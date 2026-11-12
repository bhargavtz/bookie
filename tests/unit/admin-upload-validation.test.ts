import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/checksum";
import { detectCoverFormat, displayFilename, validateCoverUpload, validatePdfUpload } from "@/server/services/admin/upload-validation";
import { PNG_BYTES, tinyPdf } from "../helpers/admin";

describe("validatePdfUpload", () => {
  it("accepts a PDF and reports its SHA-256", () => {
    const bytes = tinyPdf("one");
    expect(validatePdfUpload(bytes, 10_000)).toEqual({ ok: true, size: bytes.length, sha256: sha256Hex(bytes) });
  });
  it("rejects by content, not by name or declared type", () => {
    const html = new TextEncoder().encode("<html>%PDF-1.4 not really</html>%%EOF");
    expect(validatePdfUpload(html, 10_000)).toEqual({ ok: false, reason: "not_a_pdf" });
    expect(validatePdfUpload(PNG_BYTES, 10_000)).toEqual({ ok: false, reason: "not_a_pdf" });
  });
  it("rejects leading junk before the header", () => {
    const bytes = new Uint8Array([0x20, ...tinyPdf("junk")]);
    expect(validatePdfUpload(bytes, 10_000)).toMatchObject({ ok: false, reason: "not_a_pdf" });
  });
  it("rejects empty, oversize and truncated files", () => {
    expect(validatePdfUpload(new Uint8Array(0), 10)).toEqual({ ok: false, reason: "empty" });
    expect(validatePdfUpload(tinyPdf("big"), 10)).toEqual({ ok: false, reason: "too_large" });
    expect(validatePdfUpload(new TextEncoder().encode("%PDF-1.7\nno trailer"), 1000)).toEqual({ ok: false, reason: "truncated" });
  });
  it("gives different checksums for different bytes", () => {
    const a = validatePdfUpload(tinyPdf("a"), 10_000);
    const b = validatePdfUpload(tinyPdf("b"), 10_000);
    expect(a.ok && b.ok && a.sha256 !== b.sha256).toBe(true);
  });
});

describe("cover validation", () => {
  it("detects PNG, JPEG and WebP by magic bytes", () => {
    expect(detectCoverFormat(PNG_BYTES)?.ext).toBe("png");
    expect(detectCoverFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
    expect(detectCoverFormat(webp)?.mime).toBe("image/webp");
  });
  it("rejects other types, including SVG, GIF and a PDF", () => {
    for (const text of ["<svg xmlns='http://www.w3.org/2000/svg'/>", "GIF89a...."]) {
      expect(validateCoverUpload(new TextEncoder().encode(text))).toEqual({ ok: false, reason: "unsupported_image" });
    }
    expect(validateCoverUpload(tinyPdf("x"))).toEqual({ ok: false, reason: "unsupported_image" });
  });
  it("enforces empty and size limits", () => {
    expect(validateCoverUpload(new Uint8Array(0))).toEqual({ ok: false, reason: "empty" });
    expect(validateCoverUpload(PNG_BYTES, 4)).toEqual({ ok: false, reason: "too_large" });
    expect(validateCoverUpload(PNG_BYTES)).toMatchObject({ ok: true, mime: "image/png" });
  });
});

describe("displayFilename", () => {
  it("keeps a short printable base name only", () => {
    expect(displayFilename("../../etc/passwd")).toBe("passwd");
    expect(displayFilename("C:\\x\\book.pdf")).toBe("book.pdf");
    expect(displayFilename("a\u0000b\nc.pdf")).toBe("abc.pdf");
    expect(displayFilename("/")).toBeNull();
    expect(displayFilename(null)).toBeNull();
    expect(displayFilename("x".repeat(500))?.length).toBe(200);
  });
});
