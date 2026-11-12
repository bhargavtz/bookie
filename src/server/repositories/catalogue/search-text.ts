import { asc, eq } from "drizzle-orm";
import { buildSearchText } from "@/lib/search/normalize";
import type { Db } from "@/server/db/client";
import {
  authors,
  bookAuthors,
  bookCategories,
  bookTags,
  bookTechnologies,
  books,
  categories,
  tags,
  technologies,
} from "@/server/db/schema";

/**
 * Recomputes `books.search_text` (authors, technologies and their aliases,
 * categories, tags) so the generated tsvector stays in step. Writers of any
 * of those relations (admin services, CSV import) call this in the same
 * transaction after changing them.
 */
export async function refreshSearchText(db: Db, bookId: string): Promise<string> {
  const [authorRows, technologyRows, categoryRows, tagRows] = await Promise.all([
    db
      .select({ name: authors.name })
      .from(bookAuthors)
      .innerJoin(authors, eq(authors.id, bookAuthors.authorId))
      .where(eq(bookAuthors.bookId, bookId))
      .orderBy(asc(bookAuthors.position)),
    db
      .select({ name: technologies.name, aliases: technologies.aliases })
      .from(bookTechnologies)
      .innerJoin(technologies, eq(technologies.id, bookTechnologies.technologyId))
      .where(eq(bookTechnologies.bookId, bookId)),
    db
      .select({ name: categories.name })
      .from(bookCategories)
      .innerJoin(categories, eq(categories.id, bookCategories.categoryId))
      .where(eq(bookCategories.bookId, bookId)),
    db
      .select({ name: tags.name })
      .from(bookTags)
      .innerJoin(tags, eq(tags.id, bookTags.tagId))
      .where(eq(bookTags.bookId, bookId)),
  ]);

  const searchText = buildSearchText({
    authors: authorRows.map((r) => r.name),
    technologies: technologyRows,
    categories: categoryRows.map((r) => r.name),
    tags: tagRows.map((r) => r.name),
  });
  await db.update(books).set({ searchText }).where(eq(books.id, bookId));
  return searchText;
}
