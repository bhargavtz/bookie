import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AdminPrincipal } from "@/server/auth/session";
import type { DbHandle } from "@/server/db/client";
import { auditLog, books, importJobs, licenses } from "@/server/db/schema";
import * as svc from "@/server/services/admin";
import { insertCategory, insertTechnology, makeContext, makeStorage, principalFor } from "../helpers/admin";
import { createTestDb } from "../helpers/db";

let handle: DbHandle;
let cleanup: () => Promise<void>;
let ctx: svc.AdminContext;
let owner: AdminPrincipal;
let editor: AdminPrincipal;
let reviewer: AdminPrincipal;

beforeAll(async () => {
  handle = await createTestDb();
  const made = await makeStorage();
  cleanup = made.cleanup;
  ctx = makeContext(handle.db, made.storage);
  [owner, editor, reviewer] = await Promise.all([principalFor(handle.db, "owner"), principalFor(handle.db, "editor"), principalFor(handle.db, "reviewer")]);
  await insertCategory(handle.db, "algorithms", "Algorithms");
  await insertTechnology(handle.db, "rust", "Rust");
});
afterAll(async () => {
  await handle.close();
  await cleanup();
});

const header = "title,authors,isbn,published_year,categories,technologies,tags,source_url";
const csv = (...rows: string[]) => [header, ...rows].join("\n");
const bookCount = async () => (await handle.db.select().from(books)).length;

describe("CSV import", () => {
  const sample = csv(
    "Import Fixture One,Ada Test; Bob Test,9780306406157,2021,algorithms,rust,alpha;beta,https://example.org/evidence-one",
    "Import Fixture Two,Cy Test,,2022,algorithms,,,",
    ",Nobody,,,,,,",
    "Import Fixture Four,Di Test,not-an-isbn,1500,missing-category,cobol,,http://127.0.0.1/x",
  );

  it("dry-run validates every row, reports row-level errors, and writes no books", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const before = await bookCount();
    const report = await svc.runCsvImport(ctx, editor, { filename: "dry.csv", text: sample, dryRun: true });
    expect(await bookCount()).toBe(before);
    expect(report).toMatchObject({ dryRun: true, totalRows: 4, validRows: 2, importedRows: 0, failedRows: 2 });
    expect(report.rows.map((r) => [r.line, r.status])).toEqual([[2, "valid"], [3, "valid"], [4, "error"], [5, "error"]]);
    expect(report.rows[2]?.errors.map((e) => e.field)).toContain("title");
    const fields = report.rows[3]?.errors.map((e) => e.field) ?? [];
    expect(fields).toEqual(expect.arrayContaining(["isbn13", "publishedYear", "source_url"]));
    expect(fetchSpy).not.toHaveBeenCalled(); // never fetches source_url
    fetchSpy.mockRestore();

    const [job] = await handle.db.select().from(importJobs).where(eq(importJobs.id, report.jobId));
    expect(job).toMatchObject({ dryRun: true, status: "completed", totalRows: 4, importedRows: 0, failedRows: 2 });
    expect(job?.errorReport).toHaveLength(2);
    const audit = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, report.jobId));
    expect(audit.map((a) => a.action)).toEqual(["import.dry_run"]);
  });

  it("commit imports the valid rows as drafts with pending licences only, and reports the rest", async () => {
    const before = await bookCount();
    const report = await svc.runCsvImport(ctx, owner, { filename: "commit.csv", text: sample, dryRun: false });
    expect(report).toMatchObject({ dryRun: false, importedRows: 2, failedRows: 2 });
    expect(await bookCount()).toBe(before + 2);
    const one = report.rows[0];
    expect(one).toMatchObject({ status: "imported", slug: "import-fixture-one" });

    const detail = await svc.getBookDetail(ctx, owner, (await handle.db.select().from(books).where(eq(books.slug, "import-fixture-one")))[0]?.id ?? "");
    expect(detail.book).toMatchObject({ status: "draft", isbn13: "9780306406157", publishedYear: 2021, primaryAssetId: null });
    expect(detail.relations.authors.map((a) => a.name)).toEqual(["Ada Test", "Bob Test"]);
    expect(detail.relations.tags.map((t) => t.slug)).toEqual(["alpha", "beta"]);
    expect(detail.license).toMatchObject({ rightsStatus: "pending", allowRead: false, allowDownload: false, sourceUrl: "https://example.org/evidence-one", approvedBy: null });

    const twoLicence = await handle.db.select().from(licenses);
    expect(twoLicence).toHaveLength(1); // only the row that supplied a source_url
    const audit = await handle.db.select().from(auditLog).where(eq(auditLog.action, "import.commit"));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.diff).toMatchObject({ importedRows: 2, failedRows: 2 });
  });

  it("re-importing the same file reports the ISBN as a duplicate and imports nothing twice", async () => {
    const before = await bookCount();
    const report = await svc.runCsvImport(ctx, owner, { filename: "again.csv", text: csv("Import Fixture One,Ada Test,9780306406157,,,,,"), dryRun: false });
    expect(report.importedRows).toBe(0);
    expect(report.rows[0]?.errors[0]?.message).toMatch(/ISBN-13 already used/);
    expect(await bookCount()).toBe(before);
    const [job] = await handle.db.select().from(importJobs).where(eq(importJobs.id, report.jobId));
    expect(job?.status).toBe("failed");
  });

  it("flags an ISBN repeated inside one file and warns about similar titles without blocking", async () => {
    const report = await svc.runCsvImport(ctx, owner, {
      filename: "inner.csv",
      text: csv("Inner Dup Alpha,A,9781402894626,,,,,", "Inner Dup Beta,A,9781402894626,,,,,", "Import Fixture Two,Cy Test,,,,,,"),
      dryRun: true,
    });
    expect(report.rows[0]?.status).toBe("valid");
    expect(report.rows[1]?.errors[0]?.message).toMatch(/duplicate ISBN-13 within the file/);
    expect(report.rows[2]).toMatchObject({ status: "valid" });
    expect(report.rows[2]?.warnings.length).toBeGreaterThan(0);
  });

  it("rejects structural problems and missing required columns with csv_invalid; defaults to a dry run", async () => {
    const run = async (text: string) => {
      try {
        await svc.runCsvImport(ctx, owner, { filename: "x.csv", text });
      } catch (error) {
        return error as svc.AdminError;
      }
      return null;
    };
    expect(await run('title,authors\n"unterminated,Ada')).toMatchObject({ status: 422, code: "csv_invalid" });
    expect(await run("title,isbn\nOnly Title,")).toMatchObject({ code: "csv_invalid" });
    const before = await bookCount();
    const report = await svc.runCsvImport(ctx, owner, { filename: "default.csv", text: "title,authors\nDefault Is Dry Run,Ada" });
    expect(report.dryRun).toBe(true);
    expect(await bookCount()).toBe(before);
  });

  it("requires the import.run permission", async () => {
    for (const principal of [reviewer, { ...editor, role: "visitor" as never }]) {
      await expect(svc.runCsvImport(ctx, principal, { filename: "x.csv", text: csv() })).rejects.toMatchObject({ status: 403 });
    }
  });

  it("reports unknown columns as ignored", async () => {
    const report = await svc.runCsvImport(ctx, owner, { filename: "extra.csv", text: "title,authors,price\nExtra Column Fixture,Ada,9.99", dryRun: true });
    expect(report.ignoredColumns).toEqual(["price"]);
    expect(report.validRows).toBe(1);
  });
});
