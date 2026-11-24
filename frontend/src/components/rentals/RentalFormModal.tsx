import { useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../utils/apiError";
import { ActionDialog, Field, inputStyle } from "../booking-journey/StaffBookingActions";

export interface RentalFieldDef {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "checkbox";
  options?: Array<string | { value: string; label: string }>;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}

export type RentalFormState = Record<string, string | boolean>;

/**
 * One small form dialog for every rental action (record a payment, decide an exit, add an inspection...). It validates
 * required fields, lets the caller add rules (returning field -> message), shows the server's error unchanged and never
 * submits an invalid form. `onSubmit` performs the real API call.
 */
export default function RentalFormModal({
  title,
  intro,
  fields,
  initial,
  submitLabel,
  validate,
  onSubmit,
  onClose,
}: {
  title: string;
  intro?: string;
  fields: RentalFieldDef[];
  initial?: RentalFormState;
  submitLabel: string;
  /** Extra rules; return a message per field key. */
  validate?: (values: RentalFormState) => Partial<Record<string, string>>;
  onSubmit: (values: RentalFormState) => Promise<void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<RentalFormState>(() => {
    const base: RentalFormState = {};
    fields.forEach((f) => (base[f.key] = f.type === "checkbox" ? false : ""));
    return { ...base, ...initial };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setApiError(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.required && f.type !== "checkbox" && String(v ?? "").trim() === "") next[f.key] = `${f.label.replace(/ \*$/, "")} is required.`;
      if (f.required && f.type === "checkbox" && v !== true) next[f.key] = "This confirmation is required.";
      if (f.type === "number" && String(v).trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(String(v).trim())) next[f.key] = "Enter a valid amount with at most 2 decimals.";
    }
    for (const [key, message] of Object.entries(validate?.(values) ?? {})) if (message) next[key] = message;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setApiError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog title={title} titleId="rental-form-title" error={apiError} busy={busy} submitLabel={submitLabel} onClose={onClose} onSubmit={(e) => void submit(e)}>
      {intro && <p className="text-muted" style={{ marginTop: 0, fontSize: "0.88rem" }}>{intro}</p>}
      {fields.map((f) => {
        const id = `rf-${f.key}`;
        const label = `${f.label}${f.required && f.type !== "checkbox" ? " *" : ""}`;
        if (f.type === "checkbox") {
          return (
            <div key={f.key} style={{ margin: "6px 0 12px" }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="checkbox" checked={values[f.key] === true} onChange={(e) => set(f.key, e.target.checked)} disabled={busy} style={{ marginTop: 3 }} />
                <span>{f.label}{f.required ? " *" : ""}</span>
              </label>
              {errors[f.key] && <small className="ins-field-error" role="alert" style={{ color: "#dc2626" }}>{errors[f.key]}</small>}
            </div>
          );
        }
        return (
          <Field key={f.key} id={id} label={label} error={errors[f.key]} hint={f.hint}>
            {f.type === "select" ? (
              <select id={id} className="filter-select" style={inputStyle} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} disabled={busy}>
                {!f.required && <option value="">—</option>}
                {f.required && String(values[f.key] ?? "") === "" && <option value="">Select…</option>}
                {(f.options ?? []).map((o) => {
                  const opt = typeof o === "string" ? { value: o, label: o } : o;
                  return (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  );
                })}
              </select>
            ) : f.type === "textarea" ? (
              <textarea id={id} className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} value={String(values[f.key] ?? "")} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} disabled={busy} />
            ) : (
              <input
                id={id}
                className="ins-prob-input"
                style={{ ...inputStyle, textAlign: "left" }}
                type={f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                value={String(values[f.key] ?? "")}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                disabled={busy}
              />
            )}
          </Field>
        );
      })}
    </ActionDialog>
  );
}
