# Bookie Architecture

Two parts. Part A (this section) records what was **built** as of 2026-11-12 (working tree on top of `c6e855b`, nothing committed) and where it deviates from the plan. Parts below it, from "Phase 1 audit report" onward, are the original plan written on 2026-11-11 and are kept as the design record; where they disagree with Part A, Part A wins. Evidence and dated findings live in [wiki/audit-2026-11-11.md](wiki/audit-2026-11-11.md); each durable decision has a page under [wiki/](wiki/index.md).

Target: a premium programming / computer-science digital library with a PDF.js reader, search, admin dashboard, licensing/rights controls, downloads and tests. The core product rule is **no file is readable, downloadable or listed unless a server-side rights policy says so**.

## Part A. Built versus planned (2026-11-12)

### Built

| Plan area | Built (evidence: working tree, 2026-11-12) |
| --- | --- |
| Foundation (S1) | Next 15.5.29, ESLint 9 flat config with layering rules, strict TypeScript, Vitest, Playwright config, Drizzle schema with 22 tables, migrations `0000` to `0002`, storage drivers (local, S3), DB rate limiter, pure `policy`, `slug`, `isbn`, `duplicates`, `external-url` modules, zod contracts. |
| Catalogue and search (S2) | `src/server/repositories/catalogue/*`, `src/server/services/{catalogue,search}`, `src/lib/search`, `GET /api/search`, `/api/search/autocomplete`, `/api/catalogue/{books,categories,collections,popular,recent}`. Single `publicBookPredicate()`. |
| Design system and public pages (S3a, S3b) | `src/styles`, `src/components/{ui,layout,home,books}`, routes `/`, `/library`, `/search`, `/category`, `/category/[slug]`, `/collections`, `/collections/[slug]`, `/book/[slug]`, `/about`, `/contact`, `/copyright`, `/licensing`, `/privacy`, `/takedown`, `not-found`. Covers drawn in CSS. Legacy landing page deleted. |
| Reader and files (S4) | `/read/[slug]`, `GET/HEAD /api/books/[slug]/{file,download}` with Range, per-request policy, `download_events`; client-only pdf.js; guest state in localStorage. |
| Admin (S5a, S5b) | scrypt env credential, DB sessions, role map, `/admin/*` UI (overview, books list/new/edit, authors, categories, collections, duplicates, import, takedowns), 27 route handlers under `/api/admin/*` including audit, CSV import with dry run, PDF and cover upload, licence and publish actions, takedown removal. `npm run admin:hash`. |
| SEO and legal (S6) | metadata and canonical builders, `noindex` rules, `sitemap.ts` plus `sitemap-books/[page]`, `robots.ts`, `Book` and `BreadcrumbList` JSON-LD, `POST /api/takedown`, legal pages, security headers with CSP. |
| Tests (S7) | 27 unit and 11 integration test files, two e2e specs (public pages, admin). |
| Docs (S7b) | README, CONTRIBUTING, SECURITY, `docs/{setup,environment,database,admin,deployment,testing,open-questions}.md`, wiki records. |

### Deviations from the plan

| # | Plan said | Built | Reason / source |
| --- | --- | --- | --- |
| 1 | `pdfjs-dist` 5.7.284 until a spike | 6.5.438 | 5.7.284 is inside an advisory range with no fixed 5.x ([stage S1](wiki/stage-s1-foundation.md)). No `isEvalSupported` option exists in 6.x. |
| 2 | Reference taxonomy seeded by migration | `npm run db:bootstrap` script, idempotent, 15 placeholder categories | S1 brief; owner must supply real names. |
| 3 | `generateSitemaps` / single sitemap | `/sitemap.xml` (static pages, categories, collections, first 5000 books) plus `/sitemap-books/<n>.xml` shards | `generateSitemaps` prerenders at build time and opened the database during `next build` ([stage S6](wiki/stage-s6-seo-legal.md)). |
| 4 | Server-side reader sync (`/api/reader`) behind `READER_SYNC` | not built; flag accepted, ignored; `bookmarks` and `reading_progress` tables unused | no accounts; guest state is localStorage only ([stage S4](wiki/stage-s4-reader.md)). |
| 5 | Signed cookie, then opaque session | opaque session token hashed in `admin_sessions` | as decided ([decision-admin-auth](wiki/decision-admin-auth.md)). |
| 6 | `/terms` page | not built | needs a lawyer ([stage S6](wiki/stage-s6-seo-legal.md)). |
| 7 | `Content-Length` preserved by file route | `next start` 15.5 sends chunked; length is in `Content-Range` | spike, 2026-11-11. |
| 8 | Admin: technologies CRUD, download stats screen, audit log screen, editor-versus-reviewer permissions UI | no technologies CRUD (slugs must pre-exist), no stats screen beyond the overview, audit log is an API only (`/api/admin/audit`), no way to create additional admin users | working tree, 2026-11-12. |
| 9 | Open Graph images generated from title | none; no share image | no rights-cleared image source ([stage S6](wiki/stage-s6-seo-legal.md)). |
| 10 | Search results `noindex` if desired; `robots` disallows `/admin` and `/api` | robots disallows `/admin` and `/api/admin` (not all of `/api`); `X-Robots-Tag: noindex, nofollow` covers `/admin/*` and `/api/*` | `src/app/robots.ts`, `next.config.ts`. |
| 11 | CSP with strict script policy | `script-src` includes `'unsafe-inline'` and `'wasm-unsafe-eval'` | Next inline bootstrap; nonce would force dynamic rendering. |
| 12 | `verify` includes `next build` (section 9) | `verify` = env check, eslint, typecheck, tests; build is separate | [stage S1](wiki/stage-s1-foundation.md). |
| 13 | Components test project (jsdom) | not created | deferred in [decision-testing](wiki/decision-testing.md). |
| 14 | axe checks in e2e | no axe spec exists | see [testing.md](testing.md). |
| 15 | Next 15.5, upgrade path later | Next 15.5.29; Next 16 deferred; `npm audit` still flags bundled `postcss` | [decision-toolchain](wiki/decision-toolchain.md). |

