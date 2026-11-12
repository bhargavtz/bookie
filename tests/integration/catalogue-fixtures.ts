import { eq } from "drizzle-orm";
import { slugify } from "@/lib/slug";
import type { BookLevel, BookStatus, LicenseType } from "@/contracts/enums";
import type { Db } from "@/server/db/client";
import { refreshSearchText } from "@/server/repositories/catalogue";
import {
  authors,
  bookAuthors,
  bookCategories,
  bookTags,
  bookTechnologies,
  books,
  categories,
  collectionBooks,
  collections,
  downloadEvents,
  tags,
  technologies,
} from "@/server/db/schema";
import { insertApprovedLicense, insertAsset, insertBook, insertLicense } from "../helpers/factories";

/** Inline fixture builder for catalogue tests. Every row is created here, in a throwaway database. */

export type BookSpec = {
  title: string;
  slug?: string;
  subtitle?: string;
  description?: string;
  authors?: string[];
  categories?: string[];
  technologies?: { name: string; aliases?: string[] }[];
  tags?: string[];
  status?: BookStatus;
  rights?: "approved" | "restricted" | "pending" | "removed" | "none";
  asset?: "ready" | "uploading" | "none";
  cover?: boolean;
  expired?: boolean;
  deleted?: boolean;
  publishedAt?: Date;
  publishedYear?: number;
  language?: string;
  level?: BookLevel;
  licenseType?: LicenseType;
};

async function ensure<T extends { id: string }>(find: () => Promise<T | undefined>, create: () => Promise<T | undefined>): Promise<T> {
  const existing = await find();
  if (existing) return existing;
  const created = await create();
  const row = created ?? (await find());
  if (!row) throw new Error("fixture row could not be created");
  return row;
}

export async function ensureCategory(db: Db, name: string, sortOrder = 0) {
  const slug = slugify(name);
  return ensure(
    async () => (await db.select().from(categories).where(eq(categories.slug, slug)))[0],
    async () => (await db.insert(categories).values({ slug, name, sortOrder }).returning())[0],
  );
}

async function ensureAuthor(db: Db, name: string) {
  const slug = slugify(name);
  return ensure(
    async () => (await db.select().from(authors).where(eq(authors.slug, slug)))[0],
    async () => (await db.insert(authors).values({ slug, name }).returning())[0],
  );
}

async function ensureTechnology(db: Db, name: string, aliases: string[]) {
  const slug = slugify(name);
  return ensure(
    async () => (await db.select().from(technologies).where(eq(technologies.slug, slug)))[0],
    async () => (await db.insert(technologies).values({ slug, name, aliases }).returning())[0],
  );
}

async function ensureTag(db: Db, name: string) {
  const slug = slugify(name);
  return ensure(
    async () => (await db.select().from(tags).where(eq(tags.slug, slug)))[0],
    async () => (await db.insert(tags).values({ slug, name }).returning())[0],
  );
}

export async function seedBook(db: Db, spec: BookSpec) {
  const status = spec.status ?? "published";
  const rights = spec.rights ?? "approved";
  const book = await insertBook(db, {
    slug: spec.slug ?? slugify(spec.title),
    title: spec.title,
    subtitle: spec.subtitle ?? null,
    description: spec.description ?? null,
    publishedYear: spec.publishedYear ?? null,
    language: spec.language ?? "en",
    level: spec.level ?? null,
  });

  const licenseOverrides = {
    allowRead: true,
    allowDownload: rights === "approved",
    licenseType: spec.licenseType ?? "project-original",
    expiresAt: spec.expired === true ? new Date("2020-01-01T00:00:00Z") : null,
  } as const;
  if (rights === "approved") await insertApprovedLicense(db, book.id, licenseOverrides);
  if (rights === "restricted") {
    await insertLicense(db, book.id, { rightsStatus: "restricted", ...licenseOverrides, allowDownload: false });
  }
  if (rights === "pending") await insertLicense(db, book.id, {});
  if (rights === "removed") {
    await insertLicense(db, book.id, { rightsStatus: "removed", removedAt: new Date(), allowRead: false, allowDownload: false });
  }

  let primaryAssetId: string | null = null;
  if (spec.asset !== "none") {
    const asset = await insertAsset(db, book.id, { status: spec.asset === "uploading" ? "uploading" : "ready" });
    primaryAssetId = asset.id;
  }
  let coverAssetId: string | null = null;
  if (spec.cover === true) {
    const cover = await insertAsset(db, book.id, { kind: "cover", mimeType: "image/png", status: "ready" });
    coverAssetId = cover.id;
  }

  for (const [index, name] of (spec.authors ?? []).entries()) {
    const author = await ensureAuthor(db, name);
    await db.insert(bookAuthors).values({ bookId: book.id, authorId: author.id, position: index });
  }
  for (const [index, name] of (spec.categories ?? []).entries()) {
    const category = await ensureCategory(db, name);
    await db.insert(bookCategories).values({ bookId: book.id, categoryId: category.id, isPrimary: index === 0 });
  }
  for (const technology of spec.technologies ?? []) {
    const row = await ensureTechnology(db, technology.name, technology.aliases ?? []);
    await db.insert(bookTechnologies).values({ bookId: book.id, technologyId: row.id });
  }
  for (const name of spec.tags ?? []) {
    const tag = await ensureTag(db, name);
    await db.insert(bookTags).values({ bookId: book.id, tagId: tag.id });
  }

  await db
    .update(books)
    .set({
      status,
      primaryAssetId,
      coverAssetId,
      publishedAt: spec.publishedAt ?? new Date("2026-01-01T00:00:00Z"),
      deletedAt: spec.deleted === true ? new Date("2026-02-01T00:00:00Z") : null,
    })
    .where(eq(books.id, book.id));
  await refreshSearchText(db, book.id);
  return book;
}

export async function seedCollection(
  db: Db,
  spec: { title: string; status?: "draft" | "published"; featured?: boolean; bookIds: string[] },
) {
  const [collection] = await db
    .insert(collections)
    .values({ slug: slugify(spec.title), title: spec.title, status: spec.status ?? "published", isFeatured: spec.featured ?? false })
    .returning();
  if (!collection) throw new Error("collection insert failed");
  for (const [position, bookId] of spec.bookIds.entries()) {
    await db.insert(collectionBooks).values({ collectionId: collection.id, bookId, position });
  }
  return collection;
}

export async function recordServedDownloads(db: Db, bookId: string, count: number) {
  for (let i = 0; i < count; i++) await db.insert(downloadEvents).values({ bookId, outcome: "served" });
}
