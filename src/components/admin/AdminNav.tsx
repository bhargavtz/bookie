"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

export type AdminNavItem = { href: string; label: string };

/** Section navigation. The current section carries aria-current so it is announced, not only coloured. */
export function AdminNav({ items }: { items: readonly AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="md:sticky md:top-6">
      <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {items.map((item) => {
          const within = (href: string): boolean => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
          // A more specific sibling (Add book under Books) owns the highlight so only one item is current.
          const claimedBySibling = items.some((other) => other.href !== item.href && other.href.startsWith(`${item.href}/`) && within(other.href));
          const current = within(item.href) && !claimedBySibling;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cx(
                  "block rounded-md px-3 py-2 text-sm font-medium no-underline transition-colors",
                  current ? "bg-accent-subtle text-accent-ink" : "text-ink hover:bg-surface-sunken",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
