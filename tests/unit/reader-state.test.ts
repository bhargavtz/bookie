import { describe, expect, it } from "vitest";
import {
  clampPage,
  emptyState,
  MAX_BOOKMARKS_PER_BOOK,
  MAX_TRACKED_BOOKS,
  READER_STATE_KEY,
  readState,
  savedPage,
  withBookmarkToggled,
  withPreferences,
  withProgress,
  writeState,
} from "@/lib/reader-state";

const memoryStorage = (initial?: string): Storage & { raw: () => string | null } => {
  let value: string | null = initial ?? null;
  return {
    getItem: (key: string) => (key === READER_STATE_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === READER_STATE_KEY) value = next;
    },
    raw: () => value,
  } as Storage & { raw: () => string | null };
};

describe("readState", () => {
  it("returns the empty state when storage is missing, empty, corrupt or the wrong shape", () => {
    expect(readState(null)).toEqual(emptyState());
    expect(readState(memoryStorage())).toEqual(emptyState());
    expect(readState(memoryStorage("{not json"))).toEqual(emptyState());
    expect(readState(memoryStorage(JSON.stringify({ version: 2 })))).toEqual(emptyState());
    expect(readState(memoryStorage(JSON.stringify({ version: 1, preferences: { theme: "neon" }, books: {} })))).toEqual(emptyState());
    expect(readState(memoryStorage(JSON.stringify({ version: 1, preferences: {}, books: { a: { page: 0, updatedAt: 1 } } })))).toEqual(emptyState());
  });

  it("does not throw when storage throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readState(throwing)).toEqual(emptyState());
  });

  it("refuses oversized payloads", () => {
    expect(readState(memoryStorage("x".repeat(600_000)))).toEqual(emptyState());
  });

  it("round-trips a valid state", () => {
    const storage = memoryStorage();
    const state = withProgress(emptyState(), "book-a", 7, 20, 1000);
    expect(writeState(storage, state)).toBe(true);
    expect(readState(storage)).toEqual(state);
  });
});

describe("writeState", () => {
  it("reports failure instead of throwing", () => {
    expect(writeState({ setItem: () => { throw new Error("quota"); } }, emptyState())).toBe(false);
    expect(writeState(null, emptyState())).toBe(false);
  });

  it("keeps only the most recently read books when over the cap", () => {
    let state = emptyState();
    for (let i = 0; i < MAX_TRACKED_BOOKS + 5; i++) state = withProgress(state, `b${i}`, 1, 10, i);
    const storage = memoryStorage();
    writeState(storage, state);
    const stored = readState(storage);
    expect(Object.keys(stored.books)).toHaveLength(MAX_TRACKED_BOOKS);
    expect(stored.books["b0"]).toBeUndefined();
    expect(stored.books[`b${MAX_TRACKED_BOOKS + 4}`]).toBeDefined();
  });
});

describe("reducers", () => {
  it.each([
    [5, 10, 5],
    [0, 10, 1],
    [-3, 10, 1],
    [99, 10, 10],
    [2.9, 10, 2],
    [Number.NaN, 10, 1],
    [500, undefined, 500],
  ])("clampPage(%s, %s) = %s", (page, total, expected) => {
    expect(clampPage(page, total)).toBe(expected);
  });

  it("saves progress and reads it back; a new page keeps bookmarks", () => {
    let state = withBookmarkToggled(emptyState(), "a", 3, 1);
    state = withProgress(state, "a", 4, 10, 2);
    expect(savedPage(state, "a")).toBe(4);
    expect(state.books["a"]?.bookmarks.map((b) => b.page)).toEqual([3]);
    expect(savedPage(state, "other")).toBeNull();
  });

  it("toggles bookmarks on and off, sorted by page and capped", () => {
    let state = emptyState();
    state = withBookmarkToggled(state, "a", 9, 1);
    state = withBookmarkToggled(state, "a", 2, 2);
    expect(state.books["a"]?.bookmarks.map((b) => b.page)).toEqual([2, 9]);
    state = withBookmarkToggled(state, "a", 9, 3);
    expect(state.books["a"]?.bookmarks.map((b) => b.page)).toEqual([2]);
    for (let p = 1; p <= MAX_BOOKMARKS_PER_BOOK + 10; p++) state = withBookmarkToggled(state, "cap", p, p);
    expect(state.books["cap"]?.bookmarks.length).toBe(MAX_BOOKMARKS_PER_BOOK);
  });

  it("updates preferences without touching books", () => {
    const state = withPreferences(withProgress(emptyState(), "a", 2, 5, 1), { theme: "dark", zoomMode: "custom", zoom: 1.5 });
    expect(state.preferences).toEqual({ theme: "dark", zoomMode: "custom", zoom: 1.5 });
    expect(savedPage(state, "a")).toBe(2);
  });
});
