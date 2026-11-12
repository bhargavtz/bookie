import path from "node:path";
import { createDb, type DbHandle } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

/** A fresh in-memory PGlite with all committed migrations applied. Call once per test file; close in afterAll. */
export async function createTestDb(): Promise<DbHandle> {
  const handle = await createDb({ kind: "pglite" });
  await runMigrations(handle, path.join(process.cwd(), "drizzle"));
  return handle;
}
