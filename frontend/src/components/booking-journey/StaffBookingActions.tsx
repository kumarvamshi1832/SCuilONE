import { useState, type FormEvent, type ReactNode } from "react";
import {
  decideBookingRequest,
  extendBookingHold,
  finalConfirmBooking,
  prepareAgreement,
  setPaymentInstructions,
  verifyAgreement,
} from "../../services/customerBookingWorkflowService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime, formatBookingMoney } from "../../utils/bookingJourney";
import { PAYMENT_PREFERENCES } from "../../types/customerBookingJourney";
import type {
  BookingRequestDetail,
  PaymentPreference,
} from "../../types/customerBookingJourney";
import "../../pages/insights/CrmInsights.css";
import "./BookingJourney.css";

interface BaseProps {
  detail: BookingRequestDetail;
  onClose: () => void;
  /** Called after a successful API call with a success message. */
  onDone: (message: string) => void | Promise<void>;
}

/** Shared dialog shell (fixed header/footer, scrolling body). */
function ActionDialog({
  title,
  titleId,
  error,
  busy,
  submitLabel,
  submitClass = "btn-primary",
  onClose,
  onSubmit,
  children,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  titleId: string;
  error: string | null;
  busy: boolean;
  submitLabel: string;
  submitClass?: string;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="ins-modal-overlay" role="presentation">
      <form className="ins-modal wide" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={onSubmit} noValidate>
        <div className="ins-modal-header">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="ins-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ins-modal-body">
          {error && (
            <div className="ins-alert error" role="alert" style={{ marginBottom: 14 }}>
              <span>{error}</span>
            </div>
          )}
          {children}
        </div>
        <div className="ins-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {secondaryLabel && onSecondary && (
            <button type="button" className="btn-secondary" onClick={onSecondary} disabled={busy}>
              {secondaryLabel}
            </button>
          )}
          <button type="submit" className={submitClass} disabled={busy}>
            {busy ? "Working…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

const Field = ({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) => (
  <div className="bj-field" style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
    <label htmlFor={id} style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
      {label}
    </label>
    {children}
    {hint && !error && <span className="text-muted" style={{ fontSize: "0.75rem" }}>{hint}</span>}
    {error && (
      <span className="bj-field-error" role="alert">
        {error}
      </span>
    )}
  </div>
);

const inputStyle = { width: "100%", boxSizing: "border-box" as const };

/* ─── Approve / reject ─── */

export function DecisionModal({
  detail,
  onClose,
  onDone,
  suggestedPrice,
}: BaseProps & { suggestedPrice: number | null }) {
  const [decision, setDecision] = useState<"Approve" | "Reject">("Approve");
  const [agreedPrice, setAgreedPrice] = useState(suggestedPrice ? String(suggestedPrice) : "");
  const [bookingAmount, setBookingAmount] = useState("");
  const [preference, setPreference] = useState<PaymentPreference>(
    (PAYMENT_PREFERENCES as readonly string[]).includes(detail.payment_preference)
      ? (detail.payment_preference as PaymentPreference)
      : "Full Payment"
  );
  const [notes, setNotes] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (decision === "Approve") {
      const price = Number(agreedPrice);
      const amount = Number(bookingAmount);
      if (!agreedPrice.trim() || !Number.isFinite(price) || price <= 0) next.agreedPrice = "Enter an agreed price greater than zero.";
      if (!bookingAmount.trim() || !Number.isFinite(amount) || amount <= 0) next.bookingAmount = "Enter a booking amount greater than zero.";
      else if (!next.agreedPrice && amount > price) next.bookingAmount = "Booking amount cannot exceed the agreed price.";
    }
    if (notes.length > 3000) next.notes = "Notes cannot exceed 3000 characters.";
    if (customerMessage.length > 2000) next.customerMessage = "Message cannot exceed 2000 characters.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirming) {
      if (validate()) setConfirming(true);
      return;
    }
    setBusy(true);
    setApiError(null);
    try {
      await decideBookingRequest(detail.id, {
        decision,
        agreed_price: decision === "Approve" ? Number(agreedPrice) : null,
        booking_amount: decision === "Approve" ? Number(bookingAmount) : null,
        payment_preference: preference,
        notes: notes.trim() || null,
        customer_message: customerMessage.trim() || null,
      });
      await onDone(decision === "Approve" ? "Booking request approved. The property is now on hold." : "Booking request rejected.");
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The decision could not be saved."));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      title={confirming ? `Confirm: ${decision} request` : "Decide on booking request"}
      titleId="decision-title"
      error={apiError}
      busy={busy}
      submitLabel={confirming ? `Confirm ${decision.toLowerCase()}` : "Review decision"}
      submitClass={confirming && decision === "Reject" ? "ins-btn-danger" : "btn-primary"}
      onClose={onClose}
      onSubmit={(e) => void submit(e)}
      secondaryLabel={confirming ? "Back" : undefined}
      onSecondary={() => setConfirming(false)}
    >
      {confirming ? (
        <>
          <p style={{ marginTop: 0 }}>
            {decision === "Approve" ? (
              <>
                You are approving this request at an agreed price of <strong>{formatBookingMoney(agreedPrice)}</strong>{" "}
                with a booking amount of <strong>{formatBookingMoney(bookingAmount)}</strong> ({preference}). The
                property will be reserved and the customer gets a 48-hour hold.
              </>
            ) : (
              <>You are rejecting this request. The customer will be notified and can submit a new request.</>
            )}
          </p>
          {customerMessage && (
            <p>
              <strong>Message to customer:</strong> {customerMessage}
            </p>
          )}
        </>
      ) : (
        <>
          <Field id="decision" label="Decision *">
            <select id="decision" className="filter-select" style={inputStyle} value={decision} onChange={(e) => setDecision(e.target.value as "Approve" | "Reject")}>
              <option value="Approve">Approve</option>
              <option value="Reject">Reject</option>
            </select>
          </Field>

          {decision === "Approve" && (
            <>
              <Field id="agreed" label="Agreed price (INR) *" error={errors.agreedPrice} hint={suggestedPrice ? `Listed price: ${formatBookingMoney(suggestedPrice)}` : undefined}>
                <input id="agreed" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} type="number" min={0} step="0.01" value={agreedPrice} onChange={(e) => setAgreedPrice(e.target.value)} />
              </Field>
              <Field id="amount" label="Booking amount (INR) *" error={errors.bookingAmount}>
                <input id="amount" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} type="number" min={0} step="0.01" value={bookingAmount} onChange={(e) => setBookingAmount(e.target.value)} />
              </Field>
              <Field id="pref" label="Payment preference *">
                <select id="pref" className="filter-select" style={inputStyle} value={preference} onChange={(e) => setPreference(e.target.value as PaymentPreference)}>
                  {PAYMENT_PREFERENCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}

          <Field id="notes" label="Internal notes" error={errors.notes}>
            <textarea id="notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field id="msg" label="Message to customer" error={errors.customerMessage} hint="Shown to the customer with the decision.">
            <textarea id="msg" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={2} maxLength={2000} value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} />
          </Field>
        </>
      )}
    </ActionDialog>
  );
}

