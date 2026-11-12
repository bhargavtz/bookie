import { z } from "zod";
import { BOOK_LEVELS, BOOK_STATUSES } from "./enums";
import { isbnSchema, languageSchema, optionalText, slugSchema, text } from "./primitives";

const MIN_YEAR = 1900;

/** Editable book metadata (admin create/update, CSV import row after parsing). */
export const bookMetadataSchema = z.object({
  title: text(300),
  subtitle: optionalText(300),
  description: optionalText(5000),
  language: languageSchema.default("en"),
  isbn13: isbnSchema.optional(),
  edition: optionalText(100),
  publisher: optionalText(200),
  publishedYear: z.number().int().min(MIN_YEAR).max(new Date().getUTCFullYear() + 1).optional(),
  pageCount: z.number().int().min(1).max(20000).optional(),
  level: z.enum(BOOK_LEVELS).optional(),
  authors: z.array(text(200)).min(1).max(20),
  categories: z.array(slugSchema).max(10).default([]),
  technologies: z.array(slugSchema).max(20).default([]),
  tags: z.array(text(40)).max(20).default([]),
});
export type BookMetadataInput = z.input<typeof bookMetadataSchema>;
export type BookMetadata = z.output<typeof bookMetadataSchema>;

/** Slug is generated server-side; an explicit override must still be a valid slug. */
export const bookCreateSchema = bookMetadataSchema.extend({
  slug: slugSchema.optional(),
});
export type BookCreate = z.output<typeof bookCreateSchema>;

export const bookStatusSchema = z.enum(BOOK_STATUSES);
