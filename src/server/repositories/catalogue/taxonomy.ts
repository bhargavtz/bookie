import { and, asc, eq, sql } from "drizzle-orm";
import type { CategoryList, CategoryWithCount, CollectionSummary } from "@/lib/search/types";
import type { Db } from "@/server/db/client";
import { bookCategories, books, categories, collectionBooks, collections } from "@/server/db/schema";
import { publicBookPredicate } from "./predicate";

/**
 * Category counts are computed on every call from the listable books. The
 * join yields one (book, category) pair per membership and `count(distinct)`
 * counts each book once per category; `totalBooks` counts each book once overall.
 */
export async function listCategoriesWithCounts(db: Db, now: Date): Promise<CategoryList> {
  const predicate = publicBookPredicate(now);
  const [rows, totals] = await Promise.all([
    db
      .select({
        slug: categories.slug,
        name: categories.name,
        description: categories.description,
        iconKey: categories.iconKey,
        bookCount: sql<number>`count(distinct ${books.id})::int`,
      })
      .from(categories)
      .leftJoin(bookCategories, eq(bookCategories.categoryId, categories.id))
      .leftJoin(books, and(eq(books.id, bookCategories.bookId), predicate))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select({ total: sql<number>`count(*)::int` }).from(books).where(predicate),
  ]);
  return { categories: rows, totalBooks: totals[0]?.total ?? 0 };
}

export async function findCategoryWithCount(db: Db, now: Date, slug: string): Promise<CategoryWithCount | null> {
  const { categories: all } = await listCategoriesWithCounts(db, now);
  return all.find((category) => category.slug === slug) ?? null;
}

async function collectionRows(db: Db, now: Date, slug: string | null): Promise<CollectionSummary[]> {
  const rows = await db
    .select({
      slug: collections.slug,
      title: collections.title,
      description: collections.description,
      isFeatured: collections.isFeatured,
      bookCount: sql<number>`count(distinct ${books.id})::int`,
    })
    .from(collections)
    .leftJoin(collectionBooks, eq(collectionBooks.collectionId, collections.id))
    .leftJoin(books, and(eq(books.id, collectionBooks.bookId), publicBookPredicate(now)))
    .where(slug === null ? eq(collections.status, "published") : and(eq(collections.status, "published"), eq(collections.slug, slug)))
    .groupBy(collections.id)
    .orderBy(sql`${collections.isFeatured} desc`, asc(collections.title));
  return rows;
}

/** Published collections that contain at least one listable book (an empty shelf is not shown). */
export async function listPublicCollections(db: Db, now: Date): Promise<CollectionSummary[]> {
  return (await collectionRows(db, now, null)).filter((collection) => collection.bookCount > 0);
}

export async function findPublicCollection(db: Db, now: Date, slug: string): Promise<CollectionSummary | null> {
  return (await collectionRows(db, now, slug))[0] ?? null;
}
