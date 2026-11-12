import { and, eq, sql } from "drizzle-orm";
import type { AssetStatus, DownloadOutcome, StorageDriverName } from "@/contracts/enums";
import type { BookRightsView } from "@/lib/policy";
import type { Db } from "@/server/db";
import { assets, books, downloadEvents, licenses, takedownRequests } from "@/server/db/schema";

/**
 * Read model for the file routes (S4): everything the rights policy and the
 * byte stream need for one book, plus the download-event writer. Kept narrow on
 * purpose; the catalogue repository (S2) owns list/search queries.
 */

export type BookFileRecord = {
  bookId: string;
  slug: string;
  title: string;
  pageCount: number | null;
  rights: BookRightsView;
  /** Operator-supplied, validated at input time; offered as a fallback link only when the licence allows reading. */
  externalSourceUrl: string | null;
  asset: {
    id: string;
    storageKey: string;
    storageDriver: StorageDriverName;
    originalFilename: string | null;
    byteSize: number;
    sha256: string | null;
    status: AssetStatus;
  } | null;
};

export interface BookFileRepository {
  findBySlug(slug: string): Promise<BookFileRecord | null>;
  recordDownloadEvent(event: {
    bookId: string;
    assetId: string | null;
    outcome: DownloadOutcome;
    ipHash: string | null;
    uaFamily: string | null;
    referrerHost: string | null;
  }): Promise<void>;
}

export function createBookFileRepository(db: Db): BookFileRepository {
  return {
    async findBySlug(slug) {
      const rows = await db
        .select({
          bookId: books.id,
          slug: books.slug,
          title: books.title,
          pageCount: books.pageCount,
          bookStatus: books.status,
          deletedAt: books.deletedAt,
          rightsStatus: licenses.rightsStatus,
          allowRead: licenses.allowRead,
          allowDownload: licenses.allowDownload,
          expiresAt: licenses.expiresAt,
          sourceUrl: licenses.sourceUrl,
          hasLicense: sql<boolean>`${licenses.id} is not null`,
          openTakedown: sql<boolean>`exists (select 1 from ${takedownRequests} where ${takedownRequests.bookId} = ${books.id} and ${takedownRequests.status} = 'open')`,
          assetId: assets.id,
          storageKey: assets.storageKey,
          storageDriver: assets.storageDriver,
          originalFilename: assets.originalFilename,
          byteSize: assets.byteSize,
          sha256: assets.sha256,
          assetStatus: assets.status,
        })
        .from(books)
        .leftJoin(licenses, eq(licenses.bookId, books.id))
        .leftJoin(assets, and(eq(assets.id, books.primaryAssetId), eq(assets.bookId, books.id)))
        .where(eq(books.slug, slug))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      const asset =
        row.assetId === null || row.storageKey === null || row.storageDriver === null || row.byteSize === null || row.assetStatus === null
          ? null
          : {
              id: row.assetId,
              storageKey: row.storageKey,
              storageDriver: row.storageDriver,
              originalFilename: row.originalFilename,
              byteSize: row.byteSize,
              sha256: row.sha256,
              status: row.assetStatus,
            };
      const license =
        row.hasLicense && row.rightsStatus !== null && row.allowRead !== null && row.allowDownload !== null
          ? { rightsStatus: row.rightsStatus, allowRead: row.allowRead, allowDownload: row.allowDownload, expiresAt: row.expiresAt }
          : null;
      return {
        bookId: row.bookId,
        slug: row.slug,
        title: row.title,
        pageCount: row.pageCount,
        rights: {
          bookStatus: row.bookStatus,
          deletedAt: row.deletedAt,
          license,
          primaryAsset: asset === null ? null : { status: asset.status },
          openTakedown: row.openTakedown,
        },
        externalSourceUrl: row.sourceUrl,
        asset,
      };
    },

    async recordDownloadEvent(event) {
      await db.insert(downloadEvents).values(event);
    },
  };
}
