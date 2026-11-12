import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminPrincipal } from "@/server/auth/session";
import type { DbHandle } from "@/server/db/client";
import { auditLog, collectionBooks, downloadEvents } from "@/server/db/schema";
import * as svc from "@/server/services/admin";
import * as taxonomy from "@/server/services/admin/taxonomy";
import { insertCategory, makeContext, makeStorage, principalFor, tinyPdf } from "../helpers/admin";
import { createTestDb } from "../helpers/db";

let handle: DbHandle;
let cleanup: () => Promise<void>;
let ctx: svc.AdminContext;
let owner: AdminPrincipal;
let editor: AdminPrincipal;
let reviewer: AdminPrincipal;
const NOW = new Date("2026-06-15T12:00:00Z");

beforeAll(async () => {
  handle = await createTestDb();
  const made = await makeStorage();
  cleanup = made.cleanup;
  ctx = makeContext(handle.db, made.storage, () => NOW);
  [owner, editor, reviewer] = await Promise.all([principalFor(handle.db, "owner"), principalFor(handle.db, "editor"), principalFor(handle.db, "reviewer")]);
  await insertCategory(handle.db, "algorithms", "Algorithms");
  await insertCategory(handle.db, "web", "Web");
  await insertCategory(handle.db, "empty", "Empty");
});
afterAll(async () => {
  await handle.close();
  await cleanup();
});

async function fail(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as svc.AdminError;
  }
  throw new Error("expected the call to fail");
}

describe("overview statistics", () => {
  it("counts unique live books per category and overall, plus rights, review and download stats", async () => {
    const both = await svc.createBook(ctx, owner, { title: "Both Categories", authors: ["A"], categories: ["algorithms", "web"] });
    const one = await svc.createBook(ctx, owner, { title: "One Category", authors: ["A"], categories: ["algorithms"] });
    const none = await svc.createBook(ctx, owner, { title: "No Category", authors: ["A"] });
    const gone = await svc.createBook(ctx, owner, { title: "Deleted Book", authors: ["A"], categories: ["web"] });
    await svc.deleteBook(ctx, owner, gone.book.id);
    await svc.submitForReview(ctx, owner, one.book.id);
    const asset = await svc.uploadPdf(ctx, owner, both.book.id, { bytes: tinyPdf("stats"), filename: null });
    await svc.setLicense(ctx, owner, both.book.id, { rightsStatus: "pending" });

    await handle.db.insert(downloadEvents).values([
      { bookId: both.book.id, assetId: asset.id, outcome: "served", occurredAt: new Date("2026-06-10T00:00:00Z") },
      { bookId: both.book.id, assetId: asset.id, outcome: "served", occurredAt: new Date("2026-01-01T00:00:00Z") },
      { bookId: both.book.id, assetId: asset.id, outcome: "denied_policy", occurredAt: new Date("2026-06-10T00:00:00Z") },
      { bookId: one.book.id, outcome: "served", occurredAt: new Date("2026-06-11T00:00:00Z") },
    ]);
    await handle.db.insert((await import("@/server/db/schema")).takedownRequests).values({
      claimantName: "C", claimantEmail: "c@example.test", relationship: "other", description: "d".repeat(25), goodFaithConfirmed: true, signature: "C",
    });

    const stats = await svc.getOverview(ctx, editor);
    expect(stats.totalBooks).toBe(3);
    const byCategory = Object.fromEntries(stats.booksByCategory.map((c) => [c.slug, c.books]));
    expect(byCategory).toEqual({ algorithms: 2, web: 1, empty: 0 });
    expect(stats.uncategorisedBooks).toBe(1);
    expect(none.book.id).toBeDefined();
    expect(stats.booksByStatus).toEqual({ draft: 2, in_review: 1 });
    expect(stats.awaitingReview).toBe(1);
    expect(stats.booksByRights).toEqual({ none: 2, pending: 1 });
    expect(stats.openTakedowns).toBe(1);
    expect(stats.downloads.total).toBe(3);
    expect(stats.downloads.last30Days).toBe(2);
    expect(stats.downloads.topBooks[0]).toMatchObject({ bookId: both.book.id, downloads: 2 });
  });
});

