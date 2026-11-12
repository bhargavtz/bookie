import { z } from "zod";
import { text } from "./primitives";

/** Anonymous reader identity (random, client generated). Not an account. */
export const readerKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "invalid reader key");

export const bookmarkInputSchema = z.object({
  readerKey: readerKeySchema,
  bookSlug: z.string().max(96),
  page: z.number().int().min(1).max(100000),
  label: text(200).optional(),
});

export const readingProgressInputSchema = z.object({
  readerKey: readerKeySchema,
  bookSlug: z.string().max(96),
  page: z.number().int().min(1).max(100000),
  totalPages: z.number().int().min(1).max(100000),
});