### Deferred or not built

Public accounts; server reader sync; takedown email notification; `/terms`; OG images; HSTS (proxy); CI and Dockerfile; presigned direct-upload flow for serverless (driver method exists, no route); file purge on takedown; admin user management and 2FA; download statistics screen; real-PostgreSQL and real-S3 verification; data retention for hashed addresses. See [open-questions.md](open-questions.md).

### Stale stray directories

`src/app/book/[id]`, `src/app/books` and `src/app/cart` exist in the working tree as empty directories left from the original landing page (2026-11-12). They contain no files, are not routes, and are untracked by git; they can be deleted.

### Stage plan (section 5 below) status

All of S1, S2, S3a, S3b, S4, S5a, S5b, S6 and S7 have code in the working tree. Only S1, S3b, S4 and S6 wrote stage pages; see [wiki/stage-closing-2026-11-12.md](wiki/stage-closing-2026-11-12.md) for S2, S3a, S5a, S5b and S7.

---

# Phase 1 audit report (original plan, 2026-11-11)

Audit date: 2026-11-11. Audited commit: `c6e855b` (branch `new-code-set`, clean tree). The sections below were a plan when written; read Part A above for what exists.
---

## 1. State of the repo at `c6e855b` (verified 2026-11-11)

| Area | Finding |
| --- | --- |
| App | Frontend-only landing page: `src/app/{layout,page,globals.css}` plus 7 components in `src/components`. One route (`/`) plus `/_not-found`. |
| Stack per `package.json`/lockfile | next 15.3.8, react/react-dom 19.1.0, gsap 3.13.0, tailwindcss 4.1.10, typescript 5.8.3, eslint 9.28.0, eslint-config-next 15.3.3. |
| Backend, DB, API routes, auth, storage, middleware | None. Verified by `git ls-files` and a file search: no `route.ts`, `middleware.ts`, `.sql`, Dockerfile, CI workflow, `vercel.json`, or test file exists. |
| Env / secrets | No `.env*` file exists. `.gitignore` ignores `.env*`. `.claude/settings.local.json` holds only npm/next permission allow-rules, no secrets. |
| Tests | None. No test runner installed. |
| Docs | README, CONTRIBUTING, SECURITY only. |
| Tailwind | Installed and wired in `postcss.config.mjs`, but `globals.css` never has `@import "tailwindcss"`, so no Tailwind output is generated. All styling is hand-written global CSS (548 lines). |

### Command results (verified 2026-11-11)

Two environments matter, and they disagree:

| Command | Clean install from lockfile (`git archive` + `npm ci`, Next 15.3.8) | Developer's existing `node_modules` (Next 16.2.11, React 19.2.8) |
| --- | --- | --- |
| `npm run lint` (`next lint`) | PASS, "No ESLint warnings or errors". | FAIL. `next lint` was removed in Next 16; it prints `Invalid project directory ... /lint`. |
| `npm run typecheck` | PASS. | FAIL, 3 errors from stale generated `.next/types/validator.ts` referencing deleted routes (`book/[id]`, `books`, `cart`). Cause: `tsconfig.json` includes `.next/types/**`, which is gitignored build output that can be stale. |
| `npm run build` | PASS (Next 15.3.8; `/` is 52.7 kB, 154 kB first-load JS; 5 static pages). | Not run (would overwrite the developer's `.next`). |

Root causes worth knowing:

1. The installed `node_modules` is out of sync with `package-lock.json` (Next 16.2.11 and extraneous packages such as `@gsap/react` and Radix packages are present). Future agents will see a broken `lint` unless they run `npm ci`. Planned fix: an environment check inside `npm run verify` (section 9).
2. `next lint` is deprecated in Next 15.5 and gone in 16. Replace it with `eslint .` (flat config) so lint works on either major.
3. `npm audit` on the lockfile: 14 vulnerabilities (1 low, 2 moderate, 9 high, 2 critical). The only direct one is `next` (critical; multiple advisories including image-optimizer, middleware-redirect SSRF, RSC DoS). `npm audit` reports `15.5.29` as the non-major fix. Other findings (tar, postcss, sharp, etc.) are transitive.

---

## 2. Reuse / replace table

Legend: **Keep** = reuse mostly as-is, **Adapt** = reuse structure but change, **Replace** = rebuild, **Remove** = delete.

### Source files

| Item | Verdict | Reason (evidence at `c6e855b`) |
| --- | --- | --- |
| `src/app/layout.tsx` | Adapt | Loads Geist and Geist Mono through `next/font` (good), but the variables are never used by CSS, metadata is a 2-field placeholder (no Open Graph, no `metadataBase`, no viewport/theme-color). Becomes the root layout with real metadata and fonts. |
| `src/app/page.tsx` | Replace | `"use client"` at the page level (the whole page ships as a client bundle), scroll listener for a `.scrolled` class that has no CSS, four copy-pasted `scrollIntoView` handlers, and an `<h1>` used for the logo. Becomes a server component homepage using shared nav. |
| `src/app/globals.css` | Replace (mine for tokens) | Global unscoped class names (`.hero`, `.feature`, ...), no focus-visible styles, body font `Poppins` is never loaded, no dark mode, no `prefers-reduced-motion`, nav links are `display:none` at <=768px with no mobile menu. Reuse only the indigo accent idea and the section rhythm. |
| `HeroSection.tsx` | Adapt | Layout idea is reusable. Remove invented stats ("10K+ books, 50K+ readers, 1M+ downloads") unless backed by real queries; remove emoji as icons; replace stock hero photo (rights unknown). GSAP intro is fine in concept. |
| `FeaturedBooksSection.tsx` | Replace | Shows unrelated stock photos labelled as books ("Book 1") with invented titles. Replace with real `BookCard` fed by the catalogue, covers from the `assets` table. |
| `CategoriesSection.tsx` | Replace | Fiction/Drama/Mystery/Sci-Fi with made-up counts. Replace with programming/CS categories from the DB with real counts. |
| `BenefitsSection.tsx` | Replace | Generic "why reading matters" copy and emoji. Replace with product value props (rights-cleared library, reader, search) or drop. |
| `AboutSection.tsx` | Adapt (copy only) | Structure trivial; copy invents claims ("Community", "Thousands of titles"). Rewrite. |
| `NewsletterSection.tsx` | Remove | Form posts nowhere: `console.log` plus `alert("Thank you for subscribing!")`, i.e. it falsely implies signup. Uses `suppressHydrationWarning` hacks. No mailing backend is in scope. |
| `Footer.tsx` | Adapt | Fix: `"use client"` is unnecessary, copyright says 2024, contact `hello@bookie.com` is a placeholder (domain ownership unknown), links are in-page anchors. Becomes the real footer with legal/takedown links. |
| `src/app/favicon.ico` | Keep (verify origin) | Default location is fine; origin unknown but it is a 30-line asset; replace during design work. |

### CSS tokens

| Token (in `globals.css`) | Verdict |
| --- | --- |
| `--purple: #6366f1` | Adapt: keep as a candidate brand accent, rename `--color-accent`. White text on it is about 4.47:1 (borderline AA for normal text); needs a darker shade for text buttons. |
| `--dark-text #1f2937`, `--light-text #6b7280`, `--background #fff` | Adapt: fold into a full semantic palette (surface, surface-raised, border, text, text-muted, accent, danger, success) with a dark theme. |
| Hard-coded `#f9fafb`, `#f8fafc`, `#e2e8f0`, `#818cf8` etc. | Replace with tokens. White on `#818cf8` (newsletter gradient) is about 3:1 and fails AA. |
| Radii 20px, shadows `0 10px 30px` | Adapt into a small radius/elevation scale. |

### GSAP usage

| Usage | Verdict |
| --- | --- |
| Per-component `gsap.registerPlugin(ScrollTrigger)` and global selectors (`'.about-content h2'`, `'.book-card'`) inside bare `useEffect` | Replace. No `gsap.context()` scoping or cleanup, so React StrictMode and route changes duplicate triggers. `scrub:1` combined with `toggleActions` is contradictory. |
| `gsap.from(... color ...)` in hero | Remove (cosmetic no-op). |
| Hero entrance stagger, floating scroll hint | Keep the idea only, behind a small `useGsapScope` hook and `prefers-reduced-motion` guard. GSAP stays on the marketing homepage only; library/reader/admin use CSS transitions. Keep gsap bundle off those routes. |

### `public/` images

| File | Size / dims | Licensing evidence | Verdict |
| --- | --- | --- | --- |
| `27669009_reading_05.jpg` | 1.7 MB, 5626x3750 | EXIF description only. Numeric stock-style name. No licence file, no attribution anywhere in repo. | **UNKNOWN RIGHTS. Remove from repo before any public launch.** |
| `7117804_3529668.jpg` | 0.9 MB, 2000x2000 | Metadata says edited in Photoshop; numeric stock-style name; no licence record. | **UNKNOWN RIGHTS. Remove.** |
| `na_feb_36.jpg` | 0.9 MB, 5001x3001 | Embedded author metadata names an individual contributor; EXIF description reads like a stock-library caption; no licence record. | **UNKNOWN RIGHTS, third-party author. Remove.** |
| `reading-book-illustration.jpg` | 78 KB, 626x626 | No metadata, no provenance; used as hero image and in README. | **UNKNOWN RIGHTS. Remove from README and hero.** |
| `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | tiny | create-next-app defaults; grep shows none referenced from `src`. | Remove (dead). |

We cannot assume rights for any raster image. Plan: replace with original, project-authored artwork (CSS/SVG covers generated from title and category, so no third-party images are needed), and add `docs/ASSETS.md` recording provenance for every asset that ships. Git history still contains the unknown-rights images; flag for the owner (a history rewrite is the owner's call).

### Other files

| Item | Verdict |
| --- | --- |
| `eslint.config.mjs` (FlatCompat, `next/core-web-vitals`, `next/typescript`) | Adapt: keep base, add strict rules (section 9). |
| `tsconfig.json` | Adapt: add `noUncheckedIndexedAccess`, `noImplicitOverride`; stop including `.next/types` stale output by running typegen first. |
| `next.config.ts` (empty) | Adapt: security headers, `serverExternalPackages`, image config. |
| `package.json` scripts | Adapt: swap `next lint`, add `verify`, db, test, e2e, script entries. |
| README, CONTRIBUTING, SECURITY | Adapt: rewrite after S7. SECURITY.md states it has "no authenticated backend", which becomes false. |

---

## 3. Evaluation of proposed decisions

Each row links to the decision page. Versions were read from npm on 2026-11-11.

| # | Proposal | Verdict | Notes |
| --- | --- | --- | --- |
| 1 | PostgreSQL + Drizzle + drizzle-kit, PGlite for dev/tests, FTS | **Confirmed, with changes** ([decision-database](wiki/decision-database.md)) | Verified in a scratch project: PGlite 0.5.16 is PostgreSQL 18.6 in WASM and supports generated `tsvector` columns, GIN indexes, `websearch_to_tsquery`, `pg_trgm` (`similarity`, `%`), `unaccent`, `gen_random_uuid()`. Use `pg` (node-postgres) in prod. Pin drizzle-orm 0.45.4 (stable; 1.0 is only rc). Risks: single-connection/single-process PGlite. |
| 2 | S3-compatible storage with presigned URLs, local driver | **Confirmed, changed emphasis** ([decision-storage](wiki/decision-storage.md)) | Reader and downloads stream through the app proxy by default (policy checked on every request, nothing signed is persisted). Presigned GET is an optional download mode with a 60 s TTL. Presigned PUT only for admin uploads on serverless hosts. No Docker in this environment, so an S3 driver can only be contract-tested, not MinIO-tested, locally. |
| 3 | Env admin credentials (scrypt) + signed httpOnly cookie, roles, rate limit | **Confirmed, changed** ([decision-admin-auth](wiki/decision-admin-auth.md)) | Replace "signed cookie" with an opaque random session token stored hashed in `admin_sessions` (revocable, no signing secret). scrypt through `node:crypto` (no dependency). Rate limit in a DB table (works across instances); middleware may only check cookie presence (Edge cannot run scrypt). |
| 4 | Guests use localStorage; no public accounts | **Confirmed** ([decision-reader-and-state](wiki/decision-reader-and-state.md)) | DB tables `bookmarks` and `reading_progress` stay in the schema keyed by an anonymous `reader_key`, but server sync is off by default (feature flag). |
| 5 | pdfjs-dist, self-hosted worker, own same-origin range proxy | **Confirmed, with hardening** ([decision-reader-and-state](wiki/decision-reader-and-state.md)) | Pin an exact version; set `isEvalSupported:false`; client-only import (SSR breaks); self-host worker, cMaps and standard fonts under `/pdfjs/`. Pin 5.7.284 until a spike validates 6.5.438 (latest) on Next 15. |
| 6 | Vitest, Playwright + axe, zod, generated test PDFs | **Confirmed, with changes** ([decision-testing](wiki/decision-testing.md)) | Vitest 5.1 needs Node >=22.12. No Docker, so no Testcontainers: PGlite in memory per test file. Generate PDFs with a small dependency-free deterministic writer. Playwright needs `playwright install chromium` (network). |
| 7 | (not proposed) one `canRead/canDownload/canPublish` policy | **Added as a decision** ([decision-rights-enforcement](wiki/decision-rights-enforcement.md)) | Plus a DB trigger as defence in depth and a static route-inventory test. |
| 8 | (not proposed) toolchain pinning | **Added** ([decision-toolchain](wiki/decision-toolchain.md)) | Bump Next 15.3.8 to 15.5.29 (audit), keep ESLint 9 and TypeScript 5.9 (do not adopt TS 7.0.2 or ESLint 10 yet), Node >=22.13, adopt Tailwind 4 properly. |

### Items flagged as risky

1. **PGlite is single-process and single-connection.** Two processes on one data dir corrupt it. Rules: one process per data dir, `next build` must not touch the DB, `workers: 1` for Playwright, singleton on `globalThis` for HMR.
2. **PGlite under Next bundlers** (WASM assets). Needs `serverExternalPackages: ['@electric-sql/pglite']`; Turbopack dev vs webpack build behaviour must be spiked in S1 before anyone builds on it.
3. **Parity drift** between PGlite (PG 18.6) and production Postgres. Require production Postgres >=16 (recommend 17+), and run the integration suite against a real server in CI when `DATABASE_URL` is supplied.
4. **Serverless limits for the PDF proxy** (body limits, function duration, bandwidth cost). The deployment target is an open question (section 8).
5. **AWS SDK v3 checksum defaults** can break non-AWS S3 (R2, MinIO); set `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED` and verify.
6. **Rate limiting on serverless** is best effort per instance unless DB-backed or at the edge; document it.
7. **Reference site (codingpdf.freeforall.dev)**: it presents many commercial titles as "free" with no licence or takedown statement visible. We take UX ideas only; no content, covers, text or URLs.

---

## 4. Target architecture

### 4.1 Layers and import rules

```
src/
  app/                    Next App Router: pages, route handlers, metadata. Thin.
    (public)/             home, library, category/[slug], book/[slug], read/[slug],
                          collections/[slug], search, about, legal pages
    admin/                login + dashboard (noindex, auth-gated)
    api/                  search, reader-state, takedown, admin/*, books/[slug]/{file,download}
    sitemap.ts robots.ts
  components/
    ui/                   design-system primitives (Button, Input, Badge, Card, Dialog...)
    layout/               Header, Footer, MobileNav, Container
    books/ home/ reader/ admin/ seo/
  contracts/              zod schemas + DTO types + service interfaces (shared by UI and server)
  lib/                    PURE code: policy/, slug, validation, search query parsing, format,
                          csv parsing, reader-state (localStorage), seo builders
  server/                 `import "server-only"`
    db/                   schema/, client (pg | pglite factory), migrate
    repositories/         ONLY place that touches tables (catalogue/, admin/)
    services/             use cases (catalogue, search, files, admin, takedown)
    storage/              StorageDriver interface + local + s3
    auth/                 hashing, sessions, rate limit, csrf/origin check
    http/                 range parsing, response helpers, error mapping
  styles/                 tokens.css (Tailwind 4 @theme), base.css
drizzle/                  generated SQL migrations (committed)
scripts/                  tsx scripts: verify, gen-test-pdfs, dev-bootstrap, admin hash, copy pdfjs assets
tests/                    unit/ integration/ e2e/ helpers/ fixtures/ (generated pdfs are gitignored)
docs/                     architecture.md, wiki/, ASSETS.md, CODING_STANDARDS.md (root)
```

Enforced by ESLint `no-restricted-imports` (zero extra deps): `components` and `lib` may not import `server`; `app` may not import `server/db` or `server/repositories`; only `server/repositories` and `server/db` may import the Drizzle schema; `server-only` guards every `server/**` entry.

### 4.2 Data model (PostgreSQL; Drizzle schema in `src/server/db/schema/`)

All ids are `uuid` (`gen_random_uuid()`), all tables have `created_at`/`updated_at` (timestamptz) unless noted.

| Table | Key columns and rules |
| --- | --- |
| `books` | `slug` unique; `title`, `subtitle`, `description`; `language`; `isbn13` (partial unique when not null); `edition`, `publisher`, `published_year`, `page_count`, `level` enum (beginner/intermediate/advanced); `status` enum (draft, in_review, published, unpublished, archived) **default `draft`**; `primary_asset_id`, `cover_asset_id` (nullable fk); `published_at`; `deleted_at` (soft delete); generated `search` tsvector (title weight A, subtitle/authors/technologies B, description C) with GIN index; trigram GIN index on `title`. |
| `authors` | `slug` unique, `name`, `bio`. |
| `book_authors` | PK (`book_id`,`author_id`), `position`. |
| `categories` | `slug` unique, `name`, `description`, `parent_id` (nullable), `sort_order`, `icon_key`. Reference taxonomy is seeded by migration (not demo content). |
| `book_categories` | PK (`book_id`,`category_id`), `is_primary`. |
| `tags` / `book_tags` | Free-form tags for search; slug unique. |
| `technologies` / `book_technologies` | Languages/frameworks (`slug`, `name`, `aliases text[]` such as `c++`/`cpp`, `c#`/`csharp`, `.net`/`dotnet`) because Postgres FTS tokenises these terms badly; query layer expands aliases. |
| `assets` | `book_id`, `kind` enum (pdf, cover, thumbnail), `storage_driver`, `storage_key` (opaque, never derived from user filename), `original_filename`, `mime_type`, `byte_size`, `sha256`, `page_count`, `status` enum (uploading, processing, ready, rejected, deleted). Partial unique index on `sha256` where `kind='pdf'` and `status<>'deleted'` for duplicate detection. |
| `licenses` | One row per book (`book_id` unique). `rights_status` enum **pending (default)** / approved / restricted / removed; `license_type` enum (project-original, public-domain, cc-by, cc-by-sa, cc-by-nc, publisher-permission, author-permission, other); `license_url`, `rights_holder`, `attribution_text`, `source_url`, `evidence_note`; `allow_read` and `allow_download` booleans **default false**; `approved_by`, `approved_at`, `expires_at`, `restricted_reason`, `removed_at`, `removed_reason`. CHECKs: `restricted` implies `allow_download=false`; `approved` requires approver, timestamp, rights holder and licence type. |
| `collections` / `collection_books` | `slug`, `title`, `description`, `is_featured`, `status` (draft/published); join has `position`. |
| `bookmarks` | `reader_key` (anonymous random id), `book_id`, `page`, `label`. Sync disabled by default. |
| `reading_progress` | PK (`reader_key`,`book_id`), `page`, `total_pages`, `updated_at`. |
| `download_events` | `book_id`, `asset_id`, `occurred_at`, `outcome` enum (served, denied_policy, denied_rate_limit), `ip_hash` (salted, rotating; never raw IP), `ua_family`, `referrer_host`. |
| `admin_users` | `email` unique (citext/lowercased), `password_hash`, `role` enum (owner, editor, reviewer), `is_active`, `last_login_at`. |
| `admin_sessions` | `token_hash` unique (sha256 of random 32 bytes), `admin_user_id`, `expires_at`, `last_seen_at`, `revoked_at`, `ip_hash`, `ua_family`. |
| `rate_limits` | `key`, `window_start`, `count`; used by login, takedown, download, search. |
| `takedown_requests` | `book_id` (nullable), `book_url`, claimant name/email/organisation, `relationship`, `description`, `good_faith_confirmed`, `signature`, `status` enum (open, under_review, upheld, rejected, withdrawn), `resolution_note`, `resolved_by`, `resolved_at`, `ip_hash`. |
| `audit_log` (added) | `admin_user_id`, `action`, `entity_type`, `entity_id`, `diff jsonb`. Every rights/publish change writes a row in the same transaction. |
| `import_jobs` (added) | CSV import runs: filename, row counts, per-row error report, status. |

Defence in depth: a migration-level trigger rejects setting `books.status='published'` unless the matching licence is approved or restricted, and rejects any licence update to `removed` that leaves the book published. Public queries never select from `books` directly; they use the single `publicBookPredicate()` SQL fragment exported by the catalogue repository.

### 4.3 Rights-enforcement design

One pure module, `src/lib/policy/`, with table-driven tests. No route, page, sitemap, search query, OG image or file handler may decide access on its own.

```
type Viewer = { kind: "public" } | { kind: "admin"; role: AdminRole };
type BookRightsView = { bookStatus, deletedAt, license: {rightsStatus, allowRead,
                        allowDownload, expiresAt} | null, primaryAsset: {status} | null,
                        openTakedown: boolean };
canList(viewer, view)     // appears in catalogue, search, sitemap, collections
canRead(viewer, view)     // inline PDF stream + reader page
canDownload(viewer, view) // attachment stream or presigned redirect
canPublish(view, now)     // admin action precondition
=> { allowed: true } | { allowed: false, reason: PolicyReason, httpStatus: 403|404|410 }
```

Rules (public viewer):

| Licence state | List | Read | Download | Detail page |
| --- | --- | --- | --- | --- |
| no licence row, or `pending`, or `expires_at` passed | no | no | no | 404 |
| `approved` | yes | if `allow_read` | if `allow_download` | 200 |
| `restricted` | yes | if `allow_read` | never | 200 with notice |
| `removed` | no | no | no | 410 tombstone (no title/cover) |

Further conditions for every positive result: `status='published'`, `deleted_at IS NULL`, primary asset `ready`. An open takedown request does not auto-remove, but flags the admin queue; "Remove" is one transaction that sets `removed`, unpublishes, writes `audit_log`, and (optionally) purges the object. Admins previewing unpublished books get `canRead` through admin routes only, with `X-Robots-Tag: noindex` and no `download_events` row.

`canPublish` requires: licence `approved|restricted` with rights holder, licence type, evidence (`source_url` or `evidence_note`), approver and timestamp; a `ready` primary PDF whose sha256 is recorded; valid slug; title; no duplicate flag unresolved.

Verification of coverage: (a) a Vitest test enumerates `src/app/**/{page,route}.ts(x)` and fails if a file that touches book data does not import from `@/lib/policy` or a service that does; (b) a rights matrix integration test seeds one book per licence state and asserts every public surface (detail, list, search, sitemap, JSON-LD, cover, file, download, reader) returns the expected status; (c) the DB trigger test.

### 4.4 PDF reader, file proxy, downloads

- Reader page `/read/[slug]` is a server component that calls `canRead`, then renders a client `PdfReader` that dynamically imports `pdfjs-dist` (never on the server).
- Same-origin file route `/api/books/[slug]/file` streams the asset: supports `Range` (single range, suffix ranges, 206 with `Content-Range`, 416 with `bytes */size`, `If-Range`, `HEAD`), sends `Accept-Ranges: bytes`, `Content-Type: application/pdf`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, max-age=0, must-revalidate` (never `public`, so takedowns bite), `ETag` from sha256. It runs `canRead` on every request.
- `/api/books/[slug]/download` runs `canDownload`, rate-limits, writes a `download_events` row, and streams with `Content-Disposition: attachment; filename*=UTF-8''...` (sanitised from title). Optional `DOWNLOAD_MODE=redirect` issues a 302 to a presigned URL with <=60 s TTL; the URL is never stored or logged.
- pdf.js: `isEvalSupported:false`, worker and cMaps/standard fonts self-hosted at `/pdfjs/<version>/` (copied by a script, gitignored), CSP `worker-src 'self'`. Exact version pin (CVE-2024-4367 affected versions below 4.2.67).

### 4.5 Search

Postgres FTS with weighted generated `tsvector`; `websearch_to_tsquery('english', q)` for ranked results; `pg_trgm` similarity on title/author for typos; technology alias expansion (`c++`, `c#`, `.net`, `node.js`); filters (category, technology, level, language, year) and sorts (relevance, newest, title); keyset pagination; `ts_headline` snippets from `description` only. Query parsing and alias expansion are pure code in `src/lib/search/` so they are unit testable without a DB.

### 4.6 Admin

Routes `/admin/**` (all `noindex`): login, books list/editor, upload (PDF + cover), CSV import with dry-run and per-row errors, duplicate review (sha256 hash match plus normalised title/ISBN match), rights review queue (approve/restrict/remove with evidence), categories/technologies/collections CRUD, takedown queue, download stats, audit log. Server actions or `/api/admin/*` handlers all begin with `requireAdmin(action)` where permissions come from one map: owner (everything), editor (content, cannot approve rights), reviewer (rights approval and takedown, cannot edit files). Mutations check `Origin` and use `SameSite=Strict` cookies.

### 4.7 SEO and legal

`generateMetadata` and canonical URLs per page type, `sitemap.ts` built from `canList` only, `robots.ts` disallowing `/admin` and `/api`, JSON-LD (`Book`, `BreadcrumbList`, `WebSite` with SearchAction) emitted only when `canList` passes, Open Graph images generated from title (no third-party art), `noindex` on search result pages and restricted books if desired. Public pages: About, Privacy, Terms, Takedown/DMCA with a form that writes `takedown_requests` (honeypot plus rate limit). Legal text requires human/legal review before launch (not legal advice).

---

## 5. Stages

Rule: each stage owns the listed paths exclusively. A stage may read anything but edits only what it owns. Shared files (`package.json`, lockfile, `eslint.config.mjs`, `tsconfig.json`, `next.config.ts`) belong to S1 only; later stages that need a dependency add it in a tiny, separate commit coordinated through the orchestrator (or pre-approve the dependency list in S1; recommended). `src/contracts/**` is frozen after S1 except by explicit orchestrator decision.

| Stage | Name | Owns (exclusive) | Depends on |
| --- | --- | --- | --- |
| **S1** | Foundation | `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `drizzle.config.ts`, `drizzle/**`, `src/server/db/**`, `src/server/storage/**`, `src/server/auth/rate-limit.ts` (interface and DB impl), `src/lib/policy/**`, `src/lib/{slug,env}.ts`, `src/contracts/**`, `src/lib/seo/index.ts` (stub), `scripts/**`, `tests/helpers/**`, `tests/fixtures/**`, `CODING_STANDARDS.md`, `AGENTS.md`, `docs/**` stage notes | none |
| **S2** | Catalogue and search | `src/server/repositories/catalogue/**`, `src/server/services/{catalogue,search}/**`, `src/lib/search/**`, `src/app/api/search/**`, `src/app/api/catalogue/**`, tests for these | S1 |
| **S3a** | Design system | `src/styles/**`, `src/components/ui/**`, `src/components/layout/**`, `src/app/layout.tsx`, `src/app/globals.css`, removal of unknown-rights images and dead SVGs in `public/`, `docs/ASSETS.md` | S1 |
| **S3b** | Homepage, library, category, detail UI | `src/app/(public)/{page.tsx,library,category,collections,book,about}/**`, `src/components/{home,books}/**`, `src/app/not-found.tsx` | S3a, S2 contracts (S1); real data once S2 lands |
| **S4** | Reader, file proxy, downloads, state | `src/app/(public)/read/**`, `src/app/api/books/**`, `src/app/api/reader/**`, `src/components/reader/**`, `src/lib/reader-state/**`, `src/server/services/files/**`, `src/server/http/**` | S1 (storage, policy, rate limit) |
| **S5a** | Admin backend | `src/server/auth/**` (except rate-limit file), `src/server/repositories/admin/**`, `src/server/services/admin/**`, `src/lib/csv/**`, `src/app/api/admin/**` | S1 |
| **S5b** | Admin UI | `src/app/admin/**`, `src/components/admin/**` | S5a, S3a |
| **S6** | SEO, takedown, legal | `src/lib/seo/**` (replaces stub), `src/app/sitemap.ts`, `src/app/robots.ts`, `src/components/seo/**`, `src/app/(public)/{privacy,terms,takedown}/**`, `src/app/api/takedown/**`, `src/server/services/takedown/submit.ts` | S1; S2 (sitemap queries), S3b (metadata hooks) |
| **S7** | e2e, a11y, perf, docs | `tests/e2e/**`, `tests/a11y/**`, perf budget config, README/CONTRIBUTING/SECURITY rewrite, final wiki pass | all |

Dependency graph:

```
S1 -> S2, S3a, S4, S5a            (parallel after S1)
S3a -> S3b, S5b
S2 -> S3b (real data), S6
S5a -> S5b
S3b + S2 -> S6
S1..S6 -> S7
```

Parallel waves: Wave 1 = S1. Wave 2 = S2 || S3a || S4 || S5a. Wave 3 = S3b || S5b (|| S6 legal pages and takedown once S2 is merged). Wave 4 = S7.

Per-stage acceptance: `npm run verify` green; stage unit/integration tests included; new wiki page or wiki update for any decision; no edits outside owned paths.

S1 spike checklist (must pass before wave 2): PGlite works under `next dev --turbopack`, `next build` and `next start` with `serverExternalPackages`; migrations apply identically on PGlite and (if available) a real Postgres; `pg_trgm`/`unaccent` created via migration; local and S3 storage drivers pass one shared contract suite; stream plus Range works through a Next route handler with an unmodified `Content-Length`; `next typegen` (or equivalent) keeps `tsc` independent of stale `.next` output.

---

## 6. Open questions for the owner

1. Deployment target: Vercel (serverless, request body 4.5 MB, function time limits) versus a Node host/Docker (streaming and uploads are simple). Changes upload and proxy design (decision-storage).
2. Who supplies the first real catalogue and the rights evidence for each title? Until then only project-generated sample PDFs exist.
3. Upgrade path beyond Next 15.5 (Next 16.4.6 is `latest`): schedule after S7, or immediately?
4. Does the git history containing the unknown-rights images need rewriting?
5. Brand: keep the name "Bookie" and the indigo accent?

## 7. Risks (summary)

Top risks, ranked: (1) rights/legal exposure from importing unlicensed books; (2) environment drift (local Next 16 vs lockfile 15.3.8, broken `lint`); (3) vulnerable Next 15.3.8; (4) PGlite single-process and bundling constraints plus parity drift; (5) PDF proxy on serverless; (6) pdf.js SSR/CSP/CVE handling; (7) landing-page copy making false claims (stats, newsletter, contact); (8) accessibility baseline gaps (no mobile nav, no focus styles, no reduced-motion, emoji icons, contrast); (9) no Docker locally (no MinIO/real-Postgres tests); (10) rate limiting limits on serverless.

## 8. Deployment assumptions to confirm

Default plan targets a single Node container or Vercel with Postgres (`DATABASE_URL`) and an S3-compatible bucket. Both are supported by the design; only upload flow and download mode differ.

## 9. Environment improvements for future agents

1. **`npm run verify`**: one command: `node scripts/check-env.mjs` (Node version, installed `next` equals lockfile, no extraneous packages), `eslint .`, `next typegen && tsc --noEmit`, `vitest run`, `next build`. e2e is separate (`npm run e2e`).
2. **Env guard**: `check-env` fails fast with "run `npm ci`" when `node_modules` drifts (this audit hit exactly that: Next 16 installed, 15.3.8 locked). Add `.nvmrc` and `engines.node >=22.13`.
3. **`CODING_STANDARDS.md`** and **`AGENTS.md`** at the repo root: layering rules, "never query tables outside repositories", policy rule, no `any`, zod at every boundary, file-ownership table from section 5, how to run each command.
4. **Lint rules that ban unsafe patterns**: `no-restricted-imports` for layer boundaries; `no-restricted-syntax`/`no-restricted-properties` for `dangerouslySetInnerHTML`, `eval`/`new Function`, `child_process` in `src/app`, raw `sql.raw`/template SQL with interpolation outside repositories; `@typescript-eslint/no-floating-promises`, `no-explicit-any`, `no-non-null-assertion`, `eqeqeq`, `no-console` (allow `warn`/`error`); `jsx-a11y` strict set; a custom check that `process.env` is read only in `src/lib/env.ts`.
5. **Dev-server log access**: run dev with `npm run dev:log` that tees stdout/stderr to `.logs/dev.log` (gitignored) so agents can read errors instead of guessing; same for `e2e` server. Use `mcp__Claude_Browser` preview for screenshots.
6. **Tooling hygiene**: pin versions exactly in the lockfile policy; `npm audit --omit=dev` in `verify` as a warning; a `scripts/gen-test-pdfs.ts` run as `pretest`; `.gitignore` additions (`.data/`, `.logs/`, `public/pdfjs/`, `tests/fixtures/generated/`, `playwright-report/`, `test-results/`).
7. **Guard hooks** (Claude Code): block writes to `.env*` and `drizzle/` hand edits to existing migrations; remind agents of stage ownership.
8. **Playwright browsers**: document `npx playwright install chromium` and detect the missing browser in `check-env` with an actionable message (browsers may not install without network access).
