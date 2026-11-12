import type { ReactNode } from "react";
import { cx } from "./cx";

export type CardTone = "raised" | "surface" | "sunken";

const tones: Record<CardTone, string> = {
  raised: "bg-surface-raised border-border shadow-sm",
  surface: "bg-surface border-border",
  sunken: "bg-surface-sunken border-transparent",
};

/**
 * Content container. `interactive` adds a hover lift for cards that wrap a
 * link; put the link inside (not the whole card) so the target stays clear.
 */
export function Card({
  tone = "raised",
  interactive = false,
  as: Element = "div",
  className,
  children,
}: {
  tone?: CardTone;
  interactive?: boolean;
  as?: "div" | "article" | "section" | "li";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Element
      className={cx(
        "rounded-lg border p-6",
        tones[tone],
        interactive &&
          "transition-[transform,box-shadow,border-color] duration-[var(--duration-base)] ease-[var(--ease-out)] hover:-translate-y-1 hover:border-border-strong hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      {children}
    </Element>
  );
}
