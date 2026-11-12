import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { AdminRole } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { adminSessions, adminUsers } from "@/server/db/schema";

export type AdminUserRow = {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  isActive: boolean;
};

const userColumns = {
  id: adminUsers.id,
  email: adminUsers.email,
  passwordHash: adminUsers.passwordHash,
  role: adminUsers.role,
  isActive: adminUsers.isActive,
};

export async function findAdminByEmail(db: Db, email: string): Promise<AdminUserRow | null> {
  const rows = await db.select(userColumns).from(adminUsers).where(eq(adminUsers.email, email.toLowerCase())).limit(1);
  return rows[0] ?? null;
}

/**
 * The environment credential is the source of truth for the bootstrap owner:
 * the row is created or its hash/role/active flag are re-synchronised.
 */
export async function upsertBootstrapOwner(db: Db, email: string, passwordHash: string): Promise<AdminUserRow> {
  const rows = await db
    .insert(adminUsers)
    .values({ email: email.toLowerCase(), passwordHash, role: "owner", isActive: true })
    .onConflictDoUpdate({
      target: adminUsers.email,
      set: { passwordHash, role: "owner", isActive: true },
    })
    .returning(userColumns);
  const row = rows[0];
  if (row === undefined) throw new Error("bootstrap admin upsert returned no row");
  return row;
}

export async function recordLogin(db: Db, adminUserId: string, now: Date): Promise<void> {
  await db.update(adminUsers).set({ lastLoginAt: now }).where(eq(adminUsers.id, adminUserId));
}

export type NewSession = {
  tokenHash: string;
  adminUserId: string;
  expiresAt: Date;
  ipHash: string | null;
  uaFamily: string | null;
  now: Date;
};

export async function insertSession(db: Db, input: NewSession): Promise<void> {
  await db.insert(adminSessions).values({
    tokenHash: input.tokenHash,
    adminUserId: input.adminUserId,
    expiresAt: input.expiresAt,
    lastSeenAt: input.now,
    ipHash: input.ipHash,
    uaFamily: input.uaFamily,
  });
}

export type SessionWithUser = {
  sessionId: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  user: Pick<AdminUserRow, "id" | "email" | "role" | "isActive">;
};

export async function findSessionByTokenHash(db: Db, tokenHash: string): Promise<SessionWithUser | null> {
  const rows = await db
    .select({
      sessionId: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      lastSeenAt: adminSessions.lastSeenAt,
      revokedAt: adminSessions.revokedAt,
      userId: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
      isActive: adminUsers.isActive,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(eq(adminSessions.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
    user: { id: row.userId, email: row.email, role: row.role, isActive: row.isActive },
  };
}

export async function touchSession(db: Db, sessionId: string, now: Date): Promise<void> {
  await db.update(adminSessions).set({ lastSeenAt: now }).where(eq(adminSessions.id, sessionId));
}

export async function revokeSessionByTokenHash(db: Db, tokenHash: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt)))
    .returning({ id: adminSessions.id });
  return rows.length > 0;
}

/** Revokes every live session of a user, optionally keeping one. Returns how many were revoked. */
export async function revokeSessionsForUser(db: Db, adminUserId: string, now: Date, exceptSessionId?: string): Promise<number> {
  const conditions = [eq(adminSessions.adminUserId, adminUserId), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, now)];
  if (exceptSessionId !== undefined) conditions.push(ne(adminSessions.id, exceptSessionId));
  const rows = await db
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(and(...conditions))
    .returning({ id: adminSessions.id });
  return rows.length;
}

export async function setAdminRole(db: Db, adminUserId: string, role: AdminRole): Promise<void> {
  await db.update(adminUsers).set({ role }).where(eq(adminUsers.id, adminUserId));
}

export async function setAdminActive(db: Db, adminUserId: string, isActive: boolean): Promise<void> {
  await db.update(adminUsers).set({ isActive }).where(eq(adminUsers.id, adminUserId));
}
