import "server-only";
/**
 * Server entry for the database. Application code (repositories) imports from
 * here; `getDb()` returns a process-wide singleton (kept on globalThis so Next
 * HMR does not open a second PGlite instance on the same data directory).
 */
import path from "node:path";
import { getEnv } from "@/lib/env";
import { createDb, type Db, type DbHandle } from "./client";

export type { Db, DbHandle, DbKind } from "./client";
export * as schema from "./schema";

const globalForDb = globalThis as unknown as { __bookieDb?: Promise<DbHandle> };

export function getDbHandle(): Promise<DbHandle> {
  globalForDb.__bookieDb ??= (() => {
    const env = getEnv();
    const handle =
      env.DATABASE_URL !== undefined
        ? createDb({ kind: "pg", connectionString: env.DATABASE_URL, poolMax: env.DATABASE_POOL_MAX })
        : createDb({ kind: "pglite", dataDir: path.resolve(process.cwd(), env.PGLITE_DATA_DIR) });
    // Do not cache a failed start-up: let the next call retry.
    handle.catch(() => {
      delete globalForDb.__bookieDb;
    });
    return handle;
  })();
  return globalForDb.__bookieDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}
