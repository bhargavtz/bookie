import { useId, type InputHTMLAttributes, type Ref } from "react";
import { cx } from "./cx";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  /** Visible label. Required: every field needs an accessible name. */
  label: string;
  /** Helper text shown under the field. */
  hint?: string;
  /** Validation message. When set, the field is marked invalid and the message is announced. */
  error?: string;
  className?: string;
  ref?: Ref<HTMLInputElement>;
};

/** Text input with a visible label, linked hint and error text (WCAG 1.3.1, 3.3.1, 3.3.2). */
export function Input({ label, hint, error, className, id, ref, ...inputProps }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter((value): value is string => value !== null)
    .join(" ");

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cx(
          "h-11 w-full rounded-md border bg-surface-raised px-3.5 text-base text-ink placeholder:text-ink-muted/70 shadow-sm transition-[border-color,box-shadow] duration-[var(--duration-fast)] focus:outline-none focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-accent-subtle disabled:opacity-50",
          error ? "border-danger" : "border-border-strong hover:border-ink-muted",
        )}
        {...inputProps}
      />
      {hint && !error ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
