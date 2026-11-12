import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { books, takedownRequests } from "@/server/db/schema";

/** Looks a book up by slug whatever its state: the public form must be able to refer to removed titles too. Never exposed to callers. */
export async function findBookIdBySlug(db: Db, slug: string): Promise<string | null> {
  const rows = await db.select({ id: books.id }).from(books).where(eq(books.slug, slug)).limit(1);
  return rows[0]?.id ?? null;
}

export type NewPublicTakedown = {
  bookId: string | null;
  bookUrl: string | null;
  claimantName: string;
  claimantEmail: string;
  organisation: string | null;
  relationship: string;
  description: string;
  signature: string;
  ipHash: string | null;
};

/** Inserts an `open` request. The DB constraint requires good_faith_confirmed = true. */
export async function insertPublicTakedown(db: Db, values: NewPublicTakedown): Promise<void> {
  await db.insert(takedownRequests).values({ ...values, goodFaithConfirmed: true });
}
