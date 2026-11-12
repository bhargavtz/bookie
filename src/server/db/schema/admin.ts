import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { idColumn, timestamps, timestamptz } from "./columns";
import { adminRole } from "./enums";

export const adminUsers = pgTable(
  "admin_users",
  {
    id: idColumn(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: adminRole("role").notNull().default("editor"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamptz("last_login_at"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("admin_users_email_uq").on(t.email),
    check("admin_users_email_lowercase_ck", sql`${t.email} = lower(${t.email})`),
  ],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: idColumn(),
    /** sha256 hex of the random cookie token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull(),
    adminUserId: uuid("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    lastSeenAt: timestamptz("last_seen_at").notNull().defaultNow(),
    revokedAt: timestamptz("revoked_at"),
    ipHash: text("ip_hash"),
    uaFamily: text("ua_family"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("admin_sessions_token_hash_uq").on(t.tokenHash),
    index("admin_sessions_user_idx").on(t.adminUserId),
    index("admin_sessions_expires_idx").on(t.expiresAt),
    check("admin_sessions_token_hash_ck", sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
