# Decision: file storage

Date: 2026-11-11. Status: accepted (proposal confirmed, emphasis changed). Baseline `c6e855b` has no storage code (2026-11-11). Related: [rights enforcement](decision-rights-enforcement.md), [reader and state](decision-reader-and-state.md), [database](decision-database.md), [architecture](../architecture.md).

## Decision

One interface, `StorageDriver`, in `src/server/storage/`, with two implementations:
- `S3StorageDriver` using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (both 3.1166.0 on npm, 2026-11-11). Works with AWS S3, Cloudflare R2, MinIO and other S3-compatible services via `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `forcePathStyle` as needed.
- `LocalStorageDriver` writing under `.data/storage` (dev and tests), with path-traversal protection (`resolve` and prefix check) and no user-controlled path segments.

Interface (sketch): `put(key, stream, meta)`, `head(key)`, `getStream(key, {range})` returning `{stream, size, start, end}`, `delete(key)`, `createUploadTarget(key, {maxBytes, contentType})`, `presignGet(key, {ttlSeconds, filename})` (optional capability).

## Rules

1. Keys are opaque: `books/{bookId}/{assetId}.pdf`; the original filename is metadata only.
2. Reader and downloads stream through the app route by default. The policy ([rights enforcement](decision-rights-enforcement.md)) runs on every request; a takedown takes effect immediately; no signed URL is ever stored, logged or placed in HTML.
3. Presigned GET is an optional `DOWNLOAD_MODE=redirect` for bandwidth savings: TTL at most 60 seconds, `ResponseContentDisposition` set, created only after `canDownload` passes.
4. Uploads: local driver uploads through a streaming route handler. On serverless hosts the request body limit (4.5 MB on Vercel, to be confirmed against the chosen host) forces presigned PUT: admin gets an upload target, uploads directly, then calls a finalize endpoint that checks `head` size, reads the first bytes for `%PDF-`, streams the object to compute sha256, rejects mismatches, then marks the asset `ready`. Max size configurable (default 200 MB).
5. Duplicate detection uses sha256 plus normalised title and ISBN (advisory).

## Risks (2026-11-11)

- AWS SDK v3 default checksum behaviour can break R2/MinIO; configure `requestChecksumCalculation` and `responseChecksumValidation` as `WHEN_REQUIRED` and verify against each provider.
- Docker is not installed on the audit machine, so the S3 driver is verified by a shared driver contract test suite plus a mock; real-endpoint contract tests run only when `S3_TEST_ENDPOINT` is set.
- Proxying large PDFs costs function time and bandwidth on serverless; the deployment target is an open question in [architecture](../architecture.md).
- Hashing a large object during finalize can exceed function time limits; fallback is a background job or provider-supplied SHA-256 checksum.

## Update 2026-11-11 (S1 implemented; working tree on top of `c6e855b`)

Implemented in `src/server/storage/` (see [stage-s1-foundation](stage-s1-foundation.md)). Differences from the sketch above: methods are `put`, `stat` (was `head`), `get(key, {range})` returning a web `ReadableStream` plus `{size,start,end}`, `delete`, and optional `presignGet` / `createUploadTarget` (TTL clamped to 60 s and 900 s). Keys are validated, not escaped: segments must match `[A-Za-z0-9][A-Za-z0-9._-]*`, no `..`, max 512 characters; `assetStorageKey()` is the only generator and takes UUIDs. The S3 driver sets `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED` and `forcePathStyle` from env. S3 `put` of a stream buffers up to a cap (`maxBytes`/`contentLength`, default 64 MB); large uploads should use presigned PUT. A presigned PUT cannot enforce a size cap, so the finalize step must `stat()` and reject oversize objects. Contract tested against the local driver and an in-process fake S3, not a real endpoint (see the S1 page). Next 15.5.29 route handlers drop `Content-Length` (chunked), which affects the file proxy design in [reader and state](decision-reader-and-state.md).
