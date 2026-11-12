#!/usr/bin/env node
/**
 * Copies the pdf.js worker, CMaps, standard fonts, ICC profiles and wasm
 * helpers from node_modules into public/pdfjs/<version>/ so the reader loads
 * every one of them from the same origin (CSP worker-src 'self'). The output
 * directory is gitignored. Run by predev/prebuild; safe to repeat.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const pkgDir = path.join(root, "node_modules", "pdfjs-dist");
const { version } = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
const outDir = path.join(root, "public", "pdfjs", version);

const entries = [
  ["build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["cmaps", "cmaps"],
  ["standard_fonts", "standard_fonts"],
  ["iccs", "iccs"],
  ["wasm", "wasm"],
];

rmSync(path.join(root, "public", "pdfjs"), { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const [from, to] of entries) {
  const source = path.join(pkgDir, from);
  if (!existsSync(source)) {
    console.error(`pdfjs-dist asset missing: ${from}`);
    process.exit(1);
  }
  cpSync(source, path.join(outDir, to), { recursive: true });
}
console.log(`pdf.js ${version} assets copied to public/pdfjs/${version}`);
