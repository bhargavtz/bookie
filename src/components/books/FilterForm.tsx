import Link from "next/link";
import { BOOK_LEVELS, LICENSE_TYPES } from "@/contracts/enums";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { LEVEL_LABELS, LICENSE_LABELS } from "./links";

export type FilterValues = {
  q?: string | undefined;
  topic?: string | undefined;
  author?: string | undefined;
  level?: string | undefined;
  language?: string | undefined;
  year?: string | undefined;
  format?: string | undefined;
  license?: string | undefined;
  sort?: string | undefined;
};

export type SortOption = { value: string; label: string };

const fieldClass =
  "h-11 w-full rounded-md border border-border-strong bg-surface-raised px-3 text-base text-ink shadow-sm focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-accent-subtle focus:outline-none";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Filter and sort controls as a plain GET form, so it works without JavaScript
 * and every state is a shareable URL. Topic options come from the database.
 */
export function FilterForm({
  action,
  values,
  topics,
  sorts,
  active,
  hiddenFields = {},
}: {
  action: string;
  values: FilterValues;
  topics: ReadonlyArray<{ slug: string; name: string }>;
  sorts: readonly SortOption[];
  /** True when any filter is set; the panel then starts open. */
  active: boolean;
  /** Fields carried through unchanged (for example the search text). */
  hiddenFields?: Record<string, string>;
}) {
  return (
    <details open={active} className="group mb-8 rounded-lg border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-base font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span>Filters and sorting</span>
        <span aria-hidden="true" className="text-ink-muted transition-transform group-open:rotate-180">
          &#9662;
        </span>
      </summary>
      <form action={action} method="get" className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <Field label="Topic" htmlFor="f-topic">
          <select id="f-topic" name="topic" defaultValue={values.topic ?? ""} className={fieldClass}>
            <option value="">Any topic</option>
            {topics.map((topic) => (
              <option key={topic.slug} value={topic.slug}>
                {topic.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Author" htmlFor="f-author">
          <input id="f-author" name="author" type="text" maxLength={80} defaultValue={values.author ?? ""} placeholder="Author name" className={fieldClass} />
        </Field>
        <Field label="Level" htmlFor="f-level">
          <select id="f-level" name="level" defaultValue={values.level ?? ""} className={fieldClass}>
            <option value="">Any level</option>
            {BOOK_LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Year" htmlFor="f-year">
          <input id="f-year" name="year" type="number" inputMode="numeric" min={1900} max={2200} defaultValue={values.year ?? ""} placeholder="e.g. 2020" className={fieldClass} />
        </Field>
        <Field label="Language code" htmlFor="f-language">
          <input id="f-language" name="language" type="text" maxLength={35} defaultValue={values.language ?? ""} placeholder="e.g. en" className={fieldClass} />
        </Field>
        <Field label="Format" htmlFor="f-format">
          <select id="f-format" name="format" defaultValue={values.format ?? ""} className={fieldClass}>
            <option value="">Any format</option>
            <option value="pdf">PDF</option>
          </select>
        </Field>
        <Field label="Licence" htmlFor="f-license">
          <select id="f-license" name="license" defaultValue={values.license ?? ""} className={fieldClass}>
            <option value="">Any licence</option>
            {LICENSE_TYPES.map((type) => (
              <option key={type} value={type}>
                {LICENSE_LABELS[type] ?? type}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort by" htmlFor="f-sort">
          <select id="f-sort" name="sort" defaultValue={values.sort ?? sorts[0]?.value ?? ""} className={fieldClass}>
            {sorts.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Apply</Button>
          <Link href={hiddenFields.q ? `${action}?q=${encodeURIComponent(hiddenFields.q)}` : action} className="text-sm text-ink-muted hover:text-ink">
            Reset filters
          </Link>
        </div>
      </form>
    </details>
  );
}
