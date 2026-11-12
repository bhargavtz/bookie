import { z } from "zod";
import { toIsbn13 } from "@/lib/isbn";
import { isValidSlug } from "@/lib/slug";
import { validateExternalUrl } from "@/lib/validation/external-url";

/** Reusable zod building blocks. Every string is trimmed and has an explicit max length. */

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !CONTROL_CHARS.test(v), "must not contain control characters");

export const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), text(max).optional());

export const slugSchema = z
  .string()
  .max(96)
  .refine((v) => isValidSlug(v), "must be lowercase letters, digits and single hyphens");

export const uuidSchema = z.uuid();

/** https-only, SSRF-checked external URL. Output is the normalised URL string. */
export const externalUrlSchema = z
  .string()
  .max(2048)
  .transform((value, ctx) => {
    const check = validateExternalUrl(value);
    if (!check.ok) {
      ctx.addIssue({ code: "custom", message: `URL rejected: ${check.reason}` });
      return z.NEVER;
    }
    return check.url.toString();
  });

/** Any ISBN spelling in; ISBN-13 digits out. */
export const isbnSchema = z
  .string()
  .max(32)
  .transform((value, ctx) => {
    const isbn13 = toIsbn13(value);
    if (isbn13 === null) {
      ctx.addIssue({ code: "custom", message: "not a valid ISBN-10 or ISBN-13" });
      return z.NEVER;
    }
    return isbn13;
  });

export const languageSchema = z
  .string()
  .max(35)
  .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/, "must be a BCP 47 language tag such as en or pt-BR");

export const emailSchema = z.email().max(254);
