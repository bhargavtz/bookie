import { takedownRequestSchema } from "@/contracts/takedown";
import { getClientIp } from "@/server/auth/client-ip";
import type { RateLimiter, RateLimitRule } from "@/server/auth/rate-limit";
import type { Db } from "@/server/db/client";
import { hashIp } from "@/server/http/client-info";
import { findBookIdBySlug, insertPublicTakedown } from "@/server/repositories/takedown";

export type TakedownDeps = {
  db: Db;
  limiter: RateLimiter;
  now: () => Date;
  trustProxy: boolean;
  salt: string;
  perClientRule?: RateLimitRule;
  globalRule?: RateLimitRule;
};

export type TakedownOutcome =
  | { status: "accepted" }
  | { status: "invalid"; issues: { field: string; message: string }[] }
  | { status: "rate_limited"; retryAfterSeconds: number };

const PER_CLIENT_RULE: RateLimitRule = { limit: 5, windowSeconds: 3600 };
/** Coarse shared ceiling; also the only limit when no client address is available (no trusted proxy). */
const GLOBAL_RULE: RateLimitRule = { limit: 100, windowSeconds: 3600 };

const BOOK_PATH = /^\/book\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

/** Slug named by the form: an explicit slug wins, otherwise the last `/book/<slug>` path of the pasted address. */
export function bookSlugFrom(input: { bookSlug?: string | undefined; bookUrl?: string | undefined }): string | null {
  if (input.bookSlug !== undefined && input.bookSlug !== "") return input.bookSlug.toLowerCase();
  if (input.bookUrl === undefined) return null;
  try {
    return BOOK_PATH.exec(new URL(input.bookUrl).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}

function isFilledHoneypot(body: unknown): boolean {
  return typeof body === "object" && body !== null && "website" in body && typeof body.website === "string" && body.website.trim() !== "";
}

/**
 * Stores a public takedown request. The outcome never depends on whether the
 * named book exists, is published or was already removed: an unknown or missing
 * slug just leaves `book_id` null for the reviewer to resolve. A filled
 * honeypot is acknowledged and dropped.
 */
export async function submitTakedown(deps: TakedownDeps, headers: Headers, body: unknown): Promise<TakedownOutcome> {
  const now = deps.now();
  const ip = getClientIp(headers, deps.trustProxy);
  const checks = [
    deps.limiter.hit("takedown:all", deps.globalRule ?? GLOBAL_RULE, now),
    ...(ip === null ? [] : [deps.limiter.hit(`takedown:ip:${hashIp(ip, deps.salt, now)}`, deps.perClientRule ?? PER_CLIENT_RULE, now)]),
  ];
  const blocked = (await Promise.all(checks)).find((result) => !result.allowed);
  if (blocked !== undefined) return { status: "rate_limited", retryAfterSeconds: blocked.retryAfterSeconds };

  if (isFilledHoneypot(body)) return { status: "accepted" };

  const parsed = takedownRequestSchema.safeParse(body);
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.error.issues.map((issue) => ({ field: issue.path.map(String).join(".") || "(form)", message: issue.message })) };
  }
  const data = parsed.data;
  const slug = bookSlugFrom(data);
  await insertPublicTakedown(deps.db, {
    bookId: slug === null ? null : await findBookIdBySlug(deps.db, slug),
    bookUrl: data.bookUrl ?? null,
    claimantName: data.claimantName,
    claimantEmail: data.claimantEmail,
    organisation: data.organisation ?? null,
    relationship: data.relationship,
    description: data.description,
    signature: data.signature,
    ipHash: ip === null ? null : hashIp(ip, deps.salt, now),
  });
  return { status: "accepted" };
}
