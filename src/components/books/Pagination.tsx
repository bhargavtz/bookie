import Link from "next/link";
import { cx } from "@/components/ui/cx";
import { hrefWith, pagerItems, type QueryValues } from "./links";

/** Numbered pager. Page 1 omits the `page` parameter so the first page has one canonical URL. */
export function Pagination({
  path,
  query,
  page,
  lastPage,
}: {
  path: string;
  query: QueryValues;
  page: number;
  lastPage: number;
}) {
  if (lastPage <= 1) return null;
  const hrefFor = (target: number) => hrefWith(path, { ...query, page: target <= 1 ? undefined : target });
  const linkClass =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill border px-3 text-sm font-medium no-underline";

  return (
    <nav aria-label="Pagination" className="mt-10">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {page > 1 ? (
            <Link rel="prev" href={hrefFor(page - 1)} className={cx(linkClass, "border-border-strong text-ink hover:bg-surface-sunken")}>
              Previous
            </Link>
          ) : null}
        </li>
        {pagerItems(page, lastPage).map((item, index) =>
          item === null ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-muted">
              &hellip;
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={cx(
                  linkClass,
                  item === page ? "border-transparent bg-accent text-on-accent" : "border-border-strong text-ink hover:bg-surface-sunken",
                )}
              >
                {item}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < lastPage ? (
            <Link rel="next" href={hrefFor(page + 1)} className={cx(linkClass, "border-border-strong text-ink hover:bg-surface-sunken")}>
              Next
            </Link>
          ) : null}
        </li>
      </ul>
    </nav>
  );
}
