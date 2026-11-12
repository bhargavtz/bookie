import { createHash, randomBytes } from "node:crypto";

/** Opaque 32-byte session token (cookie value). Only its sha256 is stored. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Salted, day-rotating hash of a client IP (raw IPs are never stored). */
export function hashClientIp(ip: string, salt: string, now: Date): string {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${salt}|${day}|${ip}`, "utf8").digest("hex");
}

/** Stable salted hash for rate-limit keys that must survive midnight (e.g. an email). */
export function hashKey(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}|key|${value}`, "utf8").digest("hex");
}
