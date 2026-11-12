"use client";

import { useCallback, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

export type SearchHit = { page: number; snippet: string };
export type SearchStatus = { state: "idle" } | { state: "running"; scanned: number } | { state: "done" };

const MAX_HITS = 300;
const CONTEXT = 40;

/** Pure: finds case-insensitive occurrences and returns short snippets. */
export function findInText(text: string, query: string, limit: number): string[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const haystack = text.toLowerCase();
  const out: string[] = [];
  let from = 0;
  while (out.length < limit) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    const start = Math.max(at - CONTEXT, 0);
    out.push(text.slice(start, at + needle.length + CONTEXT).replace(/\s+/g, " ").trim());
    from = at + needle.length;
  }
  return out;
}

/** Document-wide text search. Page text is cached; a new query cancels the previous scan. */
export function useTextSearch(doc: PDFDocumentProxy | null) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<SearchStatus>({ state: "idle" });
  const cache = useRef(new Map<number, string>());
  const token = useRef(0);

  const run = useCallback(
    async (query: string) => {
      const mine = ++token.current;
      setHits([]);
      if (doc === null || query.trim().length < 2) {
        setStatus({ state: "idle" });
        return;
      }
      const found: SearchHit[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        if (token.current !== mine) return;
        let text = cache.current.get(pageNumber);
        if (text === undefined) {
          try {
            const page = await doc.getPage(pageNumber);
            const content = await page.getTextContent();
            text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
          } catch {
            text = "";
          }
          cache.current.set(pageNumber, text);
        }
        for (const snippet of findInText(text, query, 5)) {
          if (found.length >= MAX_HITS) break;
          found.push({ page: pageNumber, snippet });
        }
        if (pageNumber % 4 === 0 || pageNumber === doc.numPages) {
          if (token.current !== mine) return;
          setHits([...found]);
          setStatus({ state: "running", scanned: pageNumber });
        }
        if (found.length >= MAX_HITS) break;
      }
      if (token.current === mine) {
        setHits(found);
        setStatus({ state: "done" });
      }
    },
    [doc],
  );

  const clear = useCallback(() => {
    token.current += 1;
    setHits([]);
    setStatus({ state: "idle" });
  }, []);

  return { hits, status, run, clear };
}
