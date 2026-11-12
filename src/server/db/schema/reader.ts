import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { books } from "./books";
import { idColumn, timestamps } from "./columns";

/** Server-side reader state is OFF by default (READER_SYNC=false); guests use localStorage. Keyed by an anonymous random reader_key. */
export const bookmarks = pgTable(
  "bookmarks",
  {
    id: idColumn(),
    readerKey: text("reader_key").notNull(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    label: text("label"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("bookmarks_reader_book_page_uq").on(t.readerKey, t.bookId, t.page),
    index("bookmarks_book_idx").on(t.bookId),
    check("bookmarks_page_ck", sql`${t.page} >= 1`),
  ],
);

export const readingProgress = pgTable(
  "reading_progress",
  {
    readerKey: text("reader_key").notNull(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    totalPages: integer("total_pages").notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.readerKey, t.bookId] }),
    index("reading_progress_book_idx").on(t.bookId),
    check("reading_progress_page_ck", sql`${t.page} >= 1 and ${t.totalPages} >= ${t.page}`),
  ],
);
