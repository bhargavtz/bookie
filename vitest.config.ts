import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(process.cwd(), "src"),
  // `server-only` throws when imported outside a React Server Components build.
  "server-only": path.resolve(process.cwd(), "tests/helpers/server-only-stub.ts"),
};

export default defineConfig({
  resolve: { alias },
  test: {
    // Components project (jsdom + @testing-library) is added by the stage that first needs it.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Each file creates its own in-memory PGlite (WASM start-up + migrations).
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/contracts/**", "src/server/**"],
      exclude: ["src/server/db/schema/**", "src/server/db/index.ts", "src/server/storage/index.ts", "src/contracts/index.ts", "src/lib/seo/index.ts"],
      reporter: ["text", "html"],
      thresholds: {
        "src/lib/policy/index.ts": { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
    },
  },
});
