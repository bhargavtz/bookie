# Database and migrations

State described: working tree on top of `c6e855b`, 2026-11-12. Background: [wiki/decision-database.md](wiki/decision-database.md), [wiki/stage-s1-foundation.md](wiki/stage-s1-foundation.md), [architecture.md](architecture.md) section 4.2.

## Drivers: PGlite versus PostgreSQL

| | PGlite (embedded) | PostgreSQL |
| --- | --- | --- |
| Selected when | `DATABASE_URL` is empty | `DATABASE_URL` is a `postgres://` URL (driver `pg`) |
| Use for | development, tests, e2e | production |
| Version | PostgreSQL 18.6 in WebAssembly (`@electric-sql/pglite` 0.5.16) | 16 or newer required, 17+ recommended |
| Limits | one process per data directory, single connection, 32-bit WASM memory | normal server limits |
| Data location | `PGLITE_DATA_DIR` (default `.data/pglite`, gitignored) | your server |

Never open one PGlite directory from two processes (for example `npm run db:migrate` while `npm run dev` is running); stop the server first. `next build` never opens the database.

Parity caveat (2026-11-11, stage S1 page): the migrations and every integration test ran on PGlite only. They have **not** been run against a real PostgreSQL server (no Docker or `psql` was available). Before the first production deploy, run `npm run db:setup` against a scratch PostgreSQL of the version you will use and run the integration suite against it, then record the result in the wiki. `pg_trgm` and `unaccent` are created by migration `0000` and need privileges to `CREATE EXTENSION` (trusted contrib extensions on modern PostgreSQL; verify on your provider).

## Commands

| Command | What it does |
| --- | --- |
| `npm run db:generate` | `drizzle-kit generate`: diff `src/server/db/schema` against the last snapshot and write a new SQL file to `drizzle/` |
| `npm run db:check` | `drizzle-kit check`: verify migration folder consistency |
| `npm run db:migrate` | apply pending migrations (`scripts/db-migrate.ts`; uses `DATABASE_URL` or PGlite). Prints the driver name only |
| `npm run db:bootstrap` | insert reference categories (idempotent) |
| `npm run db:setup` | `db:migrate` then `db:bootstrap` |

Committed migrations (2026-11-12): `0000_extensions_and_functions.sql` (extensions, `bookie_unaccent()`; hand-written), `0001_schema.sql` (all tables; generated), `0002_guards_and_triggers.sql` (publish guard, `updated_at` triggers; hand-written).

## Bootstrap taxonomy

`npm run db:bootstrap` inserts 15 reference categories from `src/server/db/reference/categories.ts` with `ON CONFLICT DO NOTHING`, so admin renames survive and a second run inserts 0. It never creates books, authors, licences or assets (tested). The names are a placeholder programming and CS taxonomy chosen by the S1 stage because the project brief's list was not available; replacing them is an owner decision ([open-questions.md](open-questions.md)). Renaming an existing category in the admin does not change the bootstrap file, and editing the file does not change rows that already exist; to rename in production use the admin categories page.

No technologies are seeded and there is no admin screen to create them (see [admin.md](admin.md)).

## Release procedure

1. `npm run build` (no database access).
2. `npm run db:migrate` against the production `DATABASE_URL` as a release step, before the new server starts. Do not migrate on cold start of serverless functions.
3. `npm run db:bootstrap` on first deploy (idempotent afterwards).
4. Start the server.

Take a database backup before every release that includes a migration.

## Safe-migration rules

1. Change the Drizzle schema, run `npm run db:generate`, commit the generated SQL and its snapshot in `drizzle/`. Triggers, functions and extensions use `drizzle-kit generate --custom`.
2. **Never edit a migration that has been committed or applied anywhere.** Add a new one. (`CODING_STANDARDS.md` section 5.)
3. **No destructive migration without review.** `DROP TABLE`, `DROP COLUMN`, type changes that rewrite data, `TRUNCATE`, bulk `DELETE` or `UPDATE` need explicit owner review, a verified backup, and a plan for rollback. Prefer expand, then migrate data, then contract in separate releases.
4. Never add a migration or seed that creates book, author, licence or asset rows. Rights data comes only from humans through the admin.
5. Do not weaken the publish guard in `0002` or the licence CHECK constraints. They are the second line of defence behind `src/lib/policy`.
6. Every new table: uuid primary key (`gen_random_uuid()`), `created_at` and `updated_at` unless append-only, explicit `onDelete` on foreign keys, indexes for filtered foreign keys, CHECK constraints for invariants. Tables created later must add their own `set_updated_at()` trigger (the one in `0002` only covered tables that existed then).
7. `drizzle/**` must be present in whatever you deploy (`next.config.ts` keeps it in traced output).
8. Test a new migration on an empty PGlite directory and, before production, on real PostgreSQL.

## Backups and retention

No backup, restore or data-retention automation exists in the repository (2026-11-12). Configure PostgreSQL backups at your provider. Retention periods for hashed addresses (`download_events`, `rate_limits`, `admin_sessions`) are not defined; see [open-questions.md](open-questions.md).
