import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { BookLevel, BookStatus } from "@/contracts/enums";
import { slugify, uniqueSlug } from "@/lib/slug";
import type { Db } from "@/server/db/client";
import {
  authors,
  bookAuthors,
  bookCategories,
  books,
  bookTags,
  bookTechnologies,
  categories,
  tags,
  technologies,
} from "@/server/db/schema";

export type BookRecord = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  language: string;
  isbn13: string | null;
  edition: string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  level: BookLevel | null;
  status: BookStatus;
  primaryAssetId: string | null;
  coverAssetId: string | null;
  publishedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const bookColumns = {
  id: books.id,
  slug: books.slug,
  title: books.title,
  subtitle: books.subtitle,
  description: books.description,
  language: books.language,
  isbn13: books.isbn13,
  edition: books.edition,
  publisher: books.publisher,
  publishedYear: books.publishedYear,
  pageCount: books.pageCount,
  level: books.level,
  status: books.status,
  primaryAssetId: books.primaryAssetId,
  coverAssetId: books.coverAssetId,
  publishedAt: books.publishedAt,
  deletedAt: books.deletedAt,
  createdAt: books.createdAt,
  updatedAt: books.updatedAt,
};

export type BookFields = {
  title: string;
  subtitle: string | null;
  description: string | null;
  language: string;
  isbn13: string | null;
  edition: string | null;
  publisher: string | null;
  publishedYear: number | null;
  pageCount: number | null;
  level: BookLevel | null;
};

