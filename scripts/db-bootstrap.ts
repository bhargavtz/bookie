/** Inserts reference taxonomy (idempotent). Requires migrations to have run. */
import path from "node:path";
import { loadEnv } from "@/lib/env";
import { bootstrapReferenceData } from "@/server/db/bootstrap";
import { createDb } from "@/server/db/client";

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const handle =
    env.DATABASE_URL !== undefined
      ? await createDb({ kind: "pg", connectionString: env.DATABASE_URL, poolMax: 2 })
      : await createDb({ kind: "pglite", dataDir: path.resolve(process.cwd(), env.PGLITE_DATA_DIR) });
  try {
    const result = await bootstrapReferenceData(handle.db);
    console.warn(`bootstrap done: ${result.categoriesInserted} categories inserted`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "bootstrap failed");
  process.exit(1);
});
