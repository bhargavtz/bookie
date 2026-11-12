import { defineConfig } from "drizzle-kit";

// Only used for `drizzle-kit generate` / `check`. Migrations are applied by
// scripts/db-migrate.ts so the same code path runs on pg and PGlite.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
});
