"use client";

import "pdfjs-dist/web/pdf_viewer.css";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { clampPage, savedPage } from "@/lib/reader-state";
import { Icon, type IconName } from "./Icon";
import { classifyLoadError, safeExternalHref, type LoadFailure } from "./load-errors";
import { PageCanvas } from "./PageCanvas";
import { assetBase, loadPdfJs, type PdfJsModule } from "./pdfjs";
import { useReaderState } from "./reader-store";
import { Bookmarks, Outline, Thumbnails } from "./Sidebar";
import { useTextSearch } from "./use-text-search";
import styles from "./reader.module.css";

export type PdfReaderProps = {
  slug: string;
  title: string;
  fileUrl: string;
  downloadUrl: string | null;
  externalSourceUrl: string | null;
  backHref: string;
};

type Panel = "thumbnails" | "outline" | "bookmarks" | "search";
type Phase =
  | { name: "loading" }
  | { name: "password"; incorrect: boolean }
  | { name: "ready"; doc: PDFDocumentProxy; pdfjs: PdfJsModule }
  | { name: "error"; failure: LoadFailure };

const PAGE_PADDING = 32;
const ZOOM_STEP = 1.15;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const PASSWORD_NEEDED = 1;

function ToolButton({ icon, label, onClick, pressed, disabled }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={styles.iconButton} onClick={onClick} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled}>
      <Icon name={icon} />
    </button>
  );
}

