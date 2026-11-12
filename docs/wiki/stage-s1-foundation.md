# Stage S1: foundation (implementation record)

Date: 2026-11-11. State described: working tree on top of `c6e855b` (branch `new-code-set`, nothing committed). Plan: [../architecture.md](../architecture.md) section 5. Related: [toolchain](decision-toolchain.md), [database](decision-database.md), [storage](decision-storage.md), [rights enforcement](decision-rights-enforcement.md), [testing](decision-testing.md), [deployment target](deployment-node-server.md).

## What exists (2026-11-11, working tree on top of `c6e855b`)

| Area | Files | Notes |
| --- | --- | --- |
| Toolchain | `package.json`, `package-lock.json`, `.nvmrc` (24), `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `scripts/check-env.mjs`, `scripts/clean-next-types.mjs` | Next 15.5.29, `eslint .`, `engines.node >=22.13`, strict TS extras, `npm run verify`. |
| Database | `src/server/db/{schema/*,client.ts,migrate.ts,bootstrap.ts,index.ts,reference/categories.ts}`, `drizzle/0000..0002`, `drizzle.config.ts`, `scripts/db-{migrate,bootstrap}.ts` | 22 tables (every entity in architecture 4.2 plus `audit_log` and `import_jobs`). |
| Storage | `src/server/storage/{types,keys,range,local,s3,index}.ts` | `StorageDriver` with `put/stat/get(range)/delete`, optional `presignGet` and `createUploadTarget`. |
| Rate limit | `src/server/auth/rate-limit.ts` | `RateLimiter` interface, `DbRateLimiter` (atomic upsert), `MemoryRateLimiter`. |
| Pure modules | `src/lib/{slug,env,isbn,checksum,duplicates}.ts`, `src/lib/policy/`, `src/lib/validation/external-url.ts`, `src/lib/seo/index.ts` (stub) | All unit-tested. |
| Contracts | `src/contracts/*` | enums (shared by Drizzle and zod), book/licence/takedown/search/reader/admin schemas, catalogue DTO types. |
| Tests | `vitest.config.ts` (projects `unit`, `integration`), `playwright.config.ts`, `tests/helpers/*`, `tests/unit/*`, `tests/integration/*` | 14 files; PDF generator in `tests/helpers/pdf-{writer,fixtures}.ts`, script `scripts/gen-test-pdfs.ts`. |
| Docs | `CODING_STANDARDS.md`, `AGENTS.md`, this wiki | |

## Data model decisions made during implementation

1. **Search document.** A generated column cannot read other tables, so authors/technologies/tags cannot be inside `books.search`. `books.search_text` (plain text, default empty) holds the denormalised author/technology/tag text and is maintained by the catalogue repository (S2) whenever those relations change. `books.search` is `GENERATED ALWAYS AS (...) STORED`: title weight A, subtitle plus `search_text` weight B, description weight C, all passed through `bookie_unaccent()`. Verified 2026-11-11 on PGlite: weighting (a title hit outranks a description hit), accent folding (`cafe resume` finds `Café ... résumé`), trigram typo matching via `word_similarity('algoritms', title)` (plain `similarity()` was 0.28, below the 0.3 `%` threshold for a short typo against a long title; S2 should use `<%`/`word_similarity`).
2. **`bookie_unaccent()`.** `unaccent()` is STABLE, so generated columns reject it. Migration `0000` wraps it in an IMMUTABLE SQL function with a pinned dictionary (standard workaround).
3. **Publish guard.** Migration `0002`: `BEFORE INSERT OR UPDATE` trigger on `books` rejects `status='published'` unless a licence row with `rights_status IN ('approved','restricted')` exists (architecture 4.2; the brief's wording "approved" is treated as shorthand). A second trigger on `licenses` is a **deferred constraint trigger** that rejects downgrading or deleting the licence while its book is still published, evaluated at commit. Reason: the "Remove" action is one transaction that sets the licence `removed` and unpublishes the book; an immediate trigger would reject the first statement. A transaction that downgrades the licence but leaves the book published fails at commit and rolls back (tested). Both raise SQLSTATE 23514 (`check_violation`).
4. **Licence CHECK constraints** (in addition to the architecture's): `restricted` implies `allow_download=false`; `removed` implies no read and no download; `approved` requires `approved_by`, `approved_at`, `rights_holder` and `license_type`. `approved_by` references `admin_users` with `ON DELETE RESTRICT` so an approver row cannot vanish under an approved licence.
5. **Uniques.** `books.slug`; `books.isbn13` unique only among non-deleted books (soft-deleted books free the ISBN); `assets.storage_key`; `assets.sha256` unique for live PDFs only (`kind='pdf' and status<>'deleted'`); one licence per book; one primary category per book; `admin_users.email` with a lower-case CHECK.
6. **`updated_at`.** Maintained both by Drizzle `$onUpdate` and a `set_updated_at()` trigger created for every table that has the column at migration time (raw SQL updates stay correct). Tables created later must add their own trigger.
7. **Append-only tables** (`download_events`, `audit_log`) have no `updated_at`; `rate_limits` is keyed `(key, window_start)`.
8. **Enums** live once in `src/contracts/enums.ts`; both `pgEnum` and zod derive from them.
9. **Reference data.** `npm run db:bootstrap` inserts 15 categories with `ON CONFLICT DO NOTHING` (admin renames survive; tested). It creates no books, authors, licences or assets (tested). The architecture says the taxonomy is "seeded by migration"; it is a script instead because the delegate's brief for S1 asked for a script. **Open item:** the project brief's exact list of 15 category names was not available to S1; `src/server/db/reference/categories.ts` holds a placeholder programming/CS taxonomy for the owner to reconcile.
10. **Policy details** (`src/lib/policy`): check order is deleted(404), no licence(404), removed(410, even if already unpublished), not published(404), pending(404), expired(404; `expires_at <= now`), no primary asset(404), asset not ready(404), then `allow_read`/`allow_download` flags (403). `canPublish` returns every unmet requirement in `missing[]` with reason `publish_requirements_unmet` and httpStatus 403. Admin viewers preview any non-deleted, non-removed book that has a ready file, but `canDownload` for admins still follows licence terms (restricted/pending never download). Branch coverage is 100% (95/95 branches, 2026-11-11).

## Spike results (2026-11-11, `next` 15.5.29, Node 26.9.0, macOS)

A temporary route handler (deleted afterwards; nothing of it remains in the tree) exercised the checklist in architecture section 5:

| Check | Result |
| --- | --- |
| PGlite under `next build` + `next start` with `serverExternalPackages: ['@electric-sql/pglite','pg']` | PASS. Route returned `PostgreSQL 18.6 (PGlite 0.5.16)` and 15 categories from a PGlite data dir created by the migrate/bootstrap scripts. Build did not open the database. |
| PGlite under `next dev --turbopack`, including a hot reload | PASS (no second instance opened; the client lives on `globalThis`). |
| Same migrations on a real PostgreSQL | NOT TESTED: no Docker or `psql` on this machine. Migrations are plain SQL plus Drizzle output; the `DATABASE_URL` path is untested against a server. |
| `pg_trgm` / `unaccent` via migration | PASS on PGlite (extensions loaded by the client, `CREATE EXTENSION` in migration `0000`). Managed hosts need privileges to create them. |
| Local and S3 drivers pass one contract suite | PASS (`tests/helpers/storage-contract.ts`). The S3 driver ran against an in-process fake S3 (`tests/helpers/fake-s3.ts`, path-style, no signature checks), **not** MinIO/R2/AWS; set `S3_TEST_ENDPOINT` + `S3_TEST_BUCKET` (+ optional `S3_TEST_REGION`, `S3_TEST_ACCESS_KEY_ID`, `S3_TEST_SECRET_ACCESS_KEY`, `S3_TEST_FORCE_PATH_STYLE`) to run it against a real endpoint. |
| Stream + `Range` through a Next route handler | PARTIAL. 206 with correct `Content-Range`, 416 with `bytes */size`, and an exact byte count all work. **`Content-Length` is NOT preserved:** `next start` answers with `Transfer-Encoding: chunked` and no `Content-Length`, even when a `Uint8Array` body and an explicit header are used, and with `compress: false`. pdf.js range loading reads the total from `Content-Range`, so ranged reads do not need it; the full-file 200 and `HEAD` carry no length. S4 should not depend on `Content-Length` and may expose the size in a separate header if needed. |
| `tsc` independent of stale `.next/types` | FIXED. `next typegen` regenerates but does **not** delete entries for removed routes (reproduced when the spike routes were deleted: 6 TS2307 errors). `npm run typecheck` now removes `.next/types` first (`scripts/clean-next-types.mjs`). |

## Dependency findings (2026-11-11)

- **`pdfjs-dist` pinned to 6.5.438, not 5.7.284.** `npm audit` flags `pdfjs-dist >=5.6.83 <6.2.108` as high severity ("Arbitrary JavaScript execution upon opening a malicious PDF", GHSA-hq66-cqwq-w95j), so 5.7.284 is inside the vulnerable range and there is no fixed 5.x. This supersedes the "start on 5.7.284" line in [decision-reader-and-state](decision-reader-and-state.md). Verified: 6.5.438 parses and extracts text from all generated fixtures under Node using `pdfjs-dist/legacy/build/pdf.mjs`. Not yet validated: browser rendering under Next 15 (S4 spike). API notes for S4: `PDFDocumentProxy.destroy` does not exist in 6.x (use `loadingTask.destroy()`); the `isEvalSupported` option does not exist in 5.7.284 or 6.5.438 (searched the package); `pdfjs-dist/wasm/` ships alongside `cmaps/` and `standard_fonts/` and likely needs copying with the other assets.
- **`npm audit` after S1 (final lockfile):** 12 findings (11 moderate, 1 high); `--omit=dev` shows 2 (1 moderate, 1 high), both the `postcss` copy bundled inside `next` (fixable only by Next 16.4.6, a major; deferred per [toolchain](decision-toolchain.md); Bookie processes only its own CSS). Before the `pdfjs-dist` bump the count was 13 with a second high finding. The rest are dev-time (`drizzle-kit` via `@esbuild-kit`, `esbuild`, `minimatch` via typescript-eslint).
- Resolved versions (2026-11-11): next 15.5.29, react and react-dom 19.3.1, typescript 5.9.3, eslint 9.39.5, eslint-config-next 15.5.29, @types/node 22.20.5, tailwindcss 4.3.5, gsap 3.15.1 (the `^` ranges on existing dependencies resolved to these during the clean install), drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, @electric-sql/pglite 0.5.16, zod 4.6.7, vitest 5.1.0, @playwright/test 1.65.0, @axe-core/playwright 4.14.0, tsx 4.23.15, @aws-sdk/client-s3 and s3-request-presigner 3.1166.0, server-only 0.0.1.
- npm 11.19.1 prints "install scripts not yet covered by allowScripts" warnings (esbuild, @tailwindcss/oxide, unrs-resolver, fsevents). Nothing was blocked in practice: `tsx`, the Tailwind PostCSS plugin and `next build` all ran. If a future npm enforces the allow-list, approve those packages.
- `next build` runs ESLint with the repo config (observed 2026-11-11: a spike route importing `drizzle-orm` from `src/app` failed the build), so the layering rules also gate production builds.

## Deviations from the architecture document

1. pdfjs-dist 6.5.438 instead of 5.7.284 (above).
2. Reference categories via script, not migration (above).
3. `NewsletterSection.tsx` is exempted from `no-console` in `eslint.config.mjs` because the legacy landing component logs and S3b will replace it; no source file outside S1's ownership was edited.
4. Tailwind `@import` was **not** added: `src/app/globals.css` belongs to S3a. Tailwind 4.3.5 stays installed but unused until then.
5. `scripts/admin-hash` (architecture section 4) is not implemented: it belongs with the admin auth work (S5a) but `scripts/**` is S1-owned, so S5a must request it from the orchestrator.
6. `next.config.ts` adds baseline security headers (nosniff, referrer policy, `X-Frame-Options: SAMEORIGIN`, a minimal Permissions-Policy) and `poweredByHeader:false`. A CSP (including `worker-src 'self'` for pdf.js) is left to S3a/S4 because it depends on the final asset set.
7. `output: 'standalone'` is not set (it disables `next start`); `outputFileTracingIncludes` keeps `drizzle/**` in traced output so a standalone build can be enabled later without losing migrations.

## Verification (run 2026-11-11 on Node 26.9.0, npm 11.19.1)

Final clean run: `rm -rf node_modules .next`, then each command below exited 0 on 2026-11-11 (working tree on top of `c6e855b`):

| Command | Result |
| --- | --- |
| `npm ci` | installed from the lockfile (about 18 s with a warm npm cache) |
| `npm run verify` | `check-env` ok, `eslint .` clean (0 errors, 0 warnings), typecheck clean, 14 test files: 327 passed, 17 skipped (the 17 are the opt-in real-S3 contract run) |
| `npm run build` | `next build` OK; routes `/` (53.3 kB, 156 kB first-load JS) and `/_not-found`; no API routes exist yet |
| `npm run db:generate` | "No schema changes" (committed migrations match the schema); `npm run db:check` OK |
| `npm run db:setup` (PGlite data dir), run twice | migrations applied; bootstrap inserted 15 categories, then 0 |
| `npm run test:coverage` | passes with the 100% policy threshold (run earlier the same day on the same tree; the `src/lib/policy/index.ts` branch count was 95 of 95) |
| `npx playwright test --list` | config loads; "No tests found" (expected before S7) |

Migrations were applied against in-memory PGlite by every integration test file. Not run: real PostgreSQL, real S3-compatible endpoint, any e2e test, any browser rendering.

## Known limits

- Playwright config is validated (`playwright test --list` loads it) but there are no e2e tests until S7; Chromium for 1.65.0 was not confirmed installed.
- Real PostgreSQL and real S3-compatible endpoints are untested here.
- `DbRateLimiter` is fixed-window; bursts straddling a window boundary can briefly reach 2x the limit.
- The local driver rejects symlinked objects but does not defend against a concurrent attacker with write access to the storage directory (TOCTOU between `lstat` and `open`); treat the storage directory as trusted.
