/**
 * Database factory: node-postgres when DATABASE_URL is set, PGlite otherwise
 * (a data directory for dev, in memory for tests). Drivers are imported
 * dynamically so a production build never loads PGlite's WASM and vice versa.
 *
 * Repositories type their parameter as `Db` and never care which one they got.
 */
import { mkdirSync } from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type DbKind = "pg" | "pglite";

export type DbHandle = {
  db: Db;
  kind: DbKind;
  close: () => Promise<void>;
};

export type CreateDbOptions =
  | { kind: "pg"; connectionString: string; poolMax?: number }
  | { kind: "pglite"; /** Directory path, or omit for in-memory. */ dataDir?: string };

async function createPglite(dataDir: string | undefined): Promise<DbHandle> {
  const [{ PGlite }, { drizzle }, { pg_trgm }, { unaccent }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("@electric-sql/pglite/contrib/pg_trgm"),
    import("@electric-sql/pglite/contrib/unaccent"),
  ]);
  if (dataDir !== undefined) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir ?? "memory://", { extensions: { pg_trgm, unaccent } });
  await client.waitReady;
  const db = drizzle(client, { schema });
  return { db: db as unknown as Db, kind: "pglite", close: () => client.close() };
}

async function createPg(connectionString: string, poolMax: number): Promise<DbHandle> {
  const [{ default: pg }, { drizzle }] = await Promise.all([import("pg"), import("drizzle-orm/node-postgres")]);
  const pool = new pg.Pool({ connectionString, max: poolMax });
  // An idle-client error must not crash the process.
  pool.on("error", () => undefined);
  const db = drizzle(pool, { schema });
  return { db: db as unknown as Db, kind: "pg", close: () => pool.end() };
}

export function createDb(options: CreateDbOptions): Promise<DbHandle> {
  return options.kind === "pg"
    ? createPg(options.connectionString, options.poolMax ?? 10)
    : createPglite(options.dataDir);
}
