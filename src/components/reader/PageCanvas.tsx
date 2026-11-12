"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PdfJsModule } from "./pdfjs";
import styles from "./reader.module.css";

/** Upper bound on canvas pixels per page, to keep memory flat on huge pages or high zoom. */
const MAX_CANVAS_PIXELS = 16_000_000;

type Props = {
  pdfjs: PdfJsModule;
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  placeholder: { width: number; height: number };
  highlight: string;
  onSize: (pageNumber: number, width: number, height: number) => void;
  onRenderState: (delta: 1 | -1) => void;
};

/**
 * One page. It renders only while near the viewport and releases its canvas
 * (and pdf.js page resources) when it leaves, so memory stays bounded on long
 * documents. The text layer is transparent selectable text used for search
 * highlighting and copy.
 */
function PageCanvasBase({ pdfjs, doc, pageNumber, scale, placeholder, highlight, onSize, onRenderState }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const textDivs = useRef<HTMLElement[]>([]);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const highlightRef = useRef(highlight);
  useEffect(() => {
    highlightRef.current = highlight;
    applyHighlight(textDivs.current, highlight);
  }, [highlight]);


  useEffect(() => {
    const el = wrapperRef.current;
    if (el === null) return undefined;
    const observer = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { rootMargin: "150% 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textHost = textRef.current;
    if (canvas === null || textHost === null) return undefined;
    if (!near) {
      canvas.width = 0;
      canvas.height = 0;
      textHost.replaceChildren();
      textDivs.current = [];
      return undefined;
    }

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let textLayer: InstanceType<PdfJsModule["TextLayer"]> | null = null;
    onRenderState(1);

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const unit = page.getViewport({ scale: 1 });
        onSize(pageNumber, unit.width, unit.height);
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setSize({ width: viewport.width, height: viewport.height });

        renderTask = page.render({
          canvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
        if (cancelled) return;

        textHost.replaceChildren();
        textHost.style.setProperty("--scale-factor", String(scale));
        textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textHost, viewport });
        await textLayer.render();
        if (cancelled) return;
        textDivs.current = textLayer.textDivs;
        applyHighlight(textDivs.current, highlightRef.current);
        setFailed(false);
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (!cancelled && name !== "RenderingCancelledException" && name !== "AbortException") setFailed(true);
      } finally {
        onRenderState(-1);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
    // highlight is applied by its own effect; including it would re-render the page on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, doc, pageNumber, scale, attempt, pdfjs]);

  const box = size ?? placeholder;
  return (
    <div
      ref={wrapperRef}
      className={styles.page}
      data-page={pageNumber}
      style={{ width: Math.floor(box.width), height: Math.floor(box.height) }}
      role="group"
      aria-label={`Page ${pageNumber}`}
    >
      <canvas ref={canvasRef} className={styles.canvas} />
      <div ref={textRef} className="textLayer" />
      {failed ? (
        <div className={styles.pageError} role="alert">
          <p>This page could not be drawn.</p>
          <button type="button" className={styles.button} onClick={() => setAttempt((n) => n + 1)}>
            Retry page
          </button>
        </div>
      ) : null}
    </div>
  );
}

function applyHighlight(divs: HTMLElement[], query: string): void {
  const needle = query.trim().toLowerCase();
  for (const div of divs) {
    div.classList.toggle(styles.hit ?? "hit", needle.length > 1 && (div.textContent ?? "").toLowerCase().includes(needle));
  }
}

export const PageCanvas = memo(PageCanvasBase);
