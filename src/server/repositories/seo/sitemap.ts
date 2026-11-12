import { asc, eq, sql } from "drizzle-orm";
import type { BookRightsView } from "@/lib/policy";
import type { Db } from "@/server/db/client";
import { assets, books, licenses } from "@/server/db/schema";
import { publicBookPredicate } from "@/server/repositories/catalogue";

export type SitemapBookRow = { slug: string; updatedAt: Date; view: BookRightsView };

export async function countSitemapBooks(db: Db, now: Date): Promise<number> {
  const rows = await db.select({ total: sql<number>`count(*)::int` }).from(books).where(publicBookPredicate(now));
  return rows[0]?.total ?? 0;
}

/** One stable page of publicly listable books, ordered by id so pages do not shift between requests. */
export async function listSitemapBooks(db: Db, now: Date, offset: number, limit: number): Promise<SitemapBookRow[]> {
  const rows = await db
    .select({
      slug: books.slug,
      updatedAt: books.updatedAt,
      status: books.status,
      deletedAt: books.deletedAt,
      rightsStatus: licenses.rightsStatus,
      allowRead: licenses.allowRead,
      allowDownload: licenses.allowDownload,
      expiresAt: licenses.expiresAt,
      primaryAssetStatus: assets.status,
    })
    .from(books)
    .leftJoin(licenses, eq(licenses.bookId, books.id))
    .leftJoin(assets, eq(assets.id, books.primaryAssetId))
    .where(publicBookPredicate(now))
    .orderBy(asc(books.id))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({
    slug: row.slug,
    updatedAt: row.updatedAt,
    view: {
      bookStatus: row.status,
      deletedAt: row.deletedAt,
      license:
        row.rightsStatus === null
          ? null
          : { rightsStatus: row.rightsStatus, allowRead: row.allowRead ?? false, allowDownload: row.allowDownload ?? false, expiresAt: row.expiresAt },
      primaryAsset: row.primaryAssetStatus === null ? null : { status: row.primaryAssetStatus },
      openTakedown: false,
    },
  }));
}
