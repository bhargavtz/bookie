import { desc, eq } from "drizzle-orm";
import type { TakedownStatus } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { takedownRequests } from "@/server/db/schema";

export type TakedownRecord = {
  id: string;
  bookId: string | null;
  claimantName: string;
  claimantEmail: string;
  status: TakedownStatus;
  description: string;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
};

const columns = {
  id: takedownRequests.id,
  bookId: takedownRequests.bookId,
  claimantName: takedownRequests.claimantName,
  claimantEmail: takedownRequests.claimantEmail,
  status: takedownRequests.status,
  description: takedownRequests.description,
  resolutionNote: takedownRequests.resolutionNote,
  resolvedAt: takedownRequests.resolvedAt,
  createdAt: takedownRequests.createdAt,
};

export async function listTakedowns(db: Db, status: TakedownStatus | undefined, limit: number, offset: number): Promise<TakedownRecord[]> {
  return db
    .select(columns)
    .from(takedownRequests)
    .where(status === undefined ? undefined : eq(takedownRequests.status, status))
    .orderBy(desc(takedownRequests.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getTakedown(db: Db, id: string): Promise<TakedownRecord | null> {
  const rows = await db.select(columns).from(takedownRequests).where(eq(takedownRequests.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Records a request received outside the public form (e.g. by email) at the moment an admin acts on it. */
export async function insertAdminTakedown(
  db: Db,
  values: {
    bookId: string;
    claimantName: string;
    claimantEmail: string;
    relationship: string;
    description: string;
    signature: string;
    status: TakedownStatus;
    resolutionNote: string | null;
    resolvedBy: string;
    resolvedAt: Date;
  },
): Promise<string> {
  const rows = await db
    .insert(takedownRequests)
    .values({ ...values, goodFaithConfirmed: true })
    .returning({ id: takedownRequests.id });
  const row = rows[0];
  if (row === undefined) throw new Error("takedown insert returned no row");
  return row.id;
}

export async function resolveTakedown(
  db: Db,
  id: string,
  values: { status: TakedownStatus; resolutionNote: string | null; resolvedBy: string; resolvedAt: Date },
): Promise<void> {
  await db.update(takedownRequests).set(values).where(eq(takedownRequests.id, id));
}
