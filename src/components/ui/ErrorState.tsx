import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Shown when something failed. Announced as an alert. Say what happened in plain
 * words and offer one way forward. `reference` is an optional support code; it
 * must never contain stack traces or internal details.
 */
export function ErrorState({
  title,
  description,
  action,
  reference,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  reference?: string;
  className?: string;
}) {
  return (
    <section
      role="alert"
      className={cx(
        "flex flex-col gap-4 rounded-lg border border-danger/40 bg-danger-subtle px-6 py-8",
        className,
      )}
    >
      <div className="flex max-w-prose flex-col gap-2">
        <h2 className="text-2xl text-ink">{title}</h2>
        {description ? <p className="text-base text-ink-muted">{description}</p> : null}
        {reference ? (
          <p className="text-xs font-medium tracking-wide text-ink-muted">Reference: {reference}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </section>
  );
}
