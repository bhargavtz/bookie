import { z } from "zod";
import { BOOK_LEVELS, LICENSE_TYPES } from "@/contracts/enums";
import { languageSchema, slugSchema } from "@/contracts/primitives";

/**
 * Query-string schemas for the public catalogue and search APIs. They extend
 * the frozen `searchQuerySchema` contract with the author, topic, format,
 * licence and popularity capabilities S2 adds. Blank values (an empty form
 * field) are treated as absent.
 */

const blankToUndefined = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

export const CATALOGUE_SORTS = ["newest", "title", "popularity"] as const;
export const SEARCH_RESULT_SORTS = ["relevance", ...CATALOGUE_SORTS] as const;
export const FORMATS = ["pdf"] as const;

const filterShape = {
  category: optional(slugSchema),
  technology: optional(slugSchema),
  topic: optional(slugSchema),
  author: optional(slugSchema),
  level: optional(z.enum(BOOK_LEVELS)),
  language: optional(languageSchema),
  year: optional(z.coerce.number().int().min(1900).max(2200)),
  format: optional(z.enum(FORMATS)),
  license: optional(z.enum(LICENSE_TYPES)),
};

const paging = {
  cursor: optional(z.string().max(512)),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(48).default(12)),
};

export const catalogueListQuerySchema = z.object({
  ...filterShape,
  sort: z.preprocess(blankToUndefined, z.enum(CATALOGUE_SORTS).default("newest")),
  ...paging,
});
export type CatalogueListQuery = z.output<typeof catalogueListQuerySchema>;

export const publicSearchQuerySchema = z.object({
  q: optional(z.string().trim().max(200)),
  ...filterShape,
  sort: z.preprocess(blankToUndefined, z.enum(SEARCH_RESULT_SORTS).default("relevance")),
  ...paging,
});
export type PublicSearchQuery = z.output<typeof publicSearchQuerySchema>;

export const autocompleteQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(10).default(8)),
});
export type AutocompleteQuery = z.output<typeof autocompleteQuerySchema>;

export const shortListQuerySchema = z.object({
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(24).default(8)),
});

export const collectionBooksQuerySchema = z.object({
  cursor: optional(z.string().max(512)),
  limit: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(48).default(24)),
});

/** URLSearchParams to a plain object; when a key repeats the last value wins. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}