export function PdfReader({ slug, title, fileUrl, downloadUrl, externalSourceUrl, backHref }: PdfReaderProps) {
  const { state, book, saveProgress, toggleBookmark, setPreferences } = useReaderState(slug);
  const { theme, zoomMode, zoom } = state.preferences;

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const passwordCallback = useRef<((password: string) => void) | null>(null);
  const restored = useRef(false);
  const pendingRestore = useRef<number | null>(null);
  const savedPref = useRef(state);
  savedPref.current = state;

  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [downloaded, setDownloaded] = useState<{ loaded: number; total: number } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [panel, setPanel] = useState<Panel | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [sizes, setSizes] = useState<Map<number, { width: number; height: number }>>(new Map());
  const [rendering, setRendering] = useState(0);
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const doc = phase.name === "ready" ? phase.doc : null;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const search = useTextSearch(doc);
  const externalHref = safeExternalHref(externalSourceUrl);

  // Load (and reload on retry). The loading task owns the worker connection and is destroyed on exit.
  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    setPhase({ name: "loading" });
    setDownloaded(null);
    setSizes(new Map());
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const base = assetBase(pdfjs);
        task = pdfjs.getDocument({
          url: fileUrl,
          withCredentials: false,
          cMapUrl: `${base}cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${base}standard_fonts/`,
          iccUrl: `${base}iccs/`,
          wasmUrl: `${base}wasm/`,
          enableXfa: false,
        });
        task.onProgress = ({ loaded, total }: { loaded: number; total?: number }) => {
          if (!cancelled) setDownloaded({ loaded, total: total ?? 0 });
        };
        task.onPassword = (update: (password: string) => void, reason: number) => {
          passwordCallback.current = update;
          if (!cancelled) setPhase({ name: "password", incorrect: reason !== PASSWORD_NEEDED });
        };
        const loaded = await task.promise;
        if (cancelled) return;
        passwordCallback.current = null;
        setNumPages(loaded.numPages);
        setPhase({ name: "ready", doc: loaded, pdfjs });
      } catch (error) {
        if (!cancelled) setPhase({ name: "error", failure: classifyLoadError(error) });
      }
    })();
    return () => {
      cancelled = true;
      passwordCallback.current = null;
      void task?.destroy();
    };
  }, [fileUrl, attempt]);

  // Opening search (key or button) puts the caret in the box so typing works immediately.
  useEffect(() => {
    if (panel === "search") searchInputRef.current?.focus();
  }, [panel, doc]);

  // Track the scroller size for fit-width / fit-page.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el === null) return undefined;
    const measure = (): void => setViewport({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [phase.name]);

  useEffect(() => {
    const onChange = (): void => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const firstSize = useMemo(() => sizes.get(1) ?? sizes.values().next().value ?? { width: 612, height: 792 }, [sizes]);
  const scale = useMemo(() => {
    const availableWidth = Math.max(viewport.width - PAGE_PADDING, 120);
    const availableHeight = Math.max(viewport.height - PAGE_PADDING, 120);
    if (zoomMode === "fit-width") return availableWidth / firstSize.width;
    if (zoomMode === "fit-page") return Math.min(availableWidth / firstSize.width, availableHeight / firstSize.height);
    return zoom;
  }, [viewport, zoomMode, zoom, firstSize]);

  const placeholder = useMemo(() => ({ width: firstSize.width * scale, height: firstSize.height * scale }), [firstSize, scale]);

  const scrollToPage = useCallback((page: number, behavior: ScrollBehavior = "auto") => {
    const target = scrollerRef.current?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    target?.scrollIntoView({ block: "start", behavior });
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      const next = clampPage(page, numPages);
      setCurrentPage(next);
      setPageInput(String(next));
      scrollToPage(next);
    },
    [numPages, scrollToPage],
  );

  const onPageSize = useCallback((pageNumber: number, width: number, height: number) => {
    setSizes((previous) => {
      const known = previous.get(pageNumber);
      if (known !== undefined && known.width === width && known.height === height) return previous;
      const next = new Map(previous);
      next.set(pageNumber, { width, height });
      return next;
    });
  }, []);

  const onRenderState = useCallback((delta: 1 | -1) => setRendering((n) => Math.max(n + delta, 0)), []);

  // Restore the saved position once the document is ready, and again when pages above it get their true sizes.
  useEffect(() => {
    if (phase.name !== "ready") return;
    if (restored.current) return;
    // Read at ready time: during hydration the store still reports the empty server snapshot.
    const target = savedPage(savedPref.current, slug);
    if (target === null || target <= 1) {
      restored.current = true;
      return;
    }
    const page = clampPage(target, numPages);
    pendingRestore.current = page;
    setCurrentPage(page);
    setPageInput(String(page));
    const frame = requestAnimationFrame(() => scrollToPage(page));
    const settle = window.setTimeout(() => {
      scrollToPage(page);
      pendingRestore.current = null;
      restored.current = true;
    }, 900);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [phase.name, numPages, scrollToPage, slug]);

  useEffect(() => {
    if (pendingRestore.current !== null) scrollToPage(pendingRestore.current);
  }, [sizes, scale, scrollToPage]);

  // Current page = the page covering the middle of the scroll area.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null || phase.name !== "ready") return undefined;
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const probe = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.35;
      let best = 1;
      for (const el of scroller.querySelectorAll<HTMLElement>("[data-page]")) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= probe) best = Number(el.dataset.page);
        if (rect.top > probe) break;
      }
      if (pendingRestore.current === null) {
        setCurrentPage(best);
        setPageInput(String(best));
      }
    };
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [phase.name]);

  // Persist reading position (debounced).
  useEffect(() => {
    if (phase.name !== "ready" || numPages === 0) return undefined;
    const timer = window.setTimeout(() => saveProgress(currentPage, numPages), 500);
    return () => window.clearTimeout(timer);
  }, [phase.name, currentPage, numPages, saveProgress]);

  const setZoomValue = useCallback(
    (value: number) => setPreferences({ zoomMode: "custom", zoom: Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM) }),
    [setPreferences],
  );
  const zoomBy = useCallback((factor: number) => setZoomValue(scale * factor), [scale, setZoomValue]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement !== null) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  }, []);

  const openPanel = useCallback((next: Panel) => setPanel((current) => (current === next ? null : next)), []);

  // Keyboard navigation (ignored while typing or with modifiers other than Ctrl/Cmd+F).
  useEffect(() => {
    if (phase.name !== "ready") return undefined;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing = target !== null && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setPanel("search");
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
      const scroller = scrollerRef.current;
      const panned = scroller !== null && scroller.scrollWidth > scroller.clientWidth + 1;
      switch (event.key) {
        case "PageDown":
        case "n":
          goToPage(currentPage + 1);
          break;
        case "PageUp":
        case "p":
          goToPage(currentPage - 1);
          break;
        case "ArrowRight":
          if (panned) return;
          goToPage(currentPage + 1);
          break;
        case "ArrowLeft":
          if (panned) return;
          goToPage(currentPage - 1);
          break;
        case "Home":
          goToPage(1);
          break;
        case "End":
          goToPage(numPages);
          break;
        case "+":
        case "=":
          zoomBy(ZOOM_STEP);
          break;
        case "-":
          zoomBy(1 / ZOOM_STEP);
          break;
        case "0":
          setPreferences({ zoomMode: "fit-width" });
          break;
        case "9":
          setPreferences({ zoomMode: "fit-page" });
          break;
        case "f":
          toggleFullscreen();
          break;
        case "d":
          setPreferences({ theme: theme === "dark" ? "light" : "dark" });
          break;
        case "b":
          toggleBookmark(currentPage);
          break;
        case "/":
          event.preventDefault();
          setPanel("search");
          break;
        case "[":
          setPanel((current) => (current === null ? "thumbnails" : null));
          break;
        case "Escape":
          setToolsOpen(false);
          return;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.name, currentPage, numPages, goToPage, zoomBy, setPreferences, theme, toggleBookmark, toggleFullscreen]);

  function submitPage(event: FormEvent): void {
    event.preventDefault();
    const value = Number.parseInt(pageInput, 10);
    if (Number.isFinite(value)) goToPage(value);
    else setPageInput(String(currentPage));
  }

  function submitPassword(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("password");
    if (typeof value === "string" && value.length > 0) passwordCallback.current?.(value);
  }

  const bookmarked = book?.bookmarks.some((b) => b.page === currentPage) ?? false;
  const progress =
    phase.name === "loading" && downloaded !== null && downloaded.total > 0 ? Math.min(downloaded.loaded / downloaded.total, 1) : null;
  const busy = phase.name === "loading" || rendering > 0;

  const fallbackLink =
    externalHref !== null ? (
      <a className={styles.linkButton} href={externalHref} target="_blank" rel="noopener noreferrer">
        Open the authorised source <Icon name="external" />
      </a>
    ) : null;

  return (
    <div ref={rootRef} className={styles.reader} data-theme={theme} data-fullscreen={fullscreen || undefined}>
      <div className={styles.progress} role="progressbar" aria-label="Loading and rendering" aria-hidden={!busy} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress === null ? undefined : Math.round(progress * 100)} data-active={busy || undefined}>
        <div className={styles.progressBar} data-indeterminate={progress === null || undefined} style={progress === null ? undefined : { width: `${progress * 100}%` }} />
      </div>

      <header className={styles.topbar}>
        <a className={styles.iconButton} href={backHref} aria-label="Back to the library" title="Back to the library">
          <Icon name="back" />
        </a>
        <h1 className={styles.title}>{title}</h1>

        <div className={styles.tools} data-open={toolsOpen || undefined} id="reader-tools">
          <div className={styles.group} role="group" aria-label="Zoom">
            <ToolButton icon="minus" label="Zoom out" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={doc === null} />
            <span className={styles.zoomValue} aria-live="polite">{Math.round(scale * 100)}%</span>
            <ToolButton icon="plus" label="Zoom in" onClick={() => zoomBy(ZOOM_STEP)} disabled={doc === null} />
            <ToolButton icon="fitWidth" label="Fit width" onClick={() => setPreferences({ zoomMode: "fit-width" })} pressed={zoomMode === "fit-width"} disabled={doc === null} />
            <ToolButton icon="fitPage" label="Fit page" onClick={() => setPreferences({ zoomMode: "fit-page" })} pressed={zoomMode === "fit-page"} disabled={doc === null} />
          </div>
          <div className={styles.group} role="group" aria-label="Reading tools">
            <ToolButton icon="search" label="Search in book" onClick={() => openPanel("search")} pressed={panel === "search"} disabled={doc === null} />
            <ToolButton icon="bookmark" label={bookmarked ? "Remove bookmark" : "Bookmark this page"} onClick={() => toggleBookmark(currentPage)} pressed={bookmarked} disabled={doc === null} />
            <ToolButton icon={theme === "dark" ? "sun" : "moon"} label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setPreferences({ theme: theme === "dark" ? "light" : "dark" })} />
            <ToolButton icon="expand" label={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen} pressed={fullscreen} />
            {downloadUrl !== null ? (
              <a className={styles.iconButton} href={downloadUrl} download aria-label="Download PDF" title="Download PDF">
                <Icon name="download" />
              </a>
            ) : null}
          </div>
        </div>

        <ToolButton icon="panel" label="Pages, outline and bookmarks" onClick={() => openPanel(panel === null ? "thumbnails" : panel)} pressed={panel !== null} disabled={doc === null} />
        <button type="button" className={`${styles.iconButton} ${styles.moreButton}`} onClick={() => setToolsOpen((open) => !open)} aria-expanded={toolsOpen} aria-controls="reader-tools" aria-label="Reader tools" title="Reader tools">
          <Icon name={toolsOpen ? "close" : "more"} />
        </button>
      </header>

      <div className={styles.body}>
        {panel !== null && doc !== null ? (
          <aside className={styles.sidebar} aria-label="Book navigation">
            <div className={styles.tabs} role="tablist">
              {(["thumbnails", "outline", "bookmarks", "search"] as const).map((name) => (
                <button key={name} type="button" role="tab" aria-selected={panel === name} className={styles.tab} onClick={() => setPanel(name)}>
                  {name === "thumbnails" ? "Pages" : name[0]?.toUpperCase() + name.slice(1)}
                </button>
              ))}
              <button type="button" className={`${styles.iconButton} ${styles.closePanel}`} onClick={() => setPanel(null)} aria-label="Close panel">
                <Icon name="close" />
              </button>
            </div>
            <div className={styles.panelBody} role="tabpanel">
              {panel === "thumbnails" ? <Thumbnails doc={doc} numPages={numPages} current={currentPage} onOpen={goToPage} /> : null}
              {panel === "outline" ? <Outline doc={doc} onOpen={goToPage} /> : null}
              {panel === "bookmarks" ? <Bookmarks bookmarks={book?.bookmarks ?? []} current={currentPage} onOpen={goToPage} onToggle={() => toggleBookmark(currentPage)} /> : null}
              {panel === "search" ? (
                <div>
                  <form
                    role="search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void search.run(query);
                    }}
                  >
                    <label className={styles.srOnly} htmlFor="reader-search">Search in this book</label>
                    <input ref={searchInputRef} id="reader-search" className={styles.searchInput} type="search" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value === "") search.clear(); }} placeholder="Search in this book" autoComplete="off" />
                  </form>
                  <p className={styles.panelNote} aria-live="polite">
                    {search.status.state === "running" ? `Searched ${search.status.scanned} of ${numPages} pages` : null}
                    {search.status.state === "done" ? `${search.hits.length === 0 ? "No matches" : `${search.hits.length} match${search.hits.length === 1 ? "" : "es"}`}` : null}
                    {search.status.state === "idle" && query.trim().length > 0 && query.trim().length < 2 ? "Type at least 2 characters." : null}
                  </p>
                  <ul className={styles.outlineList}>
                    {search.hits.map((hit, index) => (
                      <li key={`${hit.page}-${index}`}>
                        <button type="button" className={styles.outlineLink} onClick={() => goToPage(hit.page)}>
                          <strong>p. {hit.page}</strong> {hit.snippet}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}

        <main ref={scrollerRef} className={styles.scroller} tabIndex={0} aria-label={`${title}, reading area`}>
          {phase.name === "loading" ? (
            <div className={styles.skeleton} role="status" aria-label="Loading book">
              <div className={styles.skeletonPage} />
              <div className={styles.skeletonPage} />
            </div>
          ) : null}

          {phase.name === "password" ? (
            <form className={styles.message} onSubmit={submitPassword}>
              <h2>Password required</h2>
              <p>{phase.incorrect ? "That password was not correct. Try again." : "This PDF is password protected. Enter the password to read it."}</p>
              <label className={styles.srOnly} htmlFor="reader-password">PDF password</label>
              <input id="reader-password" name="password" type="password" className={styles.searchInput} autoComplete="off" required />
              <div className={styles.actions}>
                <button type="submit" className={styles.button}>Unlock</button>
                {fallbackLink}
              </div>
            </form>
          ) : null}

          {phase.name === "error" ? (
            <div className={styles.message} role="alert">
              <h2>This book cannot be shown</h2>
              <p>{phase.failure.message}</p>
              <div className={styles.actions}>
                {phase.failure.retryable ? (
                  <button type="button" className={styles.button} onClick={() => setAttempt((n) => n + 1)}>
                    Try again
                  </button>
                ) : null}
                {fallbackLink}
                <a className={styles.linkButton} href={backHref}>Back to the library</a>
              </div>
            </div>
          ) : null}

          {phase.name === "ready" ? (
            <div className={styles.pages}>
              {Array.from({ length: numPages }, (_, i) => {
                const known = sizes.get(i + 1);
                return (
                  <PageCanvas
                    key={i + 1}
                    pdfjs={phase.pdfjs}
                    doc={phase.doc}
                    pageNumber={i + 1}
                    scale={scale}
                    placeholder={known !== undefined ? { width: known.width * scale, height: known.height * scale } : placeholder}
                    highlight={panel === "search" ? query : ""}
                    onSize={onPageSize}
                    onRenderState={onRenderState}
                  />
                );
              })}
            </div>
          ) : null}
        </main>
      </div>

      {phase.name === "ready" ? (
        <footer className={styles.bottombar}>
          <ToolButton icon="prev" label="Previous page" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} />
          <form onSubmit={submitPage} className={styles.pageForm}>
            <label className={styles.srOnly} htmlFor="reader-page">Page number</label>
            <input id="reader-page" className={styles.pageInput} inputMode="numeric" pattern="[0-9]*" value={pageInput} onChange={(event) => setPageInput(event.target.value)} onFocus={(event) => event.target.select()} />
            <span aria-hidden="true">/ {numPages}</span>
            <span className={styles.srOnly}>of {numPages}</span>
          </form>
          <ToolButton icon="next" label="Next page" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} />
        </footer>
      ) : null}
    </div>
  );
}
