"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  emptyState,
  READER_STATE_KEY,
  readState,
  withBookmarkToggled,
  withPreferences,
  withProgress,
  writeState,
  type ReaderPreferences,
  type ReaderState,
} from "@/lib/reader-state";

/** localStorage-backed external store: SSR-safe (server snapshot is empty) and synced across tabs. */

const SERVER_SNAPSHOT = emptyState();
const listeners = new Set<() => void>();
let cache: ReaderState | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function snapshot(): ReaderState {
  cache ??= readState(storage());
  return cache;
}

function commit(next: ReaderState): void {
  cache = next;
  writeState(storage(), next);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === READER_STATE_KEY || event.key === null) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useReaderState(slug: string) {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const saveProgress = useCallback(
    (page: number, totalPages: number) => commit(withProgress(snapshot(), slug, page, totalPages, Date.now())),
    [slug],
  );
  const toggleBookmark = useCallback((page: number) => commit(withBookmarkToggled(snapshot(), slug, page, Date.now())), [slug]);
  const setPreferences = useCallback((patch: Partial<ReaderPreferences>) => commit(withPreferences(snapshot(), patch)), []);
  return { state, book: state.books[slug], saveProgress, toggleBookmark, setPreferences };
}
