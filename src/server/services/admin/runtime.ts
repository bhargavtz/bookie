import "server-only";
import { getEnv } from "@/lib/env";
import { adminCookieName } from "@/server/auth/cookie";
import type { GuardConfig } from "@/server/auth/guard";
import { DbRateLimiter } from "@/server/auth/rate-limit";
import type { AuthDeps } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { getStorage } from "@/server/storage";
import type { AdminContext } from "./context";

export type AdminRuntime = {
  auth: AuthDeps;
  guard: GuardConfig;
  ctx: AdminContext;
  trustProxy: boolean;
};

const DEV_SALT = "bookie-development-only-salt";

/** Builds the runtime from the validated environment. Cheap; the db and storage are process singletons. */
export async function getAdminRuntime(): Promise<AdminRuntime> {
  const env = getEnv();
  const db = await getDb();
  const now = (): Date => new Date();
  const production = env.NODE_ENV === "production";
  const bootstrap =
    env.ADMIN_EMAIL !== undefined && env.ADMIN_PASSWORD_HASH !== undefined
      ? { email: env.ADMIN_EMAIL, passwordHash: env.ADMIN_PASSWORD_HASH }
      : null;
  return {
    auth: { db, limiter: new DbRateLimiter(db), now, bootstrap, salt: env.IP_HASH_SALT ?? DEV_SALT },
    guard: { cookieName: adminCookieName(production), siteOrigin: new URL(env.SITE_URL).origin },
    trustProxy: env.TRUST_PROXY,
    ctx: { db, storage: getStorage(), now, maxUploadBytes: env.MAX_UPLOAD_BYTES },
  };
}
