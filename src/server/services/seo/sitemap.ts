import type { MetadataRoute } from "next";
import { SITEMAP_PAGE_SIZE, STATIC_SITEMAP_PATHS, bookSitemapPageCount, entry, extraBookPages, isSitemapEligible } from "@/lib/seo/sitemap";
import type { Db } from "@/server/db/client";
import { listCategoriesWithCounts, listPublicCollections } from "@/server/repositories/catalogue";
import { countSitemapBooks, listSitemapBooks } from "@/server/repositories/seo/sitemap";

export type SitemapDeps = { db: Db; siteUrl: string; now?: () => Date };

/** Sitemap use cases. Visibility is the catalogue predicate plus `canList` on every row. */
export function createSitemapService({ db, siteUrl, now: clock = () => new Date() }: SitemapDeps) {
  return {
    /** Page numbers of the additional book sitemap files (2..N); empty for catalogues of one page or less. */
    async extraPages(): Promise<number[]> {
      return extraBookPages(await countSitemapBooks(db, clock()));
    },

    /** Static pages, categories that hold at least one listable book, and published collections with one. */
    async staticAndTaxonomy(): Promise<MetadataRoute.Sitemap> {
      const now = clock();
      const [{ categories }, collections] = await Promise.all([listCategoriesWithCounts(db, now), listPublicCollections(db, now)]);
      return [
        ...STATIC_SITEMAP_PATHS.map((path) => entry(path, siteUrl)),
        ...categories.filter((c) => c.bookCount > 0).map((c) => entry(`/category/${encodeURIComponent(c.slug)}`, siteUrl)),
        ...collections.filter((c) => c.bookCount > 0).map((c) => entry(`/collections/${encodeURIComponent(c.slug)}`, siteUrl)),
      ];
    },

    /** One page (1..N) of canonical book URLs. */
    async books(page: number): Promise<MetadataRoute.Sitemap> {
      const now = clock();
      if (!Number.isInteger(page) || page < 1) return [];
      const rows = await listSitemapBooks(db, now, (page - 1) * SITEMAP_PAGE_SIZE, SITEMAP_PAGE_SIZE);
      return rows.filter((row) => isSitemapEligible(row.view, now)).map((row) => entry(`/book/${encodeURIComponent(row.slug)}`, siteUrl, row.updatedAt));
    },

    /** `/sitemap.xml`: everything except book pages 2..N. */
    async primary(): Promise<MetadataRoute.Sitemap> {
      const [rest, firstBooks] = await Promise.all([this.staticAndTaxonomy(), this.books(1)]);
      return [...rest, ...firstBooks];
    },

    async pageCount(): Promise<number> {
      return bookSitemapPageCount(await countSitemapBooks(db, clock()));
    },
  };
}

export type SitemapService = ReturnType<typeof createSitemapService>;