export async function getBook(db: Db, id: string): Promise<BookRecord | null> {
  const rows = await db.select(bookColumns).from(books).where(eq(books.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function slugIsTaken(db: Db, slug: string): Promise<boolean> {
  const rows = await db.select({ id: books.id }).from(books).where(eq(books.slug, slug)).limit(1);
  return rows.length > 0;
}

export async function freeBookSlug(db: Db, title: string): Promise<string> {
  return uniqueSlug(title, (candidate) => slugIsTaken(db, candidate));
}

export async function insertBook(db: Db, slug: string, fields: BookFields): Promise<BookRecord> {
  const rows = await db
    .insert(books)
    .values({ slug, ...fields })
    .returning(bookColumns);
  const row = rows[0];
  if (row === undefined) throw new Error("book insert returned no row");
  return row;
}

export async function updateBookFields(db: Db, id: string, fields: Partial<BookFields>): Promise<BookRecord | null> {
  if (Object.keys(fields).length === 0) return getBook(db, id);
  const rows = await db.update(books).set(fields).where(eq(books.id, id)).returning(bookColumns);
  return rows[0] ?? null;
}

/**
 * Status change used by every workflow transition. A move to `published` is
 * rejected by the database trigger (SQLSTATE 23514) without an approved or
 * restricted licence; the service layer maps that to a clean error.
 */
export async function setBookStatus(db: Db, id: string, status: BookStatus, publishedAt?: Date | null): Promise<void> {
  await db
    .update(books)
    .set({ status, ...(publishedAt !== undefined ? { publishedAt } : {}) })
    .where(eq(books.id, id));
}

export async function softDeleteBook(db: Db, id: string, now: Date): Promise<void> {
  await db.update(books).set({ deletedAt: now, status: "archived" }).where(eq(books.id, id));
}

export async function restoreBook(db: Db, id: string): Promise<void> {
  await db.update(books).set({ deletedAt: null }).where(eq(books.id, id));
}

export type BookListOptions = {
  status?: BookStatus;
  q?: string;
  includeDeleted: boolean;
  limit: number;
  offset: number;
};

const likeEscape = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listBooks(db: Db, options: BookListOptions): Promise<{ items: BookRecord[]; total: number }> {
  const conditions: SQL[] = [];
  if (!options.includeDeleted) conditions.push(isNull(books.deletedAt));
  if (options.status !== undefined) conditions.push(eq(books.status, options.status));
  if (options.q !== undefined && options.q !== "") {
    const pattern = `%${likeEscape(options.q)}%`;
    const match = or(ilike(books.title, pattern), ilike(books.isbn13, pattern), ilike(books.slug, pattern));
    if (match !== undefined) conditions.push(match);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const [items, totals] = await Promise.all([
    db.select(bookColumns).from(books).where(where).orderBy(desc(books.updatedAt), asc(books.id)).limit(options.limit).offset(options.offset),
    db.select({ total: count() }).from(books).where(where),
  ]);
  return { items, total: totals[0]?.total ?? 0 };
}

export type BookRelations = {
  authors: { id: string; name: string }[];
  categories: { id: string; slug: string; name: string; isPrimary: boolean }[];
  technologies: { id: string; slug: string; name: string }[];
  tags: { id: string; slug: string; name: string }[];
};

export async function getBookRelations(db: Db, bookId: string): Promise<BookRelations> {
  const [authorRows, categoryRows, technologyRows, tagRows] = await Promise.all([
    db
      .select({ id: authors.id, name: authors.name })
      .from(bookAuthors)
      .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
      .where(eq(bookAuthors.bookId, bookId))
      .orderBy(asc(bookAuthors.position)),
    db
      .select({ id: categories.id, slug: categories.slug, name: categories.name, isPrimary: bookCategories.isPrimary })
      .from(bookCategories)
      .innerJoin(categories, eq(categories.id, bookCategories.categoryId))
      .where(eq(bookCategories.bookId, bookId))
      .orderBy(desc(bookCategories.isPrimary), asc(categories.name)),
    db
      .select({ id: technologies.id, slug: technologies.slug, name: technologies.name })
      .from(bookTechnologies)
      .innerJoin(technologies, eq(technologies.id, bookTechnologies.technologyId))
      .where(eq(bookTechnologies.bookId, bookId))
      .orderBy(asc(technologies.name)),
    db
      .select({ id: tags.id, slug: tags.slug, name: tags.name })
      .from(bookTags)
      .innerJoin(tags, eq(tags.id, bookTags.tagId))
      .where(eq(bookTags.bookId, bookId))
      .orderBy(asc(tags.name)),
  ]);
  return { authors: authorRows, categories: categoryRows, technologies: technologyRows, tags: tagRows };
}

export type RelationInput = {
  authorNames: string[];
  categorySlugs: string[];
  technologySlugs: string[];
  tagNames: string[];
};

/** Slugs in `wanted` that do not exist in the given table. Used to report unknown taxonomy values before writing. */
export async function unknownCategorySlugs(db: Db, wanted: readonly string[]): Promise<string[]> {
  if (wanted.length === 0) return [];
  const rows = await db.select({ slug: categories.slug }).from(categories).where(inArray(categories.slug, [...wanted]));
  const found = new Set(rows.map((r) => r.slug));
  return wanted.filter((slug) => !found.has(slug));
}

export async function unknownTechnologySlugs(db: Db, wanted: readonly string[]): Promise<string[]> {
  if (wanted.length === 0) return [];
  const rows = await db.select({ slug: technologies.slug }).from(technologies).where(inArray(technologies.slug, [...wanted]));
  const found = new Set(rows.map((r) => r.slug));
  return wanted.filter((slug) => !found.has(slug));
}

async function authorIdFor(db: Db, name: string): Promise<string> {
  const existing = await db.select({ id: authors.id }).from(authors).where(sql`lower(${authors.name}) = lower(${name})`).limit(1);
  if (existing[0] !== undefined) return existing[0].id;
  const slug = await uniqueSlug(name, async (candidate) => {
    const rows = await db.select({ id: authors.id }).from(authors).where(eq(authors.slug, candidate)).limit(1);
    return rows.length > 0;
  });
  const rows = await db.insert(authors).values({ slug, name }).returning({ id: authors.id });
  const row = rows[0];
  if (row === undefined) throw new Error("author insert returned no row");
  return row.id;
}

async function tagIdFor(db: Db, name: string): Promise<string> {
  const slug = slugify(name);
  const rows = await db
    .insert(tags)
    .values({ slug, name })
    .onConflictDoUpdate({ target: tags.slug, set: { slug } })
    .returning({ id: tags.id });
  const row = rows[0];
  if (row === undefined) throw new Error("tag upsert returned no row");
  return row.id;
}

/**
 * Replaces authors, categories (first one is primary), technologies and tags,
 * then refreshes the denormalised `search_text` that feeds the FTS column.
 * Category and technology slugs must exist (check with unknown*Slugs first).
 */
export async function replaceBookRelations(db: Db, bookId: string, input: RelationInput): Promise<void> {
  await db.delete(bookAuthors).where(eq(bookAuthors.bookId, bookId));
  await db.delete(bookCategories).where(eq(bookCategories.bookId, bookId));
  await db.delete(bookTechnologies).where(eq(bookTechnologies.bookId, bookId));
  await db.delete(bookTags).where(eq(bookTags.bookId, bookId));

  const authorIds: string[] = [];
  for (const name of input.authorNames) {
    const id = await authorIdFor(db, name);
    if (!authorIds.includes(id)) authorIds.push(id);
  }
  if (authorIds.length > 0) {
    await db.insert(bookAuthors).values(authorIds.map((authorId, position) => ({ bookId, authorId, position })));
  }

  const categorySlugs = [...new Set(input.categorySlugs)];
  if (categorySlugs.length > 0) {
    const rows = await db.select({ id: categories.id, slug: categories.slug }).from(categories).where(inArray(categories.slug, categorySlugs));
    const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
    const values = categorySlugs.flatMap((slug, index) => {
      const categoryId = bySlug.get(slug);
      return categoryId === undefined ? [] : [{ bookId, categoryId, isPrimary: index === 0 }];
    });
    if (values.length > 0) await db.insert(bookCategories).values(values);
  }

  const technologySlugs = [...new Set(input.technologySlugs)];
  if (technologySlugs.length > 0) {
    const rows = await db.select({ id: technologies.id }).from(technologies).where(inArray(technologies.slug, technologySlugs));
    if (rows.length > 0) await db.insert(bookTechnologies).values(rows.map((r) => ({ bookId, technologyId: r.id })));
  }

  const tagIds = new Set<string>();
  for (const name of input.tagNames) tagIds.add(await tagIdFor(db, name));
  if (tagIds.size > 0) await db.insert(bookTags).values([...tagIds].map((tagId) => ({ bookId, tagId })));

  const technologyNames = technologySlugs.length > 0
    ? (await db.select({ name: technologies.name }).from(technologies).where(inArray(technologies.slug, technologySlugs))).map((r) => r.name)
    : [];
  const searchText = [...input.authorNames, ...technologyNames, ...input.tagNames].join(" ");
  await db.update(books).set({ searchText }).where(eq(books.id, bookId));
}

export type DuplicateHit = { bookId: string; title: string; slug: string; deleted: boolean };

/** Other books (including soft-deleted ones) that carry the same ISBN-13. */
export async function findBooksByIsbn(db: Db, isbn13: string, excludeBookId?: string): Promise<DuplicateHit[]> {
  const conditions: SQL[] = [eq(books.isbn13, isbn13)];
  if (excludeBookId !== undefined) conditions.push(ne(books.id, excludeBookId));
  const rows = await db
    .select({ bookId: books.id, title: books.title, slug: books.slug, deletedAt: books.deletedAt })
    .from(books)
    .where(and(...conditions));
  return rows.map((r) => ({ bookId: r.bookId, title: r.title, slug: r.slug, deleted: r.deletedAt !== null }));
}

/** Live books whose title is trigram-similar; the service confirms with the pure normaliser. */
export async function findSimilarTitles(db: Db, title: string, excludeBookId: string | undefined, limit: number): Promise<DuplicateHit[]> {
  const conditions: SQL[] = [isNull(books.deletedAt), sql`similarity(lower(${books.title}), lower(${title})) >= 0.5`];
  if (excludeBookId !== undefined) conditions.push(ne(books.id, excludeBookId));
  const rows = await db
    .select({ bookId: books.id, title: books.title, slug: books.slug })
    .from(books)
    .where(and(...conditions))
    .limit(limit);
  return rows.map((r) => ({ ...r, deleted: false }));
}
