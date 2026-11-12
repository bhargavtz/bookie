import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminPrincipal } from "@/server/auth/session";
import type { DbHandle } from "@/server/db/client";
import { assets, auditLog, books, licenses, takedownRequests } from "@/server/db/schema";
import { setBookStatus } from "@/server/repositories/admin/books";
import * as svc from "@/server/services/admin";
import { mapDbError } from "@/server/services/admin/errors";
import { insertCategory, insertTechnology, makeContext, makeStorage, PNG_BYTES, principalFor, tinyPdf } from "../helpers/admin";
import { createTestDb } from "../helpers/db";

let handle: DbHandle;
let cleanup: () => Promise<void>;
let ctx: svc.AdminContext;
let storage: Awaited<ReturnType<typeof makeStorage>>["storage"];
let owner: AdminPrincipal;
let editor: AdminPrincipal;
let reviewer: AdminPrincipal;

beforeAll(async () => {
  handle = await createTestDb();
  const made = await makeStorage();
  storage = made.storage;
  cleanup = made.cleanup;
  ctx = makeContext(handle.db, storage);
  [owner, editor, reviewer] = await Promise.all([principalFor(handle.db, "owner"), principalFor(handle.db, "editor"), principalFor(handle.db, "reviewer")]);
  await insertCategory(handle.db, "algorithms", "Algorithms");
  await insertCategory(handle.db, "web", "Web");
  await insertTechnology(handle.db, "rust", "Rust");
});
afterAll(async () => {
  await handle.close();
  await cleanup();
});

let seq = 0;
const meta = (overrides: Record<string, unknown> = {}) => ({
  title: `Fixture Title ${++seq}`,
  authors: ["Fixture Author"],
  categories: ["algorithms"],
  ...overrides,
});
const evidence = { rightsStatus: "approved", licenseType: "project-original", rightsHolder: "Test Holder", sourceUrl: "https://example.org/evidence", allowRead: true } as const;

async function auditActions(bookId: string): Promise<string[]> {
  const rows = await handle.db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.entityId, bookId));
  return rows.map((r) => r.action);
}
async function fail(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as svc.AdminError;
  }
  throw new Error("expected the call to fail");
}

