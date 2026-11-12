import Link from "next/link";
import type { ReactNode } from "react";

/** A titled homepage section with an optional "view all" link. */
export function Shelf({
  id,
  title,
  intro,
  href,
  hrefLabel,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex max-w-prose flex-col gap-2">
          <h2 id={id} className="text-3xl sm:text-4xl">
            {title}
          </h2>
          {intro ? <p className="text-base text-ink-muted">{intro}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="min-h-11 content-center text-sm font-medium">
            {hrefLabel ?? "View all"}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
