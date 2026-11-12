import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canList } from "@/lib/policy";
import { catalogueListQuerySchema, publicSearchQuerySchema } from "@/lib/search/schemas";
import type { DbHandle } from "@/server/db/client";
import { books } from "@/server/db/schema";
import { findBookBySlug, findPublicBooks } from "@/server/repositories/catalogue";
import { CatalogueError } from "@/server/services/catalogue/errors";
import { rightsView } from "@/server/services/catalogue/mapping";
import { createCatalogueService, type CatalogueService } from "@/server/services/catalogue/service";
import { createSearchService } from "@/server/services/search/service";
import { createTestDb } from "../helpers/db";
import { type BookSpec, ensureCategory, recordServedDownloads, seedBook, seedCollection } from "./catalogue-fixtures";

let handle: DbHandle;
let catalogue: CatalogueService;
let search: ReturnType<typeof createSearchService>;

const NOW = new Date("2026-06-01T00:00:00Z");
const list = (raw: Record<string, string> = {}) => catalogue.listBooks(catalogueListQuerySchema.parse(raw));
const find = (raw: Record<string, string>) => catalogue.searchBooks(publicSearchQuerySchema.parse(raw));
const slugs = (page: { items: { slug: string }[] }) => page.items.map((item) => item.slug);

/** Books that must be listable, and books that must never appear anywhere public. */
const visible: BookSpec[] = [
  {
    title: "Systems Programming in C++",
    subtitle: "Memory and performance",
    description: "A practical guide to writing fast native software with careful memory management.",
    authors: ["Ada Fixture", "Grace Sample"],
    categories: ["Programming Languages", "Systems"],
    technologies: [{ name: "C++", aliases: ["cpp"] }],
    tags: ["performance"],
    publishedAt: new Date("2026-03-01T00:00:00Z"),
    publishedYear: 2024,
    level: "advanced",
    cover: true,
    licenseType: "cc-by",
  },
  {
    title: "Database Internals Explained",
    description: "How storage engines, indexes and transactions work inside relational databases.",
    authors: ["Grace Sample"],
    categories: ["Databases"],
    technologies: [{ name: "PostgreSQL" }],
    publishedAt: new Date("2026-04-01T00:00:00Z"),
    publishedYear: 2023,
    level: "intermediate",
    licenseType: "public-domain",
  },
  {
    title: "Programming Languages Handbook",
    authors: ["Linus Placeholder"],
    categories: ["Programming Languages"],
    rights: "restricted",
    publishedAt: new Date("2026-05-01T00:00:00Z"),
    language: "de",
    licenseType: "publisher-permission",
  },
];

const hidden: BookSpec[] = [
  { title: "Hidden Draft Programming", status: "draft", rights: "none", asset: "none", categories: ["Programming Languages"], authors: ["Grace Sample"] },
  { title: "Hidden In Review Programming", status: "in_review", rights: "pending", categories: ["Programming Languages"] },
  { title: "Hidden Unpublished Programming", status: "unpublished", categories: ["Programming Languages"] },
  { title: "Hidden Archived Programming", status: "archived", categories: ["Programming Languages"] },
  { title: "Hidden Removed Programming", status: "unpublished", rights: "removed", categories: ["Programming Languages"] },
  { title: "Hidden Deleted Programming", deleted: true, categories: ["Programming Languages"] },
  { title: "Hidden Expired Programming", expired: true, categories: ["Programming Languages"] },
  { title: "Hidden No File Programming", asset: "none", categories: ["Programming Languages"] },
  { title: "Hidden Uploading Programming", asset: "uploading", categories: ["Programming Languages"] },
];

beforeAll(async () => {
  handle = await createTestDb();
  catalogue = createCatalogueService({ db: handle.db, now: () => NOW });
  search = createSearchService({ db: handle.db, now: () => NOW });
  for (const spec of [...visible, ...hidden]) await seedBook(handle.db, spec);
});
afterAll(async () => {
  await handle.close();
});

