"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BOOK_LEVELS } from "@/contracts/enums";
import { adminFetch } from "./api";
import { CheckboxField, FormAlert, SelectField, TextAreaField } from "./fields";
import { bookValuesToPayload, type ApiFailure, type BookFormValues } from "./forms";
import type { CategoryOptionDto } from "./types";

type Props = {
  mode: "create" | "edit";
  bookId?: string;
  initial: BookFormValues;
  categories: readonly CategoryOptionDto[];
  readOnly?: boolean;
};

/** Metadata editor. Sends the full record (the API replaces metadata, never status, licence or files). */
export function BookForm({ mode, bookId, initial, categories, readOnly = false }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<BookFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = <K extends keyof BookFormValues>(key: K, value: BookFormValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const errors: Record<string, string> = {
    ...localErrors,
    ...(failure?.fieldErrors ?? {}),
    ...(failure?.code === "duplicate_isbn" ? { isbn13: failure.message } : {}),
  };

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);
    setSaved(null);
    const { payload, errors: found } = bookValuesToPayload(values);
    setLocalErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const result =
      mode === "create"
        ? await adminFetch<{ book: { id: string } }>("POST", "/api/admin/books", { json: payload })
        : await adminFetch("PUT", `/api/admin/books/${bookId ?? ""}`, { json: payload });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    if (mode === "create") {
      const created = (result.data as { book?: { id?: string } }).book?.id;
      router.push(created ? `/admin/books/${created}` : "/admin/books");
      return;
    }
    setSaved("Details saved.");
    router.refresh();
  }

  const field = (key: keyof BookFormValues): string | undefined => errors[key];

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <FormAlert failure={failure} success={saved} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Title" required value={values.title} error={field("title")} disabled={readOnly} onChange={(e) => { set("title", e.target.value); }} />
        <Input className="sm:col-span-2" label="Subtitle" value={values.subtitle} error={field("subtitle")} disabled={readOnly} onChange={(e) => { set("subtitle", e.target.value); }} />
        <TextAreaField label="Authors" required hint="One per line or comma separated. Order is kept." value={values.authors} error={field("authors")} disabled={readOnly} onChange={(e) => { set("authors", e.target.value); }} />
        <TextAreaField label="Description" value={values.description} error={field("description")} disabled={readOnly} onChange={(e) => { set("description", e.target.value); }} />
        <Input label="ISBN-13 or ISBN-10" value={values.isbn13} error={field("isbn13")} disabled={readOnly} onChange={(e) => { set("isbn13", e.target.value); }} />
        <Input label="Language" hint="BCP 47 tag, for example en" value={values.language} error={field("language")} disabled={readOnly} onChange={(e) => { set("language", e.target.value); }} />
        <Input label="Publisher" value={values.publisher} error={field("publisher")} disabled={readOnly} onChange={(e) => { set("publisher", e.target.value); }} />
        <Input label="Edition" value={values.edition} error={field("edition")} disabled={readOnly} onChange={(e) => { set("edition", e.target.value); }} />
        <Input label="Published year" inputMode="numeric" value={values.publishedYear} error={field("publishedYear")} disabled={readOnly} onChange={(e) => { set("publishedYear", e.target.value); }} />
        <Input label="Page count" inputMode="numeric" value={values.pageCount} error={field("pageCount")} disabled={readOnly} onChange={(e) => { set("pageCount", e.target.value); }} />
        <SelectField label="Level" value={values.level} error={field("level")} disabled={readOnly} onChange={(e) => { set("level", e.target.value); }}>
          <option value="">Not set</option>
          {BOOK_LEVELS.map((level) => (
            <option key={level} value={level}>{level}</option>
          ))}
        </SelectField>
        <Input label="Technologies" hint="Known technology slugs, comma separated" value={values.technologies} error={field("technologies")} disabled={readOnly} onChange={(e) => { set("technologies", e.target.value); }} />
        <Input className="sm:col-span-2" label="Tags" hint="Comma separated" value={values.tags} error={field("tags")} disabled={readOnly} onChange={(e) => { set("tags", e.target.value); }} />
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={errors["categories"] ? "categories-error" : undefined}>
        <legend className="text-sm font-medium text-ink">Categories</legend>
        {categories.length === 0 ? <p className="text-sm text-ink-muted">No categories exist yet. Create them under Categories first.</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {categories.map((category) => (
            <CheckboxField
              key={category.slug}
              label={category.name}
              checked={values.categories.includes(category.slug)}
              disabled={readOnly}
              onChange={(checked) => {
                set("categories", checked ? [...values.categories, category.slug] : values.categories.filter((slug) => slug !== category.slug));
              }}
            />
          ))}
        </div>
        {errors["categories"] ? <p id="categories-error" className="text-sm font-medium text-danger">{errors["categories"]}</p> : null}
      </fieldset>

      {readOnly ? null : (
        <div>
          <Button type="submit" disabled={busy}>{busy ? "Saving" : mode === "create" ? "Create draft" : "Save details"}</Button>
        </div>
      )}
    </form>
  );
}
