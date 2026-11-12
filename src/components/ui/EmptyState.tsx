import type { ReactNode } from "react";
import { cx } from "./cx";

/** Shown when a list or search legitimately has no results. Offer a next step where one exists. */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  /** Decorative visual. Must not be the only carrier of meaning. */
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "flex flex-col items-center gap-4 rounded-lg border border-dashed border-border-strong bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-accent-ink">
          {icon}
        </div>
      ) : null}
      <div className="flex max-w-prose flex-col gap-2">
        <h2 className="text-2xl text-ink">{title}</h2>
        {description ? <p className="text-base text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </section>
  );
}
