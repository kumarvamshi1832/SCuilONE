import { NOMINEE_LIMITS } from "../../types/bookingNominee";
import type { BookingNominee, NomineeDraft, NomineeErrors, NomineeField } from "../../types/bookingNominee";
import { formatAllocation, newNomineeDraft, totalAllocationText } from "../../utils/bookingNominees";
import { formatBookingDate } from "../../utils/bookingJourney";
import "./BuyerNominees.css";

interface NomineesEditorProps {
  value: NomineeDraft[];
  onChange: (next: NomineeDraft[]) => void;
  errors?: NomineeErrors;
  disabled?: boolean;
}

/** Editable list of nominees (up to 20). Used by the staff booking screens and the customer portal. */
export function NomineesEditor({ value, onChange, errors, disabled }: NomineesEditorProps) {
  const update = (key: string, field: NomineeField, text: string) =>
    onChange(value.map((row) => (row.key === key ? { ...row, [field]: text } : row)));

  const usingPercent = value.some((row) => row.allocation_percentage.trim() !== "");

  return (
    <div className="nm-root">
      {value.length === 0 && (
        <p className="nm-empty">No nominees added. Nominees are optional.</p>
      )}

      {value.map((row, index) => {
        const e = errors?.rows[row.key] ?? {};
        const id = (field: string) => `${row.key}-${field}`;
        const field = (name: NomineeField, label: string, props: { type?: string; required?: boolean; max?: number; placeholder?: string } = {}) => (
          <div className={`nm-field ${e[name] ? "has-error" : ""}`}>
            <label htmlFor={id(name)}>
              {label}
              {props.required && <span className="nm-req"> *</span>}
            </label>
            <input
              id={id(name)}
              type={props.type ?? "text"}
              value={row[name]}
              maxLength={props.max}
              placeholder={props.placeholder}
              disabled={disabled}
              aria-invalid={Boolean(e[name])}
              aria-describedby={e[name] ? `${id(name)}-err` : undefined}
              onChange={(ev) => update(row.key, name, ev.target.value)}
              {...(name === "allocation_percentage" ? { inputMode: "decimal" as const } : {})}
            />
            {e[name] && (
              <small id={`${id(name)}-err`} className="nm-error" role="alert">
                {e[name]}
              </small>
            )}
          </div>
        );
        return (
          <fieldset key={row.key} className="nm-card" disabled={disabled}>
            <legend>Nominee {index + 1}</legend>
            <button
              type="button"
              className="nm-remove"
              onClick={() => onChange(value.filter((r) => r.key !== row.key))}
              aria-label={`Remove nominee ${index + 1}`}
              disabled={disabled}
            >
              Remove
            </button>
            <div className="nm-grid">
              {field("nominee_name", "Full name", { required: true, max: NOMINEE_LIMITS.nameMax })}
              {field("relationship", "Relationship", { required: true, max: NOMINEE_LIMITS.relationshipMax, placeholder: "e.g. Spouse" })}
              {field("phone", "Phone", { type: "tel", max: NOMINEE_LIMITS.phoneMax })}
              {field("email", "Email", { type: "email" })}
              {field("date_of_birth", "Date of birth", { type: "date" })}
              {field("allocation_percentage", "Allocation %", { placeholder: "e.g. 50" })}
            </div>
            <div className={`nm-field ${e.address ? "has-error" : ""}`}>
              <label htmlFor={id("address")}>Address</label>
              <textarea
                id={id("address")}
                rows={2}
                maxLength={NOMINEE_LIMITS.addressMax}
                value={row.address}
                disabled={disabled}
                onChange={(ev) => update(row.key, "address", ev.target.value)}
              />
              {e.address && <small className="nm-error" role="alert">{e.address}</small>}
            </div>
            <div className={`nm-field ${e.remarks ? "has-error" : ""}`}>
              <label htmlFor={id("remarks")}>Remarks</label>
              <textarea
                id={id("remarks")}
                rows={2}
                maxLength={NOMINEE_LIMITS.remarksMax}
                value={row.remarks}
                disabled={disabled}
                onChange={(ev) => update(row.key, "remarks", ev.target.value)}
              />
              {e.remarks && <small className="nm-error" role="alert">{e.remarks}</small>}
            </div>
          </fieldset>
        );
      })}

      {errors?.form && (
        <div className="nm-form-error" role="alert">
          {errors.form}
        </div>
      )}

      <div className="nm-footer">
        <button
          type="button"
          className="nm-add"
          onClick={() => onChange([...value, newNomineeDraft()])}
          disabled={disabled || value.length >= NOMINEE_LIMITS.maxNominees}
        >
          + Add nominee
        </button>
        <span className="nm-hint">
          {value.length}/{NOMINEE_LIMITS.maxNominees} nominees
          {usingPercent && (
            <>
              {" · "}Allocated: <strong>{totalAllocationText(value)}%</strong> of 100%
            </>
          )}
        </span>
      </div>
      <p className="nm-note">
        Allocation percentages are optional, but if you enter one you must enter one for every nominee and the total must be exactly 100%.
      </p>
    </div>
  );
}

/** Read-only nominee list. */
export function NomineesView({ nominees }: { nominees: BookingNominee[] }) {
  if (nominees.length === 0) return <p className="nm-empty">No nominees have been added.</p>;
  return (
    <ul className="nm-view">
      {nominees.map((n, i) => (
        <li key={n.id || i} className="nm-view-item">
          <div className="nm-view-top">
            <strong>{n.nominee_name}</strong>
            <span className="nm-view-rel">{n.relationship}</span>
            {n.allocation_percentage !== null && n.allocation_percentage !== undefined && n.allocation_percentage !== "" && (
              <span className="nm-view-pct">{formatAllocation(n.allocation_percentage)}</span>
            )}
          </div>
          <dl className="nm-view-meta">
            {n.phone && (<><dt>Phone</dt><dd>{n.phone}</dd></>)}
            {n.email && (<><dt>Email</dt><dd>{n.email}</dd></>)}
            {n.date_of_birth && (<><dt>Date of birth</dt><dd>{formatBookingDate(n.date_of_birth)}</dd></>)}
            {n.address && (<><dt>Address</dt><dd>{n.address}</dd></>)}
            {n.remarks && (<><dt>Remarks</dt><dd>{n.remarks}</dd></>)}
          </dl>
        </li>
      ))}
    </ul>
  );
}
