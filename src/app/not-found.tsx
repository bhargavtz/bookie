import type { Metadata } from "next";
import { PageShell } from "@/components/home/PageShell";
import { SearchBox } from "@/components/home/SearchBox";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageShell>
      <section className="flex max-w-prose flex-col items-start gap-6 py-10">
        <p className="text-xs font-semibold tracking-[0.14em] text-accent-ink uppercase">Error 404</p>
        <h1 className="text-4xl">We could not find that page</h1>
        <p className="text-lg text-ink-muted">
          The address may be wrong, or the book may have been removed. Search the library, or go back to the start.
        </p>
        <SearchBox size="compact" className="max-w-xl" />
        <Button href="/library" variant="secondary">
          Browse the library
        </Button>
      </section>
    </PageShell>
  );
}
