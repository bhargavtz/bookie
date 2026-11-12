import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { hrefWith, type QueryValues } from "./links";

/** Sort choices as links (no JavaScript, shareable). Changing the sort resets the page. */
export function SortLinks({
  path,
  query,
  current,
  options,
}: {
  path: string;
  query: QueryValues;
  current: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <nav aria-label="Sort books" className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-ink-muted">Sort by</span>
      {options.map((option) => (
        <Link
          key={option.value}
          href={hrefWith(path, { ...query, sort: option.value, page: undefined })}
          aria-current={option.value === current ? "true" : undefined}
          className={cx(
            "inline-flex min-h-9 items-center rounded-pill border px-3.5 text-sm font-medium no-underline",
            option.value === current ? "border-transparent bg-accent-subtle text-accent-ink" : "border-border-strong text-ink hover:bg-surface-sunken",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
