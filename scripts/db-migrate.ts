/**
 * Applies drizzle/ migrations to the configured database (DATABASE_URL, else the
 * PGlite data dir). Run before starting the server: PGlite allows one process
 * per data directory. Prints no connection details.
 */
import path from "node:path";
import { loadEnv } from "@/lib/env";
import { createDb } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const handle =
    env.DATABASE_URL !== undefined
      ? await createDb({ kind: "pg", connectionString: env.DATABASE_URL, poolMax: 2 })
      : await createDb({ kind: "pglite", dataDir: path.resolve(process.cwd(), env.PGLITE_DATA_DIR) });
  try {
    await runMigrations(handle);
    console.warn(`migrations applied (driver: ${handle.kind})`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "migration failed");
  process.exit(1);
});
