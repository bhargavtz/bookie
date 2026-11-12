import { describe, expect, it } from "vitest";
import { buildContentDisposition, sanitizePdfFilename } from "@/server/http/content-disposition";

describe("sanitizePdfFilename", () => {
  it.each([
    ["The Rust Book.pdf", "The Rust Book.pdf"],
    ["The Rust Book", "The Rust Book.pdf"],
    ["UPPER.PDF", "UPPER.pdf"],
    ["../../etc/passwd", "passwd.pdf"],
    ["C:\\Users\\me\\notes.pdf", "notes.pdf"],
    ['evil"; filename="x', "evil; filename=x.pdf"],
    ["line\r\nbreak: x-header", "linebreak x-header.pdf"],
    ["   ", "book.pdf"],
    ["", "book.pdf"],
    [null, "book.pdf"],
    [undefined, "book.pdf"],
    ["...hidden", "hidden.pdf"],
    ["trailing. . ", "trailing.pdf"],
    ["CON", "book.pdf"],
    ["lpt1.pdf", "book.pdf"],
    ["a\u202Eb\u0000c", "abc.pdf"],
    ["Café Ünïcode 日本語.pdf", "Café Ünïcode 日本語.pdf"],
  ])("%j -> %j", (input, expected) => {
    expect(sanitizePdfFilename(input)).toBe(expected);
  });

  it("caps the name at 120 UTF-8 bytes without splitting a character", () => {
    const name = sanitizePdfFilename("é".repeat(200));
    expect(new TextEncoder().encode(name.replace(/\.pdf$/, "")).length).toBeLessThanOrEqual(120);
    expect(name).toMatch(/^é+\.pdf$/);
  });
});

describe("buildContentDisposition", () => {
  it("emits an ASCII fallback and a UTF-8 filename*", () => {
    expect(buildContentDisposition("attachment", "Café Ünï 日本語.pdf")).toBe(
      "attachment; filename=\"Cafe Uni ___.pdf\"; filename*=UTF-8''Caf%C3%A9%20%C3%9Cn%C3%AF%20%E6%97%A5%E6%9C%AC%E8%AA%9E.pdf",
    );
  });

  it("uses inline for the reader and escapes RFC 8187 reserved characters", () => {
    const header = buildContentDisposition("inline", "It's (a).pdf");
    expect(header.startsWith("inline; ")).toBe(true);
    expect(header).toContain("filename*=UTF-8''It%27s%20%28a%29.pdf");
  });

  it("never lets quotes, backslashes, semicolons or percent signs through the quoted fallback", () => {
    const header = buildContentDisposition("attachment", 'a%b;c\\d"e.pdf');
    const fallback = /filename="([^"]*)"/.exec(header)?.[1] ?? "";
    expect(fallback).not.toMatch(/[%;\\"]/);
    expect(header).not.toMatch(/[\r\n]/);
  });

  it("falls back to book.pdf for hostile or empty input", () => {
    expect(buildContentDisposition("attachment", "\r\n")).toBe('attachment; filename="book.pdf"; filename*=UTF-8\'\'book.pdf');
  });
});
