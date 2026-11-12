import { type SQL, sql } from "drizzle-orm";
import { assets, books, licenses } from "@/server/db/schema";

/**
 * The single SQL form of "this book may be listed publicly". It mirrors
 * `canList` for a public viewer (tests/integration/catalogue-policy-parity
 * proves the two agree for every licence state) and is the only place public
 * queries decide visibility. Services additionally run every returned row
 * through `canList`, so a divergence can only ever hide books, never leak one.
 */
export function publicBookPredicate(now: Date): SQL {
  const at = now.toISOString();
  return sql`(
    ${books.deletedAt} is null
    and ${books.status} = 'published'
    and exists (
      select 1 from ${licenses}
      where ${licenses.bookId} = ${books.id}
        and ${licenses.rightsStatus} in ('approved', 'restricted')
        and (${licenses.expiresAt} is null or ${licenses.expiresAt} > ${at}::timestamptz)
    )
    and exists (
      select 1 from ${assets}
      where ${assets.id} = ${books.primaryAssetId}
        and ${assets.status} = 'ready'
    )
  )`;
}
