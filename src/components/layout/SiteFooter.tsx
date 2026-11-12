import Link from "next/link";
import { footerNavigation } from "./navigation";

/**
 * Site footer with the About, Contact, Copyright, Licensing, Privacy and takedown
 * links. The copyright line states that titles belong to their rights holders;
 * it makes no claim about the site's own licence.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-content gap-12 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-8">
        <div className="flex max-w-prose flex-col gap-4">
          <p className="font-display text-3xl tracking-tight text-ink">Bookie</p>
          <p className="text-base text-ink-muted">
            A digital library of programming and computer science books, read in the browser.
          </p>
        </div>

        {footerNavigation.map((group) => (
          <nav key={group.heading} aria-label={group.heading} className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">{group.heading}</h2>
            <ul className="flex flex-col gap-2">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-base text-ink hover:text-accent-ink hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-border">
        <p className="mx-auto max-w-content px-4 py-6 text-sm text-ink-muted sm:px-6 lg:px-8">
          &copy; {year} Bookie. Each title remains the property of its rights holder.
        </p>
      </div>
    </footer>
  );
}
