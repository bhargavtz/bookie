import { isIP } from "node:net";

/**
 * Client address for rate limiting and session metadata. Headers are trusted
 * only when TRUST_PROXY=true, and then only the LAST x-forwarded-for entry (the
 * one appended by the single trusted proxy; earlier entries are client-supplied).
 * Returns null when unknown; the raw value is never stored.
 */
export function getClientIp(headers: Headers, trustProxy: boolean): string | null {
  if (!trustProxy) return null;
  const forwarded = headers.get("x-forwarded-for");
  const candidate = forwarded !== null ? forwarded.split(",").pop()?.trim() : headers.get("x-real-ip")?.trim();
  return candidate !== undefined && candidate !== "" && isIP(candidate) !== 0 ? candidate : null;
}