describe("public visibility", () => {
  it("lists only published books with an approved or restricted, unexpired licence and a ready file", async () => {
    const page = await list({ limit: "48" });
    expect(slugs(page).sort()).toEqual(
      ["database-internals-explained", "programming-languages-handbook", "systems-programming-in-cpp"].sort(),
    );
    expect(page.total).toBe(3);
  });

  it("never returns hidden books from any surface", async () => {
    const surfaces = [
      await list({ limit: "48" }),
      await find({ q: "programming", limit: "48" }),
      await find({ q: "hidden", limit: "48" }),
      await find({ category: "programming-languages", limit: "48" }),
      await catalogue.recentlyAdded(24),
    ];
    for (const page of surfaces) expect(slugs(page).filter((slug) => slug.startsWith("hidden"))).toEqual([]);
    expect((await find({ q: "hidden" })).items).toEqual([]);
    expect(await search.autocomplete({ q: "hidden", limit: 8 })).toEqual([]);
  });

  it("answers 404 for hidden books and 410 for a removed licence, never data", async () => {
    await expect(catalogue.getBook("hidden-draft-programming")).rejects.toMatchObject({ code: "not_found", status: 404 });
    await expect(catalogue.getBook("hidden-unpublished-programming")).rejects.toMatchObject({ code: "not_found" });
    await expect(catalogue.getBook("hidden-expired-programming")).rejects.toMatchObject({ code: "not_found" });
    await expect(catalogue.getBook("hidden-removed-programming")).rejects.toMatchObject({ code: "gone", status: 410 });
    await expect(catalogue.getBook("no-such-book")).rejects.toBeInstanceOf(CatalogueError);
    await expect(catalogue.getBook("Not A Slug!")).rejects.toMatchObject({ code: "not_found" });
  });

  it("agrees with the rights policy for every book (predicate parity)", async () => {
    const all = await findPublicBooks(handle.db, NOW, {
      filters: { categories: [], technologies: [], topics: [], authors: [] },
      text: null,
      sort: "newest",
      offset: 0,
      limit: 200,
    });
    const listedSlugs = new Set(all.rows.map((row) => row.slug));
    const everySlug = await handle.db.select({ slug: books.slug }).from(books);
    expect(everySlug.length).toBeGreaterThanOrEqual(visible.length + hidden.length);
    for (const { slug } of everySlug) {
      const row = await findBookBySlug(handle.db, slug);
      if (row === null) throw new Error("fixture missing");
      expect(listedSlugs.has(slug), slug).toBe(canList({ kind: "public" }, rightsView(row), NOW).allowed);
    }
  });

  it("reflects a rights change immediately: unpublishing removes the book everywhere", async () => {
    const book = await seedBook(handle.db, { title: "Temporary Visibility Check Programming" });
    expect(slugs(await find({ q: "temporary visibility" }))).toContain(book.slug);
    await handle.db.update(books).set({ status: "unpublished" }).where(eq(books.id, book.id));
    expect((await find({ q: "temporary visibility" })).items).toEqual([]);
    await expect(catalogue.getBook(book.slug)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("book detail and summaries", () => {
  it("builds detail with rights flags from the policy", async () => {
    const detail = await catalogue.getBook("systems-programming-in-cpp");
    expect(detail).toMatchObject({
      title: "Systems Programming in C++",
      authors: ["Ada Fixture", "Grace Sample"],
      categorySlugs: ["programming-languages", "systems"],
      canRead: true,
      canDownload: true,
      level: "advanced",
      license: { rightsStatus: "approved", licenseType: "cc-by" },
    });
    expect(detail.technologies).toEqual([{ slug: "cpp", name: "C++" }]);
    expect(detail.coverUrl).toBe("/api/books/systems-programming-in-cpp/cover");
  });

  it("never offers download for a restricted licence", async () => {
    const detail = await catalogue.getBook("programming-languages-handbook");
    expect(detail).toMatchObject({ canRead: true, canDownload: false, license: { rightsStatus: "restricted" }, coverUrl: null });
  });
});

describe("categories", () => {
  it("counts unique published books per category, deduplicating multi-category books", async () => {
    const { categories, totalBooks } = await catalogue.listCategories();
    const count = (slug: string) => categories.find((c) => c.slug === slug)?.bookCount;
    // Systems Programming is in two categories; Programming Languages also has the restricted handbook.
    expect(count("programming-languages")).toBe(2);
    expect(count("systems")).toBe(1);
    expect(count("databases")).toBe(1);
    // Three unique books overall, not 4 (the sum of the category counts).
    expect(totalBooks).toBe(3);
    expect(categories.reduce((sum, c) => sum + c.bookCount, 0)).toBe(4);
  });

  it("ignores hidden books and keeps empty categories at zero", async () => {
    await ensureCategory(handle.db, "Empty Shelf Category", 99);
    const { categories } = await catalogue.listCategories();
    expect(categories.find((c) => c.slug === "empty-shelf-category")?.bookCount).toBe(0);
    expect(categories.find((c) => c.slug === "programming-languages")?.bookCount).toBe(2);
  });

  it("returns a category with its books and 404 for unknown or malformed slugs", async () => {
    expect((await catalogue.getCategory("databases")).bookCount).toBe(1);
    await expect(catalogue.getCategory("nope")).rejects.toMatchObject({ code: "not_found" });
    await expect(catalogue.getCategory("../etc")).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("filters", () => {
  it("filters by category, technology, topic, author, year, language, level, format and licence", async () => {
    expect(slugs(await list({ category: "databases" }))).toEqual(["database-internals-explained"]);
    expect(slugs(await list({ category: "systems" }))).toEqual(["systems-programming-in-cpp"]);
    expect(slugs(await list({ technology: "postgresql" }))).toEqual(["database-internals-explained"]);
    expect(slugs(await list({ topic: "databases" }))).toEqual(["database-internals-explained"]);
    expect(slugs(await list({ topic: "postgresql" }))).toEqual(["database-internals-explained"]);
    expect((await list({ author: "grace-sample" })).items).toHaveLength(2);
    expect(slugs(await list({ author: "linus-placeholder" }))).toEqual(["programming-languages-handbook"]);
    expect(slugs(await list({ year: "2023" }))).toEqual(["database-internals-explained"]);
    expect(slugs(await list({ language: "de" }))).toEqual(["programming-languages-handbook"]);
    expect(slugs(await list({ level: "advanced" }))).toEqual(["systems-programming-in-cpp"]);
    expect((await list({ format: "pdf" })).items).toHaveLength(3);
    expect(slugs(await list({ license: "public-domain" }))).toEqual(["database-internals-explained"]);
  });

  it("combines filters with AND and returns nothing for an unknown value", async () => {
    expect(slugs(await list({ category: "programming-languages", author: "grace-sample" }))).toEqual(["systems-programming-in-cpp"]);
    expect((await list({ category: "databases", language: "de" })).items).toEqual([]);
    expect((await list({ category: "does-not-exist" })).items).toEqual([]);
  });
});

describe("sorting and pagination", () => {
  it("sorts by newest, title and popularity (real download events only)", async () => {
    expect(slugs(await list({ sort: "newest" }))).toEqual([
      "programming-languages-handbook",
      "database-internals-explained",
      "systems-programming-in-cpp",
    ]);
    expect(slugs(await list({ sort: "title" }))).toEqual([
      "database-internals-explained",
      "programming-languages-handbook",
      "systems-programming-in-cpp",
    ]);
    expect((await catalogue.popular(8)).items).toEqual([]);

    const systems = await findBookBySlug(handle.db, "systems-programming-in-cpp");
    const databases = await findBookBySlug(handle.db, "database-internals-explained");
    if (systems === null || databases === null) throw new Error("fixture missing");
    await recordServedDownloads(handle.db, systems.id, 3);
    await recordServedDownloads(handle.db, databases.id, 1);
    expect(slugs(await list({ sort: "popularity" }))[0]).toBe("systems-programming-in-cpp");
    expect(slugs(await catalogue.popular(8))).toEqual(["systems-programming-in-cpp", "database-internals-explained"]);
  });

  it("pages through results with an opaque cursor without gaps or repeats", async () => {
    const first = await list({ limit: "2", sort: "title" });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await list({ limit: "2", sort: "title", cursor: first.nextCursor ?? "" });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect([...slugs(first), ...slugs(second)]).toEqual(slugs(await list({ sort: "title" })));
  });

  it("rejects a malformed cursor", async () => {
    await expect(list({ cursor: "garbage" })).rejects.toMatchObject({ code: "invalid_query" });
  });

  it("recently added is newest first", async () => {
    expect(slugs(await catalogue.recentlyAdded(2))).toEqual(["programming-languages-handbook", "database-internals-explained"]);
  });
});

describe("full-text search", () => {
  it("matches title, author, description, technology alias, category and tag", async () => {
    expect(slugs(await find({ q: "storage engines" }))).toEqual(["database-internals-explained"]);
    expect(slugs(await find({ q: "Linus Placeholder" }))).toEqual(["programming-languages-handbook"]);
    expect(slugs(await find({ q: "c++" }))).toContain("systems-programming-in-cpp");
    expect(slugs(await find({ q: "cpp" }))).toContain("systems-programming-in-cpp");
    expect(slugs(await find({ q: "postgresql" }))).toEqual(["database-internals-explained"]);
    expect(slugs(await find({ q: "databases" }))).toContain("database-internals-explained");
    expect(slugs(await find({ q: "performance" }))).toEqual(["systems-programming-in-cpp"]);
  });

  it("stems words and tolerates a small typo in the title", async () => {
    expect(slugs(await find({ q: "transactional" }))).toEqual(["database-internals-explained"]);
    expect(slugs(await find({ q: "Databse Internals Explaned" }))).toContain("database-internals-explained");
  });

  it("combines text with filters and supports web-style operators", async () => {
    expect(slugs(await find({ q: "programming", category: "databases" }))).toEqual([]);
    expect(slugs(await find({ q: "programming", language: "de" }))).toEqual(["programming-languages-handbook"]);
    expect(slugs(await find({ q: "programming -handbook" }))).not.toContain("programming-languages-handbook");
  });

  it("falls back to newest when relevance is requested without usable text", async () => {
    const page = await find({ q: "!!!" });
    expect(page.items).toHaveLength(3);
    expect(page.items.every((item) => item.highlight === null)).toBe(true);
  });

  it("ranks a title match above a description-only match", async () => {
    const results = await find({ q: "databases" });
    expect(slugs(results)[0]).toBe("database-internals-explained");
  });

  it("returns highlight segments instead of markup", async () => {
    const [hit] = (await find({ q: "storage" })).items;
    expect(hit?.highlight?.excerpt.some((segment) => segment.match && segment.text.toLowerCase().includes("storage"))).toBe(true);
    const text = (hit?.highlight?.excerpt ?? []).map((segment) => segment.text).join("");
    expect(text).not.toContain("<");
    const titled = (await find({ q: "database" })).items[0];
    expect(titled?.highlight?.title.some((segment) => segment.match)).toBe(true);
  });

  it("treats LIKE and query metacharacters literally and safely", async () => {
    expect((await find({ q: "'; drop table books; --" })).items).toEqual([]);
    expect(await search.autocomplete({ q: "%%", limit: 8 })).toEqual([]);
    expect(await search.autocomplete({ q: "__", limit: 8 })).toEqual([]);
  });
});

describe("autocomplete", () => {
  it("suggests books, authors, technologies and categories that lead to listable books", async () => {
    const suggestions = await search.autocomplete({ q: "data", limit: 8 });
    expect(suggestions).toContainEqual({ type: "book", slug: "database-internals-explained", label: "Database Internals Explained" });
    expect(suggestions).toContainEqual({ type: "category", slug: "databases", label: "Databases" });
    const people = await search.autocomplete({ q: "grace", limit: 8 });
    expect(people).toEqual([{ type: "author", slug: "grace-sample", label: "Grace Sample" }]);
    const tech = await search.autocomplete({ q: "postg", limit: 8 });
    expect(tech.map((s) => s.type)).toContain("technology");
  });

  it("does not suggest authors who only wrote hidden books, and honours the limit", async () => {
    expect(await search.autocomplete({ q: "hidden", limit: 8 })).toEqual([]);
    expect((await search.autocomplete({ q: "pro", limit: 2 })).length).toBeLessThanOrEqual(2);
  });
});

describe("collections", () => {
  it("lists published collections with counts of listable books only, in curator order", async () => {
    const [handbook, databases] = [
      await findBookBySlug(handle.db, "programming-languages-handbook"),
      await findBookBySlug(handle.db, "database-internals-explained"),
    ];
    const hiddenBook = await findBookBySlug(handle.db, "hidden-draft-programming");
    if (!handbook || !databases || !hiddenBook) throw new Error("fixture missing");

    await seedCollection(handle.db, { title: "Curated Shelf", featured: true, bookIds: [databases.id, hiddenBook.id, handbook.id] });
    await seedCollection(handle.db, { title: "Draft Shelf", status: "draft", bookIds: [databases.id] });
    await seedCollection(handle.db, { title: "Only Hidden Shelf", bookIds: [hiddenBook.id] });

    const collections = await catalogue.listCollections();
    expect(collections).toEqual([
      { slug: "curated-shelf", title: "Curated Shelf", description: null, isFeatured: true, bookCount: 2 },
    ]);

    const detail = await catalogue.getCollection("curated-shelf", { limit: 24 });
    expect(slugs(detail.books)).toEqual(["database-internals-explained", "programming-languages-handbook"]);
    await expect(catalogue.getCollection("draft-shelf", { limit: 24 })).rejects.toMatchObject({ code: "not_found" });
    await expect(catalogue.getCollection("missing", { limit: 24 })).rejects.toMatchObject({ code: "not_found" });
  });
});
