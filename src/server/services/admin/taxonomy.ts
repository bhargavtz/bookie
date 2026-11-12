import { z } from "zod";
import { COLLECTION_STATUSES } from "@/contracts/enums";
import { optionalText, slugSchema, text, uuidSchema } from "@/contracts/primitives";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { AdminPrincipal } from "@/server/auth/session";
import { writeAudit } from "@/server/repositories/admin/audit";
import * as repo from "@/server/repositories/admin/taxonomy";
import { type AdminContext, inTransaction } from "./context";
import { AdminError, notFound, requirePermission } from "./errors";
import { parseOrThrow } from "./books";

type Entity = "author" | "category" | "collection";

async function audit(tx: Parameters<typeof writeAudit>[0], principal: AdminPrincipal, action: string, entity: Entity, id: string, diff?: Record<string, unknown>) {
  await writeAudit(tx, { adminUserId: principal.userId, action: `${entity}.${action}`, entityType: entity, entityId: id, ...(diff !== undefined ? { diff } : {}) });
}

// ---- authors ---------------------------------------------------------------

const authorSchema = z.object({ name: text(200), bio: optionalText(4000) });

export async function listAuthors(ctx: AdminContext, principal: AdminPrincipal) {
  requirePermission(principal, "book.read");
  return repo.listAuthors(ctx.db);
}

export async function createAuthor(ctx: AdminContext, principal: AdminPrincipal, input: unknown) {
  requirePermission(principal, "taxonomy.manage");
  const data = parseOrThrow(authorSchema, input);
  return inTransaction(ctx, async (tx) => {
    const slug = await uniqueSlug(data.name, (candidate) => repo.authorSlugTaken(tx, candidate));
    const row = await repo.insertAuthor(tx, { slug, name: data.name, bio: data.bio ?? null });
    await audit(tx, principal, "create", "author", row.id, { name: row.name });
    return row;
  });
}

export async function updateAuthor(ctx: AdminContext, principal: AdminPrincipal, id: string, input: unknown) {
  requirePermission(principal, "taxonomy.manage");
  const data = parseOrThrow(authorSchema, input);
  return inTransaction(ctx, async (tx) => {
    const row = await repo.updateAuthor(tx, id, { name: data.name, bio: data.bio ?? null });
    if (row === null) throw notFound("Author");
    await audit(tx, principal, "update", "author", id, { name: data.name });
    return row;
  });
}