describe("authors, categories, collections", () => {
  it("manages authors with unique slugs and blocks deleting an author still in use", async () => {
    expect(await fail(taxonomy.createAuthor(ctx, reviewer, { name: "Nope" }))).toMatchObject({ status: 403 });
    const a = await taxonomy.createAuthor(ctx, editor, { name: "Grace Test", bio: "Fixture bio" });
    const b = await taxonomy.createAuthor(ctx, editor, { name: "Grace Test" });
    expect(a.slug).toBe("grace-test");
    expect(b.slug).toBe("grace-test-2");
    expect((await taxonomy.updateAuthor(ctx, editor, a.id, { name: "Grace T. Test" })).name).toBe("Grace T. Test");
    await svc.createBook(ctx, owner, { title: "Uses Author", authors: ["Grace T. Test"] });
    expect(await fail(taxonomy.deleteAuthor(ctx, editor, a.id))).toMatchObject({ status: 409, code: "in_use" });
    await taxonomy.deleteAuthor(ctx, editor, b.id);
    expect(await fail(taxonomy.deleteAuthor(ctx, editor, b.id))).toMatchObject({ status: 404 });
    expect((await taxonomy.listAuthors(ctx, reviewer)).map((x) => x.name)).toContain("Grace T. Test");
  });

  it("manages categories: slug is fixed after creation, duplicates conflict, in-use deletes are refused", async () => {
    const created = await taxonomy.createCategory(ctx, editor, { name: "Compilers", sortOrder: 5 });
    expect(created.slug).toBe("compilers");
    const updated = await taxonomy.updateCategory(ctx, editor, created.id, { name: "Compiler Design", sortOrder: 6 });
    expect(updated).toMatchObject({ slug: "compilers", name: "Compiler Design" });
    expect(await fail(taxonomy.createCategory(ctx, editor, { name: "Compilers 2", slug: "compilers" }))).toMatchObject({ status: 409, code: "conflict" });
    expect(await fail(taxonomy.updateCategory(ctx, editor, created.id, { name: "X", parentId: created.id }))).toMatchObject({ status: 422 });
    await svc.createBook(ctx, owner, { title: "Compiler Book", authors: ["A"], categories: ["compilers"] });
    expect(await fail(taxonomy.deleteCategory(ctx, editor, created.id))).toMatchObject({ code: "in_use" });
    const spare = await taxonomy.createCategory(ctx, editor, { name: "Spare" });
    await taxonomy.deleteCategory(ctx, editor, spare.id);
  });

  it("manages collections and their ordered membership; unknown book ids are rejected", async () => {
    const x = await svc.createBook(ctx, owner, { title: "Coll X", authors: ["A"] });
    const y = await svc.createBook(ctx, owner, { title: "Coll Y", authors: ["A"] });
    const collection = await taxonomy.createCollection(ctx, editor, { title: "Starter Shelf", bookIds: [y.book.id, x.book.id], isFeatured: true });
    expect(collection).toMatchObject({ slug: "starter-shelf", status: "draft", isFeatured: true });
    const members = await handle.db.select().from(collectionBooks).where(eq(collectionBooks.collectionId, collection.id));
    expect(members.sort((m, n) => m.position - n.position).map((m) => m.bookId)).toEqual([y.book.id, x.book.id]);
    await taxonomy.updateCollection(ctx, editor, collection.id, { title: "Starter Shelf", status: "published", bookIds: [x.book.id] });
    expect((await handle.db.select().from(collectionBooks).where(eq(collectionBooks.collectionId, collection.id)))).toHaveLength(1);
    expect(await fail(taxonomy.createCollection(ctx, editor, { title: "Bad", bookIds: ["00000000-0000-4000-8000-0000000000bb"] }))).toMatchObject({ status: 422 });
    await taxonomy.deleteCollection(ctx, editor, collection.id);
    expect(await taxonomy.listCollections(ctx, editor)).toHaveLength(0);
  });

  it("every mutation above wrote an audit row and the audit log is readable only with audit.read", async () => {
    const actions = (await handle.db.select({ action: auditLog.action }).from(auditLog)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["author.create", "author.update", "author.delete", "category.create", "category.update", "category.delete", "collection.create", "collection.update", "collection.delete"]));
    expect(await fail(svc.getAuditLog(ctx, editor, {}))).toMatchObject({ status: 403 });
    const rows = await svc.getAuditLog(ctx, reviewer, { entityType: "author", limit: 5 });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.entityType === "author")).toBe(true);
  });
});
