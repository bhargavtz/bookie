import { categories } from "./schema";
import type { Db } from "./client";
import { REFERENCE_CATEGORIES } from "./reference/categories";

/** Inserts structurally required reference data. Idempotent; never touches book data. */
export async function bootstrapReferenceData(db: Db): Promise<{ categoriesInserted: number }> {
  const rows = REFERENCE_CATEGORIES.map((c, index) => ({
    slug: c.slug,
    name: c.name,
    description: c.description,
    iconKey: c.iconKey,
    sortOrder: (index + 1) * 10,
  }));
  const inserted = await db
    .insert(categories)
    .values(rows)
    .onConflictDoNothing({ target: categories.slug })
    .returning({ id: categories.id });
  return { categoriesInserted: inserted.length };
}