describe("book CRUD and role checks", () => {
  it("creates a draft with relations, a generated slug and an audit row; reads it back", async () => {
    const created = await svc.createBook(ctx, editor, meta({ title: "Systems & Things", authors: ["Ada Test", "Bob Test"], technologies: ["rust"], tags: ["Memory Safety"] }));
    expect(created.book).toMatchObject({ status: "draft", slug: "systems-and-things", publishedAt: null });
    expect(created.relations.authors.map((a) => a.name)).toEqual(["Ada Test", "Bob Test"]);
    expect(created.relations.categories[0]).toMatchObject({ slug: "algorithms", isPrimary: true });
    expect(created.relations.technologies.map((t) => t.slug)).toEqual(["rust"]);
    expect(created.license).toBeNull();
    expect(await auditActions(created.book.id)).toEqual(["book.create"]);
    const [row] = await handle.db.select({ searchText: books.searchText }).from(books).where(eq(books.id, created.book.id));
    expect(row?.searchText).toBe("Ada Test Bob Test Rust Memory Safety");
  });

  it("gives a second book with the same title a distinct slug", async () => {
    const a = await svc.createBook(ctx, owner, meta({ title: "Same Title" }));
    const b = await svc.createBook(ctx, owner, meta({ title: "Same Title" }));
    expect(b.book.slug).toBe(`${a.book.slug}-2`);
  });

  it("rejects invalid input, unknown taxonomy and duplicate ISBN with clear errors", async () => {
    const invalid = await fail(svc.createBook(ctx, editor, { title: "", authors: [] }));
    expect(invalid).toMatchObject({ status: 422, code: "validation_failed" });
    const unknown = await fail(svc.createBook(ctx, editor, meta({ categories: ["nope"], technologies: ["cobol"] })));
    expect(unknown).toMatchObject({ status: 422 });
    expect(JSON.stringify(unknown.details)).toContain("nope");
    await svc.createBook(ctx, editor, meta({ isbn13: "978-0-306-40615-7" }));
    const dup = await fail(svc.createBook(ctx, editor, meta({ isbn13: "0306406152" })));
    expect(dup).toMatchObject({ status: 409, code: "duplicate_isbn" });
  });

  it("enforces roles: reviewer cannot create or upload, editor cannot approve or publish", async () => {
    expect(await fail(svc.createBook(ctx, reviewer, meta()))).toMatchObject({ status: 403 });
    const book = await svc.createBook(ctx, editor, meta());
    expect(await fail(svc.uploadPdf(ctx, reviewer, book.book.id, { bytes: tinyPdf("role"), filename: "a.pdf" }))).toMatchObject({ status: 403 });
    expect(await fail(svc.approvePublication(ctx, editor, book.book.id))).toMatchObject({ status: 403 });
    expect(await fail(svc.setLicense(ctx, editor, book.book.id, evidence))).toMatchObject({ status: 403 });
    expect(await fail(svc.getOverview(ctx, { ...editor, role: "visitor" as never }))).toMatchObject({ status: 403 });
  });

  it("updates metadata (PUT), 404s for unknown and non-UUID-shaped missing ids, and soft-deletes", async () => {
    const book = await svc.createBook(ctx, editor, meta({ title: "Before" }));
    const updated = await svc.updateBook(ctx, editor, book.book.id, meta({ title: "After", authors: ["New Author"], categories: ["web"] }));
    expect(updated.book.title).toBe("After");
    expect(updated.relations.authors.map((a) => a.name)).toEqual(["New Author"]);
    expect(updated.relations.categories.map((c) => c.slug)).toEqual(["web"]);
    expect(await fail(svc.getBookDetail(ctx, editor, "00000000-0000-4000-8000-0000000000aa"))).toMatchObject({ status: 404 });

    await svc.deleteBook(ctx, editor, book.book.id);
    expect(await fail(svc.updateBook(ctx, editor, book.book.id, meta()))).toMatchObject({ status: 404 });
    const listed = await svc.listBooks(ctx, editor, { q: "After" });
    expect(listed.items.find((b) => b.id === book.book.id)).toBeUndefined();
    expect((await svc.listBooks(ctx, editor, { q: "After", includeDeleted: true })).items).toHaveLength(1);
    expect(await auditActions(book.book.id)).toEqual(expect.arrayContaining(["book.create", "book.update", "book.delete"]));
  });
});

