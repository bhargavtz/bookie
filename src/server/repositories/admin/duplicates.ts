import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { assets, books } from "@/server/db/schema";

export type DuplicateGroup = { key: string; books: { bookId: string; title: string; deleted: boolean }[] };

/** ISBN-13 values shared by more than one book (soft-deleted books included, so an admin can see why a restore would collide). */
export async function isbnDuplicateGroups(db: Db): Promise<DuplicateGroup[]> {
  const rows = await db
    .select({ isbn13: books.isbn13, bookId: books.id, title: books.title, deletedAt: books.deletedAt })
    .from(books)
    .where(
      and(
        isNotNull(books.isbn13),
        sql`${books.isbn13} in (select isbn13 from books where isbn13 is not null group by isbn13 having count(*) > 1)`,
      ),
    );
  return group(rows.map((r) => ({ key: r.isbn13 ?? "", bookId: r.bookId, title: r.title, deleted: r.deletedAt !== null })));
}

/** PDF checksums shared by more than one asset row (a deleted or rejected copy may coexist with a live one). */
export async function checksumDuplicateGroups(db: Db): Promise<DuplicateGroup[]> {
  const rows = await db
    .select({ sha256: assets.sha256, bookId: books.id, title: books.title, deletedAt: books.deletedAt })
    .from(assets)
    .innerJoin(books, eq(books.id, assets.bookId))
    .where(
      and(
        eq(assets.kind, "pdf"),
        isNotNull(assets.sha256),
        sql`${assets.sha256} in (select sha256 from assets where kind = 'pdf' and sha256 is not null group by sha256 having count(distinct book_id) > 1)`,
      ),
    );
  return group(rows.map((r) => ({ key: r.sha256 ?? "", bookId: r.bookId, title: r.title, deleted: r.deletedAt !== null })));
}

function group(rows: { key: string; bookId: string; title: string; deleted: boolean }[]): DuplicateGroup[] {
  const map = new Map<string, DuplicateGroup>();
  for (const row of rows) {
    const entry = map.get(row.key) ?? { key: row.key, books: [] };
    if (!entry.books.some((b) => b.bookId === row.bookId)) entry.books.push({ bookId: row.bookId, title: row.title, deleted: row.deleted });
    map.set(row.key, entry);
  }
  return [...map.values()];
}

/** True when another live book shares this book's ISBN-13 or PDF checksum. */
export async function hasUnresolvedDuplicate(db: Db, bookId: string): Promise<boolean> {
  const byIsbn = await db.execute(sql`
    select 1 from books a join books b on b.isbn13 = a.isbn13 and b.id <> a.id and b.deleted_at is null
    where a.id = ${bookId} and a.isbn13 is not null limit 1`);
  if (rowCount(byIsbn) > 0) return true;
  const bySha = await db.execute(sql`
    select 1 from assets a join assets b on b.sha256 = a.sha256 and b.book_id <> a.book_id and b.kind = 'pdf' and b.status <> 'deleted'
    join books bb on bb.id = b.book_id and bb.deleted_at is null
    where a.book_id = ${bookId} and a.kind = 'pdf' and a.status <> 'deleted' and a.sha256 is not null limit 1`);
  return rowCount(bySha) > 0;
}

/** Drivers return either `{ rows }` (node-postgres, PGlite) or an array. */
function rowCount(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  const rows = (result as { rows?: unknown[] }).rows;
  return Array.isArray(rows) ? rows.length : 0;
}

