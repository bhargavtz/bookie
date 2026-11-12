import { createHash } from "node:crypto";

/**
 * Privacy-preserving request facts for download events and rate limits. A raw
 * IP is never stored or returned: only a salted hash that rotates every UTC day.
 */

export type ClientInfo = {
  ipHash: string | null;
  uaFamily: string | null;
  referrerHost: string | null;
};

export type ClientInfoOptions = { trustProxy: boolean; salt: string; now: Date };

export function clientIp(headers: Headers, trustProxy: boolean): string | null {
  if (!trustProxy) return null;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded !== undefined && forwarded !== "" ? forwarded : (headers.get("x-real-ip")?.trim() ?? null);
}

export function hashIp(ip: string, salt: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${salt}|${day}|${ip}`).digest("hex").slice(0, 32);
}

export function uaFamily(userAgent: string | null): string | null {
  if (userAgent === null) return null;
  // Order matters: Edge and Chrome both contain "Chrome"; Chrome contains "Safari".
  const families: [RegExp, string][] = [
    [/bot|crawler|spider/i, "bot"],
    [/edg\//i, "edge"],
    [/firefox\//i, "firefox"],
    [/chrome\//i, "chrome"],
    [/safari\//i, "safari"],
    [/curl\//i, "curl"],
  ];
  return families.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "other";
}

export function referrerHost(referrer: string | null): string | null {
  if (referrer === null || referrer === "") return null;
  try {
    return new URL(referrer).hostname.slice(0, 253);
  } catch {
    return null;
  }
}

export function describeClient(headers: Headers, options: ClientInfoOptions): ClientInfo {
  const ip = clientIp(headers, options.trustProxy);
  return {
    ipHash: ip === null ? null : hashIp(ip, options.salt, options.now),
    uaFamily: uaFamily(headers.get("user-agent")),
    referrerHost: referrerHost(headers.get("referer")),
  };
}
