import { cx } from "./cx";

/**
 * Loading placeholder. Decorative by default (aria-hidden). Pass `label` on the
 * block that stands for the whole loading region so screen readers get one
 * status message instead of silence. The shimmer stops under reduced motion.
 */
export function SkeletonBlock({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        "relative overflow-hidden rounded-md bg-surface-sunken",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[bk-shimmer_1.6s_var(--ease-out)_infinite] before:bg-linear-to-r before:from-transparent before:via-surface-raised/70 before:to-transparent motion-reduce:before:animate-none",
        className,
      )}
    />
  );
}
