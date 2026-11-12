import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { adminUsers } from "./admin";
import { books } from "./books";
import { idColumn, timestamps, timestamptz } from "./columns";
import { licenseType, rightsStatus } from "./enums";

/**
 * One rights record per book. Defaults are deny-by-default: pending, no read,
 * no download. The publish guard triggers live in the guards migration.
 */
export const licenses = pgTable(
  "licenses",
  {
    id: idColumn(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    rightsStatus: rightsStatus("rights_status").notNull().default("pending"),
    licenseType: licenseType("license_type"),
    licenseUrl: text("license_url"),
    rightsHolder: text("rights_holder"),
    attributionText: text("attribution_text"),
    sourceUrl: text("source_url"),
    evidenceNote: text("evidence_note"),
    allowRead: boolean("allow_read").notNull().default(false),
    allowDownload: boolean("allow_download").notNull().default(false),
    approvedBy: uuid("approved_by").references(() => adminUsers.id, { onDelete: "restrict" }),
    approvedAt: timestamptz("approved_at"),
    expiresAt: timestamptz("expires_at"),
    restrictedReason: text("restricted_reason"),
    removedAt: timestamptz("removed_at"),
    removedReason: text("removed_reason"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("licenses_book_uq").on(t.bookId),
    check("licenses_restricted_no_download_ck", sql`${t.rightsStatus} <> 'restricted' or ${t.allowDownload} = false`),
    check(
      "licenses_removed_no_access_ck",
      sql`${t.rightsStatus} <> 'removed' or (${t.allowRead} = false and ${t.allowDownload} = false)`,
    ),
    check(
      "licenses_approved_requires_evidence_ck",
      sql`${t.rightsStatus} <> 'approved' or (${t.approvedBy} is not null and ${t.approvedAt} is not null and ${t.rightsHolder} is not null and ${t.licenseType} is not null)`,
    ),
  ],
);
