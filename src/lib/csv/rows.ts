/**
 * CSV record -> validated book metadata. Pure: every row goes through the same
 * zod contract as the admin editor (`bookMetadataSchema`). Rights are never
 * imported: rows only describe metadata; licences stay pending. The optional
 * `source_url` column is validated by the SSRF-safe validator and stored as
 * evidence text; it is never fetched.
 */
import { bookMetadataSchema, type BookMetadata } from "@/contracts/book";
import { externalUrlSchema } from "@/contracts/primitives";
import { normalizeTitle } from "@/lib/duplicates";
import type { CsvRecord } from "./parse";

export const CSV_COLUMNS = [
  "title",
  "subtitle",
  "description",
  "language",
  "isbn",
  "edition",
  "publisher",
  "published_year",
  "page_count",
  "level",
  "authors",
  "categories",
  "technologies",
  "tags",
  "source_url",
] as const;

export const REQUIRED_CSV_COLUMNS = ["title", "authors"] as const;

export type CsvIssue = { field: string; message: string };

export type ParsedBookRow = { metadata: BookMetadata; sourceUrl: string | undefined };

export type RowValidation =
  | { line: number; ok: true; row: ParsedBookRow; warnings: CsvIssue[] }
  | { line: number; ok: false; errors: CsvIssue[] };

const LIST_SEPARATOR = /[;|]/;
const splitList = (value: string): string[] =>
  value
    .split(LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part !== "");

const blankToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" ? undefined : value;

const numberOrOriginal = (value: string | undefined): number | string | undefined => {
  const v = blankToUndefined(value);
  if (v === undefined) return undefined;
  return /^\d+$/.test(v) ? Number(v) : v;
};

export function missingRequiredColumns(columns: readonly string[]): string[] {
  return REQUIRED_CSV_COLUMNS.filter((c) => !columns.includes(c));
}

export function unknownColumns(columns: readonly string[]): string[] {
  const known = new Set<string>(CSV_COLUMNS);
  return columns.filter((c) => !known.has(c));
}

function toMetadataInput(values: Record<string, string>): Record<string, unknown> {
  const level = blankToUndefined(values["level"]);
  return {
    title: values["title"] ?? "",
    subtitle: values["subtitle"],
    description: values["description"],
    language: blankToUndefined(values["language"]) ?? "en",
    isbn13: blankToUndefined(values["isbn"]),
    edition: values["edition"],
    publisher: values["publisher"],
    publishedYear: numberOrOriginal(values["published_year"]),
    pageCount: numberOrOriginal(values["page_count"]),
    level: level?.toLowerCase(),
    authors: splitList(values["authors"] ?? ""),
    categories: splitList(values["categories"] ?? "").map((s) => s.toLowerCase()),
    technologies: splitList(values["technologies"] ?? "").map((s) => s.toLowerCase()),
    tags: splitList(values["tags"] ?? ""),
  };
}

/** Validates one record. Does not touch the database: unknown slugs and DB duplicates are checked by the service. */
export function validateCsvRecord(record: CsvRecord): RowValidation {
  const errors: CsvIssue[] = [];
  const parsed = bookMetadataSchema.safeParse(toMetadataInput(record.values));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push({ field: issue.path.length > 0 ? issue.path.join(".") : "row", message: issue.message });
    }
  }
  let sourceUrl: string | undefined;
  const rawUrl = blankToUndefined(record.values["source_url"]);
  if (rawUrl !== undefined) {
    const url = externalUrlSchema.safeParse(rawUrl);
    if (url.success) sourceUrl = url.data;
    else errors.push({ field: "source_url", message: url.error.issues[0]?.message ?? "invalid URL" });
  }
  if (!parsed.success || errors.length > 0) return { line: record.line, ok: false, errors };
  return { line: record.line, ok: true, row: { metadata: parsed.data, sourceUrl }, warnings: [] };
}

/**
 * Validates every record and then applies the in-file rules: a repeated ISBN-13
 * is an error on the later row; a repeated normalised title is only a warning.
 */
export function validateCsvRecords(records: readonly CsvRecord[]): RowValidation[] {
  const results = records.map(validateCsvRecord);
  const seenIsbn = new Map<string, number>();
  const seenTitle = new Map<string, number>();
  return results.map((result) => {
    if (!result.ok) return result;
    const { metadata } = result.row;
    if (metadata.isbn13 !== undefined) {
      const first = seenIsbn.get(metadata.isbn13);
      if (first !== undefined) {
        return {
          line: result.line,
          ok: false,
          errors: [{ field: "isbn", message: `duplicate ISBN-13 within the file (first seen on line ${first})` }],
        };
      }
      seenIsbn.set(metadata.isbn13, result.line);
    }
    const titleKey = normalizeTitle(metadata.title);
    const firstTitle = seenTitle.get(titleKey);
    if (firstTitle === undefined) seenTitle.set(titleKey, result.line);
    else {
      result.warnings.push({ field: "title", message: `similar title already on line ${firstTitle}` });
    }
    return result;
  });
}
