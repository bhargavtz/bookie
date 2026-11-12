"use client";

/**
 * The only place pdfjs-dist is imported, and only dynamically in the browser
 * (pdf.js touches browser globals at import time). The worker, CMaps, fonts and
 * wasm helpers are served from this origin under /pdfjs/<version>/ (copied by
 * scripts/copy-pdfjs-assets.mjs), so worker-src 'self' is enough.
 *
 * pdfjs-dist 6.x has no `isEvalSupported` option (nothing to disable); the
 * mitigation for crafted PDFs is the exact version pin plus upload validation
 * (docs/wiki/decision-reader-and-state.md, update 2026-11-11).
 */
import type * as PdfJs from "pdfjs-dist";

export type PdfJsModule = typeof PdfJs;

let loading: Promise<PdfJsModule> | null = null;

export function loadPdfJs(): Promise<PdfJsModule> {
  loading ??= import("pdfjs-dist").then((module) => {
    module.GlobalWorkerOptions.workerSrc = `/pdfjs/${module.version}/pdf.worker.min.mjs`;
    return module;
  });
  loading.catch(() => {
    loading = null; // allow a retry after a failed chunk load
  });
  return loading;
}

export function assetBase(pdfjs: PdfJsModule): string {
  return `/pdfjs/${pdfjs.version}/`;
}
