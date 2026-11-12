import type { ReactNode } from "react";

/** Readable long-form column for the static pages. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="flex max-w-prose flex-col gap-10 pb-4">{children}</div>;
}

export function ProseSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 text-lg text-ink">
      <h2 id={id} className="text-3xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Contact address from configuration, or a plain statement that none is set. Never invents one. */
export function ContactAddress({ email }: { email: string | undefined }) {
  return email === undefined ? (
    <p className="rounded-lg border border-dashed border-border-strong bg-surface px-4 py-3 text-base text-ink-muted">
      No contact address is configured for this site yet.
    </p>
  ) : (
    <p>
      Email: <a href={`mailto:${email}`}>{email}</a>
    </p>
  );
}
