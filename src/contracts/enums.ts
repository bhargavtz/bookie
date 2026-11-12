/**
 * Single source of truth for enumerations. The Drizzle schema (pgEnum) and the
 * zod contracts both derive from these arrays, so they cannot drift.
 */
export const BOOK_STATUSES = ["draft", "in_review", "published", "unpublished", "archived"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export const BOOK_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type BookLevel = (typeof BOOK_LEVELS)[number];

export const ASSET_KINDS = ["pdf", "cover", "thumbnail"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const ASSET_STATUSES = ["uploading", "processing", "ready", "rejected", "deleted"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const STORAGE_DRIVERS = ["local", "s3"] as const;
export type StorageDriverName = (typeof STORAGE_DRIVERS)[number];

export const RIGHTS_STATUSES = ["pending", "approved", "restricted", "removed"] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const LICENSE_TYPES = [
  "project-original",
  "public-domain",
  "cc-by",
  "cc-by-sa",
  "cc-by-nc",
  "publisher-permission",
  "author-permission",
  "other",
] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

export const COLLECTION_STATUSES = ["draft", "published"] as const;
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number];

export const DOWNLOAD_OUTCOMES = ["served", "denied_policy", "denied_rate_limit"] as const;
export type DownloadOutcome = (typeof DOWNLOAD_OUTCOMES)[number];

export const ADMIN_ROLES = ["owner", "editor", "reviewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const TAKEDOWN_STATUSES = ["open", "under_review", "upheld", "rejected", "withdrawn"] as const;
export type TakedownStatus = (typeof TAKEDOWN_STATUSES)[number];

export const IMPORT_JOB_STATUSES = ["pending", "running", "completed", "failed"] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const SEARCH_SORTS = ["relevance", "newest", "title"] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];
