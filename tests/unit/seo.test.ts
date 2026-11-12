import { describe, expect, it } from "vitest";
import type { BookRightsView } from "@/lib/policy";
import {
  absoluteUrl,
  buildBookJsonLd,
  buildBreadcrumbJsonLd,
  buildPageMetadata,
  buildRobots,
  canonicalPageQuery,
  canonicalUrl,
  hasNonPageQuery,
  serializeJsonLd,
} from "@/lib/seo";
import { SITEMAP_PAGE_SIZE, bookSitemapPageCount, extraBookPagePath, extraBookPages, isSitemapEligible, renderSitemapXml } from "@/lib/seo/sitemap";
import { bookSlugFrom } from "@/server/services/takedown/submit";
import { takedownRequestSchema } from "@/contracts/takedown";
import { contentSecurityPolicy, headers, securityHeaders } from "../../next.config";

const SITE = "https://bookie.example";
const NOW = new Date("2026-11-11T12:00:00Z");

const view = (overrides: Partial<BookRightsView> = {}): BookRightsView => ({
  bookStatus: "published",
  deletedAt: null,
  license: { rightsStatus: "approved", allowRead: true, allowDownload: false, expiresAt: null },
  primaryAsset: { status: "ready" },
  openTakedown: false,
  ...overrides,
});

describe("isSitemapEligible", () => {
  const cases: [string, BookRightsView, boolean][] = [
    ["published and approved", view(), true],
    ["published and restricted", view({ license: { rightsStatus: "restricted", allowRead: true, allowDownload: false, expiresAt: null } }), true],
    ["approved licence not yet expired", view({ license: { rightsStatus: "approved", allowRead: true, allowDownload: true, expiresAt: new Date("2027-01-01") } }), true],
    ["draft", view({ bookStatus: "draft" }), false],
    ["archived", view({ bookStatus: "archived" }), false],
    ["soft-deleted", view({ deletedAt: new Date("2026-01-01") }), false],
    ["no licence", view({ license: null }), false],
    ["pending licence", view({ license: { rightsStatus: "pending", allowRead: false, allowDownload: false, expiresAt: null } }), false],
    ["removed licence", view({ license: { rightsStatus: "removed", allowRead: false, allowDownload: false, expiresAt: null } }), false],
    ["expired licence", view({ license: { rightsStatus: "approved", allowRead: true, allowDownload: false, expiresAt: new Date("2026-01-01") } }), false],
    ["no primary file", view({ primaryAsset: null }), false],
    ["file not ready", view({ primaryAsset: { status: "uploading" } }), false],
  ];
  it.each(cases)("%s -> %s", (_name, input, expected) => {
    expect(isSitemapEligible(input, NOW)).toBe(expected);
  });
});

describe("sitemap paging", () => {
  it("keeps one page of books in /sitemap.xml and puts the rest in numbered files", () => {
    expect(extraBookPages(0)).toEqual([]);
    expect(extraBookPages(SITEMAP_PAGE_SIZE)).toEqual([]);
    expect(extraBookPages(SITEMAP_PAGE_SIZE + 1)).toEqual([2]);
    expect(extraBookPages(SITEMAP_PAGE_SIZE * 3)).toEqual([2, 3]);
    expect(bookSitemapPageCount(-5)).toBe(0);
    expect(extraBookPagePath(2)).toBe("/sitemap-books/2.xml");
  });

  it("renders escaped XML", () => {
    const xml = renderSitemapXml([{ url: "https://x.example/a?b=1&c=<2>", lastModified: new Date("2026-01-02T00:00:00Z") }, { url: "https://x.example/b" }]);
    expect(xml).toContain("<loc>https://x.example/a?b=1&amp;c=&lt;2&gt;</loc>");
    expect(xml).toContain("<lastmod>2026-01-02T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<loc>https://x.example/b</loc></url>");
  });
});

describe("canonical URLs and metadata", () => {
  it("drops query and fragment unless asked", () => {
    expect(canonicalUrl("/library?q=x#y", SITE)).toBe(`${SITE}/library`);
    expect(canonicalUrl("/library", SITE, { page: "2" })).toBe(`${SITE}/library?page=2`);
    expect(absoluteUrl("/a", SITE)).toBe(`${SITE}/a`);
  });

  it("emits canonical, Open Graph and Twitter data and no image", () => {
    const meta = buildPageMetadata({ title: "T", description: "D", path: "/book/x", siteUrl: SITE, openGraphType: "book" });
    expect(meta.alternates?.canonical).toBe(`${SITE}/book/x`);
    expect(meta.openGraph).toMatchObject({ type: "book", url: `${SITE}/book/x`, title: "T", siteName: "Bookie" });
    expect(meta.twitter).toMatchObject({ card: "summary", title: "T" });
    expect(meta.robots).toBeUndefined();
    expect(JSON.stringify(meta)).not.toContain("images");
  });

  it("noindex keeps following links by default", () => {
    expect(buildPageMetadata({ title: "T", description: "D", path: "/search", siteUrl: SITE, noindex: true }).robots).toEqual({ index: false, follow: true });
  });

  it("detects non-page query parameters", () => {
    expect(hasNonPageQuery({})).toBe(false);
    expect(hasNonPageQuery({ page: "2" })).toBe(false);
    expect(hasNonPageQuery({ q: "go" })).toBe(true);
    expect(hasNonPageQuery({ q: "" })).toBe(false);
    expect(hasNonPageQuery({ topic: ["a", ""] })).toBe(true);
    expect(canonicalPageQuery("3")).toEqual({ page: "3" });
    expect(canonicalPageQuery("1")).toBeUndefined();
    expect(canonicalPageQuery("abc")).toBeUndefined();
  });
});

