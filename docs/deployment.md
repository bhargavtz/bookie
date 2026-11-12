# Deployment

State described: working tree on top of `c6e855b`, 2026-11-12. Decision record: [wiki/deployment-node-server.md](wiki/deployment-node-server.md). Nothing here has been deployed or verified on a real host (2026-11-12); treat it as a checklist, not a tested runbook.

## Target: one long-running Node process

`npm run build`, then `npm run start` (`next start`), behind a reverse proxy that terminates TLS. Node `>=22.13`. PostgreSQL 16+ via `DATABASE_URL`. Files on a persistent disk (`STORAGE_DRIVER=local`) or an S3-compatible bucket (`STORAGE_DRIVER=s3`, preferred when you run more than one instance). No Dockerfile, CI workflow or process-manager config exists in the repository (2026-11-12). `output: 'standalone'` is deliberately not set because it disables `next start`.

### Checklist

1. Provision PostgreSQL 16+ and a backup policy. Verify `CREATE EXTENSION pg_trgm, unaccent` works for the migration user ([database.md](database.md)).
2. Set the environment ([environment.md](environment.md)): at least `NODE_ENV=production`, `SITE_URL` (your https origin), `DATABASE_URL`, `IP_HASH_SALT` (random, 16+ characters), `CONTACT_EMAIL` (a monitored mailbox; without it the takedown form is disabled), storage settings, and `ADMIN_EMAIL` plus `ADMIN_PASSWORD_HASH` if you want the admin.
3. `npm ci && npm run build`.
4. `npm run db:migrate`, then (first deploy) `npm run db:bootstrap`, before starting the server.
5. `npm run start` under a supervisor (systemd, a container runtime, or similar) that restarts it.
6. Put the reverse proxy and TLS in front (below), then set `TRUST_PROXY=true` only if the proxy overwrites `X-Forwarded-For`.
7. Smoke test: home page, one search, `/robots.txt`, `/sitemap.xml`, `/admin/login`, and the admin flow with a throwaway book you created.

## Reverse proxy notes

- Terminate TLS and redirect http to https. The admin cookie is `Secure`; it will not work over plain http outside `localhost`.
- **`X-Forwarded-For`**: the proxy must overwrite, not append to, any client-supplied value, and then `TRUST_PROXY=true` may be set. Without `TRUST_PROXY` the app records no client address: address hashes are not stored and per-client rate limits fall back to shared buckets (so a flood from anyone can exhaust a shared limit). See the mismatch noted in the S7b wiki page: the admin and takedown code take the **last** `X-Forwarded-For` entry, while the download-event code takes the **first**. With an overwriting proxy both are the same value.
- Do not cache `/api/*` (especially `/api/books/*`; file responses are `private, max-age=0, must-revalidate`), pass `Range` and `If-Range` headers through, and do not compress or transform `application/pdf` ranges.
- Next 15.5 `next start` sends route-handler responses chunked without `Content-Length` (observed 2026-11-11). pdf.js reads the total size from `Content-Range`, so ranged reads work, but a proxy that buffers responses will slow large downloads; disable response buffering for `/api/books/`.
- Set generous timeouts and body-size limits for `/api/admin/books/*/pdf` (up to `MAX_UPLOAD_BYTES`, default 200 MiB, buffered in memory by the route; the multipart request is a little larger than the file).

## HTTPS and HSTS

HSTS is **not set** by the application (it belongs to the TLS terminator or a deliberate production-only decision). Add `Strict-Transport-Security` at the proxy once https works for every host you serve, starting with a short `max-age`. Not configured: preload.

## Headers set by `next.config.ts` (2026-11-12)

On every route: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone, geolocation, payment, usb, interest-cohort all off). `X-Powered-By` is removed. `/admin/*` and `/api/*` additionally send `X-Robots-Tag: noindex, nofollow`. File responses add `Content-Security-Policy: default-src 'none'; sandbox`.

CSP in production: `default-src 'self'`; `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`; `worker-src 'self'`; `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self' data:`; `connect-src 'self'`; `media-src 'self'`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`. Development adds `'unsafe-eval'` and websockets. Known weakness: `script-src 'unsafe-inline'` (nonces would force every page to render dynamically); remote scripts are still blocked. If your proxy or CDN injects scripts or fonts, the CSP will block them.

## S3-compatible storage

1. Create a **private** bucket (no public read, no public ACLs). Files are served only through the app (`DOWNLOAD_MODE=proxy`, the default), which checks rights on every request.
2. Create credentials limited to that bucket with `GetObject`, `PutObject`, `DeleteObject`, `HeadObject`. Provide them through the secret store as `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, or use an instance role and leave both unset.
3. Set `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`; for R2 or MinIO also `S3_ENDPOINT` and, where needed, `S3_FORCE_PATH_STYLE=true`.
4. `DOWNLOAD_MODE=redirect` gives clients a presigned URL (valid at most 60 seconds) to save bandwidth, but access control after the redirect is the bucket's, so a takedown does not cut off an already-issued URL for up to 60 seconds. Inline reading always goes through the app.
5. The S3 driver was tested only against an in-process fake (2026-11-11). Run the opt-in real-endpoint contract test ([testing.md](testing.md)) against your provider before relying on it. The driver sets AWS SDK checksum options to `WHEN_REQUIRED` for R2/MinIO compatibility; this is untested against real providers.
6. Admin uploads stream through the app and, for S3, are buffered up to a cap (default 64 MB in the driver) per `put`; the app route reads the whole upload into memory first. Very large files are better served by a direct-upload flow that is not built (2026-11-12).

## Local disk storage

Needs a persistent volume at `STORAGE_LOCAL_DIR` and a single instance (or a shared filesystem). The directory must be trusted: the driver rejects symlinked objects but does not defend against a concurrent attacker with write access to it.

## Serverless (Vercel and similar): not designed for, not verified

The PDF proxy and PGlite are the parts that break first. Known issues:

1. Request body limit (about 4.5 MB on Vercel, confirm at migration time) breaks admin PDF upload; a presigned-PUT flow exists in the storage driver (`createUploadTarget`) but no route or UI uses it.
2. Streaming large PDFs consumes function time and egress; function duration limits apply.
3. `STORAGE_DRIVER=local` and PGlite do not work (no persistent filesystem). `STORAGE_DRIVER=s3` and `DATABASE_URL` are mandatory.
4. Use a pooler and a small `DATABASE_POOL_MAX`.
5. Rate limits are database-backed (shared across instances). Admin session login uses scrypt at about 128 MB per hash; size function memory or lower the parameters.
6. Run migrations as a release step, never at cold start.

## Not yet configured (2026-11-12)

HSTS and preload; a Dockerfile; CI (lint, typecheck, tests, build, `npm audit`); automated backups and restore drills; log shipping and alerting; error reporting; email notification for takedowns; retention for hashed addresses and sessions; a CDN; per-IP rate limiting at the edge; a verified run on real PostgreSQL and a real S3 endpoint; two-factor authentication for the admin. `npm audit` still reports findings in the `postcss` copy bundled in Next 15.5.29, fixable only by Next 16 (deferred; see [wiki/decision-toolchain.md](wiki/decision-toolchain.md)).
