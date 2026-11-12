import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapReferenceData } from "@/server/db/bootstrap";
import type { DbHandle } from "@/server/db/client";
import { REFERENCE_CATEGORIES } from "@/server/db/reference/categories";
import { books, categories, licenses } from "@/server/db/schema";
import { insertApprovedLicense, insertAsset, insertBook, insertLicense, sqlState } from "../helpers/factories";
import { createTestDb } from "../helpers/db";

let handle: DbHandle;
beforeAll(async () => {
  handle = await createTestDb();
});
afterAll(async () => {
  await handle.close();
});

const rows = async <T = Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> => {
  const result = await handle.db.execute(query);
  return (result as unknown as { rows: T[] }).rows;
};

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";

describe("migrations", () => {
  it("create every table from the architecture", async () => {
    const result = await rows<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const names = new Set(result.map((r) => r.table_name));
    for (const t of [
      "books", "authors", "book_authors", "categories", "book_categories", "tags", "book_tags",
      "technologies", "book_technologies", "assets", "licenses", "collections", "collection_books",
      "bookmarks", "reading_progress", "download_events", "admin_users", "admin_sessions",
      "rate_limits", "takedown_requests", "audit_log", "import_jobs",
    ]) {
      expect(names.has(t), `missing table ${t}`).toBe(true);
    }
  });

  it("install pg_trgm and unaccent", async () => {
    const result = await rows<{ extname: string }>(sql`select extname from pg_extension`);
    const names = result.map((r) => r.extname);
    expect(names).toEqual(expect.arrayContaining(["pg_trgm", "unaccent"]));
  });

  it("are idempotent (re-running applies nothing and does not fail)", async () => {
    const { runMigrations } = await import("@/server/db/migrate");
    await expect(runMigrations(handle)).resolves.toBeUndefined();
  });
});

describe("deny-by-default", () => {
  it("books default to draft", async () => {
    const book = await insertBook(handle.db);
    expect(book.status).toBe("draft");
    expect(book.deletedAt).toBeNull();
    expect(book.language).toBe("en");
  });

  it("licences default to pending with no read or download", async () => {
    const book = await insertBook(handle.db);
    const license = await insertLicense(handle.db, book.id);
    expect(license).toMatchObject({ rightsStatus: "pending", allowRead: false, allowDownload: false });
  });

  it("a book can have only one licence row", async () => {
    const book = await insertBook(handle.db);
    await insertLicense(handle.db, book.id);
    expect(await sqlState(insertLicense(handle.db, book.id))).toBe(UNIQUE_VIOLATION);
  });
});

describe("publish guard trigger", () => {
  it("rejects inserting a book as published", async () => {
    expect(await sqlState(handle.db.insert(books).values({ slug: "direct-publish", title: "x", status: "published" }))).toBe(CHECK_VIOLATION);
  });

  it("rejects publishing without a licence row", async () => {
    const book = await insertBook(handle.db);
    expect(await sqlState(handle.db.update(books).set({ status: "published" }).where(eq(books.id, book.id)))).toBe(CHECK_VIOLATION);
  });

  it.each(["pending", "removed"] as const)("rejects publishing with a %s licence", async (rightsStatus) => {
    const book = await insertBook(handle.db);
    await insertLicense(handle.db, book.id, { rightsStatus });
    expect(await sqlState(handle.db.update(books).set({ status: "published" }).where(eq(books.id, book.id)))).toBe(CHECK_VIOLATION);
  });

  it("allows publishing with approved rights, then forbids downgrading the licence while published", async () => {
    const book = await insertBook(handle.db);
    await insertApprovedLicense(handle.db, book.id);
    await handle.db.update(books).set({ status: "published", publishedAt: new Date() }).where(eq(books.id, book.id));
    const [after] = await handle.db.select().from(books).where(eq(books.id, book.id));
    expect(after?.status).toBe("published");

    expect(await sqlState(handle.db.update(licenses).set({ rightsStatus: "pending", allowRead: false }).where(eq(licenses.bookId, book.id)))).toBe(CHECK_VIOLATION);
    expect(await sqlState(handle.db.delete(licenses).where(eq(licenses.bookId, book.id)))).toBe(CHECK_VIOLATION);
  });

  it("allows publishing with restricted rights", async () => {
    const book = await insertBook(handle.db);
    await insertApprovedLicense(handle.db, book.id, { rightsStatus: "restricted", allowDownload: false });
    await handle.db.update(books).set({ status: "published" }).where(eq(books.id, book.id));
    const [after] = await handle.db.select().from(books).where(eq(books.id, book.id));
    expect(after?.status).toBe("published");
  });

  it("'remove' works as one transaction: licence removed and book unpublished together", async () => {
    const book = await insertBook(handle.db);
    await insertApprovedLicense(handle.db, book.id, { allowDownload: true });
    await handle.db.update(books).set({ status: "published" }).where(eq(books.id, book.id));

    await handle.db.transaction(async (tx) => {
      await tx.update(licenses).set({ rightsStatus: "removed", allowRead: false, allowDownload: false, removedAt: new Date(), removedReason: "takedown upheld" }).where(eq(licenses.bookId, book.id));
      await tx.update(books).set({ status: "unpublished" }).where(eq(books.id, book.id));
    });
    const [b] = await handle.db.select().from(books).where(eq(books.id, book.id));
    const [l] = await handle.db.select().from(licenses).where(eq(licenses.bookId, book.id));
    expect(b?.status).toBe("unpublished");
    expect(l?.rightsStatus).toBe("removed");
  });

  it("a transaction that downgrades the licence but leaves the book published fails at commit and rolls back", async () => {
    const book = await insertBook(handle.db);
    await insertApprovedLicense(handle.db, book.id);
    await handle.db.update(books).set({ status: "published" }).where(eq(books.id, book.id));

    const state = await sqlState(
      handle.db.transaction(async (tx) => {
        await tx.update(licenses).set({ rightsStatus: "removed", allowRead: false }).where(eq(licenses.bookId, book.id));
      }),
    );
    expect(state).toBe(CHECK_VIOLATION);
    const [l] = await handle.db.select().from(licenses).where(eq(licenses.bookId, book.id));
    expect(l?.rightsStatus).toBe("approved");
  });

  it("deleting a published book (cascade to its licence) is allowed", async () => {
    const book = await insertBook(handle.db);
    await insertApprovedLicense(handle.db, book.id);
    await handle.db.update(books).set({ status: "published" }).where(eq(books.id, book.id));
    await handle.db.delete(books).where(eq(books.id, book.id));
    expect(await handle.db.select().from(licenses).where(eq(licenses.bookId, book.id))).toHaveLength(0);
  });

  it("licence changes on unpublished books are unrestricted", async () => {
    const book = await insertBook(handle.db);
    const license = await insertApprovedLicense(handle.db, book.id);
    await handle.db.update(licenses).set({ rightsStatus: "pending", allowRead: false }).where(eq(licenses.id, license.id));
    await handle.db.delete(licenses).where(eq(licenses.id, license.id));
  });
});

