"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminFetch } from "./api";
import { CheckboxField, FormAlert, SelectField, TextAreaField } from "./fields";
import { entityInitialValues, entityValuesToPayload, type ApiFailure, type EntityFieldSpec, type EntityValues } from "./forms";

export type EntityItem = { id: string; [key: string]: unknown };

type Props = {
  noun: string;
  endpoint: string;
  items: readonly EntityItem[];
  fields: readonly EntityFieldSpec[];
  /** Field shown as the row heading. */
  titleField: string;
  /** Items may carry a `summary` string shown under the heading (functions cannot cross from server to client components). */
  canManage: boolean;
};

function FieldControl({ field, values, error, onChange }: { field: EntityFieldSpec; values: EntityValues; error: string | undefined; onChange: (name: string, value: string | boolean) => void }) {
  const value = values[field.name];
  if (field.kind === "checkbox") {
    return <CheckboxField label={field.label} {...(field.hint ? { hint: field.hint } : {})} checked={value === true} onChange={(checked) => { onChange(field.name, checked); }} />;
  }
  const text = typeof value === "string" ? value : "";
  if (field.kind === "textarea" || field.kind === "list") {
    return <TextAreaField label={field.label} rows={field.kind === "list" ? 3 : 3} {...(field.hint ? { hint: field.hint } : {})} {...(error ? { error } : {})} value={text} onChange={(e) => { onChange(field.name, e.target.value); }} />;
  }
  if (field.kind === "select") {
    return (
      <SelectField label={field.label} {...(field.hint ? { hint: field.hint } : {})} {...(error ? { error } : {})} value={text} onChange={(e) => { onChange(field.name, e.target.value); }}>
        {(field.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </SelectField>
    );
  }
  return <Input label={field.label} required={field.required === true} {...(field.kind === "integer" ? { inputMode: "numeric" as const } : {})} {...(field.hint ? { hint: field.hint } : {})} {...(error ? { error } : {})} value={text} onChange={(e) => { onChange(field.name, e.target.value); }} />;
}

function EntityForm({ noun, endpoint, fields, item, onDone, onCancel }: { noun: string; endpoint: string; fields: readonly EntityFieldSpec[]; item: EntityItem | null; onDone: (message: string) => void; onCancel?: () => void }) {
  const mode = item === null ? "create" : "edit";
  const [values, setValues] = useState<EntityValues>(() => entityInitialValues(fields, item));
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const visible = fields.filter((field) => !(field.createOnly === true && mode === "edit"));
  const errors = { ...localErrors, ...(failure?.fieldErrors ?? {}) };

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);
    const { payload, errors: found } = entityValuesToPayload(fields, values, mode);
    setLocalErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const result = item === null ? await adminFetch("POST", endpoint, { json: payload }) : await adminFetch("PUT", `${endpoint}/${item.id}`, { json: payload });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    if (item === null) setValues(entityInitialValues(fields, null));
    onDone(item === null ? `${noun} created.` : `${noun} saved.`);
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
      <FormAlert failure={failure} />
      {visible.map((field) => (
        <FieldControl key={field.name} field={field} values={values} error={errors[field.name]} onChange={(name, value) => { setValues((current) => ({ ...current, [name]: value })); }} />
      ))}
      <div className="flex gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving" : mode === "create" ? `Add ${noun.toLowerCase()}` : "Save"}</Button>
        {onCancel ? <Button variant="ghost" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </form>
  );
}

/** List with inline create, edit and (confirmed) delete for one taxonomy kind. Every change goes through the admin API. */
export function EntityManager({ noun, endpoint, items, fields, titleField, canManage }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function remove(id: string): Promise<void> {
    setBusyId(id);
    setFailure(null);
    setStatus(null);
    const result = await adminFetch("DELETE", `${endpoint}/${id}`);
    setBusyId(null);
    setConfirming(null);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setStatus(`${noun} deleted.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section aria-label={`Add ${noun.toLowerCase()}`} className="rounded-lg border border-border bg-surface-raised p-5">
          <h2 className="mb-3 text-xl">Add {noun.toLowerCase()}</h2>
          <EntityForm
            noun={noun}
            endpoint={endpoint}
            fields={fields}
            item={null}
            onDone={(message) => {
              setStatus(message);
              router.refresh();
            }}
          />
        </section>
      ) : null}

      <FormAlert failure={failure} success={status} />

      {items.length === 0 ? (
        <EmptyState title={`No ${noun.toLowerCase()} records yet`} description={canManage ? `Add the first one above.` : undefined} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface-raised">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{String(item[titleField] ?? "")}</p>
                  {typeof item["summary"] === "string" ? <p className="text-sm text-ink-muted">{item["summary"]}</p> : null}
                </div>
                {canManage && editing !== item.id ? (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" aria-label={`Edit ${String(item[titleField] ?? "")}`} onClick={() => { setEditing(item.id); setConfirming(null); }}>Edit</Button>
                    {confirming === item.id ? (
                      <>
                        <Button variant="danger" size="sm" disabled={busyId === item.id} onClick={() => void remove(item.id)}>Confirm delete</Button>
                        <Button variant="ghost" size="sm" onClick={() => { setConfirming(null); }}>Cancel</Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" aria-label={`Delete ${String(item[titleField] ?? "")}`} onClick={() => { setConfirming(item.id); }}>Delete</Button>
                    )}
                  </div>
                ) : null}
              </div>
              {editing === item.id ? (
                <EntityForm
                  noun={noun}
                  endpoint={endpoint}
                  fields={fields}
                  item={item}
                  onCancel={() => { setEditing(null); }}
                  onDone={(message) => {
                    setStatus(message);
                    setEditing(null);
                    router.refresh();
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
