import { NETWORK_FAILURE, parseApiFailure, type ApiFailure } from "./forms";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: ApiFailure };

type RequestBody = { json: unknown } | { form: FormData } | undefined;

/**
 * Same-origin call to the admin API. The browser adds the Origin header and the
 * HttpOnly session cookie; no credential is ever readable here. Network errors and
 * non-JSON 5xx bodies become an `ApiFailure` instead of throwing.
 */
export async function adminFetch<T = unknown>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: RequestBody): Promise<ApiResult<T>> {
  const init: RequestInit = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (body !== undefined && "json" in body) {
    init.headers = { Accept: "application/json", "Content-Type": "application/json" };
    init.body = JSON.stringify(body.json);
  } else if (body !== undefined) {
    init.body = body.form;
  }
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    return { ok: false, failure: NETWORK_FAILURE };
  }
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  if (response.ok) return { ok: true, data: parsed as T };
  return { ok: false, failure: parseApiFailure(response.status, parsed, response.headers.get("Retry-After")) };
}
