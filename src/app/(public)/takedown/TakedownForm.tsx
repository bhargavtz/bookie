"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Messages = { acknowledgement: string; rateLimited: string; failed: string };
type FieldErrors = Partial<Record<string, string>>;
type Phase = { kind: "editing" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

const FIELD_ALIAS: Record<string, string> = { bookUrl: "bookAddress", bookSlug: "bookAddress" };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function issuesToErrors(issues: unknown): FieldErrors {
  const errors: FieldErrors = {};
  if (!Array.isArray(issues)) return errors;
  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) continue;
    const { field, message } = issue as { field?: unknown; message?: unknown };
    if (typeof field === "string" && typeof message === "string") errors[FIELD_ALIAS[field] ?? field] ??= message;
  }
  return errors;
}

export function TakedownForm({ messages }: { messages: Messages }) {
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [errors, setErrors] = useState<FieldErrors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const address = text(form, "bookAddress").trim();
    const payload = {
      ...(address === "" ? {} : /^https?:\/\//i.test(address) ? { bookUrl: address } : { bookSlug: address }),
      claimantName: text(form, "claimantName"),
      claimantEmail: text(form, "claimantEmail"),
      organisation: text(form, "organisation"),
      relationship: text(form, "relationship"),
      description: text(form, "description"),
      goodFaithConfirmed: form.get("goodFaithConfirmed") === "on",
      signature: text(form, "signature"),
      website: text(form, "website"),
    };
    setPhase({ kind: "sending" });
    setErrors({});
    try {
      const response = await fetch("/api/takedown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 202) {
        setPhase({ kind: "sent" });
      } else if (response.status === 400) {
        const body: unknown = await response.json().catch(() => null);
        const issues = typeof body === "object" && body !== null && "error" in body ? (body as { error?: { issues?: unknown } }).error?.issues : undefined;
        setErrors(issuesToErrors(issues));
        setPhase({ kind: "editing" });
      } else {
        setPhase({ kind: "error", message: response.status === 429 ? messages.rateLimited : messages.failed });
      }
    } catch {
      setPhase({ kind: "error", message: messages.failed });
    }
  }

  if (phase.kind === "sent") {
    return (
      <p role="status" className="rounded-lg border border-border-strong bg-surface px-5 py-4 text-lg text-ink">
        {messages.acknowledgement}
      </p>
    );
  }

  const sending = phase.kind === "sending";
  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex max-w-prose flex-col gap-5">
      <Input name="bookAddress" label="Book page address" hint="Paste the address of the book page, or its short name (the last part of the address)." {...(errors.bookAddress ? { error: errors.bookAddress } : {})} />
      <Input name="claimantName" label="Your name" required autoComplete="name" {...(errors.claimantName ? { error: errors.claimantName } : {})} />
      <Input name="claimantEmail" label="Your email address" type="email" required autoComplete="email" {...(errors.claimantEmail ? { error: errors.claimantEmail } : {})} />
      <Input name="organisation" label="Organisation (optional)" autoComplete="organization" {...(errors.organisation ? { error: errors.organisation } : {})} />
      <Input name="relationship" label="Your relationship to the work" hint="For example author, publisher or authorised agent." required {...(errors.relationship ? { error: errors.relationship } : {})} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="takedown-description" className="text-sm font-medium text-ink">Statement</label>
        <textarea
          id="takedown-description"
          name="description"
          required
          rows={8}
          minLength={20}
          maxLength={5000}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby="takedown-description-note"
          className="w-full rounded-md border border-border-strong bg-surface-raised px-3.5 py-2.5 text-base text-ink shadow-sm focus:outline-none focus-visible:border-focus focus-visible:ring-3 focus-visible:ring-accent-subtle"
        />
        <p id="takedown-description-note" className={errors.description ? "text-sm font-medium text-danger" : "text-sm text-ink-muted"}>
          {errors.description ?? "Describe the work, why you hold the rights, and what you ask us to do (at least 20 characters)."}
        </p>
      </div>
      <Input name="signature" label="Signature (type your full name)" required {...(errors.signature ? { error: errors.signature } : {})} />
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-base text-ink">
          <input type="checkbox" name="goodFaithConfirmed" className="mt-1 size-5" aria-invalid={errors.goodFaithConfirmed ? true : undefined} />
          <span>I confirm that this statement is made in good faith and that the information in it is accurate.</span>
        </label>
        {errors.goodFaithConfirmed ? <p className="text-sm font-medium text-danger">{errors.goodFaithConfirmed}</p> : null}
      </div>
      {/* Honeypot: hidden from people and assistive technology; bots that fill it are dropped silently. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {phase.kind === "error" ? (
        <p role="alert" className="text-base font-medium text-danger">{phase.message}</p>
      ) : null}
      <div>
        <Button type="submit" disabled={sending}>{sending ? "Sending" : "Send request"}</Button>
      </div>
    </form>
  );
}
