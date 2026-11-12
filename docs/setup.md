# Setup

State described: working tree on top of `c6e855b`, 2026-11-12. See also [environment.md](environment.md), [database.md](database.md), [testing.md](testing.md).

## Prerequisites

- Node.js `>=22.13` (`package.json` `engines`; `.nvmrc` says 24). Vitest 5.1 and pdfjs-dist 6.x tooling need it.
- npm. Always `npm ci`, not `npm install`: `npm run check:env` fails when `node_modules` differs from `package-lock.json`.
- No Docker and no external database are required for development: PGlite (embedded PostgreSQL in WebAssembly) is used when `DATABASE_URL` is empty.
- For e2e only: `npx playwright install chromium` (needs network).

## First run

```bash
npm ci
cp .env.example .env.local
npm run db:setup
npm run dev
```

1. `.env.example` has placeholders only. The defaults work for local development as they are: PGlite in `.data/pglite`, files in `.data/storage`, `SITE_URL=http://localhost:3000`. `.data/` is gitignored.
2. `npm run db:setup` applies the SQL migrations in `drizzle/` and inserts the reference categories (see [database.md](database.md)). It is safe to run twice.
3. `npm run dev` first copies the pdf.js worker and fonts into `public/pdfjs/` (gitignored), then starts Next with Turbopack.
4. The site starts empty: no books exist, and the home page shows honest empty states. Add content through the admin ([admin.md](admin.md)).

PGlite allows one process per data directory. Never run `npm run db:*` while the dev server (or `next start`) uses the same `PGLITE_DATA_DIR`; stop the server first.

## Enabling the admin area

The admin is off (all `/admin` and `/api/admin` routes answer 404) until `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` are both set. Generate the hash with `npm run admin:hash` and put the result in `.env.local` only. Details in [admin.md](admin.md).

## Production-style run on your machine

```bash
npm run build
npm run start       # next start, port 3000
```

`next start` reads `NODE_ENV=production`, which makes `IP_HASH_SALT` mandatory (at least 16 characters; generate your own random value and keep it out of the repository). Build output is in `.next/`. `next build` runs ESLint, so lint errors fail the build, and it never opens the database.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `check-env FAILED ... run npm ci` | `node_modules` drifted from the lockfile (for example a different `next`). Run `npm ci`. |
| `Invalid environment configuration` listing variable names | A variable failed validation. Messages carry names and reasons, never values. See [environment.md](environment.md). |
| Database errors or a hanging start with PGlite | Two processes share one `PGLITE_DATA_DIR`. Stop the other one. To start over, stop everything and delete `.data/pglite`, then `npm run db:setup`. |
| Reader shows a worker or font error | `public/pdfjs/` is missing. Run `npm run assets:pdfjs`. |
| `npm run typecheck` reports errors about deleted routes | Handled by the script, which deletes `.next/types` first. Use `npm run typecheck`, not bare `tsc`. |
| `npm run e2e` says Chromium is missing | `npx playwright install chromium`. |
