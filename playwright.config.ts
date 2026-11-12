import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Test-only credentials live in the gitignored .env.e2e (never committed).
try {
  process.loadEnvFile(".env.e2e");
} catch {
  // absent: admin specs skip themselves
}
const isCI = process.env.CI !== undefined && process.env.CI !== "";

/**
 * e2e runs against a PRODUCTION build (`npm run build` first) on a dedicated
 * port and a dedicated, freshly created PGlite + storage directory. PGlite is
 * single-process, so: one worker, and nothing else may open .data/e2e.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", testIgnore: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Mobile runs the read-only smoke and accessibility specs (mutating admin specs run once, on desktop).
    { name: "mobile", testMatch: /(mobile|a11y)\.spec\.ts/, use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `rm -rf .data/e2e && npm run db:setup && npx tsx tests/e2e/fixtures/seed.ts && npx next start -p ${PORT} -H 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      PGLITE_DATA_DIR: ".data/e2e/pglite",
      STORAGE_LOCAL_DIR: ".data/e2e/storage",
      SITE_URL: BASE_URL,
      IP_HASH_SALT: "e2e-only-salt-not-a-secret",
      DATABASE_URL: "",
      ...(process.env.ADMIN_EMAIL !== undefined ? { ADMIN_EMAIL: process.env.ADMIN_EMAIL } : {}),
      ...(process.env.ADMIN_PASSWORD_HASH !== undefined ? { ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH } : {}),
    },
  },
});
