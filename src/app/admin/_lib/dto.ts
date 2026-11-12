import "server-only";
import type { AssetDto, BookDto, BookRelationsDto, CapabilitiesDto, LicenseDto, TakedownDto } from "@/components/admin/types";
import { can } from "@/server/auth/permissions";
import type { AdminRole } from "@/contracts/enums";
import type { BookDetail } from "@/server/services/admin";

type BookRow = BookDetail["book"];
type LicenseRow = NonNullable<BookDetail["license"]>;
type AssetRow = NonNullable<BookDetail["primaryAsset"]>;

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());

export function toBookDto(book: BookRow): BookDto {
  return {
    id: book.id,
    slug: book.slug,
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    language: book.language,
    isbn13: book.isbn13,
    edition: book.edition,
    publisher: book.publisher,
    publishedYear: book.publishedYear,
    pageCount: book.pageCount,
    level: book.level,
    status: book.status,
    updatedAt: book.updatedAt.toISOString(),
  };
}

export function toRelationsDto(relations: BookDetail["relations"]): BookRelationsDto {
  return {
    authors: relations.authors.map((a) => a.name),
    categories: relations.categories.map((c) => c.slug),
    technologies: relations.technologies.map((t) => t.slug),
    tags: relations.tags.map((t) => t.name),
  };
}

export function toLicenseDto(license: LicenseRow): LicenseDto {
  return {
    rightsStatus: license.rightsStatus,
    licenseType: license.licenseType,
    licenseUrl: license.licenseUrl,
    rightsHolder: license.rightsHolder,
    attributionText: license.attributionText,
    sourceUrl: license.sourceUrl,
    evidenceNote: license.evidenceNote,
    allowRead: license.allowRead,
    allowDownload: license.allowDownload,
    approvedAt: iso(license.approvedAt),
    expiresAt: iso(license.expiresAt),
    restrictedReason: license.restrictedReason,
    removedAt: iso(license.removedAt),
    removedReason: license.removedReason,
  };
}

export const toAssetDto = (asset: AssetRow): AssetDto => ({
  originalFilename: asset.originalFilename,
  byteSize: asset.byteSize,
  sha256: asset.sha256,
  status: asset.status,
  mimeType: asset.mimeType,
});

export function toTakedownDto(
  row: { id: string; bookId: string | null; claimantName: string; claimantEmail: string; status: TakedownDto["status"]; description: string; resolutionNote: string | null; resolvedAt: Date | null; createdAt: Date },
  bookTitle: string | null,
): TakedownDto {
  return { ...row, bookTitle, resolvedAt: iso(row.resolvedAt), createdAt: row.createdAt.toISOString() };
}

export function capabilitiesFor(role: AdminRole): CapabilitiesDto {
  return {
    write: can(role, "book.write"),
    review: can(role, "license.review"),
    approve: can(role, "publication.approve"),
    del: can(role, "book.delete"),
    upload: can(role, "asset.upload"),
  };
}
