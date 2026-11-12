/**
 * Content-Disposition builder (RFC 6266 / RFC 5987 / RFC 8187). The filename is
 * untrusted metadata (an uploader's original name or a book title): it is
 * normalised, stripped of anything that could change header structure or
 * confuse a file system, and emitted both as an ASCII fallback and as UTF-8.
 */

export type DispositionKind = "inline" | "attachment";

const MAX_STEM_BYTES = 120;
const FALLBACK_STEM = "book";
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function truncateUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let out = "";
  let used = 0;
  for (const char of text) {
    const bytes = encoder.encode(char).length;
    if (used + bytes > maxBytes) break;
    out += char;
    used += bytes;
  }
  return out;
}

/** A safe `<stem>.pdf` file name (never empty, no path separators, no control or bidi characters). */
export function sanitizePdfFilename(raw: string | null | undefined): string {
  let stem = (raw ?? "").normalize("NFC");
  // Drop any directory part a client may have sent, then the extension.
  stem = stem.split(/[\\/]/).pop() ?? "";
  stem = stem.replace(/\.pdf$/i, "");
  stem = stem
    // C0/C1 controls, bidi overrides/isolates, zero-width and BOM characters.
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/[<>:"|?*\\/]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  stem = truncateUtf8(stem, MAX_STEM_BYTES).trim();
  if (stem === "" || WINDOWS_RESERVED.test(stem)) stem = FALLBACK_STEM;
  return `${stem}.pdf`;
}

const asciiFallback = (filename: string): string =>
  filename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\u0020-\u007e]/g, "_")
    .replace(/["\\%;]/g, "_");

/** RFC 8187 value-chars: attr-char is ALPHA / DIGIT / "!#$&+-.^_`|~". */
const encodeRfc8187 = (value: string): string =>
  encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function buildContentDisposition(kind: DispositionKind, rawFilename: string | null | undefined): string {
  const filename = sanitizePdfFilename(rawFilename);
  return `${kind}; filename="${asciiFallback(filename)}"; filename*=UTF-8''${encodeRfc8187(filename)}`;
}
