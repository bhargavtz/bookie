import path from "node:path";
import type { DbHandle } from "./client";

export const DEFAULT_MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Applies the committed SQL migrations with the migrator that matches the driver. Idempotent. */
export async function runMigrations(handle: DbHandle, migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER): Promise<void> {
  if (handle.kind === "pglite") {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(handle.db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(handle.db as unknown as Parameters<typeof migrate>[0], { migrationsFolder });
  }
}