describe("publish guard", () => {
  it("refuses to publish with no licence, listing every unmet requirement, and leaves the book a draft", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    const error = await fail(svc.approvePublication(ctx, reviewer, book.book.id));
    expect(error).toMatchObject({ status: 409, code: "publish_blocked" });
    expect(error.details).toMatchObject({ missing: expect.arrayContaining(["license_exists", "primary_pdf_ready", "pdf_sha256"]) });
    expect((await svc.getBookDetail(ctx, owner, book.book.id)).book.status).toBe("draft");
  });

  it("a pending licence does not allow publishing; an approved licence alone is still not enough (no PDF)", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    await svc.setLicense(ctx, editor, book.book.id, { rightsStatus: "pending", evidenceNote: "asked the author" });
    const pending = await fail(svc.approvePublication(ctx, reviewer, book.book.id));
    expect(pending.details).toMatchObject({ missing: expect.arrayContaining(["rights_approved_or_restricted"]) });
    await svc.setLicense(ctx, reviewer, book.book.id, evidence);
    const noPdf = await fail(svc.approvePublication(ctx, reviewer, book.book.id));
    expect(noPdf.details).toMatchObject({ missing: ["primary_pdf_ready", "pdf_sha256"] });
  });

  it("the database trigger refuses a direct publish and the error maps to a clean publish_blocked", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    let raised: unknown;
    try {
      await setBookStatus(handle.db, book.book.id, "published", new Date());
    } catch (error) {
      raised = error;
    }
    expect(raised).toBeDefined();
    const mapped = mapDbError(raised);
    expect(mapped).toMatchObject({ status: 409, code: "publish_blocked" });
    expect((mapped as Error).message).not.toMatch(/books_publish|SQLSTATE|insert|update/i);
    expect((await svc.getBookDetail(ctx, owner, book.book.id)).book.status).toBe("draft");
  });

  it("publishes once licence evidence, approval and a ready checksummed PDF exist; audit rows record each step", async () => {
    const book = await svc.createBook(ctx, editor, meta());
    const id = book.book.id;
    const asset = await svc.uploadPdf(ctx, editor, id, { bytes: tinyPdf("publish-ok"), filename: "../book.pdf" });
    expect(asset).toMatchObject({ kind: "pdf", status: "ready", mimeType: "application/pdf", originalFilename: "book.pdf" });
    expect(asset.storageKey).toBe(`books/${id}/${asset.id}.pdf`);
    expect((await storage.stat(asset.storageKey))?.size).toBe(asset.byteSize);

    await svc.submitForReview(ctx, editor, id);
    const license = await svc.setLicense(ctx, reviewer, id, evidence);
    expect(license).toMatchObject({ rightsStatus: "approved", approvedBy: reviewer.userId });
    const published = await svc.approvePublication(ctx, reviewer, id);
    expect(published).toMatchObject({ status: "published" });
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(await auditActions(id)).toEqual(
      expect.arrayContaining(["book.create", "asset.upload_pdf", "book.submit_review", "license.update", "book.publish"]),
    );
  });

  it("allows a restricted licence to publish (read-only)", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    await svc.uploadPdf(ctx, owner, book.book.id, { bytes: tinyPdf("restricted"), filename: null });
    await svc.setLicense(ctx, reviewer, book.book.id, { ...evidence, rightsStatus: "restricted", restrictedReason: "read-only grant" });
    expect((await svc.approvePublication(ctx, reviewer, book.book.id)).status).toBe("published");
  });

  it("rejecting publication returns the book to draft with the reason in the audit log", async () => {
    const book = await svc.createBook(ctx, editor, meta());
    await svc.submitForReview(ctx, editor, book.book.id);
    expect(await fail(svc.rejectPublication(ctx, reviewer, book.book.id, { reason: "x" }))).toMatchObject({ status: 422 });
    expect((await svc.rejectPublication(ctx, reviewer, book.book.id, { reason: "no rights evidence" })).status).toBe("draft");
    const [row] = await handle.db.select().from(auditLog).where(eq(auditLog.action, "book.reject_publication"));
    expect(row?.diff).toMatchObject({ reason: "no rights evidence" });
    expect(await fail(svc.rejectPublication(ctx, reviewer, book.book.id, { reason: "again again" }))).toMatchObject({ code: "invalid_state" });
  });

  it("replacing the PDF of a published book sends it back to review", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    const first = await svc.uploadPdf(ctx, owner, book.book.id, { bytes: tinyPdf("replace-1"), filename: null });
    await svc.setLicense(ctx, owner, book.book.id, evidence);
    await svc.approvePublication(ctx, owner, book.book.id);
    const second = await svc.uploadPdf(ctx, owner, book.book.id, { bytes: tinyPdf("replace-2"), filename: null });
    const detail = await svc.getBookDetail(ctx, owner, book.book.id);
    expect(detail.book.status).toBe("in_review");
    expect(detail.book.primaryAssetId).toBe(second.id);
    expect(await storage.stat(first.storageKey)).toBeNull();
    const [old] = await handle.db.select().from(assets).where(eq(assets.id, first.id));
    expect(old?.status).toBe("deleted");
  });

  it("unpublish, archive and unpublishing on licence downgrade", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    const id = book.book.id;
    await svc.uploadPdf(ctx, owner, id, { bytes: tinyPdf("downgrade"), filename: null });
    await svc.setLicense(ctx, owner, id, evidence);
    await svc.approvePublication(ctx, owner, id);
    // Downgrading the licence of a published book must unpublish it in the same transaction.
    await svc.setLicense(ctx, reviewer, id, { rightsStatus: "pending" });
    expect((await svc.getBookDetail(ctx, owner, id)).book.status).toBe("unpublished");
    expect(await fail(svc.unpublishBook(ctx, reviewer, id, { reason: "already off" }))).toMatchObject({ code: "invalid_state" });
    expect((await svc.archiveBook(ctx, editor, id)).status).toBe("archived");
  });
});

