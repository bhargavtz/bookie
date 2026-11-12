import { z } from "zod";
import { bookCreateSchema, bookMetadataSchema, type BookMetadata } from "@/contracts/book";
import { BOOK_STATUSES } from "@/contracts/enums";
import { canPublish } from "@/lib/policy";
import type { AdminPrincipal } from "@/server/auth/session";
import { writeAudit } from "@/server/repositories/admin/audit";
import {
  findBooksByIsbn,
  freeBookSlug,
  getBook,
  getBookRelations,
  insertBook,
  listBooks as listBookRows,
  replaceBookRelations,
  setBookStatus,
  slugIsTaken,
  softDeleteBook,
  unknownCategorySlugs,
  unknownTechnologySlugs,
  updateBookFields,
  type BookFields,
  type BookRecord,
  type BookRelations,
} from "@/server/repositories/admin/books";
import { getAsset, type AssetRecord } from "@/server/repositories/admin/assets";
import { getLicense, type LicenseRecord } from "@/server/repositories/admin/licenses";
import { getPublishView } from "@/server/repositories/admin/publication";
import { type AdminContext, inTransaction } from "./context";
import { AdminError, notFound, requirePermission } from "./errors";

export type BookDetail = {
  book: BookRecord;
  relations: BookRelations;
  license: LicenseRecord | null;
  primaryAsset: AssetRecord | null;
  coverAsset: AssetRecord | null;
};

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AdminError(
    422,
    "validation_failed",
    "Some fields are invalid",
    result.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
  );
}

function toFields(meta: BookMetadata): BookFields {
  return {
    title: meta.title,
    subtitle: meta.subtitle ?? null,
    description: meta.description ?? null,
    language: meta.language,
    isbn13: meta.isbn13 ?? null,
    edition: meta.edition ?? null,
    publisher: meta.publisher ?? null,
    publishedYear: meta.publishedYear ?? null,
    pageCount: meta.pageCount ?? null,
    level: meta.level ?? null,
  };
}

/** Rejects unknown taxonomy slugs and an ISBN already used by another book (soft-deleted ones included). */
export async function assertMetadataIsAcceptable(ctx: AdminContext, meta: BookMetadata, excludeBookId?: string): Promise<void> {
  const [unknownCategories, unknownTechnologies] = await Promise.all([
    unknownCategorySlugs(ctx.db, meta.categories),
    unknownTechnologySlugs(ctx.db, meta.technologies),
  ]);
  const problems: { field: string; message: string }[] = [];
  if (unknownCategories.length > 0) problems.push({ field: "categories", message: `unknown: ${unknownCategories.join(", ")}` });
  if (unknownTechnologies.length > 0) problems.push({ field: "technologies", message: `unknown: ${unknownTechnologies.join(", ")}` });
  if (problems.length > 0) throw new AdminError(422, "validation_failed", "Some fields are invalid", problems);
  if (meta.isbn13 !== undefined) {
    // A soft-deleted book frees its ISBN (partial unique index), so only live books block.
    const hits = (await findBooksByIsbn(ctx.db, meta.isbn13, excludeBookId)).filter((hit) => !hit.deleted);
    if (hits.length > 0) {
      throw new AdminError(409, "duplicate_isbn", "Another book already has this ISBN-13", hits);
    }
  }
}

