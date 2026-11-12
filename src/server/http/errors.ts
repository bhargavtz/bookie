/** Typed, non-leaking error responses for file routes. Messages are fixed strings: no paths, keys or stack traces. */

export type FileErrorCode =
  | "not_found"
  | "gone"
  | "forbidden"
  | "rate_limited"
  | "range_not_satisfiable"
  | "asset_missing"
  | "storage_error";

export type FileError = {
  code: FileErrorCode;
  status: 403 | 404 | 410 | 416 | 429 | 502;
  message: string;
  /** Seconds, for 429. */
  retryAfterSeconds?: number;
  /** Total size, for 416 (Content-Range: "bytes *" plus "/size"). */
  size?: number;
};

export const FILE_ERROR_MESSAGES: Record<FileErrorCode, string> = {
  not_found: "Not found.",
  gone: "This title has been removed.",
  forbidden: "This action is not permitted for this title.",
  rate_limited: "Too many requests. Please try again later.",
  range_not_satisfiable: "The requested range cannot be satisfied.",
  asset_missing: "The file for this title is unavailable.",
  storage_error: "The file could not be read. Please try again.",
};

const STATUS: Record<FileErrorCode, FileError["status"]> = {
  not_found: 404,
  gone: 410,
  forbidden: 403,
  rate_limited: 429,
  range_not_satisfiable: 416,
  asset_missing: 404,
  storage_error: 502,
};

export function fileError(code: FileErrorCode, extra: Pick<FileError, "retryAfterSeconds" | "size"> = {}): FileError {
  return { code, status: STATUS[code], message: FILE_ERROR_MESSAGES[code], ...extra };
}

export function fileErrorResponse(error: FileError, isHead = false): Response {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (error.retryAfterSeconds !== undefined) headers.set("Retry-After", String(error.retryAfterSeconds));
  if (error.status === 416 && error.size !== undefined) headers.set("Content-Range", `bytes */${error.size}`);
  const body = isHead ? null : JSON.stringify({ error: { code: error.code, message: error.message } });
  return new Response(body, { status: error.status, headers });
}
