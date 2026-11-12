# AGENTS.md: working on Bookie

Read first: [docs/architecture.md](docs/architecture.md), [docs/wiki/index.md](docs/wiki/index.md), [CODING_STANDARDS.md](CODING_STANDARDS.md). The wiki is the contract.

## Commands (Node >= 22.13, see `.nvmrc`; use `npm ci`)

| Command | Purpose |
| --- | --- |
| `npm run verify` | env check + `eslint .` + `next typegen && tsc --noEmit` + vitest (unit and integration). Must be green. |
| `npm run build` | production build (separate; slow; writes `.next`). Does not touch the database. |
| `npm run test:unit` / `test:integration` / `test:coverage` | vitest projects; coverage enforces 100% branches on `src/lib/policy/index.ts` |
| `npm run e2e` | Playwright (needs a build and `npx playwright install chromium`); dedicated data dir `.data/e2e`, one worker |
| `npm run db:generate` | drizzle-kit: generate SQL migration from `src/server/db/schema` into `drizzle/` |
| `npm run db:migrate` / `db:bootstrap` / `db:setup` | apply migrations / insert reference taxonomy (idempotent) / both. Uses `DATABASE_URL` or PGlite at `PGLITE_DATA_DIR` |
| `npm run gen:pdfs` | write deterministic test PDFs to `tests/fixtures/generated/` (also runs as `pretest`) |
| `npm run dev:log` | dev server with output teed to `.logs/dev.log` |

PGlite is single-process: never run a script and the server on the same `PGLITE_DATA_DIR`.

## Stage ownership (edit only what your stage owns; see architecture section 5)

| Stage | Owns |
| --- | --- |
| S1 | root config (`package.json`, lockfile, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `drizzle.config.ts`, `.nvmrc`), `drizzle/**`, `src/server/db/**`, `src/server/storage/**`, `src/server/auth/rate-limit.ts`, `src/lib/{policy,slug,env,isbn,checksum,duplicates,validation}`, `src/contracts/**`, `src/lib/seo/index.ts` (stub), `scripts/**`, `tests/helpers/**`, `tests/fixtures/**`, `CODING_STANDARDS.md`, `AGENTS.md`, stage notes in `docs/` |
| S2 | catalogue and search repositories/services, `src/lib/search/**`, `src/app/api/{search,catalogue}/**` |
| S3a | `src/styles/**`, `src/components/{ui,layout}/**`, `src/app/{layout.tsx,globals.css}`, Tailwind `@import`, removal of unknown-rights images in `public/`, `docs/ASSETS.md` |
| S3b | `src/app/(public)/{page,library,category,collections,book,about}`, `src/components/{home,books}/**`, `not-found.tsx` |
| S4 | reader, `src/app/api/{books,reader}/**`, `src/components/reader/**`, `src/lib/reader-state/**`, `src/server/services/files/**`, `src/server/http/**` |
| S5a / S5b | admin backend (auth except rate-limit, admin repos/services, csv, `api/admin`) / admin UI |
| S6 | SEO builders, sitemap, robots, legal pages, takedown route/service |
| S7 | `tests/e2e/**`, `tests/a11y/**`, README/CONTRIBUTING/SECURITY rewrite |

Need a dependency or a contract change outside your stage? Ask the orchestrator; do not edit shared files.

## Hard rules

- Rights policy first: use `@/lib/policy`. Defaults are deny. No fake books, licences or stats anywhere, including seeds.
- Never print, log or commit secrets or env values. `.env.example` holds placeholders only.
- Do not commit or push unless asked. Leave changes in the working tree.
- Wiki entries need dates and a commit reference; update `docs/wiki/index.md`.