describe("licence CHECK constraints", () => {
  it("restricted cannot allow download", async () => {
    const book = await insertBook(handle.db);
    expect(await sqlState(insertLicense(handle.db, book.id, { rightsStatus: "restricted", allowDownload: true }))).toBe(CHECK_VIOLATION);
  });

  it("removed cannot allow read or download", async () => {
    const book = await insertBook(handle.db);
    expect(await sqlState(insertLicense(handle.db, book.id, { rightsStatus: "removed", allowRead: true }))).toBe(CHECK_VIOLATION);
  });

  it("approved requires approver, timestamp, rights holder and licence type", async () => {
    const book = await insertBook(handle.db);
    expect(await sqlState(insertLicense(handle.db, book.id, { rightsStatus: "approved" }))).toBe(CHECK_VIOLATION);
  });
});

describe("other constraints", () => {
  it("slug uniqueness and format", async () => {
    await insertBook(handle.db, { slug: "dup-slug" });
    expect(await sqlState(insertBook(handle.db, { slug: "dup-slug" }))).toBe(UNIQUE_VIOLATION);
    expect(await sqlState(insertBook(handle.db, { slug: "Bad Slug" }))).toBe(CHECK_VIOLATION);
  });

  it("isbn13: unique among live books, validated shape, reusable after soft delete", async () => {
    const first = await insertBook(handle.db, { isbn13: "9780262033848" });
    expect(await sqlState(insertBook(handle.db, { isbn13: "9780262033848" }))).toBe(UNIQUE_VIOLATION);
    expect(await sqlState(insertBook(handle.db, { isbn13: "12345" }))).toBe(CHECK_VIOLATION);
    await handle.db.update(books).set({ deletedAt: new Date() }).where(eq(books.id, first.id));
    await insertBook(handle.db, { isbn13: "9780262033848" });
    await insertBook(handle.db); // many books without ISBN
    await insertBook(handle.db);
  });

  it("duplicate PDF bytes are rejected among live assets, allowed once the first is deleted", async () => {
    const a = await insertBook(handle.db);
    const b = await insertBook(handle.db);
    const sha = "ab".repeat(32);
    const first = await insertAsset(handle.db, a.id, { sha256: sha });
    expect(await sqlState(insertAsset(handle.db, b.id, { sha256: sha }))).toBe(UNIQUE_VIOLATION);
    // a cover with the same hash is not a PDF duplicate
    await insertAsset(handle.db, b.id, { kind: "cover", mimeType: "image/png", sha256: sha });
    await handle.db.execute(sql`update assets set status = 'deleted' where id = ${first.id}`);
    await insertAsset(handle.db, b.id, { sha256: sha });
    expect(await sqlState(insertAsset(handle.db, b.id, { sha256: "NOTHEX" }))).toBe(CHECK_VIOLATION);
  });

  it("asset storage keys are unique", async () => {
    const book = await insertBook(handle.db);
    await insertAsset(handle.db, book.id, { storageKey: "books/shared-key.pdf" });
    expect(await sqlState(insertAsset(handle.db, book.id, { storageKey: "books/shared-key.pdf" }))).toBe(UNIQUE_VIOLATION);
  });

  it("foreign keys are enforced", async () => {
    expect(await sqlState(insertLicense(handle.db, "00000000-0000-4000-8000-000000000000"))).toBe(FK_VIOLATION);
  });

  it("updated_at moves forward on raw SQL updates (trigger)", async () => {
    const book = await insertBook(handle.db);
    await handle.db.execute(sql`update books set updated_at = '2000-01-01T00:00:00Z' where id = ${book.id}`);
    await handle.db.execute(sql`update books set title = 'Changed' where id = ${book.id}`);
    const [after] = await rows<{ updated_at: string }>(sql`select updated_at from books where id = ${book.id}`);
    expect(new Date(after?.updated_at ?? 0).getUTCFullYear()).toBeGreaterThan(2020);
  });
});

