# Bookie

Bookie is a digital library for programming and computer-science books, built with Next.js 15 (App Router), TypeScript, PostgreSQL (Drizzle ORM) and a self-hosted PDF.js reader. Its core rule: **no book is listed, readable or downloadable unless a server-side rights policy says so.** New books are drafts, new licences are pending, and publishing is blocked until a reviewer records rights evidence.

> **Status (2026-11-12, working tree on top of `c6e855b`, nothing committed):** all feature stages are implemented in the working tree. No real catalogue exists; the repository ships no books, licences or covers. Legal pages are drafts that need review by a qualified lawyer before launch. See [docs/open-questions.md](docs/open-questions.md) for decisions that belong to the owner.

## What exists (verified against the working tree, 2026-11-12)

- **Public site**: home, library (filters and sorts), search with autocomplete, categories, curated collections, book detail pages, About, Contact, Copyright, Licensing, Privacy and a takedown form. Book covers are generated in CSS from title and author; no third-party images ship.
- **Rights policy**: one pure module (`src/lib/policy`) decides list, read, download and publish for every route, plus database triggers as a second guard. Pending, expired or missing licences are hidden (404); removed titles return 410.
- **PDF reader** (`/read/[slug]`): pdf.js 6.5.438 loaded in the browser only, worker and fonts served from the same origin, lazy page rendering, text layer, thumbnails, outline, in-document search, zoom, fullscreen, light/dark, bookmarks and a restored reading position (stored in the browser's localStorage; there are no reader accounts).
- **File and download routes** with HTTP `Range` support, per-request policy checks, download rate limiting and privacy-preserving download events (salted, daily-rotating address hash; no raw IP).
- **Admin dashboard** (`/admin`, disabled unless configured): single env-configured owner account (scrypt hash), DB-backed revocable sessions, role model (owner, editor, reviewer), book editor, PDF and cover upload with server-side checks, licence and evidence form, publish and takedown workflow, CSV metadata import (dry run first), duplicate review, authors, categories, collections, audit log. See [docs/admin.md](docs/admin.md).
- **SEO and legal**: canonical URLs, `noindex` rules, database-backed sitemap (sharded), robots.txt, `Book` and `BreadcrumbList` JSON-LD, security headers including a CSP.
- **Storage**: local disk (development) or S3-compatible (AWS S3, Cloudflare R2, MinIO).

Not built: public accounts, server-side reader sync (`READER_SYNC` is accepted but no route exists), email notifications, a terms-of-use page, newsletter, share images, HSTS (set it at your TLS terminator). See [docs/architecture.md](docs/architecture.md) for planned versus built.

## Quick start

Requires Node.js `>=22.13` (`.nvmrc` pins 24) and npm.

```bash
npm ci
cp .env.example .env.local     # placeholders only; see docs/environment.md
npm run db:setup               # migrations + reference categories, embedded PGlite by default
npm run dev                    # http://localhost:3000
```

Production-style run:

```bash
npm run build
npm run db:migrate             # as a release step, before starting the server
npm run start
```

Full walkthrough: [docs/setup.md](docs/setup.md). Never put real secrets in the repository; `.env*` is gitignored except `.env.example`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `dev:log` | Next dev server (Turbopack); `dev:log` also writes `.logs/dev.log` |
| `npm run build` / `start` | Production build / serve it with `next start` (build never opens the database) |
| `npm run verify` | environment check, ESLint, typecheck, unit + integration tests; must be green |
| `npm run lint` / `typecheck` | `eslint .` / `next typegen` and `tsc --noEmit` |
| `npm test`, `test:unit`, `test:integration`, `test:coverage` | Vitest; coverage enforces 100% on `src/lib/policy/index.ts` |
| `npm run e2e` | Playwright against a production build (needs `npx playwright install chromium`) |
| `npm run db:generate` / `db:check` | generate / check Drizzle SQL migrations |
| `npm run db:migrate` / `db:bootstrap` / `db:setup` | apply migrations / insert reference categories / both |
| `npm run admin:hash` | print a scrypt hash for `ADMIN_PASSWORD_HASH` (password read from a hidden prompt or stdin) |
| `npm run gen:pdfs` | write deterministic test PDFs to `tests/fixtures/generated/` (also runs before `npm test`) |
| `npm run assets:pdfjs` | copy pdf.js worker and fonts to `public/pdfjs/` (runs before `dev` and `build`) |
| `npm run check:env` | verify Node version and that `node_modules` matches the lockfile |

## Documentation

| Document | Contents |
| --- | --- |
| [docs/setup.md](docs/setup.md) | local setup, first run, troubleshooting |
| [docs/environment.md](docs/environment.md) | every environment variable |
| [docs/database.md](docs/database.md) | migrations, PGlite versus PostgreSQL, bootstrap taxonomy |
| [docs/admin.md](docs/admin.md) | admin credentials, adding books, rights approval, takedowns, CSV import |
| [docs/deployment.md](docs/deployment.md) | Node server, reverse proxy, S3, HTTPS, headers, serverless caveats |
| [docs/testing.md](docs/testing.md) | verify, unit, integration, e2e, skipped tests |
| [docs/architecture.md](docs/architecture.md) | design, data model, stages, built versus planned |
| [docs/ASSETS.md](docs/ASSETS.md) | asset provenance |
| [docs/open-questions.md](docs/open-questions.md) | decisions for the owner |
| [docs/wiki/index.md](docs/wiki/index.md) | dated decision and stage records |
| [CODING_STANDARDS.md](CODING_STANDARDS.md), [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) | contributor and security guidance |

## License

No license file is included in this repository (2026-11-12). Unless one is added, the source is not licensed for reuse beyond what applicable law permits. Choosing a licence is the owner's decision (see open questions).

## Maintainer

[Bhargavtz](https://github.com/Bhargavtz)
