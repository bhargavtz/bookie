import { asc, eq, inArray } from "drizzle-orm";
import type { CollectionStatus } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { authors, books, categories, collectionBooks, collections } from "@/server/db/schema";

export type AuthorRecord = { id: string; slug: string; name: string; bio: string | null };
const authorColumns = { id: authors.id, slug: authors.slug, name: authors.name, bio: authors.bio };

export async function listAuthors(db: Db): Promise<AuthorRecord[]> {
  return db.select(authorColumns).from(authors).orderBy(asc(authors.name));
}
export async function getAuthor(db: Db, id: string): Promise<AuthorRecord | null> {
  return (await db.select(authorColumns).from(authors).where(eq(authors.id, id)).limit(1))[0] ?? null;
}
export async function insertAuthor(db: Db, values: { slug: string; name: string; bio: string | null }): Promise<AuthorRecord> {
  const row = (await db.insert(authors).values(values).returning(authorColumns))[0];
  if (row === undefined) throw new Error("author insert returned no row");
  return row;
}
export async function updateAuthor(db: Db, id: string, values: { name?: string; bio?: string | null }): Promise<AuthorRecord | null> {
  if (Object.keys(values).length === 0) return getAuthor(db, id);
  return (await db.update(authors).set(values).where(eq(authors.id, id)).returning(authorColumns))[0] ?? null;
}
/** Fails with a foreign-key violation (23503) while any book still references the author. */
export async function deleteAuthor(db: Db, id: string): Promise<boolean> {
  return (await db.delete(authors).where(eq(authors.id, id)).returning({ id: authors.id })).length > 0;
}

export type CategoryRecord = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  iconKey: string | null;
};
const categoryColumns = {
  id: categories.id,
  slug: categories.slug,
  name: categories.name,
  description: categories.description,
  parentId: categories.parentId,
  sortOrder: categories.sortOrder,
  iconKey: categories.iconKey,
};

export async function listCategories(db: Db): Promise<CategoryRecord[]> {
  return db.select(categoryColumns).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}
export async function getCategory(db: Db, id: string): Promise<CategoryRecord | null> {
  return (await db.select(categoryColumns).from(categories).where(eq(categories.id, id)).limit(1))[0] ?? null;
}
export async function insertCategory(db: Db, values: Omit<CategoryRecord, "id">): Promise<CategoryRecord> {
  const row = (await db.insert(categories).values(values).returning(categoryColumns))[0];
  if (row === undefined) throw new Error("category insert returned no row");
  return row;
}
export async function updateCategory(db: Db, id: string, values: Partial<Omit<CategoryRecord, "id" | "slug">>): Promise<CategoryRecord | null> {
  if (Object.keys(values).length === 0) return getCategory(db, id);
  return (await db.update(categories).set(values).where(eq(categories.id, id)).returning(categoryColumns))[0] ?? null;
}
/** Fails with 23503 while any book is filed under the category. */
export async function deleteCategory(db: Db, id: string): Promise<boolean> {
  return (await db.delete(categories).where(eq(categories.id, id)).returning({ id: categories.id })).length > 0;
}

export type CollectionRecord = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  isFeatured: boolean;
  status: CollectionStatus;
};
const collectionColumns = {
  id: collections.id,
  slug: collections.slug,
  title: collections.title,
  description: collections.description,
  isFeatured: collections.isFeatured,
  status: collections.status,
};

export async function listCollections(db: Db): Promise<CollectionRecord[]> {
  return db.select(collectionColumns).from(collections).orderBy(asc(collections.title));
}
export async function getCollection(db: Db, id: string): Promise<CollectionRecord | null> {
  return (await db.select(collectionColumns).from(collections).where(eq(collections.id, id)).limit(1))[0] ?? null;
}
export async function insertCollection(db: Db, values: Omit<CollectionRecord, "id">): Promise<CollectionRecord> {
  const row = (await db.insert(collections).values(values).returning(collectionColumns))[0];
  if (row === undefined) throw new Error("collection insert returned no row");
  return row;
}
export async function updateCollection(db: Db, id: string, values: Partial<Omit<CollectionRecord, "id" | "slug">>): Promise<CollectionRecord | null> {
  if (Object.keys(values).length === 0) return getCollection(db, id);
  return (await db.update(collections).set(values).where(eq(collections.id, id)).returning(collectionColumns))[0] ?? null;
}
export async function deleteCollection(db: Db, id: string): Promise<boolean> {
  return (await db.delete(collections).where(eq(collections.id, id)).returning({ id: collections.id })).length > 0;
}
export async function getCollectionBookIds(db: Db, collectionId: string): Promise<string[]> {
  const rows = await db
    .select({ bookId: collectionBooks.bookId })
    .from(collectionBooks)
    .where(eq(collectionBooks.collectionId, collectionId))
    .orderBy(asc(collectionBooks.position));
  return rows.map((r) => r.bookId);
}
/** Replaces membership and order. Membership is curation only; visibility is still decided by the rights policy. */
export async function setCollectionBooks(db: Db, collectionId: string, bookIds: readonly string[]): Promise<void> {
  await db.delete(collectionBooks).where(eq(collectionBooks.collectionId, collectionId));
  if (bookIds.length > 0) {
    await db.insert(collectionBooks).values(bookIds.map((bookId, position) => ({ collectionId, bookId, position })));
  }
}
export async function existingBookIds(db: Db, bookIds: readonly string[]): Promise<Set<string>> {
  if (bookIds.length === 0) return new Set();
  const rows = await db.select({ id: books.id }).from(books).where(inArray(books.id, [...bookIds]));
  return new Set(rows.map((r) => r.id));
}

export async function authorSlugTaken(db: Db, slug: string): Promise<boolean> {
  return (await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, slug)).limit(1)).length > 0;
}
