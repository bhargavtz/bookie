"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Bookmark } from "@/lib/reader-state";
import styles from "./reader.module.css";

type OutlineNode = { title: string; dest: string | unknown[] | null; items: OutlineNode[] };

const THUMB_WIDTH = 132;

function Thumbnail({ doc, pageNumber, current, onOpen }: { doc: PDFDocumentProxy; pageNumber: number; current: boolean; onOpen: (page: number) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = buttonRef.current;
    if (el === null) return undefined;
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((e) => e.isIntersecting)), { rootMargin: "200px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    if (!visible) {
      canvas.width = 0;
      canvas.height = 0;
      return undefined;
    }
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: THUMB_WIDTH / unit.width });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, viewport });
        await task.promise;
      } catch {
        // A thumbnail is decorative: a failure leaves the placeholder.
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, visible]);

  return (
    <button ref={buttonRef} type="button" className={styles.thumb} aria-current={current ? "page" : undefined} onClick={() => onOpen(pageNumber)}>
      <canvas ref={canvasRef} className={styles.thumbCanvas} style={{ minHeight: visible ? undefined : 170 }} />
      <span>{pageNumber}</span>
    </button>
  );
}

export function Thumbnails({ doc, numPages, current, onOpen }: { doc: PDFDocumentProxy; numPages: number; current: number; onOpen: (page: number) => void }) {
  return (
    <div className={styles.thumbs}>
      {Array.from({ length: numPages }, (_, i) => (
        <Thumbnail key={i + 1} doc={doc} pageNumber={i + 1} current={current === i + 1} onOpen={onOpen} />
      ))}
    </div>
  );
}

export function Outline({ doc, onOpen }: { doc: PDFDocumentProxy; onOpen: (page: number) => void }) {
  const [outline, setOutline] = useState<OutlineNode[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    doc
      .getOutline()
      .then((result) => {
        if (!cancelled) setOutline(result as OutlineNode[] | null);
      })
      .catch(() => {
        if (!cancelled) setOutline(null);
      });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  async function open(dest: OutlineNode["dest"]): Promise<void> {
    try {
      const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
      const target = explicit?.[0];
      if (target === undefined || target === null) return;
      const index = typeof target === "number" ? target : await doc.getPageIndex(target as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
      onOpen(index + 1);
    } catch {
      // Broken destination: ignore, the reader stays where it is.
    }
  }

  if (outline === undefined) return <p className={styles.panelNote}>Loading outline</p>;
  if (outline === null || outline.length === 0) return <p className={styles.panelNote}>This book has no outline.</p>;
  const render = (nodes: OutlineNode[]) => (
    <ul className={styles.outlineList}>
      {nodes.map((node, index) => (
        <li key={`${index}-${node.title}`}>
          {node.dest === null ? (
            <span className={styles.outlineLabel}>{node.title}</span>
          ) : (
            <button type="button" className={styles.outlineLink} onClick={() => void open(node.dest)}>
              {node.title}
            </button>
          )}
          {node.items.length > 0 ? render(node.items) : null}
        </li>
      ))}
    </ul>
  );
  return <nav aria-label="Outline">{render(outline)}</nav>;
}

export function Bookmarks({ bookmarks, current, onOpen, onToggle }: { bookmarks: Bookmark[]; current: number; onOpen: (page: number) => void; onToggle: () => void }) {
  const hasCurrent = bookmarks.some((b) => b.page === current);
  return (
    <div>
      <button type="button" className={styles.wideButton} onClick={onToggle}>
        {hasCurrent ? `Remove bookmark on page ${current}` : `Bookmark page ${current}`}
      </button>
      {bookmarks.length === 0 ? (
        <p className={styles.panelNote}>No bookmarks yet. They are stored in this browser only.</p>
      ) : (
        <ul className={styles.outlineList}>
          {bookmarks.map((b) => (
            <li key={b.page}>
              <button type="button" className={styles.outlineLink} onClick={() => onOpen(b.page)}>
                Page {b.page}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
