#!/usr/bin/env node
/**
 * Environment drift guard, run first by `npm run verify`.
 * Fails (exit 1) when Node is too old or node_modules does not match
 * package-lock.json; the fix is always `npm ci`. Warns (never fails) when the
 * Playwright Chromium browser is missing. Prints no environment variable values.
 */
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = process.cwd();
const problems = [];
const warnings = [];

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

// 1. Node version against package.json engines.node (>=X.Y)
const pkg = readJson(path.join(root, "package.json"));
const min = /(\d+)\.(\d+)/.exec(pkg.engines?.node ?? "");
if (min) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < Number(min[1]) || (major === Number(min[1]) && minor < Number(min[2]))) {
    problems.push(`Node ${process.versions.node} is older than required ${pkg.engines.node} (see .nvmrc)`);
  }
}

// 2. node_modules must match package-lock.json
const lockPath = path.join(root, "package-lock.json");
const hiddenPath = path.join(root, "node_modules", ".package-lock.json");
if (!existsSync(path.join(root, "node_modules")) || !existsSync(hiddenPath)) {
  problems.push("node_modules is missing or was not installed by npm");
} else if (!existsSync(lockPath)) {
  problems.push("package-lock.json is missing");
} else {
  const lock = readJson(lockPath).packages ?? {};
  const installed = readJson(hiddenPath).packages ?? {};
  const mismatched = [];
  const missing = [];
  for (const [key, meta] of Object.entries(lock)) {
    if (key === "" || !key.startsWith("node_modules/")) continue;
    const have = installed[key];
    if (!have) {
      // optional (other-platform) and dev-peer-optional packages are legitimately absent
      if (!meta.optional && !meta.peer) missing.push(key.replace(/^.*node_modules\//, ""));
    } else if (have.version !== meta.version) {
      mismatched.push(`${key.replace(/^.*node_modules\//, "")} (installed ${have.version}, locked ${meta.version})`);
    }
  }
  const extraneous = Object.keys(installed)
    .filter((key) => key.startsWith("node_modules/") && !lock[key])
    .map((key) => key.replace(/^.*node_modules\//, ""));
  const show = (label, list) => {
    if (list.length > 0) {
      const head = list.slice(0, 5).join(", ");
      problems.push(`${list.length} ${label}: ${head}${list.length > 5 ? ", ..." : ""}`);
    }
  };
  show("package(s) at a different version than package-lock.json", mismatched);
  show("locked package(s) not installed", missing);
  show("extraneous package(s) not in package-lock.json", extraneous);

  const nextLocked = lock["node_modules/next"]?.version;
  if (nextLocked && pkg.dependencies?.next && pkg.dependencies.next !== nextLocked) {
    problems.push(`package.json pins next ${pkg.dependencies.next} but package-lock.json has ${nextLocked}`);
  }
}

// 3. Playwright browser (warning only: e2e is not part of `verify`)
try {
  const require = createRequire(import.meta.url);
  const { chromium } = require("@playwright/test");
  if (!existsSync(chromium.executablePath())) {
    warnings.push("Playwright Chromium is not installed: run `npx playwright install chromium` before `npm run e2e`");
  }
} catch {
  warnings.push("could not check the Playwright browser installation");
}

for (const w of warnings) console.warn(`check-env warning: ${w}`);
if (problems.length > 0) {
  console.error("check-env FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nFix: run `npm ci` (Node per .nvmrc), then re-run.");
  process.exit(1);
}
console.warn("check-env ok");
