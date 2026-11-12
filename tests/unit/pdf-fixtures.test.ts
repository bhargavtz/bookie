import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { looksLikePdf, sha256Hex } from "@/lib/checksum";
import type * as PdfJsModule from "pdfjs-dist/legacy/build/pdf.mjs";
import { generateTestPdfs, type PdfFixtureInfo } from "../helpers/pdf-fixtures";

type PdfJs = typeof PdfJsModule;

let dir: string;
let infos: PdfFixtureInfo[];
let pdfjs: PdfJs;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "bookie-pdf-"));
  infos = await generateTestPdfs(dir);
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const info = (kind: PdfFixtureInfo["kind"]): PdfFixtureInfo => {
  const found = infos.find((i) => i.kind === kind);
  if (!found) throw new Error(`missing fixture ${kind}`);
  return found;
};

async function load(file: string) {
  const data = new Uint8Array(await readFile(path.join(dir, file)));
  const task = pdfjs.getDocument({ data, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  return { doc, close: () => task.destroy() };
}

async function textOfAllPages(file: string): Promise<string> {
  const { doc, close } = await load(file);
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
  }
  await close();
  return pages.join("\n");
}

describe("generated test PDFs", () => {
  it("generates four fixtures and a manifest whose hashes match the bytes", async () => {
    expect(infos.map((i) => i.kind).sort()).toEqual(["corrupt", "multipage", "restricted", "searchable"]);
    for (const i of infos) {
      const bytes = await readFile(path.join(dir, i.file));
      expect(sha256Hex(bytes)).toBe(i.sha256);
      expect(bytes.length).toBe(i.bytes);
      expect(looksLikePdf(bytes)).toBe(true);
    }
    expect(new Set(infos.map((i) => i.sha256)).size).toBe(infos.length);
  });

  it("is deterministic", async () => {
    const other = await mkdtemp(path.join(os.tmpdir(), "bookie-pdf-"));
    try {
      const again = await generateTestPdfs(other);
      expect(again.map((i) => i.sha256)).toEqual(infos.map((i) => i.sha256));
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it.each(["searchable", "multipage", "restricted"] as const)("%s parses with the declared page count and searchable text", async (kind) => {
    const i = info(kind);
    const { doc, close } = await load(i.file);
    expect(doc.numPages).toBe(i.pages);
    await close();
    const text = (await textOfAllPages(i.file)).toLowerCase();
    expect(text).toContain(i.searchPhrase.toLowerCase());
  });

  it("multipage has more than 20 pages", () => {
    expect(info("multipage").pages).toBeGreaterThan(20);
  });

  it("corrupt fixture has a PDF header but cannot be parsed", async () => {
    await expect(load("corrupt.pdf")).rejects.toThrow();
  });
});
