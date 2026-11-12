# Stage S6: SEO, takedown and legal (implementation record)

Date: 2026-11-12, working tree on top of `c6e855b` (nothing committed). Related: [stage-s3b-public-pages.md](stage-s3b-public-pages.md), [decision-rights-enforcement.md](decision-rights-enforcement.md), [decision-reader-and-state.md](decision-reader-and-state.md).

## What exists

- **Metadata** (`src/lib/seo/index.ts`, pure): `buildPageMetadata` gives canonical (from `SITE_URL`, default `http://localhost:3000`), Open Graph and Twitter `summary` metadata; no share image is emitted because no rights-cleared image exists. Used by home, library, search, categories, category, collections, collection, book, about, contact, copyright, licensing, privacy and takedown. Pages that read `SITE_URL` at request time are dynamic (`force-dynamic` or `connection()`), so the canonical is never baked in at build time.
- **noindex**: `/search` with any query string; `/library`, `/category/[slug]` and `/collections/[slug]` when they carry a filter or sort parameter (canonical points at the plain list; plain `?page=n` stays indexable); `/read/[slug]` (S4, already); not-found/removed books. Admin and API: `X-Robots-Tag: noindex, nofollow` header for `/admin/:path*` and `/api/:path*` (admin UI files belong to S5b, so this is done in `next.config.ts`), plus robots.txt disallow.
- **Sitemap** (`src/app/sitemap.ts`, `src/app/sitemap-books/[page]/route.ts`): `/sitemap.xml` lists static pages, categories with at least one listable book, published collections with at least one listable book, and the first 5000 books; further book pages are `/sitemap-books/<n>.xml`. Books come from the S2 `publicBookPredicate` and every row is re-checked with `canList` (`isSitemapEligible`). Removed, pending, expired, draft, deleted and file-less books are excluded. `generateSitemaps` was rejected: it prerenders at build time and opened the database during `next build`.
- **robots** (`src/app/robots.ts`): allow `/`, disallow `/admin` and `/api/admin`, lists `/sitemap.xml` and any extra book sitemap pages.
- **JSON-LD** (`src/components/seo/JsonLd.tsx`, the single allow-listed `dangerouslySetInnerHTML`): `Book` on book pages from existing fields only (title, subtitle, authors, description, language, ISBN-13, edition, publisher, year, page count, https licence URL); `BreadcrumbList` on book and category pages. No ratings, reviews, offers or images.
- **Takedown**: `/takedown` page and client form; `POST /api/takedown`; service `src/server/services/takedown/submit.ts`; repository `src/server/repositories/takedown.ts` (inserts into S5a's `takedown_requests`, status `open`). Validation is `takedownRequestSchema` (zod, S1 contract) including required statement (>= 20 characters), signature and good-faith confirmation. Same-origin check, JSON only, 32 KB body cap. Rate limit: 5 per hour per salted-hash client (only when `TRUST_PROXY=true` supplies an address) and 100 per hour shared. Valid, unknown-book and removed-book requests get the same 202 acknowledgement; the book is linked internally by slug (any state) and never reported back. A filled honeypot is acknowledged and dropped. Without `CONTACT_EMAIL` the page says no address is configured, the form is not rendered, and the route returns 503.
- **Legal copy**: one content module, `src/app/(public)/_content/legal.ts`, rendered by `LegalPage`. Lawyer-review markers are code comments (`LEGAL REVIEW`) and never rendered.
- **Security headers** (`next.config.ts`, exported `securityHeaders`, `contentSecurityPolicy`, `headers`): CSP (`default-src 'self'`, `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`, `worker-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`. Development adds `'unsafe-eval'` and websockets. Verified by `tests/unit/seo.test.ts` and by `curl` against `next start`.

## Legal copy review (2026-11-12)

Corrections made against the implementation: (1) Contact said an upheld takedown may delete the stored file; the code keeps storage objects (purge is a separate decision), so the page now says the file is not deleted automatically. (2) "Removed at once" now states that home and collection shelves are cached up to 60 s. (3) Privacy previously omitted the browser family and referrer host stored with download events, and said the address hash is always recorded; it is recorded only when `TRUST_PROXY=true`, rotates daily, and no retention period is set. Takedown storage of signature, relationship and statement is now listed. (4) Licensing no longer says restricted titles are "listed with limits stated"; it states the policy: never downloadable, readable only if `allow_read`. (5) About says publication needs a licence, rights holder and a source link or evidence note (what `canPublish` checks). (6) `ContactAddress` no longer tells people to use the takedown form when no address is set, because the form is disabled in that case. (7) The privacy page states no third-party scripts are loaded; the CSP enforces same-origin scripts.

## Needs a human lawyer

Notice-and-takedown policy (designated agent, counter-notice, response times), data-protection basis and retention for hashed IPs and takedown personal data, a terms-of-use page (architecture lists `/terms`; not built), and the disclaimer wording. All are marked in `legal.ts`.

## Deferred

- No email notification of new takedown requests (the admin queue is the only channel).
- HSTS not set (belongs to the TLS terminator or a production-only decision); CSP uses `'unsafe-inline'` for scripts (nonces would force dynamic rendering for every page).
- Admin page `<meta robots>` (S5b files); the header and robots.txt cover it.
- No OG/Twitter images; no per-book share image until a rights-cleared image source exists.
- Raising the sitemap page size or adding `lastmod` for categories and collections needs schema timestamps in the repository queries.

## Tests

`tests/unit/seo.test.ts` (sitemap predicate table, paging, XML, canonical/metadata, robots, JSON-LD, takedown schema, headers config); `tests/integration/takedown-sitemap.test.ts` (PGlite: takedown route and sitemap service).
