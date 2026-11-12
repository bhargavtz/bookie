import type { BookDetail, BookSummary } from "@/contracts/catalogue";
import { canDownload, canList, canRead, type BookRightsView } from "@/lib/policy";
import type { BookRow } from "@/server/repositories/catalogue";

const PUBLIC = { kind: "public" } as const;

export function rightsView(row: BookRow): BookRightsView {
  return {
    bookStatus: row.status,
    deletedAt: row.deletedAt,
    license:
      row.license === null
        ? null
        : {
            rightsStatus: row.license.rightsStatus,
            allowRead: row.license.allowRead,
            allowDownload: row.license.allowDownload,
            expiresAt: row.license.expiresAt,
          },
    primaryAsset: row.primaryAssetStatus === null ? null : { status: row.primaryAssetStatus },
    // Informational in the policy: an open takedown does not by itself deny access.
    openTakedown: false,
  };
}

export const isListable = (row: BookRow, now: Date): boolean => canList(PUBLIC, rightsView(row), now).allowed;

export function toSummary(row: BookRow, now: Date): BookSummary {
  const view = rightsView(row);
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    authors: row.authors,
    categorySlugs: row.categorySlugs,
    level: row.level,
    language: row.language,
    publishedYear: row.publishedYear,
    coverUrl: row.coverAssetStatus === "ready" ? `/api/books/${encodeURIComponent(row.slug)}/cover` : null,
    canRead: canRead(PUBLIC, view, now).allowed,
    canDownload: canDownload(PUBLIC, view, now).allowed,
  };
}

/** Caller has already established `isListable`, so the licence exists and is approved or restricted. */
export function toDetail(row: BookRow, now: Date): BookDetail {
  const license = row.license;
  return {
    ...toSummary(row, now),
    description: row.description,
    isbn13: row.isbn13,
    edition: row.edition,
    publisher: row.publisher,
    pageCount: row.pageCount,
    technologies: row.technologies,
    license: {
      rightsStatus: license?.rightsStatus === "restricted" ? "restricted" : "approved",
      licenseType: license?.licenseType ?? null,
      rightsHolder: license?.rightsHolder ?? null,
      attributionText: license?.attributionText ?? null,
      licenseUrl: license?.licenseUrl ?? null,
      sourceUrl: license?.sourceUrl ?? null,
    },
  };
}
