"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { readBookmarks, toggleBookmark, writeBookmarks } from "./bookmarks";

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Bookmark (guest, localStorage) and Share (Web Share API, clipboard fallback). */
export function BookActions({ slug, title }: { slug: string; title: string }) {
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // Storage exists only in the browser, so the saved state is read after mount.
    setSaved(readBookmarks(safeStorage()).includes(slug));
  }, [slug]);

  function onBookmark() {
    const storage = safeStorage();
    const next = toggleBookmark(readBookmarks(storage), slug);
    if (!writeBookmarks(storage, next)) {
      setMessage("Bookmarks cannot be saved in this browser.");
      return;
    }
    const nowSaved = next.includes(slug);
    setSaved(nowSaved);
    setMessage(nowSaved ? "Bookmarked on this device." : "Bookmark removed.");
  }

  async function onShare() {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage("Link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Could not share. Copy the address from the browser bar.");
    }
  }

  return (
    <>
      <Button variant="secondary" size="lg" aria-pressed={saved} onClick={onBookmark}>
        {saved ? "Bookmarked" : "Bookmark"}
      </Button>
      <Button variant="secondary" size="lg" onClick={() => void onShare()}>
        Share
      </Button>
      <p role="status" aria-live="polite" className="basis-full text-sm text-ink-muted empty:hidden">
        {message}
      </p>
    </>
  );
}