describe("licences", () => {
  it("validates URLs with the SSRF-safe validator and the cross-field rules; never fetches", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    const bad = await fail(svc.setLicense(ctx, owner, book.book.id, { ...evidence, sourceUrl: "https://169.254.169.254/latest/meta-data" }));
    expect(bad).toMatchObject({ status: 422 });
    expect(await fail(svc.setLicense(ctx, owner, book.book.id, { ...evidence, licenseUrl: "http://example.org/" }))).toMatchObject({ status: 422 });
    expect(await fail(svc.setLicense(ctx, owner, book.book.id, { ...evidence, rightsStatus: "restricted", restrictedReason: "r", allowDownload: true }))).toMatchObject({ status: 422 });
    expect(await fail(svc.setLicense(ctx, owner, book.book.id, { ...evidence, rightsHolder: undefined }))).toMatchObject({ status: 422 });
    expect(await handle.db.select().from(licenses).where(eq(licenses.bookId, book.book.id))).toHaveLength(0);
  });

  it("stamps the approver and keeps a single row per book", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    await svc.setLicense(ctx, editor, book.book.id, { rightsStatus: "pending", sourceUrl: "https://example.org/a" });
    const approved = await svc.setLicense(ctx, reviewer, book.book.id, { ...evidence, allowDownload: true });
    expect(approved).toMatchObject({ approvedBy: reviewer.userId, allowDownload: true });
    expect(await handle.db.select().from(licenses).where(eq(licenses.bookId, book.book.id))).toHaveLength(1);
  });
});

