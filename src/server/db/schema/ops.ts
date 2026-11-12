import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./admin";
import { assets, books } from "./books";
import { idColumn, timestamps, timestamptz } from "./columns";
import { downloadOutcome, importJobStatus, takedownStatus } from "./enums";

/** Append-only; no updated_at. ip_hash is salted and rotating, never a raw IP. */
export const downloadEvents = pgTable(
  "download_events",
  {
    id: idColumn(),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
    outcome: downloadOutcome("outcome").notNull(),
    ipHash: text("ip_hash"),
    uaFamily: text("ua_family"),
    referrerHost: text("referrer_host"),
  },
  (t) => [
    index("download_events_book_time_idx").on(t.bookId, t.occurredAt),
    index("download_events_time_idx").on(t.occurredAt),
  ],
);

/** Fixed-window counters. `key` must already be hashed/namespaced by the caller (e.g. login:ip:<hash>). */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamptz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index("rate_limits_window_idx").on(t.windowStart)],
);

export const takedownRequests = pgTable(
  "takedown_requests",
  {
    id: idColumn(),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    bookUrl: text("book_url"),
    claimantName: text("claimant_name").notNull(),
    claimantEmail: text("claimant_email").notNull(),
    organisation: text("organisation"),
    relationship: text("relationship").notNull(),
    description: text("description").notNull(),
    goodFaithConfirmed: boolean("good_faith_confirmed").notNull(),
    signature: text("signature").notNull(),
    status: takedownStatus("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => adminUsers.id, { onDelete: "set null" }),
    resolvedAt: timestamptz("resolved_at"),
    ipHash: text("ip_hash"),
    ...timestamps(),
  },
  (t) => [
    index("takedown_requests_status_idx").on(t.status, t.createdAt),
    index("takedown_requests_book_idx").on(t.bookId),
    check("takedown_requests_good_faith_ck", sql`${t.goodFaithConfirmed} = true`),
  ],
);

/** Every rights/publish change writes a row in the same transaction. Append-only. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: idColumn(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    diff: jsonb("diff"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId), index("audit_log_time_idx").on(t.createdAt)],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: idColumn(),
    adminUserId: uuid("admin_user_id").references(() => adminUsers.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    status: importJobStatus("status").notNull().default("pending"),
    dryRun: boolean("dry_run").notNull().default(false),
    totalRows: integer("total_rows").notNull().default(0),
    importedRows: integer("imported_rows").notNull().default(0),
    failedRows: integer("failed_rows").notNull().default(0),
    errorReport: jsonb("error_report").notNull().default(sql`'[]'::jsonb`),
    ...timestamps(),
  },
  (t) => [index("import_jobs_status_idx").on(t.status, t.createdAt)],
);
