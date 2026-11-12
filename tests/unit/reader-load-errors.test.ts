import { describe, expect, it } from "vitest";
import { classifyLoadError, safeExternalHref } from "@/components/reader/load-errors";
import { findInText } from "@/components/reader/use-text-search";

const named = (name: string, extra: Record<string, unknown> = {}): Error => Object.assign(new Error("x"), { name, ...extra });

describe("classifyLoadError", () => {
  it.each([
    [named("PasswordException"), "password", false],
    [named("InvalidPDFException"), "corrupt", false],
    [named("MissingPDFException"), "unavailable", true],
    [named("ResponseException", { status: 404 }), "unavailable", true],
    [named("ResponseException", { status: 410 }), "unavailable", true],
    [named("ResponseException", { status: 403 }), "forbidden", false],
    [named("ResponseException", { status: 429 }), "rate-limited", true],
    [named("ResponseException", { status: 502 }), "unavailable", true],
    [new TypeError("Failed to fetch"), "network", true],
    [named("UnexpectedResponseException"), "network", true],
    [new Error("boom"), "unknown", true],
    ["a string", "unknown", true],
    [null, "unknown", true],
  ])("%#", (error, kind, retryable) => {
    const result = classifyLoadError(error);
    expect(result.kind).toBe(kind);
    expect(result.retryable).toBe(retryable);
    expect(result.message.length).toBeGreaterThan(10);
  });
});

describe("safeExternalHref", () => {
  it("allows https only", () => {
    expect(safeExternalHref("https://example.org/book")).toBe("https://example.org/book");
    expect(safeExternalHref("http://example.org")).toBeNull();
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("not a url")).toBeNull();
    expect(safeExternalHref(null)).toBeNull();
  });
});

describe("findInText", () => {
  it("finds case-insensitive matches with context and respects the limit", () => {
    const text = "Alpha beta. The Quokka indexing method is here. Another quokka INDEXING remark.";
    const found = findInText(text, "quokka indexing", 5);
    expect(found).toHaveLength(2);
    expect(found[0]).toContain("Quokka indexing");
    expect(findInText(text, "quokka indexing", 1)).toHaveLength(1);
  });

  it("ignores queries shorter than two characters and misses", () => {
    expect(findInText("abc", "a", 5)).toEqual([]);
    expect(findInText("abc", "  ", 5)).toEqual([]);
    expect(findInText("abc", "zz", 5)).toEqual([]);
  });
});