describe("uploads and checksum duplicate detection", () => {
  it("refuses the same PDF bytes for a second book, reporting where it already lives, and stores nothing", async () => {
    const first = await svc.createBook(ctx, owner, meta({ title: "Original Holder" }));
    const second = await svc.createBook(ctx, owner, meta({ title: "Would Be Duplicate" }));
    const bytes = tinyPdf("dup-check");
    const asset = await svc.uploadPdf(ctx, owner, first.book.id, { bytes, filename: "a.pdf" });
    const error = await fail(svc.uploadPdf(ctx, owner, second.book.id, { bytes, filename: "b.pdf" }));
    expect(error).toMatchObject({ status: 409, code: "duplicate_checksum" });
    expect(error.details).toMatchObject({ bookId: first.book.id, title: "Original Holder" });
    expect(await handle.db.select().from(assets).where(eq(assets.bookId, second.book.id))).toHaveLength(0);
    expect(await storage.stat(`books/${second.book.id}/${asset.id}.pdf`)).toBeNull();

    const matches = await svc.duplicatesForBook(ctx, owner, second.book.id);
    expect(matches.checksum).toBeNull();
    await svc.uploadPdf(ctx, owner, second.book.id, { bytes: tinyPdf("different"), filename: null });
    // Same bytes re-uploaded to the SAME book are a duplicate too.
    expect(await fail(svc.uploadPdf(ctx, owner, first.book.id, { bytes, filename: null }))).toMatchObject({ code: "duplicate_checksum" });
  });

  it("allows bytes whose only other copy was replaced (deleted)", async () => {
    const a = await svc.createBook(ctx, owner, meta());
    const b = await svc.createBook(ctx, owner, meta());
    await svc.uploadPdf(ctx, owner, a.book.id, { bytes: tinyPdf("old-version"), filename: null });
    await svc.uploadPdf(ctx, owner, a.book.id, { bytes: tinyPdf("new-version"), filename: null });
    await expect(svc.uploadPdf(ctx, owner, b.book.id, { bytes: tinyPdf("old-version"), filename: null })).resolves.toMatchObject({ status: "ready" });
  });

  it("rejects non-PDF, oversized, empty and truncated uploads and leaves no stored object or row", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    const before = await handle.db.select().from(assets).where(eq(assets.bookId, book.book.id));
    expect(await fail(svc.uploadPdf(ctx, owner, book.book.id, { bytes: PNG_BYTES, filename: "x.pdf" }))).toMatchObject({ status: 415, code: "upload_rejected" });
    expect(await fail(svc.uploadPdf(ctx, owner, book.book.id, { bytes: new Uint8Array(ctx.maxUploadBytes + 1).fill(0x25), filename: null }))).toMatchObject({ status: 413 });
    expect(await fail(svc.uploadPdf(ctx, owner, book.book.id, { bytes: new Uint8Array(0), filename: null }))).toMatchObject({ status: 422 });
    expect(await fail(svc.uploadPdf(ctx, owner, book.book.id, { bytes: new TextEncoder().encode("%PDF-1.7 cut off"), filename: null }))).toMatchObject({ status: 422 });
    expect(await handle.db.select().from(assets).where(eq(assets.bookId, book.book.id))).toEqual(before);
  });

  it("stores a cover by magic bytes with the matching extension and replaces the old one", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    const cover = await svc.uploadCover(ctx, owner, book.book.id, { bytes: PNG_BYTES, filename: "cover.exe" });
    expect(cover).toMatchObject({ kind: "cover", mimeType: "image/png" });
    expect(cover.storageKey.endsWith(".png")).toBe(true);
    expect((await svc.getBookDetail(ctx, owner, book.book.id)).book.coverAssetId).toBe(cover.id);
    expect(await fail(svc.uploadCover(ctx, owner, book.book.id, { bytes: tinyPdf("not-an-image"), filename: "c.png" }))).toMatchObject({ status: 415 });
    const jpeg = await svc.uploadCover(ctx, owner, book.book.id, { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]), filename: null });
    expect(jpeg.storageKey.endsWith(".jpg")).toBe(true);
    expect(await storage.stat(cover.storageKey)).toBeNull();
  });

  it("scans the library for ISBN and checksum duplicates, including a soft-deleted twin", async () => {
    const original = await svc.createBook(ctx, owner, meta({ isbn13: "9781402894626" }));
    await svc.deleteBook(ctx, owner, original.book.id);
    // A soft-deleted book frees the ISBN for reuse...
    const reused = await svc.createBook(ctx, owner, meta({ isbn13: "9781402894626" }));
    // ...but the admin can still see the pair.
    const report = await svc.scanDuplicates(ctx, reviewer);
    const group = report.isbn.find((g) => g.key === "9781402894626");
    expect(group?.books.map((b) => b.bookId).sort()).toEqual([original.book.id, reused.book.id].sort());
    expect(group?.books.find((b) => b.bookId === original.book.id)?.deleted).toBe(true);
    const matches = await svc.duplicatesForBook(ctx, reviewer, reused.book.id);
    expect(matches.isbn.map((m) => m.bookId)).toEqual([original.book.id]);
    expect(await fail(svc.scanDuplicates(ctx, { ...editor, role: "visitor" as never }))).toMatchObject({ status: 403 });
  });

  it("hints at similar titles for review", async () => {
    await svc.createBook(ctx, owner, meta({ title: "Practical Rust Systems Programming" }));
    const near = await svc.createBook(ctx, owner, meta({ title: "Practical Rust Systems Programming, 2nd Edition" }));
    const matches = await svc.duplicatesForBook(ctx, owner, near.book.id);
    expect(matches.similarTitles.length).toBeGreaterThan(0);
  });
});

