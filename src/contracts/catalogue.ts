import { z } from "zod";
import { BOOK_LEVELS, SEARCH_SORTS } from "./enums";
import { languageSchema, slugSchema } from "./primitives";

/** Query accepted by the public catalogue/search API (S2 implements it). */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: slugSchema.optional(),
  technology: slugSchema.optional(),
  level: z.enum(BOOK_LEVELS).optional(),
  language: languageSchema.optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  sort: z.enum(SEARCH_SORTS).default("relevance"),
  /** Opaque keyset cursor produced by the server. */
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});
export type SearchQuery = z.output<typeof searchQuerySchema>;

export type Page<T> = { items: T[]; nextCursor: string | null; total?: number };

/** Public DTOs. Built only from rows that passed `canList`. */
export type BookSummary = {
  slug: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  categorySlugs: string[];
  level: (typeof BOOK_LEVELS)[number] | null;
  language: string;
  publishedYear: number | null;
  coverUrl: string | null;
  canRead: boolean;
  canDownload: boolean;
};

export type BookDetail = BookSummary & {
  description: string | null;
  isbn13: string | null;
  edition: string | null;
  publisher: string | null;
  pageCount: number | null;
  technologies: { slug: string; name: string }[];
  license: {
    rightsStatus: "approved" | "restricted";
    licenseType: string | null;
    rightsHolder: string | null;
    attributionText: string | null;
    licenseUrl: string | null;
    sourceUrl: string | null;
  };
};
