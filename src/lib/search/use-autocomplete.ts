"use client";

import { useEffect, useState } from "react";
import type { Suggestion } from "./types";

export const AUTOCOMPLETE_MIN_LENGTH = 2;
export const AUTOCOMPLETE_DELAY_MS = 250;

/** The trimmed input if it is long enough to query, otherwise null. Pure so it can be tested without React. */
export function autocompleteTerm(input: string, minLength: number = AUTOCOMPLETE_MIN_LENGTH): string | null {
  const term = input.trim();
  return term.length >= minLength ? term : null;
}

/** Value that follows `value` only after it has been stable for `delayMs`. */
export function useDebouncedValue<T>(value: T, delayMs: number = AUTOCOMPLETE_DELAY_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type AutocompleteState = {
  suggestions: Suggestion[];
  status: "idle" | "loading" | "ready" | "error";
};

/**
 * Debounced autocomplete. Only the latest input is requested: older in-flight
 * requests are aborted so a slow response can never overwrite a newer one.
 */
export function useAutocomplete(input: string, options: { delayMs?: number; endpoint?: string } = {}): AutocompleteState {
  const { delayMs = AUTOCOMPLETE_DELAY_MS, endpoint = "/api/search/autocomplete" } = options;
  const term = autocompleteTerm(useDebouncedValue(input, delayMs));
  const [state, setState] = useState<AutocompleteState>({ suggestions: [], status: "idle" });

  useEffect(() => {
    if (term === null) {
      setState({ suggestions: [], status: "idle" });
      return;
    }
    const controller = new AbortController();
    setState((previous) => ({ suggestions: previous.suggestions, status: "loading" }));
    fetch(`${endpoint}?${new URLSearchParams({ q: term }).toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("autocomplete request failed");
        const body = (await response.json()) as { suggestions?: Suggestion[] };
        setState({ suggestions: body.suggestions ?? [], status: "ready" });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ suggestions: [], status: "error" });
      });
    return () => controller.abort();
  }, [term, endpoint]);

  return state;
}