describe("robots", () => {
  it("allows public pages, disallows admin and admin API, and lists every sitemap", () => {
    const robots = buildRobots(SITE, ["/sitemap-books/2.xml"]);
    expect(robots.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/admin"] }]);
    expect(robots.sitemap).toEqual([`${SITE}/sitemap.xml`, `${SITE}/sitemap-books/2.xml`]);
    expect(buildRobots(SITE).sitemap).toEqual([`${SITE}/sitemap.xml`]);
  });
});

describe("structured data", () => {
  const base = {
    slug: "a-book",
    title: "A Book",
    subtitle: null,
    authors: [],
    description: null,
    language: "en",
    isbn13: null,
    edition: null,
    publisher: null,
    publishedYear: null,
    pageCount: null,
    license: { licenseUrl: null },
  };

  it("includes only fields that exist", () => {
    const ld = buildBookJsonLd(base, SITE);
    expect(ld).toEqual({ "@context": "https://schema.org", "@type": "Book", "@id": `${SITE}/book/a-book`, url: `${SITE}/book/a-book`, name: "A Book", inLanguage: "en" });
    for (const invented of ["aggregateRating", "review", "offers", "image"]) expect(ld).not.toHaveProperty(invented);
  });

  it("maps present fields and rejects non-https licence URLs", () => {
    const ld = buildBookJsonLd(
      { ...base, subtitle: "Sub", authors: ["Ada"], description: " Hello\n world ", isbn13: "9780306406157", edition: "2", publisher: "Pub", publishedYear: 2020, pageCount: 10, license: { licenseUrl: "https://example.org/l" } },
      SITE,
    );
    expect(ld).toMatchObject({
      alternativeName: "Sub",
      author: [{ "@type": "Person", name: "Ada" }],
      description: "Hello world",
      isbn: "9780306406157",
      bookEdition: "2",
      publisher: { name: "Pub" },
      datePublished: "2020",
      numberOfPages: 10,
      license: "https://example.org/l",
    });
    expect(buildBookJsonLd({ ...base, license: { licenseUrl: "http://example.org/l" } }, SITE)).not.toHaveProperty("license");
  });

  it("builds ordered breadcrumbs", () => {
    const ld = buildBreadcrumbJsonLd([{ name: "Library", path: "/library" }, { name: "Book", path: "/book/x" }], SITE) as { itemListElement: { position: number; item: string }[] };
    expect(ld.itemListElement.map((i) => [i.position, i.item])).toEqual([[1, `${SITE}/library`], [2, `${SITE}/book/x`]]);
  });

  it("serialises without a literal < so a payload cannot close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>\u2028" });
    expect(out).not.toContain("<");
    expect(out).not.toContain("\u2028");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>\u2028" });
  });
});

describe("takedown validation", () => {
  const valid = {
    claimantName: "A Person",
    claimantEmail: "person@example.org",
    relationship: "Author",
    description: "I wrote this work and did not license it.",
    goodFaithConfirmed: true,
    signature: "A Person",
  };

  it("accepts a complete request", () => {
    expect(takedownRequestSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["missing statement", { ...valid, description: "" }],
    ["short statement", { ...valid, description: "too short" }],
    ["good faith not confirmed", { ...valid, goodFaithConfirmed: false }],
    ["bad email", { ...valid, claimantEmail: "nope" }],
    ["missing signature", { ...valid, signature: " " }],
    ["filled honeypot", { ...valid, website: "http://spam" }],
    ["private book URL", { ...valid, bookUrl: "https://127.0.0.1/book/x" }],
  ])("rejects %s", (_name, input) => {
    expect(takedownRequestSchema.safeParse(input).success).toBe(false);
  });

  it("finds the book slug from a slug or a book page address", () => {
    expect(bookSlugFrom({ bookSlug: "My-Book" })).toBe("my-book");
    expect(bookSlugFrom({ bookUrl: "https://bookie.example/book/some-book/" })).toBe("some-book");
    expect(bookSlugFrom({ bookUrl: "https://bookie.example/library" })).toBeNull();
    expect(bookSlugFrom({ bookUrl: "not a url" })).toBeNull();
    expect(bookSlugFrom({})).toBeNull();
  });
});

describe("security headers config", () => {
  const byKey = (list: { key: string; value: string }[]) => Object.fromEntries(list.map((h) => [h.key, h.value]));

  it("is exported through headers() for every path", async () => {
    const rules = await headers();
    const all = rules.find((rule) => rule.source === "/:path*");
    expect(all).toBeDefined();
    const map = byKey(all?.headers ?? []);
    expect(map["X-Content-Type-Options"]).toBe("nosniff");
    expect(map["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(map["Permissions-Policy"]).toContain("camera=()");
    expect(map["X-Frame-Options"]).toBe("DENY");
    expect(map["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("marks admin and API routes noindex", async () => {
    const rules = await headers();
    for (const source of ["/admin/:path*", "/api/:path*"]) {
      expect(rules.find((rule) => rule.source === source)?.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    }
  });

  it("CSP lets pdf.js run from this origin and blocks other origins", () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/https?:\/\//);
  });

  it("development CSP adds eval and websockets for HMR only", () => {
    const csp = byKey(securityHeaders(true))["Content-Security-Policy"] ?? "";
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });
});
