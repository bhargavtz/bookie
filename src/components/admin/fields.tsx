import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui/cx";
import { describeRequirement, failureHeadline, type ApiFailure } from "./forms";

const controlClass =
  "w-full rounded-md border bg-surface-raised px-3.5 py-2.5 text-base text-ink shadow-sm transition-[border-color,box-shadow] duration-[var(--duration-fast)] focus:outline-none focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-accent-subtle disabled:opacity-50";

function FieldFrame({ id, label, hint, error, className, children }: { id: string; label: string; hint?: string | undefined; error?: string | undefined; className?: string | undefined; children: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string): string | undefined => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & { label: string; hint?: string; error?: string; className?: string };

export function TextAreaField({ label, hint, error, id, rows = 4, className, ...rest }: TextAreaProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} className={className}>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cx(controlClass, error ? "border-danger" : "border-border-strong hover:border-ink-muted")}
        {...rest}
      />
    </FieldFrame>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { label: string; hint?: string; error?: string; className?: string; children: ReactNode };

export function SelectField({ label, hint, error, id, children, className, ...rest }: SelectProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} className={className}>
      <select
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cx(controlClass, "h-11 py-0", error ? "border-danger" : "border-border-strong hover:border-ink-muted")}
        {...rest}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export function CheckboxField({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Announced failure or success above a form. Lists unmet publish requirements when the server blocked publication. */
export function FormAlert({ failure, success }: { failure?: ApiFailure | null; success?: string | null }) {
  if (failure) {
    return (
      <div role="alert" className="rounded-md border border-danger/40 bg-danger-subtle px-4 py-3 text-sm text-ink">
        <p className="font-semibold">{failureHeadline(failure)}</p>
        {failure.code === "publish_blocked" && failure.missing.length > 0 ? (
          <ul className="mt-2 list-disc pl-5">
            {failure.missing.map((key) => (
              <li key={key}>{describeRequirement(key)}</li>
            ))}
          </ul>
        ) : null}
        {failure.code === "publish_blocked" && failure.missing.length === 0 ? (
          <p className="mt-1">The database refused the change because no approved or restricted licence is on record.</p>
        ) : null}
      </div>
    );
  }
  if (success) {
    return (
      <p role="status" className="rounded-md border border-success/40 bg-success-subtle px-4 py-3 text-sm font-medium text-ink">
        {success}
      </p>
    );
  }
  return null;
}

export function FormSection({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="flex flex-col gap-4 rounded-lg border border-border bg-surface-raised p-5 sm:p-6">
      <div>
        <h2 id={id ? `${id}-title` : undefined} className="text-xl text-ink">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
