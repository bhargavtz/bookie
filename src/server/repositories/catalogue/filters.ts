import { type SQL, sql } from "drizzle-orm";
import type { CatalogueFilters } from "@/lib/search/filters";
import {
  assets,
  authors,
  bookAuthors,
  bookCategories,
  bookTechnologies,
  books,
  categories,
  licenses,
  technologies,
} from "@/server/db/schema";

const inCategory = (slug: string): SQL => sql`exists (
  select 1 from ${bookCategories}
  inner join ${categories} on ${categories.id} = ${bookCategories.categoryId}
  where ${bookCategories.bookId} = ${books.id} and ${categories.slug} = ${slug}
)`;

const inTechnology = (slug: string): SQL => sql`exists (
  select 1 from ${bookTechnologies}
  inner join ${technologies} on ${technologies.id} = ${bookTechnologies.technologyId}
  where ${bookTechnologies.bookId} = ${books.id} and ${technologies.slug} = ${slug}
)`;

const byAuthor = (slug: string): SQL => sql`exists (
  select 1 from ${bookAuthors}
  inner join ${authors} on ${authors.id} = ${bookAuthors.authorId}
  where ${bookAuthors.bookId} = ${books.id} and ${authors.slug} = ${slug}
)`;

/** One SQL condition per active filter; all are ANDed by the caller. */
export function filterConditions(filters: CatalogueFilters): SQL[] {
  const conditions: SQL[] = [];
  for (const slug of filters.categories) conditions.push(inCategory(slug));
  for (const slug of filters.technologies) conditions.push(inTechnology(slug));
  for (const slug of filters.topics) conditions.push(sql`(${inCategory(slug)} or ${inTechnology(slug)})`);
  for (const slug of filters.authors) conditions.push(byAuthor(slug));
  if (filters.level !== undefined) conditions.push(sql`${books.level} = ${filters.level}`);
  if (filters.language !== undefined) conditions.push(sql`lower(${books.language}) = ${filters.language}`);
  if (filters.year !== undefined) conditions.push(sql`${books.publishedYear} = ${filters.year}`);
  if (filters.format !== undefined) {
    conditions.push(sql`exists (select 1 from ${assets} where ${assets.id} = ${books.primaryAssetId} and ${assets.kind} = ${filters.format})`);
  }
  if (filters.license !== undefined) {
    conditions.push(sql`exists (select 1 from ${licenses} where ${licenses.bookId} = ${books.id} and ${licenses.licenseType} = ${filters.license})`);
  }
  return conditions;
}
