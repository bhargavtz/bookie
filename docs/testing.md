# Testing

State described: working tree on top of `c6e855b`, 2026-11-12. Strategy: [wiki/decision-testing.md](wiki/decision-testing.md). Coding rules for tests: `CODING_STANDARDS.md` section 7.

## The gate: `npm run verify`

Runs, in order: `node scripts/check-env.mjs` (Node version, `node_modules` matches the lockfile, warning if Playwright Chromium is missing), `eslint .`, `npm run typecheck` (`next typegen` then `tsc --noEmit`, after deleting stale `.next/types`), and `npm test` (all Vitest projects, preceded by `pretest`, which writes the generated test PDFs). It must be green before work is considered done. It does **not** run `npm run build` or e2e.

## Commands

| Command | Scope |
| --- | --- |
| `npm test` | unit and integration |
| `npm run test:unit` | `tests/unit/**`: pure modules, route inventory, headers, SEO, CSV, policy, UI helpers (no database) |
| `npm run test:integration` | `tests/integration/**`: each file creates its own in-memory PGlite with all migrations applied, plus local storage in a temp directory; calls the real route handlers and services. About 1 to 2 seconds start-up per file |
| `npm run test:coverage` | all tests with v8 coverage; fails if `src/lib/policy/index.ts` drops below 100% for branches, functions, lines or statements |
| `npm run e2e` | Playwright, desktop (Chrome) and mobile (Pixel 7) projects, one worker |
| `npm run gen:pdfs` | regenerate `tests/fixtures/generated/*.pdf` and `manifest.json` (gitignored, deterministic, original text) |

Vitest is started with `--configLoader runner` because the default config loader warns about ESM syntax in this CommonJS package.

Counts: the S1 stage recorded 14 files (327 passed, 17 skipped) on 2026-11-11; later stages added files (the tree has 27 unit and 11 integration test files on 2026-11-12). Run `npm run verify` for the current numbers; they are not restated here.

## End-to-end tests

Specs: `tests/e2e/public-pages.spec.ts`, `tests/e2e/admin.spec.ts`.

```bash
npx playwright install chromium    # once
npm run build                      # e2e runs against the production build
npm run e2e
```

How the data is set up: Playwright's `webServer` runs `rm -rf .data/e2e && npm run db:setup && npx next start -p 3100 -H 127.0.0.1` with `NODE_ENV=production`, `PGLITE_DATA_DIR=.data/e2e/pglite`, `STORAGE_LOCAL_DIR=.data/e2e/storage`, an empty `DATABASE_URL` and a fixed non-secret test salt. So the e2e database holds **only the migrated schema and the 15 bootstrap categories**: no books, authors, licences or collections are seeded. Specs therefore check structure and honest empty states. In CI the web server is always fresh; locally an already-running server on port 3100 is reused, so stop other users of `.data/e2e` (PGlite is single-process). Run e2e with nothing else using that directory.

### What is skipped, and why

| Test | Skipped when | Why |
| --- | --- | --- |
| `admin.spec.ts` (whole suite) | `E2E_ADMIN_EMAIL` or `E2E_ADMIN_PASSWORD` is unset | The admin is disabled without credentials, and no credential may live in the repository. To run it: generate a throwaway password and hash with `npm run admin:hash`, export `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `E2E_ADMIN_EMAIL` (same address) and `E2E_ADMIN_PASSWORD` in your shell (the webServer inherits your environment), then `npm run e2e -- tests/e2e/admin.spec.ts`. |
| "a book detail page shows its metadata" in `public-pages.spec.ts` | no published book exists in the e2e database | Nothing is seeded (no fake books by policy). |
| `storage-s3.test.ts` real-endpoint block (17 tests) | `S3_TEST_ENDPOINT` or `S3_TEST_BUCKET` is unset | Needs a real S3-compatible endpoint. |

### Real S3 opt-in

The shared storage contract suite always runs against the local driver and an in-process fake S3 (`tests/helpers/fake-s3.ts`, no signature checks). To run it against a real endpoint (a scratch bucket you can write to and clean up):

```bash
export S3_TEST_ENDPOINT=...            # e.g. your MinIO or R2 endpoint
export S3_TEST_BUCKET=...
# optional: S3_TEST_REGION (default us-east-1), S3_TEST_ACCESS_KEY_ID, S3_TEST_SECRET_ACCESS_KEY,
#           S3_TEST_FORCE_PATH_STYLE (default true; set false for virtual-hosted style)
npm run test:integration -- storage-s3
```

Do not paste credentials into files or shell history you keep; use your secret manager.

## Known gaps (2026-11-12)

- No accessibility (axe) tests exist. `@axe-core/playwright` is installed and `CODING_STANDARDS.md` says axe runs in e2e, but no spec uses it and `tests/a11y/` does not exist.
- The S3b stage record says its e2e spec was "written, not executed" (2026-11-11), and Chromium for Playwright 1.65.0 was not confirmed installed then. No stage page records a passing `npm run e2e`, and the S7b documentation pass did not run it (2026-11-12).
- No tests against real PostgreSQL, real S3, Safari, Firefox or touch devices.
- Reader: password-protected PDFs, fullscreen, outline and touch gestures were not browser-tested ([wiki/stage-s4-reader.md](wiki/stage-s4-reader.md)).
- No CI workflow runs any of this.
