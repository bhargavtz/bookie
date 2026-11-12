import { z } from "zod";
import { CsvParseError, missingRequiredColumns, parseCsv, unknownColumns, validateCsvRecords, type CsvIssue, type ParsedBookRow } from "@/lib/csv";
import { compareForDuplicate } from "@/lib/duplicates";
import type { AdminPrincipal } from "@/server/auth/session";
import { writeAudit } from "@/server/repositories/admin/audit";
import {
  findBooksByIsbn,
  findSimilarTitles,
  freeBookSlug,
  insertBook,
  replaceBookRelations,
  unknownCategorySlugs,
  unknownTechnologySlugs,
} from "@/server/repositories/admin/books";
import { finishImportJob, insertImportJob } from "@/server/repositories/admin/imports";
import { upsertLicense } from "@/server/repositories/admin/licenses";
import { type AdminContext, inTransaction } from "./context";
import { AdminError, mapDbError, requirePermission } from "./errors";
import { parseOrThrow } from "./books";

const importInputSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  text: z.string(),
  dryRun: z.boolean().default(true),
});

export type ImportRowReport = {
  line: number;
  status: "valid" | "error" | "imported";
  title: string | null;
  slug: string | null;
  errors: CsvIssue[];
  warnings: CsvIssue[];
};

export type ImportReport = {
  jobId: string;
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  importedRows: number;
  failedRows: number;
  ignoredColumns: string[];
  rows: ImportRowReport[];
};

/** Checks that need the database; the pure checks already ran in `validateCsvRecords`. */
async function databaseIssues(ctx: AdminContext, row: ParsedBookRow): Promise<{ errors: CsvIssue[]; warnings: CsvIssue[] }> {
  const errors: CsvIssue[] = [];
  const warnings: CsvIssue[] = [];
  const meta = row.metadata;
  const [badCategories, badTechnologies] = await Promise.all([
    unknownCategorySlugs(ctx.db, meta.categories),
    unknownTechnologySlugs(ctx.db, meta.technologies),
  ]);
  if (badCategories.length > 0) errors.push({ field: "categories", message: `unknown category: ${badCategories.join(", ")}` });
  if (badTechnologies.length > 0) errors.push({ field: "technologies", message: `unknown technology: ${badTechnologies.join(", ")}` });
  if (meta.isbn13 !== undefined) {
    const hits = (await findBooksByIsbn(ctx.db, meta.isbn13)).filter((hit) => !hit.deleted);
    if (hits.length > 0) errors.push({ field: "isbn", message: `ISBN-13 already used by "${hits[0]?.title ?? "another book"}"` });
  }
  const similar = await findSimilarTitles(ctx.db, meta.title, undefined, 10);
  for (const candidate of similar) {
    if (compareForDuplicate({ title: meta.title }, { title: candidate.title }) !== null) {
      warnings.push({ field: "title", message: `similar to existing book "${candidate.title}"` });
      break;
    }
  }
  return { errors, warnings };
}

/**
 * CSV metadata import. Rows are validated with the same zod contract as the
 * editor, checked against the database, and (unless `dryRun`) inserted one
 * transaction per row so a bad row never blocks the rest. Everything imported is
 * a `draft` with no licence rights: the optional `source_url` is stored as a
 * pending licence's evidence link and is never fetched. No network access happens here.
 */