export async function deleteAuthor(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<void> {
  requirePermission(principal, "taxonomy.manage");
  await inTransaction(ctx, async (tx) => {
    if (!(await repo.deleteAuthor(tx, id))) throw notFound("Author");
    await audit(tx, principal, "delete", "author", id);
  });
}

// ---- categories ------------------------------------------------------------

const categorySchema = z.object({
  name: text(100),
  slug: slugSchema.optional(),
  description: optionalText(500),
  parentId: uuidSchema.optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
  iconKey: optionalText(50),
});

export async function listCategories(ctx: AdminContext, principal: AdminPrincipal) {
  requirePermission(principal, "book.read");
  return repo.listCategories(ctx.db);
}

export async function createCategory(ctx: AdminContext, principal: AdminPrincipal, input: unknown) {
  requirePermission(principal, "taxonomy.manage");
  const data = parseOrThrow(categorySchema, input);
  return inTransaction(ctx, async (tx) => {
    const row = await repo.insertCategory(tx, {
      slug: data.slug ?? slugify(data.name),
      name: data.name,
      description: data.description ?? null,
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder,
      iconKey: data.iconKey ?? null,
    });
    await audit(tx, principal, "create", "category", row.id, { slug: row.slug });
    return row;
  });
}

/** The slug is stable once created (public URLs depend on it); everything else is editable. */
export async function updateCategory(ctx: AdminContext, principal: AdminPrincipal, id: string, input: unknown) {
  requirePermission(principal, "taxonomy.manage");
  const data = parseOrThrow(categorySchema.omit({ slug: true }), input);
  if (data.parentId === id) throw new AdminError(422, "validation_failed", "A category cannot be its own parent", [{ field: "parentId", message: "invalid" }]);
  return inTransaction(ctx, async (tx) => {
    const row = await repo.updateCategory(tx, id, {
      name: data.name,
      description: data.description ?? null,
      parentId: data.parentId ?? null,
      sortOrder: data.sortOrder,
      iconKey: data.iconKey ?? null,
    });
    if (row === null) throw notFound("Category");
    await audit(tx, principal, "update", "category", id, { name: data.name });
    return row;
  });
}

export async function deleteCategory(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<void> {
  requirePermission(principal, "taxonomy.manage");
  await inTransaction(ctx, async (tx) => {
    if (!(await repo.deleteCategory(tx, id))) throw notFound("Category");
    await audit(tx, principal, "delete", "category", id);
  });
}

// ---- collections -----------------------------------------------------------

const collectionSchema = z.object({
  title: text(200),
  slug: slugSchema.optional(),
  description: optionalText(2000),
  isFeatured: z.boolean().default(false),
  status: z.enum(COLLECTION_STATUSES).default("draft"),
  bookIds: z.array(uuidSchema).max(500).optional(),
});

export async function listCollections(ctx: AdminContext, principal: AdminPrincipal) {
  requirePermission(principal, "book.read");
  return repo.listCollections(ctx.db);
}

async function assertBooksExist(ctx: AdminContext, bookIds: readonly string[]): Promise<void> {
  const existing = await repo.existingBookIds(ctx.db, bookIds);
  const missing = bookIds.filter((id) => !existing.has(id));
  if (missing.length > 0) throw new AdminError(422, "validation_failed", "Unknown books in collection", [{ field: "bookIds", message: `unknown: ${missing.join(", ")}` }]);
}

/** Membership is curation only; whether a member is shown publicly is still decided by the rights policy. */
export async function createCollection(ctx: AdminContext, principal: AdminPrincipal, input: unknown) {
  requirePermission(principal, "collection.manage");
  const data = parseOrThrow(collectionSchema, input);
  if (data.bookIds !== undefined) await assertBooksExist(ctx, data.bookIds);
  return inTransaction(ctx, async (tx) => {
    const row = await repo.insertCollection(tx, {
      slug: data.slug ?? slugify(data.title),
      title: data.title,
      description: data.description ?? null,
      isFeatured: data.isFeatured,
      status: data.status,
    });
    if (data.bookIds !== undefined) await repo.setCollectionBooks(tx, row.id, data.bookIds);
    await audit(tx, principal, "create", "collection", row.id, { slug: row.slug });
    return row;
  });
}

export async function updateCollection(ctx: AdminContext, principal: AdminPrincipal, id: string, input: unknown) {
  requirePermission(principal, "collection.manage");
  const data = parseOrThrow(collectionSchema.omit({ slug: true }), input);
  if (data.bookIds !== undefined) await assertBooksExist(ctx, data.bookIds);
  return inTransaction(ctx, async (tx) => {
    const row = await repo.updateCollection(tx, id, {
      title: data.title,
      description: data.description ?? null,
      isFeatured: data.isFeatured,
      status: data.status,
    });
    if (row === null) throw notFound("Collection");
    if (data.bookIds !== undefined) await repo.setCollectionBooks(tx, id, data.bookIds);
    await audit(tx, principal, "update", "collection", id, { status: data.status });
    return row;
  });
}

export async function deleteCollection(ctx: AdminContext, principal: AdminPrincipal, id: string): Promise<void> {
  requirePermission(principal, "collection.manage");
  await inTransaction(ctx, async (tx) => {
    if (!(await repo.deleteCollection(tx, id))) throw notFound("Collection");
    await audit(tx, principal, "delete", "collection", id);
  });
}
