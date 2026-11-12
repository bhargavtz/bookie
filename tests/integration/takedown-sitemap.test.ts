import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import type { DbHandle } from "@/server/db/client";
import { assets, bookCategories, books, categories, collectionBooks, collections, licenses, takedownRequests } from "@/server/db/schema";
import { createSitemapService } from "@/server/services/seo/sitemap";
import { insertApprovedLicense, insertAsset, insertBook, insertLicense } from "../helpers/factories";
import { createTestDb } from "../helpers/db";

type PostRoute = { POST: (request: Request) => Promise<Response> };
const g = globalThis as unknown as { __bookieDb?: Promise<DbHandle> };

let handle: DbHandle;
let route: PostRoute;

const valid = {
  claimantName: "A Person",
  claimantEmail: "person@example.org",
  relationship: "Author",
  description: "I wrote this work and did not license it to this site.",
  goodFaithConfirmed: true,
  signature: "A Person",
};

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/takedown", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const rows = () => handle.db.select().from(takedownRequests);

beforeAll(async () => {
  handle = await createTestDb();
  g.__bookieDb = Promise.resolve(handle);
  process.env.CONTACT_EMAIL = "legal@example.org";
  process.env.TRUST_PROXY = "true";
  resetEnvCache();
  route = (await import("@/app/api/takedown/route")) as PostRoute;
});

afterAll(async () => {
  delete g.__bookieDb;
  delete process.env.CONTACT_EMAIL;
  delete process.env.TRUST_PROXY;
  resetEnvCache();
  await handle.close();
});

beforeEach(async () => {
  await handle.db.delete(takedownRequests);
});

/** Mirrors the admin takedown: unpublish and mark the licence removed in one transaction (a DB trigger requires it). */
async function removeBook(bookId: string): Promise<void> {
  await handle.db.transaction(async (tx) => {
    await tx.update(books).set({ status: "archived" }).where(eq(books.id, bookId));
    await tx.update(licenses).set({ rightsStatus: "removed", allowRead: false, allowDownload: false, removedAt: new Date() }).where(eq(licenses.bookId, bookId));
  });
}

async function publishedBook(slug: string): Promise<string> {
  const book = await insertBook(handle.db, { slug, title: slug });
  await insertApprovedLicense(handle.db, book.id, {});
  const asset = await insertAsset(handle.db, book.id, {});
  await handle.db.update(books).set({ status: "published", primaryAssetId: asset.id }).where(eq(books.id, book.id));
  return book.id;
}

