"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAutocomplete } from "@/lib/search/use-autocomplete";
import type { Suggestion } from "@/lib/search/types";
import { bookHref, categoryHref, hrefWith } from "@/components/books/links";
import { cx } from "@/components/ui/cx";

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  book: "Book",
  author: "Author",
  category: "Topic",
  technology: "Technology",
};

export function suggestionHref(suggestion: Suggestion): string {
  switch (suggestion.type) {
    case "book":
      return bookHref(suggestion.slug);
    case "category":
      return categoryHref(suggestion.slug);
    case "author":
      return hrefWith("/search", { author: suggestion.slug });
    case "technology":
      return hrefWith("/search", { technology: suggestion.slug });
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Search field with autocomplete from /api/search/autocomplete. Pressing "/" or
 * Ctrl/Cmd+K anywhere on the page focuses it. Without JavaScript the form still
 * submits to /search.
 */
export function SearchBox({
  initialValue = "",
  size = "hero",
  label = "Search the library",
  className,
}: {
  initialValue?: string;
  size?: "hero" | "compact";
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const { suggestions, status } = useAutocomplete(value);
  const showList = open && value.trim().length >= 2 && (suggestions.length > 0 || status === "ready" || status === "error");

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const isShortcut =
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target));
      if (!isShortcut) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "Enter" && showList) {
      const chosen = suggestions[active];
      if (chosen !== undefined) {
        event.preventDefault();
        setOpen(false);
        router.push(suggestionHref(chosen));
      }
    }
  }

  const isHero = size === "hero";

  return (
    <form
      action="/search"
      method="get"
      role="search"
      aria-label={label}
      className={cx("relative w-full", className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        {label}
      </label>
      <div
        className={cx(
          "flex items-center gap-3 rounded-pill border border-border-strong bg-surface-raised px-4 shadow-md transition-[border-color,box-shadow] focus-within:border-focus focus-within:ring-3 focus-within:ring-accent-subtle",
          isHero ? "h-14 sm:h-16 sm:px-6" : "h-11",
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5 shrink-0 text-ink-muted">
          <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          id={`${listId}-input`}
          name="q"
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-option-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          maxLength={200}
          placeholder="Search titles, authors and topics"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          className={cx(
            "min-w-0 flex-1 bg-transparent text-ink placeholder:text-ink-muted/70 focus:outline-none",
            isHero ? "text-lg" : "text-base",
          )}
        />
        <kbd
          aria-hidden="true"
          className="hidden shrink-0 rounded-sm border border-border-strong px-1.5 py-0.5 font-sans text-xs text-ink-muted sm:inline"
        >
          /
        </kbd>
        <button
          type="submit"
          className={cx(
            "shrink-0 rounded-pill bg-accent font-medium text-on-accent hover:bg-accent-hover",
            isHero ? "h-10 px-5 text-base sm:h-11" : "h-8 px-3.5 text-sm",
          )}
        >
          Search
        </button>
      </div>
      <p className="sr-only">Press slash, or Control or Command plus K, to jump to search.</p>

      <div
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!showList}
        className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
      >
        {suggestions.map((suggestion, index) => (
          <Link
            key={`${suggestion.type}:${suggestion.slug}`}
            id={`${listId}-option-${index}`}
            role="option"
            aria-selected={index === active}
            href={suggestionHref(suggestion)}
            onClick={() => setOpen(false)}
            className={cx(
              "flex min-h-11 items-center justify-between gap-3 rounded-md px-3 py-2 text-ink no-underline hover:bg-accent-subtle",
              index === active && "bg-accent-subtle",
            )}
          >
            <span className="truncate">{suggestion.label}</span>
            <span className="shrink-0 text-xs font-semibold tracking-wide text-ink-muted uppercase">
              {TYPE_LABEL[suggestion.type]}
            </span>
          </Link>
        ))}
        {suggestions.length === 0 && status === "ready" ? (
          <p className="px-3 py-3 text-sm text-ink-muted">No suggestions. Press Enter to search anyway.</p>
        ) : null}
        {status === "error" ? (
          <p className="px-3 py-3 text-sm text-ink-muted">Suggestions are unavailable. Press Enter to search.</p>
        ) : null}
      </div>
    </form>
  );
}
