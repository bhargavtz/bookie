import { type AnyColumn, and, asc, eq, sql } from "drizzle-orm";
import { escapeLike } from "@/lib/search/normalize";
import type { Suggestion } from "@/lib/search/types";
import type { Db } from "@/server/db/client";
import {
  authors,
  bookAuthors,
  bookTechnologies,
  books,
  categories,
  technologies,
} from "@/server/db/schema";
import { publicBookPredicate } from "./predicate";

const contains = (column: AnyColumn, term: string) =>
  sql`bookie_unaccent(lower(${column})) like ${`%${escapeLike(term.toLowerCase())}%`}`;
const startsWith = (column: AnyColumn, term: string) =>
  sql`bookie_unaccent(lower(${column})) like ${`${escapeLike(term.toLowerCase())}%`}`;

/** Prefix matches first, then alphabetical. Only entities that lead to at least one listable book are suggested. */
export async function suggest(db: Db, now: Date, term: string, limit: number): Promise<Suggestion[]> {
  const predicate = publicBookPredicate(now);

  const [bookRows, authorRows, categoryRows, technologyRows] = await Promise.all([
    db
      .select({ slug: books.slug, label: books.title })
      .from(books)
      .where(and(predicate, contains(books.title, term)))
      .orderBy(sql`${startsWith(books.title, term)} desc`, asc(books.title))
      .limit(limit),
    db
      .selectDistinct({ slug: authors.slug, label: authors.name })
      .from(authors)
      .innerJoin(bookAuthors, eq(bookAuthors.authorId, authors.id))
      .innerJoin(books, eq(books.id, bookAuthors.bookId))
      .where(and(predicate, contains(authors.name, term)))
      .orderBy(asc(authors.name))
      .limit(limit),
    db
      .select({ slug: categories.slug, label: categories.name })
      .from(categories)
      .where(contains(categories.name, term))
      .orderBy(sql`${startsWith(categories.name, term)} desc`, asc(categories.name))
      .limit(limit),
    db
      .selectDistinct({ slug: technologies.slug, label: technologies.name })
      .from(technologies)
      .innerJoin(bookTechnologies, eq(bookTechnologies.technologyId, technologies.id))
      .innerJoin(books, eq(books.id, bookTechnologies.bookId))
      .where(and(predicate, contains(technologies.name, term)))
      .orderBy(asc(technologies.name))
      .limit(limit),
  ]);

  const tag = <T extends Suggestion["type"]>(type: T, rows: { slug: string; label: string }[]): Suggestion[] =>
    rows.map((row) => ({ type, slug: row.slug, label: row.label }));

  // Round-robin so one type cannot crowd out the others.
  const groups = [tag("book", bookRows), tag("author", authorRows), tag("technology", technologyRows), tag("category", categoryRows)];
  const merged: Suggestion[] = [];
  for (let i = 0; merged.length < limit && groups.some((group) => i < group.length); i++) {
    for (const group of groups) {
      const item = group[i];
      if (item !== undefined && merged.length < limit) merged.push(item);
    }
  }
  return merged;
}
