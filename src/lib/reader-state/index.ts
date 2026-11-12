/**
 * Guest reader state (no accounts): reading position, bookmarks and reader
 * preferences kept in localStorage under one versioned key. Everything read
 * back is validated with zod, size-capped and survives a missing or throwing
 * storage (private windows, blocked site data). Pure functions over an injected
 * Storage so they are unit-testable; the React binding lives in
 * src/components/reader.
 */
import { z } from "zod";

export const READER_STATE_KEY = "bookie:reader:v1";
export const MAX_TRACKED_BOOKS = 200;
export const MAX_BOOKMARKS_PER_BOOK = 200;

export const readerThemes = ["light", "dark"] as const;
export const zoomModes = ["fit-width", "fit-page", "custom"] as const;

const pageNumber = z.number().int().min(1).max(100_000);

const bookStateSchema = z.object({
  page: pageNumber,
  totalPages: pageNumber.optional(),
  updatedAt: z.number().int().nonnegative(),
  bookmarks: z
    .array(z.object({ page: pageNumber, label: z.string().max(200).optional(), createdAt: z.number().int().nonnegative() }))
    .max(MAX_BOOKMARKS_PER_BOOK)
    .default([]),
});

const preferencesSchema = z.object({
  theme: z.enum(readerThemes).default("light"),
  zoomMode: z.enum(zoomModes).default("fit-width"),
  zoom: z.number().min(0.25).max(5).default(1),
});

const stateSchema = z.object({
  version: z.literal(1),
  preferences: preferencesSchema,
  books: z.record(z.string().max(96), bookStateSchema),
});

export type BookReaderState = z.infer<typeof bookStateSchema>;
export type ReaderPreferences = z.infer<typeof preferencesSchema>;
export type ReaderState = z.infer<typeof stateSchema>;
export type Bookmark = BookReaderState["bookmarks"][number];

export const DEFAULT_PREFERENCES: ReaderPreferences = { theme: "light", zoomMode: "fit-width", zoom: 1 };

export const emptyState = (): ReaderState => ({ version: 1, preferences: { ...DEFAULT_PREFERENCES }, books: {} });

/** Reads and validates; anything wrong (missing, corrupt, wrong shape, storage throws) yields the empty state. */
export function readState(storage: Pick<Storage, "getItem"> | null): ReaderState {
  if (storage === null) return emptyState();
  try {
    const raw = storage.getItem(READER_STATE_KEY);
    if (raw === null || raw.length > 512_000) return emptyState();
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyState();
  } catch {
    return emptyState();
  }
}

/** Keeps the most recently read books when over the cap. */
function capBooks(books: ReaderState["books"]): ReaderState["books"] {
  const entries = Object.entries(books);
  if (entries.length <= MAX_TRACKED_BOOKS) return books;
  entries.sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
  return Object.fromEntries(entries.slice(0, MAX_TRACKED_BOOKS));
}

/** Returns false when the write failed (quota, blocked storage); callers keep working in memory. */
export function writeState(storage: Pick<Storage, "setItem"> | null, state: ReaderState): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(READER_STATE_KEY, JSON.stringify({ ...state, books: capBooks(state.books) }));
    return true;
  } catch {
    return false;
  }
}

export function clampPage(page: number, totalPages: number | undefined): number {
  const upper = totalPages !== undefined && totalPages >= 1 ? totalPages : 100_000;
  return Math.min(Math.max(Math.trunc(Number.isFinite(page) ? page : 1), 1), upper);
}

export function withProgress(state: ReaderState, slug: string, page: number, totalPages: number | undefined, now: number): ReaderState {
  const previous = state.books[slug];
  const next: BookReaderState = {
    bookmarks: previous?.bookmarks ?? [],
    page: clampPage(page, totalPages),
    ...(totalPages !== undefined ? { totalPages } : {}),
    updatedAt: now,
  };
  return { ...state, books: { ...state.books, [slug]: next } };
}

export function withBookmarkToggled(state: ReaderState, slug: string, page: number, now: number): ReaderState {
  const previous = state.books[slug] ?? { page, updatedAt: now, bookmarks: [] };
  const exists = previous.bookmarks.some((b) => b.page === page);
  const bookmarks = exists
    ? previous.bookmarks.filter((b) => b.page !== page)
    : [...previous.bookmarks, { page, createdAt: now }].sort((a, b) => a.page - b.page).slice(0, MAX_BOOKMARKS_PER_BOOK);
  return { ...state, books: { ...state.books, [slug]: { ...previous, bookmarks } } };
}

export function withPreferences(state: ReaderState, patch: Partial<ReaderPreferences>): ReaderState {
  return { ...state, preferences: { ...state.preferences, ...patch } };
}

export function savedPage(state: ReaderState, slug: string): number | null {
  return state.books[slug]?.page ?? null;
}