describe("takedown / removal", () => {
  async function publishedBook() {
    const book = await svc.createBook(ctx, owner, meta());
    await svc.uploadPdf(ctx, owner, book.book.id, { bytes: tinyPdf(`takedown-${++seq}`), filename: null });
    await svc.setLicense(ctx, owner, book.book.id, { ...evidence, allowDownload: true });
    await svc.approvePublication(ctx, owner, book.book.id);
    return book.book.id;
  }

  it("sets the licence to removed, unpublishes, records an upheld takedown request and audits, all together", async () => {
    const id = await publishedBook();
    expect(await fail(svc.removeBookForTakedown(ctx, editor, id, { reason: "rights holder asked" }))).toMatchObject({ status: 403 });
    expect(await fail(svc.removeBookForTakedown(ctx, reviewer, id, { reason: "rights holder asked" }))).toMatchObject({ status: 422 });

    const result = await svc.removeBookForTakedown(ctx, reviewer, id, {
      reason: "rights holder asked by email",
      claimant: { name: "Pat Claimant", email: "pat@example.test", relationship: "author", description: "I am the author of this work." },
    });
    const detail = await svc.getBookDetail(ctx, reviewer, id);
    expect(detail.book.status).toBe("unpublished");
    expect(detail.license).toMatchObject({ rightsStatus: "removed", allowRead: false, allowDownload: false, removedReason: "rights holder asked by email" });
    expect(detail.license?.removedAt).toBeInstanceOf(Date);
    const [request] = await handle.db.select().from(takedownRequests).where(eq(takedownRequests.id, result.takedownRequestId));
    expect(request).toMatchObject({ bookId: id, status: "upheld", resolvedBy: reviewer.userId });
    expect(await auditActions(id)).toContain("book.takedown_remove");
    expect(await fail(svc.approvePublication(ctx, owner, id))).toMatchObject({ code: "publish_blocked" });
  });

  it("resolves an existing public request instead of creating a new one", async () => {
    const id = await publishedBook();
    const [inserted] = await handle.db
      .insert(takedownRequests)
      .values({ bookId: id, claimantName: "Sam Claimant", claimantEmail: "sam@example.test", relationship: "publisher", description: "Please remove this work.", goodFaithConfirmed: true, signature: "Sam Claimant" })
      .returning();
    const before = await handle.db.select().from(takedownRequests);
    await svc.removeBookForTakedown(ctx, reviewer, id, { reason: "upheld after review", takedownRequestId: inserted?.id });
    expect(await handle.db.select().from(takedownRequests)).toHaveLength(before.length);
    const [after] = await handle.db.select().from(takedownRequests).where(eq(takedownRequests.id, inserted?.id ?? ""));
    expect(after).toMatchObject({ status: "upheld", resolutionNote: "upheld after review" });
    const open = await svc.listTakedownRequests(ctx, reviewer, { status: "open" });
    expect(open.find((r) => r.id === inserted?.id)).toBeUndefined();
  });

  it("can remove a never-published book with no licence row and triage a request without removal", async () => {
    const book = await svc.createBook(ctx, owner, meta());
    await svc.removeBookForTakedown(ctx, owner, book.book.id, {
      reason: "precautionary removal",
      claimant: { name: "Lee Claimant", email: "lee@example.test", relationship: "other", description: "Believes this is infringing." },
    });
    expect((await svc.getBookDetail(ctx, owner, book.book.id)).license?.rightsStatus).toBe("removed");

    const [req] = await handle.db
      .insert(takedownRequests)
      .values({ claimantName: "Kim Claimant", claimantEmail: "kim@example.test", relationship: "other", description: "Looks unfounded.", goodFaithConfirmed: true, signature: "Kim" })
      .returning();
    expect(await fail(svc.updateTakedownStatus(ctx, reviewer, req?.id ?? "", { status: "upheld", note: "should use remove" }))).toMatchObject({ status: 422 });
    await svc.updateTakedownStatus(ctx, reviewer, req?.id ?? "", { status: "rejected", note: "no rights shown" });
    expect(await auditActions(req?.id ?? "")).toEqual(["takedown.update"]);
  });
});
