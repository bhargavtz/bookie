# Deployment target: plain Node server

Date: 2026-11-11. Status: accepted (owner's delegate decided; answers open question 1 in [../architecture.md](../architecture.md) section 6). State described: working tree on top of `c6e855b`. Related: [storage](decision-storage.md), [reader and state](decision-reader-and-state.md), [database](decision-database.md), [stage S1](stage-s1-foundation.md).

## Decision

Bookie targets a single long-running Node process: `npm run build` then `npm run start` (`next start`), behind a reverse proxy, with PostgreSQL via `DATABASE_URL` and either the local-disk or an S3-compatible storage driver. Node >= 22.13 (`.nvmrc` 24). Containerising it is straightforward but not part of S1 (no Dockerfile exists, 2026-11-11). `output: 'standalone'` is deliberately not set because it disables `next start`; it can be enabled later (`outputFileTracingIncludes` already keeps `drizzle/**`).

Operational rules:
- Run `npm run db:migrate` before starting the server (or as a release step). `next build` never touches the database.
- Embedded PGlite (no `DATABASE_URL`) is for development and tests only: one process per data directory, 32-bit WASM.
- Behind a proxy set `TRUST_PROXY=true` only when the proxy overwrites `X-Forwarded-For`; set `IP_HASH_SALT` (required when `NODE_ENV=production`; the app refuses to start without it).
- With the local storage driver the host needs a persistent volume for `STORAGE_LOCAL_DIR`; prefer an S3-compatible bucket for multi-instance setups.
- Next 15.5 `next start` sends route-handler responses with `Transfer-Encoding: chunked` and no `Content-Length` (observed 2026-11-11, see stage S1 page). A reverse proxy in front may buffer or re-add lengths; it must not cache `/api/books/*`, must pass `Range`/`If-Range`, and must not compress `application/pdf` ranges.

## Vercel / serverless caveats (not designed for, documented only)

If the project is moved to Vercel or another serverless host later, the PDF proxy (architecture 4.4) is the part that breaks first:

1. **Request body limit.** Vercel serverless functions accept request bodies of about 4.5 MB (to be confirmed against current docs at migration time), so admin PDF uploads must switch to presigned PUT (`S3StorageDriver.createUploadTarget`) plus a finalize step, as sketched in [decision-storage](decision-storage.md).
2. **Function duration and bandwidth.** Streaming large PDFs through a function is limited by the maximum duration and billed as function time and egress; `DOWNLOAD_MODE=redirect` (presigned GET, <= 60 s) avoids proxying downloads but gives up per-request policy enforcement after the redirect. Inline reading must still go through the proxy for takedowns to bite.
3. **Local storage driver and PGlite do not work** (read-only/ephemeral filesystem, no persistent process): `STORAGE_DRIVER=s3` and `DATABASE_URL` are mandatory.
4. **Connection pooling.** `pg` pools per instance; use a pooler or serverless-friendly Postgres and a small `DATABASE_POOL_MAX`.
5. **Rate limiting** is DB-backed (works across instances); `MemoryRateLimiter` is per-instance only and best-effort.
6. **scrypt** at N=2^17 needs about 128 MB per hash ([admin auth](decision-admin-auth.md)); size the function memory accordingly or tune N.
7. **Hashing on finalize** (sha256 of a large object) can exceed the function time limit; fall back to a background job or provider-supplied checksums.
8. **Migrations** must run as a release step (not at cold start), and `drizzle/**` must be in the deployed bundle.

Not verified on any serverless platform (2026-11-11).
