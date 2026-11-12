import type { BookLevel, BookStatus, CollectionStatus, LicenseType, RightsStatus, TakedownStatus } from "@/contracts/enums";

/** Plain, serialisable shapes the admin pages hand to client components (dates are ISO strings). */

export type BookDto = {
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
  updatedAt: string;
};

export type BookRelationsDto = {
  authors: string[];
  categories: string[];
  technologies: string[];
  tags: string[];
};

export type LicenseDto = {
  rightsStatus: RightsStatus;
  licenseType: LicenseType | null;
  licenseUrl: string | null;
  rightsHolder: string | null;
  attributionText: string | null;
  sourceUrl: string | null;
  evidenceNote: string | null;
  allowRead: boolean;
  allowDownload: boolean;
  approvedAt: string | null;
  expiresAt: string | null;
  restrictedReason: string | null;
  removedAt: string | null;
  removedReason: string | null;
};

export type AssetDto = { originalFilename: string | null; byteSize: number; sha256: string | null; status: string; mimeType: string };

export type AuthorDto = { id: string; slug: string; name: string; bio: string | null };
export type CategoryDto = { id: string; slug: string; name: string; description: string | null; parentId: string | null; sortOrder: number; iconKey: string | null };
export type CollectionDto = { id: string; slug: string; title: string; description: string | null; isFeatured: boolean; status: CollectionStatus };

export type TakedownDto = {
  id: string;
  bookId: string | null;
  bookTitle: string | null;
  claimantName: string;
  claimantEmail: string;
  status: TakedownStatus;
  description: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type BookOptionDto = { id: string; title: string };
export type CategoryOptionDto = { slug: string; name: string };

/** Role capabilities the client needs to hide controls the server would refuse anyway. */
export type CapabilitiesDto = {
  write: boolean;
  review: boolean;
  approve: boolean;
  del: boolean;
  upload: boolean;
};

export type ImportIssueDto = { field: string; message: string };
export type ImportRowDto = { line: number; status: "valid" | "error" | "imported"; title: string | null; slug: string | null; errors: ImportIssueDto[]; warnings: ImportIssueDto[] };
export type ImportReportDto = {
  jobId: string;
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  importedRows: number;
  failedRows: number;
  ignoredColumns: string[];
  rows: ImportRowDto[];
};