describe("full-text and trigram search", () => {
  it("generated tsvector is weighted, accent-insensitive, and trigram finds typos", async () => {
    await insertBook(handle.db, { slug: "intro-algorithms", title: "Introduction to Algorithms", description: "Sorting, graphs and dynamic programming." });
    await insertBook(handle.db, { slug: "cafe-culture", title: "Café Culture", subtitle: "Naïve résumé tricks", searchText: "Zoë Müller" });
    await insertBook(handle.db, { slug: "cpp-book", title: "Effective cpp", searchText: "c++ cpp" });

    const ranked = await rows<{ slug: string; rank: number }>(
      sql`select slug, ts_rank(search, websearch_to_tsquery('english', 'algorithm')) as rank from books where search @@ websearch_to_tsquery('english', 'algorithm') order by rank desc`,
    );
    expect(ranked.map((r) => r.slug)).toContain("intro-algorithms");

    const accent = await rows<{ slug: string }>(sql`select slug from books where search @@ websearch_to_tsquery('english', bookie_unaccent('cafe resume'))`);
    expect(accent.map((r) => r.slug)).toEqual(["cafe-culture"]);

    const author = await rows<{ slug: string }>(sql`select slug from books where search @@ websearch_to_tsquery('english', 'zoe muller')`);
    expect(author.map((r) => r.slug)).toEqual(["cafe-culture"]);

    const description = await rows<{ slug: string }>(sql`select slug from books where search @@ websearch_to_tsquery('english', 'dynamic programming')`);
    expect(description.map((r) => r.slug)).toEqual(["intro-algorithms"]);

    const typo = await rows<{ slug: string; sim: number }>(sql`select slug, word_similarity('algoritms', title) as sim from books where 'algoritms' <% title`);
    expect(typo.map((r) => r.slug)).toContain("intro-algorithms");

    // title (weight A) outranks the same word in the description (weight C)
    await insertBook(handle.db, { slug: "w-title", title: "Zephyrology", description: "plain" });
    await insertBook(handle.db, { slug: "w-desc", title: "Plain", description: "zephyrology" });
    const weighted = await rows<{ slug: string }>(
      sql`select slug from books where search @@ websearch_to_tsquery('english', 'zephyrology') order by ts_rank(search, websearch_to_tsquery('english', 'zephyrology')) desc`,
    );
    expect(weighted.map((r) => r.slug)).toEqual(["w-title", "w-desc"]);
  });

  it("uses the GIN indexes (planner can pick them on a larger table)", async () => {
    const idx = await rows<{ indexname: string }>(sql`select indexname from pg_indexes where tablename = 'books'`);
    const names = idx.map((i) => i.indexname);
    expect(names).toEqual(expect.arrayContaining(["books_search_gin", "books_title_trgm_gin", "books_slug_uq"]));
  });
});

describe("bootstrap reference data", () => {
  it("inserts the taxonomy once and is idempotent; admin edits survive", async () => {
    const first = await bootstrapReferenceData(handle.db);
    expect(first.categoriesInserted).toBe(REFERENCE_CATEGORIES.length);
    await handle.db.update(categories).set({ name: "Renamed by admin" }).where(eq(categories.slug, "databases"));
    const second = await bootstrapReferenceData(handle.db);
    expect(second.categoriesInserted).toBe(0);
    const all = await handle.db.select().from(categories);
    expect(all).toHaveLength(REFERENCE_CATEGORIES.length);
    expect(all.find((c) => c.slug === "databases")?.name).toBe("Renamed by admin");
  });

  it("creates no book, author, licence or asset records", async () => {
    const fresh = await createTestDb();
    try {
      await bootstrapReferenceData(fresh.db);
      for (const t of ["books", "authors", "licenses", "assets", "collections", "tags", "technologies"]) {
        const result = await fresh.db.execute(sql.raw(`select count(*)::int as n from ${t}`));
        expect((result as unknown as { rows: { n: number }[] }).rows[0]?.n).toBe(0);
      }
    } finally {
      await fresh.close();
    }
  });
});