describe("POST /api/takedown", () => {
  it("stores a valid request as open and returns the generic acknowledgement", async () => {
    const bookId = await publishedBook("known-book");
    const res = await route.POST(post({ ...valid, bookSlug: "known-book" }, { "x-forwarded-for": "203.0.113.7" }));
    expect(res.status).toBe(202);
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ bookId, status: "open", claimantEmail: "person@example.org", goodFaithConfirmed: true });
    expect(stored[0]?.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(stored[0])).not.toContain("203.0.113.7");
  });

  it("answers identically for a book that does not exist and does not link it", async () => {
    await publishedBook("exists-here");
    const known = await route.POST(post({ ...valid, bookSlug: "exists-here" }, { "x-forwarded-for": "203.0.113.20" }));
    const unknown = await route.POST(post({ ...valid, bookSlug: "no-such-book" }, { "x-forwarded-for": "203.0.113.21" }));
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    const stored = await rows();
    expect(stored.filter((r) => r.bookId === null)).toHaveLength(1);
  });

  it("links a request that names a removed book without revealing its state", async () => {
    const id = await publishedBook("removed-book");
    await removeBook(id);
    const res = await route.POST(post({ ...valid, bookUrl: "https://bookie.example/book/removed-book" }, { "x-forwarded-for": "203.0.113.30" }));
    expect(res.status).toBe(202);
    expect((await rows())[0]?.bookId).toBe(id);
  });

  it("rejects an invalid statement with field errors and stores nothing", async () => {
    const res = await route.POST(post({ ...valid, description: "short" }, { "x-forwarded-for": "203.0.113.40" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; issues: { field: string }[] } };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.issues.map((i) => i.field)).toContain("description");
    expect(await rows()).toHaveLength(0);
  });

  it("requires good-faith confirmation", async () => {
    const res = await route.POST(post({ ...valid, goodFaithConfirmed: false }, { "x-forwarded-for": "203.0.113.41" }));
    expect(res.status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it("acknowledges but drops a filled honeypot", async () => {
    const res = await route.POST(post({ ...valid, website: "http://spam.example" }, { "x-forwarded-for": "203.0.113.42" }));
    expect(res.status).toBe(202);
    expect(await rows()).toHaveLength(0);
  });

  it("rate-limits one client after five requests with Retry-After", async () => {
    const headers = { "x-forwarded-for": "203.0.113.50" };
    for (let i = 0; i < 5; i += 1) expect((await route.POST(post(valid, headers))).status).toBe(202);
    const blocked = await route.POST(post(valid, headers));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await rows()).toHaveLength(5);
    expect((await route.POST(post(valid, { "x-forwarded-for": "203.0.113.51" }))).status).toBe(202);
  });

  it("rejects a cross-origin post, non-JSON bodies and bad JSON", async () => {
    expect((await route.POST(post(valid, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await route.POST(post(valid, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await route.POST(post("{not json", { "x-forwarded-for": "203.0.113.60" }))).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it("is disabled when no contact address is configured", async () => {
    delete process.env.CONTACT_EMAIL;
    resetEnvCache();
    const res = await route.POST(post(valid, { "x-forwarded-for": "203.0.113.70" }));
    expect(res.status).toBe(503);
    expect(await rows()).toHaveLength(0);
    process.env.CONTACT_EMAIL = "legal@example.org";
    resetEnvCache();
  });
});

describe("sitemap service", () => {
  it("lists only publicly listable books, categories with a listable book and non-empty collections", async () => {
    const { db } = handle;
    const ok = await publishedBook("sm-visible");
    const restrictedBook = await insertBook(db, { slug: "sm-restricted", title: "r" });
    await insertApprovedLicense(db, restrictedBook.id, { rightsStatus: "restricted", allowRead: true, allowDownload: false, restrictedReason: "read only" });
    const restrictedAsset = await insertAsset(db, restrictedBook.id, {});
    await db.update(books).set({ status: "published", primaryAssetId: restrictedAsset.id }).where(eq(books.id, restrictedBook.id));

    const draft = await insertBook(db, { slug: "sm-draft", title: "d" });
    await insertApprovedLicense(db, draft.id, {});
    // A pending licence cannot belong to a published book (DB trigger), so the pending case is an unpublished book.
    const pending = await insertBook(db, { slug: "sm-pending", title: "p" });
    await insertLicense(db, pending.id, {});
    await insertAsset(db, pending.id, {});

    const removedId = await publishedBook("sm-removed");
    await removeBook(removedId);

    const notReady = await insertBook(db, { slug: "sm-no-file", title: "n" });
    await insertApprovedLicense(db, notReady.id, {});
    const pendingFile = await insertAsset(db, notReady.id, { status: "uploading" });
    await db.update(books).set({ status: "published", primaryAssetId: pendingFile.id }).where(eq(books.id, notReady.id));
    await db.update(assets).set({ status: "uploading" }).where(eq(assets.id, pendingFile.id));

    const deleted = await publishedBook("sm-deleted");
    await db.update(books).set({ deletedAt: new Date() }).where(eq(books.id, deleted));

    const [withBook] = await db.insert(categories).values({ slug: "sm-cat-full", name: "Full" }).returning();
    const [emptyCategory] = await db.insert(categories).values({ slug: "sm-cat-empty", name: "Empty" }).returning();
    const [hiddenOnly] = await db.insert(categories).values({ slug: "sm-cat-hidden", name: "Hidden" }).returning();
    if (!withBook || !emptyCategory || !hiddenOnly) throw new Error("category insert failed");
    await db.insert(bookCategories).values([
      { bookId: ok, categoryId: withBook.id },
      { bookId: removedId, categoryId: hiddenOnly.id },
    ]);
    const [shelf] = await db.insert(collections).values({ slug: "sm-shelf", title: "Shelf", status: "published" }).returning();
    const [emptyShelf] = await db.insert(collections).values({ slug: "sm-empty-shelf", title: "Empty shelf", status: "published" }).returning();
    const [draftShelf] = await db.insert(collections).values({ slug: "sm-draft-shelf", title: "Draft shelf", status: "draft" }).returning();
    if (!shelf || !emptyShelf || !draftShelf) throw new Error("collection insert failed");
    await db.insert(collectionBooks).values([
      { collectionId: shelf.id, bookId: ok },
      { collectionId: draftShelf.id, bookId: ok },
    ]);

    const service = createSitemapService({ db, siteUrl: "https://bookie.example" });
    expect(await service.extraPages()).toEqual([]);

    const urls = (await service.primary()).map((e) => e.url);
    expect(urls).toContain("https://bookie.example/book/sm-visible");
    expect(urls).toContain("https://bookie.example/book/sm-restricted");
    for (const hidden of ["sm-draft", "sm-pending", "sm-removed", "sm-no-file", "sm-deleted"]) {
      expect(urls).not.toContain(`https://bookie.example/book/${hidden}`);
    }
    expect(urls).toContain("https://bookie.example/category/sm-cat-full");
    expect(urls).not.toContain("https://bookie.example/category/sm-cat-empty");
    expect(urls).not.toContain("https://bookie.example/category/sm-cat-hidden");
    expect(urls).toContain("https://bookie.example/collections/sm-shelf");
    expect(urls).not.toContain("https://bookie.example/collections/sm-empty-shelf");
    expect(urls).not.toContain("https://bookie.example/collections/sm-draft-shelf");
    expect(urls).toContain("https://bookie.example/takedown");
    expect(urls.some((url) => url.includes("/search"))).toBe(false);
    expect(await service.books(2)).toEqual([]);
    expect(await service.books(0)).toEqual([]);
  });
});
