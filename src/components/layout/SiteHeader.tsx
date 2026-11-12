import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { isActivePath, primaryNavigation, type NavItem } from "./navigation";

function NavList({ items, currentPath, className }: { items: readonly NavItem[]; currentPath?: string; className?: string }) {
  return (
    <ul className={cx("flex flex-col gap-1 md:flex-row md:items-center", className)}>
      {items.map((item) => {
        const active = isActivePath(item.href, currentPath);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "inline-flex min-h-11 items-center rounded-pill px-4 text-sm font-medium transition-colors duration-[var(--duration-fast)] md:min-h-9",
                active ? "bg-accent-subtle text-accent-ink" : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Sticky site header. Desktop shows inline links; below md the links move into a
 * disclosure built on <details>, which works without JavaScript and is keyboard
 * operable by default. Pass `currentPath` to mark the active page.
 */
export function SiteHeader({ currentPath }: { currentPath?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-canvas/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="font-display text-2xl tracking-tight text-ink">
          Bookie
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <NavList items={primaryNavigation} currentPath={currentPath} />
        </nav>

        <details className="group relative md:hidden">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-pill border border-border-strong bg-surface-raised px-4 text-sm font-medium text-ink shadow-sm [&::-webkit-details-marker]:hidden">
            Menu
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className="size-3 text-ink-muted transition-transform duration-[var(--duration-fast)] group-open:rotate-180"
            >
              <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <nav
            aria-label="Primary mobile"
            className="absolute right-0 top-full mt-2 w-60 rounded-lg border border-border bg-surface-raised p-2 shadow-lg"
          >
            <NavList items={primaryNavigation} currentPath={currentPath} />
          </nav>
        </details>
      </div>
    </header>
  );
}
