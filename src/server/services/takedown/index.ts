import "server-only";
import { getEnv } from "@/lib/env";
import { DbRateLimiter } from "@/server/auth/rate-limit";
import { getDb } from "@/server/db";
import { submitTakedown, type TakedownOutcome } from "./submit";

export type { TakedownOutcome } from "./submit";

const DEV_SALT = "bookie-development-only-salt";

/** Submits with the process-wide database and the validated environment. */
export async function submitPublicTakedown(headers: Headers, body: unknown): Promise<TakedownOutcome> {
  const env = getEnv();
  const db = await getDb();
  return submitTakedown(
    { db, limiter: new DbRateLimiter(db), now: () => new Date(), trustProxy: env.TRUST_PROXY, salt: env.IP_HASH_SALT ?? DEV_SALT },
    headers,
    body,
  );
}
