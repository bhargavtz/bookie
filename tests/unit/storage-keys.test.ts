import { describe, expect, it } from "vitest";
import { assertSafeKey, assetStorageKey, isSafeKey, resolveRange, StorageKeyError, StorageRangeError } from "@/server/storage";

describe("storage keys", () => {
  it.each([
    "books/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf",
    "a",
    "a/b/c.txt",
    "x_y-z.1",
  ])("accepts %s", (k) => {
    expect(isSafeKey(k)).toBe(true);
    expect(assertSafeKey(k)).toBe(k);
  });

  it.each([
    "",
    "/abs",
    "../etc/passwd",
    "a/../b",
    "a/./b",
    "a//b",
    "a/",
    ".hidden",
    "a/.hidden",
    "a..b",
    "a\\b",
    "a b",
    "a%2e%2e/b",
    "a\u0000b",
    "café",
    "x".repeat(513),
    "a/b?c",
    "~root",
  ])("rejects %j", (k) => {
    expect(isSafeKey(k)).toBe(false);
    expect(() => assertSafeKey(k)).toThrow(StorageKeyError);
  });

  it("builds asset keys only from uuids and a short extension", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(assetStorageKey(id, id, "pdf")).toBe(`books/${id}/${id}.pdf`);
    expect(() => assetStorageKey("../x", id, "pdf")).toThrow(StorageKeyError);
    expect(() => assetStorageKey(id, id, "p/df")).toThrow(StorageKeyError);
    expect(() => assetStorageKey(id, id, "")).toThrow(StorageKeyError);
  });
});

describe("resolveRange", () => {
  it("defaults to the whole object", () => {
    expect(resolveRange(100, undefined)).toEqual({ start: 0, end: 99 });
    expect(resolveRange(0, undefined)).toEqual({ start: 0, end: 0 });
  });
  it("clamps end to size - 1", () => {
    expect(resolveRange(100, { start: 10, end: 500 })).toEqual({ start: 10, end: 99 });
    expect(resolveRange(100, { start: 10 })).toEqual({ start: 10, end: 99 });
    expect(resolveRange(100, { start: 5, end: 5 })).toEqual({ start: 5, end: 5 });
  });
  it("rejects invalid and unsatisfiable ranges", () => {
    expect(() => resolveRange(100, { start: 100 })).toThrow(StorageRangeError);
    expect(() => resolveRange(100, { start: -1 })).toThrow(StorageRangeError);
    expect(() => resolveRange(100, { start: 10, end: 5 })).toThrow(StorageRangeError);
    expect(() => resolveRange(100, { start: 1.5 })).toThrow(StorageRangeError);
    expect(() => resolveRange(100, { start: 0, end: 2.5 })).toThrow(StorageRangeError);
  });
});
