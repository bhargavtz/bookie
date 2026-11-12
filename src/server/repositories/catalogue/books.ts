import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { hasSearchOperators } from "@/lib/search/normalize";
import { HIGHLIGHT_START, HIGHLIGHT_STOP } from "@/lib/search/highlight";
import type { CatalogueFilters } from "@/lib/search/filters";
import type { Db } from "@/server/db/client";
import {
  assets,
  authors,
  bookAuthors,
  bookCategories,
  bookTechnologies,
  books,
  categories,
  collectionBooks,
  collections,
  downloadEvents,
  licenses,
  technologies,
} from "@/server/db/schema";
import { filterConditions } from "./filters";
import { publicBookPredicate } from "./predicate";
import type { BookRow, RepoSort } from "./types";

export type PublicBookQuery = {
  filters: CatalogueFilters;
  /** Already normalised (lib/search/normalize); null means browse, not search. */
  text: string | null;
  sort: RepoSort;
  offset: number;
  limit: number;
  /** Restrict to a published collection (use with sort "collection" to keep curator order). */
  collectionSlug?: string;
  /** Only books with at least one served download (the "popular" shelf). */
  onlyDownloaded?: boolean;
};

const HEADLINE_OPTIONS = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_STOP}, MaxFragments=1, MinWords=12, MaxWords=32, ShortWord=2`;
const TITLE_HEADLINE_OPTIONS = `StartSel=${HIGHLIGHT_START}, StopSel=${HIGHLIGHT_STOP}, MaxFragments=0`;

/** Lifetime served downloads, derived from real download_events rows only. */
const downloadCount = sql`(select count(*) from ${downloadEvents} where ${downloadEvents.bookId} = ${books.id} and ${downloadEvents.outcome} = 'served')`;

type BaseRow = Omit<BookRow, "authors" | "categorySlugs" | "technologies">;

async function hydrate(db: Db, base: BaseRow[]): Promise<BookRow[]> {
  if (base.length === 0) return [];
  const ids = base.map((row) => row.id);

  const [authorRows, categoryRows, technologyRows] = await Promise.all([
    db
      .select({ bookId: bookAuthors.bookId, name: authors.name })
      .from(bookAuthors)
      .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
      .where(inArray(bookAuthors.bookId, ids))
      .orderBy(asc(bookAuthors.position), asc(authors.name)),
    db
      .select({ bookId: bookCategories.bookId, slug: categories.slug })
      .from(bookCategories)
      .innerJoin(categories, eq(categories.id, bookCategories.categoryId))
      .where(inArray(bookCategories.bookId, ids))
      .orderBy(sql`${bookCategories.isPrimary} desc`, asc(categories.sortOrder), asc(categories.name)),
    db
      .select({ bookId: bookTechnologies.bookId, slug: technologies.slug, name: technologies.name })
      .from(bookTechnologies)
      .innerJoin(technologies, eq(technologies.id, bookTechnologies.technologyId))
      .where(inArray(bookTechnologies.bookId, ids))
      .orderBy(asc(technologies.name)),
  ]);

  return base.map((row) => ({
    ...row,
    authors: authorRows.filter((a) => a.bookId === row.id).map((a) => a.name),
    categorySlugs: categoryRows.filter((c) => c.bookId === row.id).map((c) => c.slug),
    technologies: technologyRows.filter((t) => t.bookId === row.id).map((t) => ({ slug: t.slug, name: t.name })),
  }));
}

const coverAsset = alias(assets, "cover_asset");

function selectBaseRows(db: Db, tsQuery: SQL | null) {
  return db
    .select({
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
      deletedAt: books.deletedAt,
      rightsStatus: licenses.rightsStatus,
      allowRead: licenses.allowRead,
      allowDownload: licenses.allowDownload,
      expiresAt: licenses.expiresAt,
      licenseType: licenses.licenseType,
      rightsHolder: licenses.rightsHolder,
      attributionText: licenses.attributionText,
      licenseUrl: licenses.licenseUrl,
      sourceUrl: licenses.sourceUrl,
      licenseId: licenses.id,
      primaryAssetStatus: assets.status,
      coverAssetStatus: coverAsset.status,
      titleHeadline:
        tsQuery === null ? sql<string | null>`null` : sql<string | null>`ts_headline('english', ${books.title}, ${tsQuery}, ${TITLE_HEADLINE_OPTIONS})`,
      descriptionHeadline:
        tsQuery === null
          ? sql<string | null>`null`
          : sql<string | null>`case when ${books.description} is null then null else ts_headline('english', ${books.description}, ${tsQuery}, ${HEADLINE_OPTIONS}) end`,
    })
    .from(books)
    .leftJoin(licenses, eq(licenses.bookId, books.id))
    .leftJoin(assets, eq(assets.id, books.primaryAssetId))
    .leftJoin(coverAsset, eq(coverAsset.id, books.coverAssetId));
}

type SelectedRow = Awaited<ReturnType<ReturnType<typeof selectBaseRows>["limit"]>>[number];

function toBaseRow(row: SelectedRow): BaseRow {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    language: row.language,
    isbn13: row.isbn13,
    edition: row.edition,
    publisher: row.publisher,
    publishedYear: row.publishedYear,
    pageCount: row.pageCount,
    level: row.level,
    status: row.status,
    deletedAt: row.deletedAt,
    license:
      row.licenseId === null || row.rightsStatus === null
        ? null
        : {
            rightsStatus: row.rightsStatus,
            allowRead: row.allowRead ?? false,
            allowDownload: row.allowDownload ?? false,
            expiresAt: row.expiresAt,
            licenseType: row.licenseType,
            rightsHolder: row.rightsHolder,
            attributionText: row.attributionText,
            licenseUrl: row.licenseUrl,
            sourceUrl: row.sourceUrl,
          },
    primaryAssetStatus: row.primaryAssetStatus,
    coverAssetStatus: row.coverAssetStatus,
    titleHeadline: row.titleHeadline,
    descriptionHeadline: row.descriptionHeadline,
  };
}

/** Membership test and curator position of the book in a published collection (correlated on books.id). */
function collectionPosition(slug: string): { condition: SQL; position: SQL } {
  const from = sql`from ${collectionBooks} inner join ${collections} on ${collections.id} = ${collectionBooks.collectionId}
    where ${collectionBooks.bookId} = ${books.id} and ${collections.slug} = ${slug} and ${collections.status} = 'published'`;
  return { condition: sql`exists (select 1 ${from})`, position: sql`(select ${collectionBooks.position} ${from})` };
}

function orderBy(sort: RepoSort, rank: SQL | null, collectionSlug: string | undefined): SQL[] {
  const newest = sql`${books.publishedAt} desc nulls last`;
  const tiebreak = sql`${books.id}`;
  switch (sort) {
    case "relevance":
      return rank === null ? [newest, tiebreak] : [sql`${rank} desc`, newest, tiebreak];
    case "title":
      return [sql`lower(${books.title}) asc`, tiebreak];
    case "popularity":
      return [sql`${downloadCount} desc`, newest, tiebreak];
    case "collection":
      return [
        collectionSlug === undefined ? sql`0` : sql`${collectionPosition(collectionSlug).position} asc`,
        sql`lower(${books.title}) asc`,
        tiebreak,
      ];
    case "newest":
      return [newest, sql`${books.createdAt} desc`, tiebreak];
  }
}

/**
 * Public book list/search. Visibility comes only from `publicBookPredicate`.
 * Text matching: websearch_to_tsquery over the weighted generated tsvector,
 * plus trigram similarity on the title so a small typo still finds the book.
 */
export async function findPublicBooks(
  db: Db,
  now: Date,
  query: PublicBookQuery,
): Promise<{ rows: BookRow[]; total: number }> {
  const tsQuery = query.text === null ? null : sql`websearch_to_tsquery('english', bookie_unaccent(${query.text}))`;
  const conditions: (SQL | undefined)[] = [publicBookPredicate(now), ...filterConditions(query.filters)];

  let rank: SQL | null = null;
  if (query.text !== null && tsQuery !== null) {
    const fuzzy = hasSearchOperators(query.text) ? sql`false` : sql`similarity(bookie_unaccent(${books.title}), bookie_unaccent(${query.text})) > 0.3`;
    conditions.push(sql`(${books.search} @@ ${tsQuery} or ${fuzzy})`);
    rank = sql`(ts_rank_cd(${books.search}, ${tsQuery}) + similarity(bookie_unaccent(${books.title}), bookie_unaccent(${query.text})))`;
  }
  if (query.onlyDownloaded === true) conditions.push(sql`${downloadCount} > 0`);

  const collectionSlug = query.collectionSlug;
  if (collectionSlug !== undefined) conditions.push(collectionPosition(collectionSlug).condition);
  const where = and(...conditions);

  const [selected, counted] = await Promise.all([
    selectBaseRows(db, tsQuery)
      .where(where)
      .orderBy(...orderBy(query.sort, rank, collectionSlug))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: sql<number>`count(*)::int` }).from(books).where(where),
  ]);

  return { rows: await hydrate(db, selected.map(toBaseRow)), total: counted[0]?.total ?? 0 };
}

/**
 * One book by slug WITHOUT the public predicate, so the service can tell
 * "removed" (410) from "unknown" (404) through the rights policy. The caller
 * must run `canList` before exposing anything.
 */
export async function findBookBySlug(db: Db, slug: string): Promise<BookRow | null> {
  const selected = await selectBaseRows(db, null).where(eq(books.slug, slug)).limit(1);
  const [row] = await hydrate(db, selected.map(toBaseRow));
  return row ?? null;
}
