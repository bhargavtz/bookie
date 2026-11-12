import { canDownload, canRead, type PolicyDecision, type Viewer } from "@/lib/policy";
import { buildContentDisposition } from "@/server/http/content-disposition";
import { describeClient } from "@/server/http/client-info";
import { fileError, type FileError } from "@/server/http/errors";
import { ifNoneMatchMatches, ifRangeAllowsRange, parseRangeHeader } from "@/server/http/range";
import type { BookFileRecord, BookFileRepository } from "@/server/repositories/book-files";
import type { RateLimiter, RateLimitRule } from "@/server/auth/rate-limit";
import { StorageNotFoundError, StorageRangeError, type StorageDriver } from "@/server/storage/types";

/**
 * Streams a book's primary PDF. Every request is authorised by the S1 rights
 * policy first (canRead for inline reading, canDownload for attachments), so a
 * takedown takes effect on the next request. Bytes come only through the
 * StorageDriver interface; no storage key, path or signed URL leaves this
 * module (errors are fixed, typed values).
 */

export type FileMode = "inline" | "download";

export type FileRequest = {
  slug: string;
  mode: FileMode;
  method: "GET" | "HEAD";
  headers: Headers;
  signal?: AbortSignal;
};

export type FileServiceDeps = {
  repository: BookFileRepository;
  storage: StorageDriver;
  rateLimiter: RateLimiter;
  now: () => Date;
  viewer: Viewer;
  trustProxy: boolean;
  ipHashSalt: string;
  downloadRule?: RateLimitRule;
  /** Used when no client IP is available (no trusted proxy): a coarse shared bucket. */
  anonymousDownloadRule?: RateLimitRule;
};

export type FileSuccess = {
  ok: true;
  status: 200 | 206 | 304;
  headers: Headers;
  body: ReadableStream<Uint8Array> | null;
};
export type FileOutcome = FileSuccess | { ok: false; error: FileError };

const DEFAULT_DOWNLOAD_RULE: RateLimitRule = { limit: 20, windowSeconds: 600 };
const DEFAULT_ANONYMOUS_DOWNLOAD_RULE: RateLimitRule = { limit: 300, windowSeconds: 600 };

export function denialToError(decision: Extract<PolicyDecision, { allowed: false }>): FileError {
  if (decision.httpStatus === 410) return fileError("gone");
  if (decision.httpStatus === 403) return fileError("forbidden");
  return fileError("not_found");
}

const fail = (error: FileError): FileOutcome => ({ ok: false, error });

function etagFor(record: BookFileRecord & { asset: NonNullable<BookFileRecord["asset"]> }, size: number): string {
  const { asset } = record;
  return asset.sha256 !== null ? `"${asset.sha256}"` : `"${asset.id}-${size}"`;
}

function baseHeaders(
  record: BookFileRecord & { asset: NonNullable<BookFileRecord["asset"]> },
  size: number,
  mode: FileMode,
): Headers {
  const headers = new Headers({
    "Content-Type": "application/pdf",
    "Accept-Ranges": "bytes",
    ETag: etagFor(record, size),
    // Never public: a takedown must take effect on the next request.
    "Cache-Control": "private, max-age=0, must-revalidate, no-transform",
    "X-Content-Type-Options": "nosniff",
    // The PDF is data, not a document that may run script or load subresources.
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": buildContentDisposition(mode === "download" ? "attachment" : "inline", record.asset.originalFilename ?? record.title),
  });
  return headers;
}

export async function serveBookFile(request: FileRequest, deps: FileServiceDeps): Promise<FileOutcome> {
  const now = deps.now();
  const record = await deps.repository.findBySlug(request.slug);
  if (record === null) return fail(fileError("not_found"));

  const isDownload = request.mode === "download";
  const client = describeClient(request.headers, { trustProxy: deps.trustProxy, salt: deps.ipHashSalt, now });
  const recordEvent = async (outcome: "served" | "denied_policy" | "denied_rate_limit"): Promise<void> => {
    try {
      await deps.repository.recordDownloadEvent({
        bookId: record.bookId,
        assetId: record.asset?.id ?? null,
        outcome,
        ...client,
      });
    } catch (error) {
      // Accounting must never block a reader; the failure is visible to operators.
      console.error("download event not recorded", error instanceof Error ? error.name : "unknown");
    }
  };

  if (isDownload && request.method === "GET") {
    const keyed = client.ipHash !== null;
    const rule = keyed ? (deps.downloadRule ?? DEFAULT_DOWNLOAD_RULE) : (deps.anonymousDownloadRule ?? DEFAULT_ANONYMOUS_DOWNLOAD_RULE);
    const limit = await deps.rateLimiter.hit(keyed ? `download:ip:${client.ipHash}` : "download:anonymous", rule, now);
    if (!limit.allowed) {
      await recordEvent("denied_rate_limit");
      return fail(fileError("rate_limited", { retryAfterSeconds: limit.retryAfterSeconds }));
    }
  }

  const decision = isDownload ? canDownload(deps.viewer, record.rights, now) : canRead(deps.viewer, record.rights, now);
  if (!decision.allowed) {
    if (isDownload && request.method === "GET") await recordEvent("denied_policy");
    return fail(denialToError(decision));
  }

  const { asset } = record;
  if (asset === null) return fail(fileError("asset_missing")); // policy guarantees a ready asset; defence in depth
  const withAsset = { ...record, asset };

  let size: number;
  try {
    const stat = await deps.storage.stat(asset.storageKey);
    if (stat === null) return fail(fileError("asset_missing"));
    size = stat.size;
  } catch (error) {
    console.error("storage stat failed", error instanceof Error ? error.name : "unknown");
    return fail(fileError("storage_error"));
  }

  const headers = baseHeaders(withAsset, size, request.mode);
  const etag = headers.get("ETag") ?? "";

  if (!isDownload && ifNoneMatchMatches(request.headers.get("if-none-match"), etag) && request.headers.get("range") === null) {
    headers.delete("Content-Disposition");
    headers.delete("Content-Type");
    return { ok: true, status: 304, headers, body: null };
  }

  const rangeHeader = ifRangeAllowsRange(request.headers.get("if-range"), etag) ? request.headers.get("range") : null;
  const range = parseRangeHeader(rangeHeader, size);
  if (range.kind === "unsatisfiable") return fail(fileError("range_not_satisfiable", { size }));

  const partial = range.kind === "partial";
  const start = partial ? range.start : 0;
  const end = partial ? range.end : Math.max(size - 1, 0);
  headers.set("Content-Length", String(size === 0 ? 0 : end - start + 1));
  if (partial) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  const status = partial ? 206 : 200;

  if (request.method === "HEAD") return { ok: true, status, headers, body: null };

  let body: ReadableStream<Uint8Array>;
  try {
    const object = await deps.storage.get(asset.storageKey, {
      ...(partial ? { range: { start, end } } : {}),
      ...(request.signal !== undefined ? { signal: request.signal } : {}),
    });
    body = object.stream;
  } catch (error) {
    if (error instanceof StorageNotFoundError) return fail(fileError("asset_missing"));
    if (error instanceof StorageRangeError) return fail(fileError("range_not_satisfiable", { size }));
    console.error("storage read failed", error instanceof Error ? error.name : "unknown");
    return fail(fileError("storage_error"));
  }

  // One event per download request; a resumed range (start > 0) is the same download.
  if (isDownload && start === 0) await recordEvent("served");

  return { ok: true, status, headers, body };
}