export async function runCsvImport(ctx: AdminContext, principal: AdminPrincipal, input: unknown): Promise<ImportReport> {
  requirePermission(principal, "import.run");
  const data = parseOrThrow(importInputSchema, input);

  let parsed;
  try {
    parsed = parseCsv(data.text);
  } catch (error) {
    if (error instanceof CsvParseError) throw new AdminError(422, "csv_invalid", `Line ${error.line}: ${error.message}`);
    throw error;
  }
  const missing = missingRequiredColumns(parsed.columns);
  if (missing.length > 0) throw new AdminError(422, "csv_invalid", `Missing required column(s): ${missing.join(", ")}`);

  const jobId = await insertImportJob(ctx.db, {
    adminUserId: principal.userId,
    filename: data.filename,
    dryRun: data.dryRun,
    totalRows: parsed.records.length,
  });

  const rows: ImportRowReport[] = [];
  let importedRows = 0;
  let validRows = 0;
  for (const result of validateCsvRecords(parsed.records)) {
    if (!result.ok) {
      rows.push({ line: result.line, status: "error", title: null, slug: null, errors: result.errors, warnings: [] });
      continue;
    }
    const extra = await databaseIssues(ctx, result.row);
    const title = result.row.metadata.title;
    if (extra.errors.length > 0) {
      rows.push({ line: result.line, status: "error", title, slug: null, errors: extra.errors, warnings: [...result.warnings, ...extra.warnings] });
      continue;
    }
    const warnings = [...result.warnings, ...extra.warnings];
    validRows += 1;
    if (data.dryRun) {
      rows.push({ line: result.line, status: "valid", title, slug: null, errors: [], warnings });
      continue;
    }
    try {
      const slug = await insertRow(ctx, principal, result.row, jobId);
      importedRows += 1;
      rows.push({ line: result.line, status: "imported", title, slug, errors: [], warnings });
    } catch (error) {
      const mapped = mapDbError(error);
      const message = mapped instanceof AdminError ? mapped.message : "unexpected error while saving this row";
      validRows -= 1;
      rows.push({ line: result.line, status: "error", title, slug: null, errors: [{ field: "row", message }], warnings });
    }
  }

  const failedRows = rows.filter((r) => r.status === "error").length;
  const status = parsed.records.length > 0 && validRows === 0 && importedRows === 0 ? "failed" : "completed";
  await inTransaction(ctx, async (tx) => {
    await finishImportJob(tx, jobId, {
      status,
      importedRows,
      failedRows,
      errorReport: rows.filter((r) => r.status === "error").map((r) => ({ line: r.line, title: r.title, errors: r.errors })),
    });
    await writeAudit(tx, {
      adminUserId: principal.userId,
      action: data.dryRun ? "import.dry_run" : "import.commit",
      entityType: "import_job",
      entityId: jobId,
      diff: { filename: data.filename, totalRows: parsed.records.length, importedRows, failedRows },
    });
  });

  return {
    jobId,
    dryRun: data.dryRun,
    totalRows: parsed.records.length,
    validRows,
    importedRows,
    failedRows,
    ignoredColumns: unknownColumns(parsed.columns),
    rows,
  };
}

async function insertRow(ctx: AdminContext, principal: AdminPrincipal, row: ParsedBookRow, jobId: string): Promise<string> {
  const meta = row.metadata;
  return inTransaction(ctx, async (tx) => {
    const slug = await freeBookSlug(tx, meta.title);
    const book = await insertBook(tx, slug, {
      title: meta.title,
      subtitle: meta.subtitle ?? null,
      description: meta.description ?? null,
      language: meta.language,
      isbn13: meta.isbn13 ?? null,
      edition: meta.edition ?? null,
      publisher: meta.publisher ?? null,
      publishedYear: meta.publishedYear ?? null,
      pageCount: meta.pageCount ?? null,
      level: meta.level ?? null,
    });
    await replaceBookRelations(tx, book.id, {
      authorNames: meta.authors,
      categorySlugs: meta.categories,
      technologySlugs: meta.technologies,
      tagNames: meta.tags,
    });
    if (row.sourceUrl !== undefined) {
      await upsertLicense(tx, book.id, {
        rightsStatus: "pending",
        licenseType: null,
        licenseUrl: null,
        rightsHolder: null,
        attributionText: null,
        sourceUrl: row.sourceUrl,
        evidenceNote: null,
        allowRead: false,
        allowDownload: false,
        approvedBy: null,
        approvedAt: null,
        expiresAt: null,
        restrictedReason: null,
        removedAt: null,
        removedReason: null,
      });
    }
    await writeAudit(tx, {
      adminUserId: principal.userId,
      action: "book.create",
      entityType: "book",
      entityId: book.id,
      diff: { title: book.title, slug, importJobId: jobId },
    });
    return slug;
  });
}
