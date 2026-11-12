/**
 * Upload validation (pure). The file type comes from the bytes (magic numbers),
 * never from the client-declared MIME type or filename extension.
 */
import { sha256Hex } from "@/lib/checksum";

export const MAX_COVER_BYTES = 5 * 1024 * 1024;

export type UploadRejection = "empty" | "too_large" | "not_a_pdf" | "unsupported_image" | "truncated";

export type PdfCheck = { ok: true; sha256: string; size: number } | { ok: false; reason: UploadRejection };

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);

/** `%PDF-` must be the very first bytes; a PDF with leading junk is rejected rather than "tolerated". */
export function validatePdfUpload(bytes: Uint8Array, maxBytes: number): PdfCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > maxBytes) return { ok: false, reason: "too_large" };
  if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: false, reason: "not_a_pdf" };
  // A real PDF carries an %%EOF marker near its end.
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 2048))).toString("latin1");
  if (!tail.includes("%%EOF")) return { ok: false, reason: "truncated" };
  return { ok: true, sha256: sha256Hex(bytes), size: bytes.length };
}

export type CoverFormat = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };
export type CoverCheck = ({ ok: true; sha256: string; size: number } & CoverFormat) | { ok: false; reason: UploadRejection };

export function detectCoverFormat(bytes: Uint8Array): CoverFormat | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export function validateCoverUpload(bytes: Uint8Array, maxBytes: number = MAX_COVER_BYTES): CoverCheck {
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > maxBytes) return { ok: false, reason: "too_large" };
  const format = detectCoverFormat(bytes);
  if (format === null) return { ok: false, reason: "unsupported_image" };
  return { ok: true, sha256: sha256Hex(bytes), size: bytes.length, ...format };
}

/** Keeps only a short, printable base name for display; it is never used to build a path or storage key. */
export function displayFilename(raw: string | null): string | null {
  if (raw === null) return null;
  const base = raw.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return cleaned === "" ? null : cleaned;
}

export const UPLOAD_MESSAGES: Record<UploadRejection, string> = {
  empty: "The file is empty",
  too_large: "The file is larger than the allowed size",
  not_a_pdf: "The file is not a PDF (missing %PDF- header)",
  truncated: "The PDF looks truncated (no %%EOF marker)",
  unsupported_image: "The cover must be a PNG, JPEG or WebP image",
};
