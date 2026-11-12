import { and, count, countDistinct, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { BookStatus, RightsStatus } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { bookCategories, books, categories, downloadEvents, licenses, takedownRequests } from "@/server/db/schema";

export type OverviewStats = {
  totalBooks: number;
  booksByStatus: Partial<Record<BookStatus, number>>;
  booksByRights: Partial<Record<RightsStatus | "none", number>>;
  awaitingReview: number;
  openTakedowns: number;
  /** One entry per category: the number of DISTINCT live books filed under it. A book in two categories counts once in each, and once in `totalBooks`. */
  booksByCategory: { categoryId: string; slug: string; name: string; books: number }[];
  uncategorisedBooks: number;
  downloads: { total: number; last30Days: number; topBooks: { bookId: string; title: string; downloads: number }[] };
};

export async function overviewStats(db: Db, now: Date): Promise<OverviewStats> {
  const live = isNull(books.deletedAt);
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

  const [byStatus, total, byRights, byCategory, categorised, takedowns, downloadTotal, downloadRecent, top] = await Promise.all([
    db.select({ status: books.status, n: count() }).from(books).where(live).groupBy(books.status),
    db.select({ n: count() }).from(books).where(live),
    db
      .select({ rights: licenses.rightsStatus, n: count() })
      .from(books)
      .leftJoin(licenses, eq(licenses.bookId, books.id))
      .where(live)
      .groupBy(licenses.rightsStatus),
    db
      .select({ categoryId: categories.id, slug: categories.slug, name: categories.name, n: countDistinct(books.id) })
      .from(categories)
      .leftJoin(bookCategories, eq(bookCategories.categoryId, categories.id))
      .leftJoin(books, and(eq(books.id, bookCategories.bookId), isNull(books.deletedAt)))
      .groupBy(categories.id, categories.slug, categories.name)
      .orderBy(categories.name),
    db
      .select({ n: countDistinct(bookCategories.bookId) })
      .from(bookCategories)
      .innerJoin(books, and(eq(books.id, bookCategories.bookId), isNull(books.deletedAt))),
    db.select({ n: count() }).from(takedownRequests).where(inArray(takedownRequests.status, ["open", "under_review"])),
    db.select({ n: count() }).from(downloadEvents).where(eq(downloadEvents.outcome, "served")),
    db.select({ n: count() }).from(downloadEvents).where(and(eq(downloadEvents.outcome, "served"), gte(downloadEvents.occurredAt, since))),
    db
      .select({ bookId: books.id, title: books.title, n: count() })
      .from(downloadEvents)
      .innerJoin(books, eq(books.id, downloadEvents.bookId))
      .where(eq(downloadEvents.outcome, "served"))
      .groupBy(books.id, books.title)
      .orderBy(desc(count()), books.title)
      .limit(10),
  ]);

  const totalBooks = total[0]?.n ?? 0;
  return {
    totalBooks,
    booksByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    booksByRights: Object.fromEntries(byRights.map((r) => [r.rights ?? "none", r.n])),
    awaitingReview: byStatus.find((r) => r.status === "in_review")?.n ?? 0,
    openTakedowns: takedowns[0]?.n ?? 0,
    booksByCategory: byCategory.map((r) => ({ categoryId: r.categoryId, slug: r.slug, name: r.name, books: r.n })),
    uncategorisedBooks: totalBooks - (categorised[0]?.n ?? 0),
    downloads: {
      total: downloadTotal[0]?.n ?? 0,
      last30Days: downloadRecent[0]?.n ?? 0,
      topBooks: top.map((r) => ({ bookId: r.bookId, title: r.title, downloads: r.n })),
    },
  };
}

