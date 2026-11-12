import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { cx } from "@/components/ui/cx";

/** Header, main landmark (target of the skip link) and footer for every public page. */
export function PageShell({
  currentPath,
  children,
  className,
}: {
  currentPath?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <SiteHeader {...(currentPath === undefined ? {} : { currentPath })} />
      <main id="main-content" className={cx("mx-auto w-full max-w-content px-4 pt-10 sm:px-6 lg:px-8", className)}>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

/** Page title block: optional eyebrow, h1 and intro. */
export function PageHeading({ eyebrow, title, intro }: { eyebrow?: string; title: string; intro?: string }) {
  return (
    <header className="mb-10 flex max-w-prose flex-col gap-3">
      {eyebrow ? <p className="text-xs font-semibold tracking-[0.14em] text-accent-ink uppercase">{eyebrow}</p> : null}
      <h1 className="text-4xl text-ink">{title}</h1>
      {intro ? <p className="text-lg text-ink-muted">{intro}</p> : null}
    </header>
  );
}

export function Breadcrumbs({ items }: { items: ReadonlyArray<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-muted">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="text-ink-muted hover:text-ink">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
