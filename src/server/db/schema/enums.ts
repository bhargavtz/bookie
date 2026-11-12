import { pgEnum } from "drizzle-orm/pg-core";
import {
  ADMIN_ROLES,
  ASSET_KINDS,
  ASSET_STATUSES,
  BOOK_LEVELS,
  BOOK_STATUSES,
  COLLECTION_STATUSES,
  DOWNLOAD_OUTCOMES,
  IMPORT_JOB_STATUSES,
  LICENSE_TYPES,
  RIGHTS_STATUSES,
  STORAGE_DRIVERS,
  TAKEDOWN_STATUSES,
} from "@/contracts/enums";

export const bookStatus = pgEnum("book_status", BOOK_STATUSES);
export const bookLevel = pgEnum("book_level", BOOK_LEVELS);
export const assetKind = pgEnum("asset_kind", ASSET_KINDS);
export const assetStatus = pgEnum("asset_status", ASSET_STATUSES);
export const storageDriverName = pgEnum("storage_driver", STORAGE_DRIVERS);
export const rightsStatus = pgEnum("rights_status", RIGHTS_STATUSES);
export const licenseType = pgEnum("license_type", LICENSE_TYPES);
export const collectionStatus = pgEnum("collection_status", COLLECTION_STATUSES);
export const downloadOutcome = pgEnum("download_outcome", DOWNLOAD_OUTCOMES);
export const adminRole = pgEnum("admin_role", ADMIN_ROLES);
export const takedownStatus = pgEnum("takedown_status", TAKEDOWN_STATUSES);
export const importJobStatus = pgEnum("import_job_status", IMPORT_JOB_STATUSES);
