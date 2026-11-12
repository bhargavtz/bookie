"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LICENSE_TYPES, RIGHTS_STATUSES } from "@/contracts/enums";
import { adminFetch } from "./api";
import { CheckboxField, FormAlert, SelectField, TextAreaField } from "./fields";
import { isRightsStatus, licenseValuesToPayload, type ApiFailure, type LicenseFormValues } from "./forms";
import { label } from "./StatusBadges";

type Props = {
  bookId: string;
  initial: LicenseFormValues;
  /** ISO time the licence was last approved or restricted by a reviewer; read-only. */
  reviewedAt: string | null;
  canEdit: boolean;
  canReview: boolean;
};

/**
 * Rights record editor. Moving out of `pending` needs a reviewer; the server enforces that and
 * its message is shown. Links are validated server-side (https only, no private hosts) and are never fetched.
 */
export function LicenseForm({ bookId, initial, reviewedAt, canEdit, canReview }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<LicenseFormValues>(initial);
  const [busy, setBusy] = useState(false);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = <K extends keyof LicenseFormValues>(key: K, value: LicenseFormValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }));
  };
  const errors: Record<string, string> = { ...localErrors, ...(failure?.fieldErrors ?? {}) };
  const disabled = !canEdit;
  const removed = values.rightsStatus === "removed";
  const restricted = values.rightsStatus === "restricted";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFailure(null);
    setSaved(null);
    const { payload, errors: found } = licenseValuesToPayload(values);
    setLocalErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const result = await adminFetch("PUT", `/api/admin/books/${bookId}/license`, { json: payload });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.failure);
      return;
    }
    setSaved("Licence saved.");
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" noValidate>
      <FormAlert failure={failure} success={saved} />
      {!canReview ? <p className="text-sm text-ink-muted">Your role can record draft evidence only. A reviewer approves, restricts or removes rights.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Rights status"
          value={values.rightsStatus}
          error={errors["rightsStatus"]}
          disabled={disabled}
          hint={reviewedAt ? `Last reviewed ${reviewedAt.slice(0, 10)}` : "Not reviewed yet"}
          onChange={(e) => { if (isRightsStatus(e.target.value)) set("rightsStatus", e.target.value); }}
        >
          {RIGHTS_STATUSES.map((status) => (
            <option key={status} value={status} disabled={status !== "pending" && !canReview}>{label(status)}</option>
          ))}
        </SelectField>
        <SelectField label="Licence type" value={values.licenseType} error={errors["licenseType"]} disabled={disabled} onChange={(e) => { set("licenseType", e.target.value); }}>
          <option value="">Not set</option>
          {LICENSE_TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </SelectField>
        <Input label="Rights holder" value={values.rightsHolder} error={errors["rightsHolder"]} disabled={disabled} onChange={(e) => { set("rightsHolder", e.target.value); }} />
        <Input label="Licence expires" type="date" value={values.expiresAt} error={errors["expiresAt"]} disabled={disabled} onChange={(e) => { set("expiresAt", e.target.value); }} />
        <Input label="Source URL" type="url" inputMode="url" hint="Where the book was obtained. https only; never fetched." value={values.sourceUrl} error={errors["sourceUrl"]} disabled={disabled} onChange={(e) => { set("sourceUrl", e.target.value); }} />
        <Input label="Licence URL" type="url" inputMode="url" hint="The licence text. https only; never fetched." value={values.licenseUrl} error={errors["licenseUrl"]} disabled={disabled} onChange={(e) => { set("licenseUrl", e.target.value); }} />
        <TextAreaField className="sm:col-span-2" label="Attribution text" value={values.attributionText} error={errors["attributionText"]} disabled={disabled} onChange={(e) => { set("attributionText", e.target.value); }} />
        <TextAreaField label="Evidence note" hint="How the rights were verified. A source URL or an evidence note is needed to publish." value={values.evidenceNote} error={errors["evidenceNote"]} disabled={disabled} onChange={(e) => { set("evidenceNote", e.target.value); }} />
        {restricted ? <TextAreaField label="Why restricted" value={values.restrictedReason} error={errors["restrictedReason"]} disabled={disabled} onChange={(e) => { set("restrictedReason", e.target.value); }} /> : null}
        {removed ? <TextAreaField label="Why removed" value={values.removedReason} error={errors["removedReason"]} disabled={disabled} onChange={(e) => { set("removedReason", e.target.value); }} /> : null}
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-ink">Permitted actions</legend>
        <CheckboxField label="Allow reading online" checked={values.allowRead && !removed} disabled={disabled || removed} onChange={(checked) => { set("allowRead", checked); }} />
        <CheckboxField
          label="Allow download"
          hint={removed || restricted ? "Not available while the licence is restricted or removed." : undefined}
          checked={values.allowDownload && !removed && !restricted}
          disabled={disabled || removed || restricted}
          onChange={(checked) => { set("allowDownload", checked); }}
        />
        {errors["allowRead"] ?? errors["allowDownload"] ? <p className="text-sm font-medium text-danger">{errors["allowRead"] ?? errors["allowDownload"]}</p> : null}
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" disabled={busy}>{busy ? "Saving" : "Save licence"}</Button>
        </div>
      ) : null}
    </form>
  );
}