/* ─── Extend hold ─── */

export function ExtendHoldModal({ detail, onClose, onDone }: BaseProps) {
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const remaining = 2 - detail.extension_count;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const h = Number(hours);
    if (!Number.isInteger(h) || h < 1 || h > 48) next.hours = "Enter whole hours between 1 and 48.";
    if (reason.trim().length < 5) next.reason = "Give a reason of at least 5 characters.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setApiError(null);
    try {
      const updated = await extendBookingHold(detail.id, { hours: h, reason: reason.trim() });
      await onDone(`Hold extended. New expiry: ${formatBookingDateTime(updated.hold_expires_at)}.`);
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The hold could not be extended."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog title="Extend booking hold" titleId="extend-title" error={apiError} busy={busy} submitLabel="Extend hold" onClose={onClose} onSubmit={(e) => void submit(e)}>
      <p style={{ marginTop: 0 }}>
        Current expiry: <strong>{formatBookingDateTime(detail.hold_expires_at)}</strong>. Extensions remaining: {remaining}.
      </p>
      <Field id="hours" label="Extend by (hours) *" error={errors.hours}>
        <input id="hours" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} type="number" min={1} max={48} value={hours} onChange={(e) => setHours(e.target.value)} />
      </Field>
      <Field id="reason" label="Reason *" error={errors.reason} hint="Recorded in the audit log.">
        <textarea id="reason" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/* ─── Payment instructions ─── */

export function PaymentInstructionsModal({ detail, onClose, onDone }: BaseProps) {
  const [text, setText] = useState(detail.payment_instructions ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 10) return setError("Instructions must be at least 10 characters.");
    if (trimmed.length > 10000) return setError("Instructions cannot exceed 10000 characters.");
    setError(null);
    setBusy(true);
    setApiError(null);
    try {
      const result = await setPaymentInstructions(detail.id, trimmed);
      await onDone(result.message || "Payment instructions saved.");
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The instructions could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog title="Payment instructions" titleId="instructions-title" error={apiError} busy={busy} submitLabel="Save instructions" onClose={onClose} onSubmit={(e) => void submit(e)}>
      <Field id="instructions" label="Instructions shown to the customer *" error={error ?? undefined} hint="Bank details, UPI ID, deadlines, how to reference the payment…">
        <textarea id="instructions" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={8} maxLength={10000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/* ─── Prepare agreement ─── */

export function AgreementPrepareModal({ detail, onClose, onDone }: BaseProps) {
  const [text, setText] = useState(detail.agreement_text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const isRevision = detail.agreement_status !== "Not Prepared";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 30) return setError("The agreement must be at least 30 characters.");
    if (trimmed.length > 30000) return setError("The agreement cannot exceed 30000 characters.");
    setError(null);
    setBusy(true);
    setApiError(null);
    try {
      const updated = await prepareAgreement(detail.id, trimmed);
      await onDone(`Agreement version ${updated.agreement_version} prepared and sent to the customer for review.`);
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The agreement could not be prepared."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog title={isRevision ? "Prepare a new agreement version" : "Prepare agreement"} titleId="agreement-title" error={apiError} busy={busy} submitLabel="Send to customer" onClose={onClose} onSubmit={(e) => void submit(e)}>
      {isRevision && (
        <div className="ins-warning-box" role="note" style={{ marginTop: 0, marginBottom: 14 }}>
          <span>
            Saving creates version {detail.agreement_version + 1} and clears any acknowledgement or verification of the
            current version.
          </span>
        </div>
      )}
      <Field id="agreement-text" label="Agreement text *" error={error ?? undefined} hint="The customer reviews and acknowledges exactly this text.">
        <textarea id="agreement-text" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={12} maxLength={30000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </ActionDialog>
  );
}

/* ─── Verify agreement ─── */

export function AgreementVerifyModal({ detail, onClose, onDone }: BaseProps) {
  const signedFiles = detail.files.filter(
    (f) => f.purpose === "Signed Agreement" && f.agreement_version === detail.agreement_version
  );
  const [verified, setVerified] = useState(true);
  const [fileId, setFileId] = useState(signedFiles[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirming) {
      const next: Record<string, string> = {};
      if (verified && !fileId) next.file = "Select the customer's signed agreement upload for this version.";
      if (notes.length > 2000) next.notes = "Notes cannot exceed 2000 characters.";
      if (!verified && !notes.trim()) next.notes = "Explain what needs to change — the customer sees this message.";
      setErrors(next);
      if (Object.keys(next).length === 0) setConfirming(true);
      return;
    }
    setBusy(true);
    setApiError(null);
    try {
      await verifyAgreement(detail.id, {
        verified,
        signed_file_id: verified ? fileId : null,
        notes: notes.trim() || null,
      });
      await onDone(verified ? "Agreement verified." : "Agreement marked as needing changes.");
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The verification could not be saved."));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      title={confirming ? "Confirm agreement decision" : "Verify agreement"}
      titleId="verify-title"
      error={apiError}
      busy={busy}
      submitLabel={confirming ? (verified ? "Confirm verification" : "Confirm rejection") : "Review decision"}
      submitClass={confirming && !verified ? "ins-btn-danger" : "btn-primary"}
      onClose={onClose}
      onSubmit={(e) => void submit(e)}
      secondaryLabel={confirming ? "Back" : undefined}
      onSecondary={() => setConfirming(false)}
    >
      {confirming ? (
        <p style={{ marginTop: 0 }}>
          {verified
            ? `You are verifying agreement version ${detail.agreement_version} against the customer's signed upload.`
            : `You are rejecting agreement version ${detail.agreement_version}. The customer will be asked to contact the sales team.`}
        </p>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            The customer acknowledged version {detail.agreement_version}
            {detail.agreement_acknowledged_at ? ` on ${formatBookingDateTime(detail.agreement_acknowledged_at)}` : ""}.
          </p>
          <Field id="verified" label="Outcome *">
            <select id="verified" className="filter-select" style={inputStyle} value={verified ? "verify" : "reject"} onChange={(e) => setVerified(e.target.value === "verify")}>
              <option value="verify">Verify — signed copy is valid</option>
              <option value="reject">Reject — changes needed</option>
            </select>
          </Field>
          {verified && (
            <Field id="signed" label="Signed agreement upload *" error={errors.file} hint={signedFiles.length === 0 ? undefined : "Only uploads for the current agreement version are listed."}>
              {signedFiles.length === 0 ? (
                <div className="ins-alert error" role="alert">
                  <span>The customer has not uploaded a signed copy of version {detail.agreement_version} yet.</span>
                </div>
              ) : (
                <select id="signed" className="filter-select" style={inputStyle} value={fileId} onChange={(e) => setFileId(e.target.value)}>
                  {signedFiles.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.filename} · {formatBookingDateTime(f.uploaded_at)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <Field id="verify-notes" label={verified ? "Notes" : "Message *"} error={errors.notes}>
            <textarea id="verify-notes" className="ins-prob-input" style={{ ...inputStyle, textAlign: "left" }} rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      )}
    </ActionDialog>
  );
}

/* ─── Final confirmation ─── */

export function FinalConfirmModal({ detail, onClose, onDone }: BaseProps) {
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setApiError(null);
    try {
      const result = await finalConfirmBooking(detail.id);
      await onDone(`Booking confirmed. Verified paid: ${formatBookingMoney(result.verified_paid)}.`);
    } catch (err) {
      setApiError(getApiErrorMessage(err, "The booking could not be confirmed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog title="Confirm booking" titleId="final-title" error={apiError} busy={busy} submitLabel="Confirm booking" onClose={onClose} onSubmit={(e) => void submit(e)}>
      <p style={{ marginTop: 0 }}>
        This confirms the booking and ends the hold. It requires a verified agreement and verified payments covering the
        booking amount ({formatBookingMoney(detail.booking_amount)}).
      </p>
      <div className="ins-warning-box" role="note">
        <span>Verify the customer's payments in the Payments module first. The server rejects the confirmation if funds are insufficient.</span>
      </div>
    </ActionDialog>
  );
}