export async function getBookDetail(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<BookDetail> {
  requirePermission(principal, "book.read");
  const book = await getBook(ctx.db, id);
  if (book === null) throw notFound("Book");
  const [relations, license, primaryAsset, coverAsset] = await Promise.all([
    getBookRelations(ctx.db, id),
    getLicense(ctx.db, id),
    book.primaryAssetId === null ? null : getAsset(ctx.db, book.primaryAssetId),
    book.coverAssetId === null ? null : getAsset(ctx.db, book.coverAssetId),
  ]);
  return { book, relations, license, primaryAsset, coverAsset };
}

const listQuerySchema = z.object({
  status: z.enum(BOOK_STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
  includeDeleted: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).default(0),
});

export async function listBooks(ctx: AdminContext, principal: AdminPrincipal, query: unknown) {
  requirePermission(principal, "book.read");
  return listBookRows(ctx.db, parseOrThrow(listQuerySchema, query));
}

export async function createBook(ctx: AdminContext, principal: AdminPrincipal, input: unknown): Promise<BookDetail> {
  requirePermission(principal, "book.write");
  const data = parseOrThrow(bookCreateSchema, input);
  await assertMetadataIsAcceptable(ctx, data);
  const id = await inTransaction(ctx, async (tx) => {
    if (data.slug !== undefined && (await slugIsTaken(tx, data.slug))) {
      throw new AdminError(409, "conflict", "That slug is already in use");
    }
    const slug = data.slug ?? (await freeBookSlug(tx, data.title));
    const book = await insertBook(tx, slug, toFields(data));
    await replaceBookRelations(tx, book.id, {
      authorNames: data.authors,
      categorySlugs: data.categories,
      technologySlugs: data.technologies,
      tagNames: data.tags,
    });
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.create", entityType: "book", entityId: book.id, diff: { title: book.title, slug } });
    return book.id;
  });
  return getBookDetail(ctx, principal, id);
}

/** Full replacement of the editable metadata (PUT semantics). Never changes status, licence or files. */
export async function updateBook(ctx: AdminContext, principal: AdminPrincipal, id: string, input: unknown): Promise<BookDetail> {
  requirePermission(principal, "book.write");
  const data = parseOrThrow(bookMetadataSchema, input);
  const existing = await getBook(ctx.db, id);
  if (existing === null || existing.deletedAt !== null) throw notFound("Book");
  await assertMetadataIsAcceptable(ctx, data, id);
  await inTransaction(ctx, async (tx) => {
    await updateBookFields(tx, id, toFields(data));
    await replaceBookRelations(tx, id, {
      authorNames: data.authors,
      categorySlugs: data.categories,
      technologySlugs: data.technologies,
      tagNames: data.tags,
    });
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.update", entityType: "book", entityId: id, diff: { title: data.title } });
  });
  return getBookDetail(ctx, principal, id);
}

async function liveBookOrThrow(ctx: AdminContext, id: string): Promise<BookRecord> {
  const book = await getBook(ctx.db, id);
  if (book === null || book.deletedAt !== null) throw notFound("Book");
  return book;
}

export async function submitForReview(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<BookRecord> {
  requirePermission(principal, "book.write");
  const book = await liveBookOrThrow(ctx, id);
  if (book.status !== "draft" && book.status !== "unpublished") {
    throw new AdminError(409, "invalid_state", `A ${book.status} book cannot be submitted for review`);
  }
  await inTransaction(ctx, async (tx) => {
    await setBookStatus(tx, id, "in_review");
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.submit_review", entityType: "book", entityId: id, diff: { from: book.status, to: "in_review" } });
  });
  return liveBookOrThrow(ctx, id);
}

/**
 * Approve publication. Two independent checks: the pure policy (`canPublish`,
 * which lists every unmet requirement) and the database trigger (which the
 * policy can never be talked out of). A trigger refusal surfaces as `publish_blocked`.
 */
export async function approvePublication(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<BookRecord> {
  requirePermission(principal, "publication.approve");
  const book = await liveBookOrThrow(ctx, id);
  if (book.status === "published" || book.status === "archived") {
    throw new AdminError(409, "invalid_state", `A ${book.status} book cannot be published from here`);
  }
  const view = await getPublishView(ctx.db, id);
  if (view === null) throw notFound("Book");
  const decision = canPublish(view, ctx.now());
  if (!decision.allowed) {
    throw new AdminError(409, "publish_blocked", "The book does not meet the publication requirements", { missing: decision.missing });
  }
  await inTransaction(ctx, async (tx) => {
    await setBookStatus(tx, id, "published", ctx.now());
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.publish", entityType: "book", entityId: id, diff: { from: book.status, to: "published" } });
  });
  return liveBookOrThrow(ctx, id);
}

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(1000) });

export async function rejectPublication(ctx: AdminContext, principal: AdminPrincipal, id: string, input: unknown): Promise<BookRecord> {
  requirePermission(principal, "publication.approve");
  const { reason } = parseOrThrow(reasonSchema, input);
  const book = await liveBookOrThrow(ctx, id);
  if (book.status !== "in_review") throw new AdminError(409, "invalid_state", "Only a book in review can be rejected");
  await inTransaction(ctx, async (tx) => {
    await setBookStatus(tx, id, "draft");
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.reject_publication", entityType: "book", entityId: id, diff: { reason } });
  });
  return liveBookOrThrow(ctx, id);
}

export async function unpublishBook(ctx: AdminContext, principal: AdminPrincipal, id: string, input: unknown): Promise<BookRecord> {
  requirePermission(principal, "publication.approve");
  const { reason } = parseOrThrow(reasonSchema, input);
  const book = await liveBookOrThrow(ctx, id);
  if (book.status !== "published") throw new AdminError(409, "invalid_state", "Only a published book can be unpublished");
  await inTransaction(ctx, async (tx) => {
    await setBookStatus(tx, id, "unpublished");
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.unpublish", entityType: "book", entityId: id, diff: { reason } });
  });
  return liveBookOrThrow(ctx, id);
}

export async function archiveBook(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<BookRecord> {
  requirePermission(principal, "book.write");
  const book = await liveBookOrThrow(ctx, id);
  if (book.status === "archived") return book;
  await inTransaction(ctx, async (tx) => {
    await setBookStatus(tx, id, "archived");
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.archive", entityType: "book", entityId: id, diff: { from: book.status } });
  });
  return liveBookOrThrow(ctx, id);
}

/** Soft delete: the row stays (audit trail, takedown evidence); it is archived and hidden everywhere. */
export async function deleteBook(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<void> {
  requirePermission(principal, "book.delete");
  await liveBookOrThrow(ctx, id);
  await inTransaction(ctx, async (tx) => {
    await softDeleteBook(tx, id, ctx.now());
    await writeAudit(tx, { adminUserId: principal.userId, action: "book.delete", entityType: "book", entityId: id });
  });
}

