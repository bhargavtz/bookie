import type { BookDetail, Page } from "@/contracts/catalogue";
import { canList } from "@/lib/policy";
import { decodeCursor, encodeCursor } from "@/lib/search/cursor";
import { type CatalogueFilters, normalizeFilters, parseSlugParam } from "@/lib/search/filters";
import { parseHighlight } from "@/lib/search/highlight";
import { normalizeSearchText } from "@/lib/search/normalize";
import type { CatalogueListQuery, PublicSearchQuery } from "@/lib/search/schemas";
import type { CategoryList, CategoryWithCount, CollectionSummary, SearchHit } from "@/lib/search/types";
import type { Db } from "@/server/db/client";
import {
  findBookBySlug,
  findCategoryWithCount,
  findPublicBooks,
  findPublicCollection,
  listCategoriesWithCounts,
  listPublicCollections,
  type PublicBookQuery,
  type RepoSort,
} from "@/server/repositories/catalogue";
import { CatalogueError } from "./errors";
import { isListable, rightsView, toDetail, toSummary } from "./mapping";

export type CatalogueDeps = { db: Db; now?: () => Date };

type ListRequest = {
  filters: CatalogueFilters;
  text: string | null;
  sort: RepoSort;
  cursor: string | undefined;
  limit: number;
  collectionSlug?: string;
  onlyDownloaded?: boolean;
};

function offsetOf(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const offset = decodeCursor(cursor);
  if (offset === null) throw new CatalogueError("invalid_query", "cursor is not valid");
  return offset;
}

/** Catalogue use cases. Visibility is the repository predicate AND `canList` on every row returned. */
export function createCatalogueService({ db, now: clock = () => new Date() }: CatalogueDeps) {
  async function page(request: ListRequest): Promise<Page<SearchHit>> {
    const now = clock();
    const offset = offsetOf(request.cursor);
    const query: PublicBookQuery = {
      filters: request.filters,
      text: request.text,
      sort: request.sort,
      offset,
      limit: request.limit + 1,
      ...(request.collectionSlug === undefined ? {} : { collectionSlug: request.collectionSlug }),
      ...(request.onlyDownloaded === undefined ? {} : { onlyDownloaded: request.onlyDownloaded }),
    };
    const { rows, total } = await findPublicBooks(db, now, query);
    const hasMore = rows.length > request.limit;
    const items = rows
      .slice(0, request.limit)
      .filter((row) => isListable(row, now))
      .map((row): SearchHit => ({
        ...toSummary(row, now),
        highlight:
          request.text === null
            ? null
            : { title: parseHighlight(row.titleHeadline), excerpt: parseHighlight(row.descriptionHeadline) },
      }));
    return { items, nextCursor: hasMore ? encodeCursor(offset + request.limit) : null, total };
  }

  return {
    listBooks(query: CatalogueListQuery): Promise<Page<SearchHit>> {
      return page({ filters: normalizeFilters(query), text: null, sort: query.sort, cursor: query.cursor, limit: query.limit });
    },

    /** Relevance falls back to newest when there is no usable text. */
    searchBooks(query: PublicSearchQuery): Promise<Page<SearchHit>> {
      const text = normalizeSearchText(query.q ?? "");
      const hasText = text !== "";
      const sort: RepoSort = query.sort === "relevance" && !hasText ? "newest" : query.sort;
      return page({ filters: normalizeFilters(query), text: hasText ? text : null, sort, cursor: query.cursor, limit: query.limit });
    },

    recentlyAdded(limit: number): Promise<Page<SearchHit>> {
      return page({ filters: normalizeFilters({}), text: null, sort: "newest", cursor: undefined, limit });
    },

    popular(limit: number): Promise<Page<SearchHit>> {
      return page({ filters: normalizeFilters({}), text: null, sort: "popularity", cursor: undefined, limit, onlyDownloaded: true });
    },

    async getBook(rawSlug: string): Promise<BookDetail> {
      const now = clock();
      const slug = parseSlugParam(rawSlug);
      if (slug === null) throw new CatalogueError("not_found", "book not found");
      const row = await findBookBySlug(db, slug);
      if (row === null) throw new CatalogueError("not_found", "book not found");
      const decision = canList({ kind: "public" }, rightsView(row), now);
      if (!decision.allowed) {
        throw decision.httpStatus === 410
          ? new CatalogueError("gone", "this book has been removed")
          : new CatalogueError("not_found", "book not found");
      }
      return toDetail(row, now);
    },

    listCategories(): Promise<CategoryList> {
      return listCategoriesWithCounts(db, clock());
    },

    async getCategory(rawSlug: string): Promise<CategoryWithCount> {
      const slug = parseSlugParam(rawSlug);
      const category = slug === null ? null : await findCategoryWithCount(db, clock(), slug);
      if (category === null) throw new CatalogueError("not_found", "category not found");
      return category;
    },

    listCollections(): Promise<CollectionSummary[]> {
      return listPublicCollections(db, clock());
    },

    async getCollection(
      rawSlug: string,
      paging: { cursor?: string | undefined; limit: number },
    ): Promise<{ collection: CollectionSummary; books: Page<SearchHit> }> {
      const slug = parseSlugParam(rawSlug);
      const collection = slug === null ? null : await findPublicCollection(db, clock(), slug);
      if (slug === null || collection === null) throw new CatalogueError("not_found", "collection not found");
      const books = await page({
        filters: normalizeFilters({}),
        text: null,
        sort: "collection",
        cursor: paging.cursor,
        limit: paging.limit,
        collectionSlug: slug,
      });
      return { collection, books };
    },
  };
}

export type CatalogueService = ReturnType<typeof createCatalogueService>;
