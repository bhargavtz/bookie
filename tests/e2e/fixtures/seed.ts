/**
 * TEST FIXTURE SEED. Used only by the Playwright webServer against the throwaway
 * `.data/e2e` PGlite + storage directory. These books, authors and licences are
 * obviously fake test data (titles start with "Test Book"); they are not product
 * seed data and must never be run against a real database. Run after migrations
 * and `db:bootstrap`, before the server starts (PGlite allows one process).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { loadEnv } from "@/lib/env";
import { createDb } from "@/server/db/client";
import { adminUsers, assets, authors, bookAuthors, bookCategories, books, categories, licenses } from "@/server/db/schema";
import { assetStorageKey } from "@/server/storage/keys";
import { LocalStorageDriver } from "@/server/storage/local";

const FIXTURES = path.resolve(process.cwd(), "tests/fixtures/generated");

type Spec = {
  slug: string;
  title: string;
  description: string;
  pdf: string | null; // fixture file written to storage; null = asset row without a stored object
  withSha: boolean;
  license: "approved" | "restricted" | "removed";
  allowRead: boolean;
  allowDownload: boolean;
  category: string;
  pageCount: number;
};

const SPECS: Spec[] = [
  { slug: "test-book-alpha", title: "Test Book Alpha", description: "Test fixture. A sample Python programming guide with 24 pages.", pdf: "multipage.pdf", withSha: true, license: "approved", allowRead: true, allowDownload: true, category: "programming-languages", pageCount: 24 },
  { slug: "test-book-beta", title: "Test Book Beta", description: "Test fixture. A short searchable sample about indexing.", pdf: "searchable.pdf", withSha: true, license: "approved", allowRead: true, allowDownload: true, category: "programming-languages", pageCount: 2 },
  { slug: "test-book-gamma", title: "Test Book Gamma", description: "Test fixture. Web development sample, read only, no download.", pdf: "searchable.pdf", withSha: false, license: "approved", allowRead: true, allowDownload: false, category: "web-development", pageCount: 2 },
  { slug: "test-book-restricted", title: "Test Book Restricted", description: "Test fixture. Restricted licence: readable, never downloadable.", pdf: "restricted.pdf", withSha: true, license: "restricted", allowRead: true, allowDownload: false, category: "databases", pageCount: 3 },
  { slug: "test-book-removed", title: "Test Book Removed", description: "Test fixture. Removed by takedown.", pdf: "searchable.pdf", withSha: false, license: "removed", allowRead: false, allowDownload: false, category: "databases", pageCount: 2 },
  { slug: "test-book-missing-pdf", title: "Test Book Missing Pdf", description: "Test fixture. Asset row is ready but the stored file is gone.", pdf: null, withSha: false, license: "approved", allowRead: true, allowDownload: true, category: "web-development", pageCount: 5 },
];

async function sha256(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  if (env.DATABASE_URL !== undefined) throw new Error("e2e seed refuses to run against DATABASE_URL");
  const dataDir = path.resolve(process.cwd(), env.PGLITE_DATA_DIR);
  if (!dataDir.includes(`${path.sep}.data${path.sep}e2e`)) throw new Error("e2e seed only runs on .data/e2e");
  const storage = new LocalStorageDriver(path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR));
  const handle = await createDb({ kind: "pglite", dataDir });
  const db = handle.db;
  try {
    const [approver] = await db
      .insert(adminUsers)
      .values({ email: "fixture-approver@example.test", passwordHash: "scrypt$1$1$1$c2FsdA$aGFzaA", role: "owner" })
      .returning();
    if (!approver) throw new Error("approver insert failed");
    const [author] = await db.insert(authors).values({ slug: "test-author", name: "Test Author" }).returning();
    if (!author) throw new Error("author insert failed");

    for (const spec of SPECS) {
      const [category] = await db.select().from(categories).where(eq(categories.slug, spec.category));
      if (!category) throw new Error(`category ${spec.category} missing; run db:bootstrap first`);
      const [book] = await db
        .insert(books)
        .values({
          slug: spec.slug,
          title: spec.title,
          description: spec.description,
          searchText: "Test Author python",
          pageCount: spec.pageCount,
          level: "beginner",
          publishedYear: 2024,
        })
        .returning();
      if (!book) throw new Error("book insert failed");
      await db.insert(bookAuthors).values({ bookId: book.id, authorId: author.id, position: 0 });
      await db.insert(bookCategories).values({ bookId: book.id, categoryId: category.id, isPrimary: true });

      const assetId = randomUUID();
      const key = assetStorageKey(book.id, assetId, "pdf");
      let size = 1024;
      let hash: string | null = null;
      if (spec.pdf !== null) {
        const bytes = new Uint8Array(await readFile(path.join(FIXTURES, spec.pdf)));
        await storage.put(key, bytes, { contentType: "application/pdf" });
        size = bytes.byteLength;
        if (spec.withSha) hash = await sha256(bytes);
      }
      await db.insert(assets).values({
        id: assetId,
        bookId: book.id,
        kind: "pdf",
        storageDriver: "local",
        storageKey: key,
        originalFilename: `${spec.slug}.pdf`,
        mimeType: "application/pdf",
        byteSize: size,
        sha256: hash,
        pageCount: spec.pageCount,
        status: "ready",
      });
      await db.insert(licenses).values({
        bookId: book.id,
        // A removed licence cannot be inserted on a published book: it is approved now and removed after publishing.
        rightsStatus: spec.license === "removed" ? "approved" : spec.license,
        licenseType: "project-original",
        rightsHolder: "Test fixture (not a real rights holder)",
        attributionText: "Test fixture",
        approvedBy: approver.id,
        approvedAt: new Date(),
        allowRead: spec.allowRead,
        allowDownload: spec.allowDownload,
        ...(spec.license === "restricted" ? { restrictedReason: "test fixture" } : {}),
      });
      // The publish guard trigger needs the asset and licence first: publish last.
      await db.update(books).set({ primaryAssetId: assetId, status: "published", publishedAt: new Date() }).where(eq(books.id, book.id));
      if (spec.license === "removed") {
        await db.transaction(async (tx) => {
          await tx.update(books).set({ status: "unpublished" }).where(eq(books.id, book.id));
          await tx
            .update(licenses)
            .set({ rightsStatus: "removed", allowRead: false, allowDownload: false, removedAt: new Date(), removedReason: "test fixture takedown" })
            .where(eq(licenses.bookId, book.id));
        });
      }
    }
    console.warn(`e2e fixtures seeded: ${SPECS.length} test books`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "seed failed");
  process.exit(1);
});
