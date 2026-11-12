import { describe, expect, it } from "vitest";
import { bookCreateSchema, bookMetadataSchema } from "@/contracts/book";
import { licenseInputSchema } from "@/contracts/license";
import { searchQuerySchema } from "@/contracts/catalogue";
import { takedownRequestSchema } from "@/contracts/takedown";
import { readerKeySchema, bookmarkInputSchema } from "@/contracts/reader";
import { adminLoginSchema } from "@/contracts/admin";
import { BOOK_STATUSES, RIGHTS_STATUSES } from "@/contracts/enums";

const validBook = {
  title: "  Algorithms Unlocked  ",
  authors: ["Ada Example"],
};

describe("bookMetadataSchema", () => {
  it("trims, applies defaults and normalises ISBN", () => {
    const parsed = bookMetadataSchema.parse({ ...validBook, isbn13: "0-262-03384-4", subtitle: "  ", level: "beginner" });
    expect(parsed.title).toBe("Algorithms Unlocked");
    expect(parsed.subtitle).toBeUndefined();
    expect(parsed.language).toBe("en");
    expect(parsed.isbn13).toBe("9780262033848");
    expect(parsed.categories).toEqual([]);
  });

  it.each([
    ["empty title", { title: "  " }],
    ["no authors", { authors: [] }],
    ["blank author", { authors: [" "] }],
    ["bad isbn", { isbn13: "9780262033849" }],
    ["year too old", { publishedYear: 1500 }],
    ["year in far future", { publishedYear: 3000 }],
    ["non-integer pages", { pageCount: 10.5 }],
    ["zero pages", { pageCount: 0 }],
    ["bad level", { level: "expert" }],
    ["bad language", { language: "English" }],
    ["bad category slug", { categories: ["Not A Slug"] }],
    ["too many tags", { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ["control char in title", { title: "bad\u0007title" }],
    ["overlong description", { description: "x".repeat(5001) }],
  ])("rejects %s", (_name, patch) => {
    expect(bookMetadataSchema.safeParse({ ...validBook, ...patch }).success).toBe(false);
  });

  it("slug override must be a valid slug", () => {
    expect(bookCreateSchema.safeParse({ ...validBook, slug: "ok-slug" }).success).toBe(true);
    expect(bookCreateSchema.safeParse({ ...validBook, slug: "Bad Slug" }).success).toBe(false);
  });
});

describe("licenseInputSchema", () => {
  const approved = { rightsStatus: "approved", licenseType: "cc-by", rightsHolder: "Authors", allowRead: true };

  it("defaults to pending, no read, no download", () => {
    expect(licenseInputSchema.parse({})).toMatchObject({ rightsStatus: "pending", allowRead: false, allowDownload: false });
  });

  it("accepts an evidenced approval and rejects an unevidenced one", () => {
    expect(licenseInputSchema.safeParse(approved).success).toBe(true);
    expect(licenseInputSchema.safeParse({ rightsStatus: "approved" }).success).toBe(false);
    expect(licenseInputSchema.safeParse({ ...approved, rightsHolder: undefined }).success).toBe(false);
  });

  it("restricted forbids download and needs a reason", () => {
    expect(licenseInputSchema.safeParse({ rightsStatus: "restricted", restrictedReason: "publisher terms", allowRead: true }).success).toBe(true);
    expect(licenseInputSchema.safeParse({ rightsStatus: "restricted", restrictedReason: "x", allowDownload: true }).success).toBe(false);
    expect(licenseInputSchema.safeParse({ rightsStatus: "restricted" }).success).toBe(false);
  });

  it("removed forbids access and needs a reason", () => {
    expect(licenseInputSchema.safeParse({ rightsStatus: "removed", removedReason: "takedown upheld" }).success).toBe(true);
    expect(licenseInputSchema.safeParse({ rightsStatus: "removed", removedReason: "x", allowRead: true }).success).toBe(false);
    expect(licenseInputSchema.safeParse({ rightsStatus: "removed" }).success).toBe(false);
  });

  it("validates external URLs with the SSRF checker", () => {
    expect(licenseInputSchema.safeParse({ sourceUrl: "https://example.org/license" }).success).toBe(true);
    expect(licenseInputSchema.safeParse({ sourceUrl: "http://example.org/license" }).success).toBe(false);
    expect(licenseInputSchema.safeParse({ sourceUrl: "https://169.254.169.254/latest" }).success).toBe(false);
    expect(licenseInputSchema.safeParse({ licenseUrl: "https://user:pw@example.org/" }).success).toBe(false);
  });

  it("coerces expiresAt", () => {
    expect(licenseInputSchema.parse({ expiresAt: "2030-01-01T00:00:00Z" }).expiresAt).toBeInstanceOf(Date);
  });
});

describe("other contracts", () => {
  it("search query defaults and bounds", () => {
    expect(searchQuerySchema.parse({})).toMatchObject({ sort: "relevance", limit: 12 });
    expect(searchQuerySchema.parse({ q: "  graphs ", limit: "24", year: "2020" })).toMatchObject({ q: "graphs", limit: 24, year: 2020 });
    expect(searchQuerySchema.safeParse({ limit: 1000 }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ sort: "random" }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
  });

  it("takedown request needs good-faith confirmation and an empty honeypot", () => {
    const base = {
      claimantName: "Pat Example",
      claimantEmail: "pat@example.com",
      relationship: "Copyright owner",
      description: "This book is my work and I did not license it.",
      goodFaithConfirmed: true,
      signature: "Pat Example",
    };
    expect(takedownRequestSchema.safeParse(base).success).toBe(true);
    expect(takedownRequestSchema.safeParse({ ...base, goodFaithConfirmed: false }).success).toBe(false);
    expect(takedownRequestSchema.safeParse({ ...base, website: "http://spam" }).success).toBe(false);
    expect(takedownRequestSchema.safeParse({ ...base, description: "short" }).success).toBe(false);
    expect(takedownRequestSchema.safeParse({ ...base, claimantEmail: "nope" }).success).toBe(false);
  });

  it("reader key and bookmark input", () => {
    expect(readerKeySchema.safeParse("abcDEF123_-abcDEF").success).toBe(true);
    expect(readerKeySchema.safeParse("short").success).toBe(false);
    expect(readerKeySchema.safeParse("has spaces in it!!!!").success).toBe(false);
    expect(bookmarkInputSchema.safeParse({ readerKey: "abcDEF123_-abcDEF", bookSlug: "x", page: 0 }).success).toBe(false);
  });

  it("admin login lowercases email", () => {
    expect(adminLoginSchema.parse({ email: "Admin@Example.COM", password: "pw" }).email).toBe("admin@example.com");
  });

  it("enum lists are the ones the DB uses", () => {
    expect(BOOK_STATUSES[0]).toBe("draft");
    expect(RIGHTS_STATUSES[0]).toBe("pending");
  });
});
