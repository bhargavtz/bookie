import { desc, eq, and, type SQL } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { auditLog } from "@/server/db/schema";

export type AuditEntry = {
  adminUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diff?: Record<string, unknown>;
};

/** Callers pass the transaction handle so the row commits or rolls back with the change it describes. */
export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    adminUserId: entry.adminUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    diff: entry.diff ?? null,
  });
}

export type AuditRow = {
  id: string;
  adminUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  diff: unknown;
  createdAt: Date;
};

export async function listAudit(
  db: Db,
  options: { limit: number; offset: number; entityType?: string; entityId?: string },
): Promise<AuditRow[]> {
  const conditions: SQL[] = [];
  if (options.entityType !== undefined) conditions.push(eq(auditLog.entityType, options.entityType));
  if (options.entityId !== undefined) conditions.push(eq(auditLog.entityId, options.entityId));
  return db
    .select()
    .from(auditLog)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(options.limit)
    .offset(options.offset);
}
