import { and, eq, inArray } from "drizzle-orm";
import type { BookPublishView } from "@/lib/policy";
import type { Db } from "@/server/db/client";
import { assets, takedownRequests } from "@/server/db/schema";
import { getBook } from "./books";
import { hasUnresolvedDuplicate } from "./duplicates";
import { getLicense } from "./licenses";

/** Everything `canPublish` needs, read in one place so the policy sees the same facts the trigger will. */
export async function getPublishView(db: Db, bookId: string): Promise<BookPublishView | null> {
  const book = await getBook(db, bookId);
  if (book === null) return null;
  const [license, primary, duplicate, openTakedowns] = await Promise.all([
    getLicense(db, bookId),
    book.primaryAssetId === null
      ? Promise.resolve(null)
      : db
          .select({ status: assets.status, sha256: assets.sha256 })
          .from(assets)
          .where(eq(assets.id, book.primaryAssetId))
          .limit(1)
          .then((rows) => rows[0] ?? null),
    hasUnresolvedDuplicate(db, bookId),
    db
      .select({ id: takedownRequests.id })
      .from(takedownRequests)
      .where(and(eq(takedownRequests.bookId, bookId), inArray(takedownRequests.status, ["open", "under_review"])))
      .limit(1),
  ]);
  return {
    bookStatus: book.status,
    deletedAt: book.deletedAt,
    slug: book.slug,
    title: book.title,
    openTakedown: openTakedowns.length > 0,
    license,
    primaryAsset: primary,
    unresolvedDuplicate: duplicate,
  };
}
