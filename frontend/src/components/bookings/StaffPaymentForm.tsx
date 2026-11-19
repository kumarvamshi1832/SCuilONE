import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { PAYMENT_METHODS, PAYMENT_METHODS_REQUIRING_REFERENCE } from "../../types/payment";
import type { Payment, PaymentCreate } from "../../types/payment";
import type { PaymentPlan } from "../../types/paymentPlan";
import { staffBalance } from "../../utils/bookingPayments";
import { centsToNumber, formatInrCents, parseAmountToCents, toCents } from "../../utils/money";
import "./BookingPayments.css";

/**
 * Staff "Record payment" form, shared by the Bookings screen and the Payments screen.
 *
 * What the backend does (routes/payments.py), mirrored here only to warn early - the server stays the authority and
 * its message is shown when it disagrees:
 *   - A recorded payment is ALWAYS created as "Pending". It is not "paid" until a user with verify permission
 *     verifies it (POST /decision).
 *   - Payable cap = booking amount while the booking is Pending, agreed price once Confirmed. A payment may not
 *     exceed  cap - (Pending + Verified) + processed refunds.
 *   - With an Active payment plan every payment must name an instalment.
 *   - UPI / Bank Transfer / Cheque / Demand Draft / Card need a transaction reference.
 *   - The staff payments API has no document upload, so no receipt file is collected here.
 */

export type PaymentKind = "token" | "installment" | "partial" | "full" | "custom";

const KIND_LABEL: Record<PaymentKind, string> = {
  token: "Token / booking amount",
  installment: "Installment amount",
  partial: "Partial payment",
  full: "Full payment",
  custom: "Custom / other amount",
};

export interface StaffPaymentFormBooking {
  id: string;
  status: string;
  booking_amount: string | number;
  agreed_price: string | number;
  payment_preference?: string;
}

interface StaffPaymentFormProps {
  booking: StaffPaymentFormBooking;
  buyerName?: string | null;
  propertyName?: string | null;
  payments: readonly Payment[];
  /** Sum of PROCESSED refunds for the booking (paise). null = not loaded: the cap is then left to the server. */
  refundedCents: number | null;
  plan: PaymentPlan | null;
  /** Instalment to pre-select (Payments screen). */
  initialInstallmentId?: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (payload: PaymentCreate) => Promise<void> | void;
  onCancel: () => void;
}

const today = (): string => new Date().toISOString().slice(0, 10);

const instOutstandingCents = (inst: PaymentPlan["installments"][number]): number =>
  inst.outstanding_balance !== undefined
    ? toCents(inst.outstanding_balance)
    : Math.max(0, toCents(inst.amount) - toCents(inst.net_collected ?? inst.total_verified ?? 0));

export default function StaffPaymentForm({
  booking,
  buyerName,
  propertyName,
  payments,
  refundedCents,
  plan,
  initialInstallmentId,
  submitting,
  error,
  onSubmit,
  onCancel,
}: StaffPaymentFormProps) {
  const activePlan = plan && plan.status === "Active" ? plan : null;
  const bal = useMemo(() => staffBalance(booking, payments, refundedCents ?? 0), [booking, payments, refundedCents]);
  const capKnown = refundedCents !== null;
  const bookingAmountCents = toCents(booking.booking_amount);
  const agreedCents = toCents(booking.agreed_price);

  const unpaidInstallments = useMemo(
    () => (activePlan?.installments ?? []).filter((i) => i.status !== "Paid" && i.status !== "Cancelled"),
    [activePlan]
  );

  /** Money already submitted (Pending) against one instalment: it also has to fit inside the instalment. */
  const pendingForInstallment = (id: string): number =>
    payments.filter((p) => p.status === "Pending" && p.installment_id === id).reduce((s, p) => s + toCents(p.amount), 0);
  const instalmentRoom = (id: string): number => {
    const inst = (activePlan?.installments ?? []).find((i) => i.id === id);
    return inst ? Math.max(0, instOutstandingCents(inst) - pendingForInstallment(id)) : 0;
  };

  const availableKinds = useMemo(() => {
    const kinds: PaymentKind[] = [];
    const room = capKnown ? bal.availableCents > 0 : true;
    if (!activePlan && booking.status === "Pending" && room) kinds.push("token");
    if (activePlan && unpaidInstallments.length > 0) kinds.push("installment");
    if (room) kinds.push("partial");
    if (!activePlan && booking.status === "Confirmed" && room) kinds.push("full");
    kinds.push("custom");
    return kinds;
  }, [activePlan, booking.status, bal.availableCents, capKnown, unpaidInstallments.length]);

  const [kind, setKind] = useState<PaymentKind>(() => availableKinds[0] ?? "custom");
  const [installmentId, setInstallmentId] = useState(initialInstallmentId ?? "");
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<string>("Bank Transfer");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = useRef(false);

  const needsInstallment = Boolean(activePlan);
  const computedCents = (k: PaymentKind, instId: string): number | null => {
    if (k === "token") return capKnown ? bal.availableCents : Math.max(0, bookingAmountCents - bal.verifiedCents - bal.pendingCents);
    if (k === "installment") return instId ? instalmentRoom(instId) : null;
    if (k === "full") return capKnown ? bal.availableCents : Math.max(0, agreedCents - bal.verifiedCents - bal.pendingCents);
    return null;
  };
  const isComputed = kind === "token" || kind === "installment" || kind === "full";
  const computed = computedCents(kind, installmentId);
  const shownAmount = isComputed ? (computed !== null && computed > 0 ? String(centsToNumber(computed)) : "") : amountText;

  const pickKind = (k: PaymentKind) => {
    setKind(k);
    setErrors({});
    if (k === "installment" && !installmentId && unpaidInstallments[0]) setInstallmentId(unpaidInstallments[0].id);
  };

  const maxCents = (): number | null => {
    const caps: number[] = [];
    if (capKnown) caps.push(bal.availableCents);
    if (needsInstallment && installmentId) caps.push(instalmentRoom(installmentId));
    return caps.length ? Math.min(...caps) : null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current || submitting) return;
    const next: Record<string, string> = {};
    const cents = isComputed ? computed : parseAmountToCents(amountText);
    if (cents === null || cents <= 0) {
      next.amount = isComputed
        ? "There is nothing left to collect for this option. Pick another option or check the pending payments."
        : "Enter an amount greater than zero (up to 2 decimals).";
    } else {
      const max = maxCents();
      if (max !== null && cents > max) {
        next.amount =
          needsInstallment && installmentId && cents > instalmentRoom(installmentId)
            ? `This instalment can take at most ${formatInrCents(instalmentRoom(installmentId))} more (after pending payments).`
            : `The most that can be recorded right now is ${formatInrCents(max)} (pending payments are included).`;
      }
    }
    if (needsInstallment && !installmentId) next.installment_id = "Select the instalment - the active payment plan requires it.";
    if (PAYMENT_METHODS_REQUIRING_REFERENCE.includes(method) && !reference.trim()) {
      next.reference = `A transaction / reference number is required for ${method}.`;
    }
    if (reference.length > 255) next.reference = "Reference cannot exceed 255 characters.";
    if (notes.length > 5000) next.notes = "Notes cannot exceed 5000 characters.";
    if (paymentDate && paymentDate > today()) next.paymentDate = "The payment date cannot be in the future.";
    setErrors(next);
    if (Object.keys(next).length > 0 || cents === null) return;

    busy.current = true;
    try {
      await onSubmit({
        installment_id: needsInstallment ? installmentId : null,
        amount: centsToNumber(cents),
        payment_method: method,
        transaction_reference: reference.trim() || null,
        payment_date: paymentDate ? new Date(paymentDate).toISOString() : null,
        notes: notes.trim() || null,
      });
    } finally {
      busy.current = false;
    }
  };

  const err = (key: string) => (errors[key] ? <small className="pw-err" role="alert">{errors[key]}</small> : null);
  const nothingToCollect = capKnown && bal.availableCents <= 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="pw-root" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {error && <div className="pw-notice error" role="alert">{error}</div>}

        <dl className="pw-facts">
          <div><dt>Booking reference</dt><dd>#{booking.id.slice(0, 8).toUpperCase()}</dd></div>
          <div><dt>Customer</dt><dd>{buyerName || "—"}</dd></div>
          <div><dt>Property</dt><dd>{propertyName || "—"}</dd></div>
          <div><dt>Total agreed price</dt><dd>{formatInrCents(agreedCents)}</dd></div>
          <div><dt>Booking / token amount</dt><dd>{formatInrCents(bookingAmountCents)}</dd></div>
          <div><dt>Verified (net of refunds)</dt><dd>{formatInrCents(Math.max(0, bal.verifiedCents - bal.refundedCents))}</dd></div>
          <div><dt>Awaiting verification</dt><dd>{formatInrCents(bal.pendingCents)}</dd></div>
          <div>
            <dt>Can be recorded now</dt>
            <dd>
              {capKnown ? formatInrCents(bal.availableCents) : "Checked by the server"}
              <small style={{ display: "block", color: "var(--pw-muted)" }}>
                {booking.status === "Pending" ? "Limit is the booking amount until the booking is confirmed." : "Limit is the agreed price."}
              </small>
            </dd>
          </div>
        </dl>

        <div className="pw-notice warn" role="note">
          Recording a payment saves it as <strong>Pending</strong>. It is <strong>not counted as paid</strong> and the customer sees it as
          “awaiting verification” until a finance user verifies it.
        </div>

        {nothingToCollect && (
          <div className="pw-notice" role="status">
            {bal.pendingCents > 0
              ? "The payable amount is already covered by pending payments. Verify or reject them before recording another."
              : "The payable amount has been fully collected."}
          </div>
        )}

        <div className="pw-field full">
          <span>Payment type</span>
          <div className="pw-kinds" role="radiogroup" aria-label="Payment type">
            {availableKinds.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={`pw-kind ${kind === k ? "active" : ""}`}
                onClick={() => pickKind(k)}
                disabled={submitting}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        <div className="pw-grid">
          {needsInstallment && (
            <div className={`pw-field full ${errors.installment_id ? "has-error" : ""}`}>
              <label htmlFor="sp-installment">Instalment *</label>
              <select id="sp-installment" value={installmentId} disabled={submitting} onChange={(e) => { setInstallmentId(e.target.value); setErrors((p) => ({ ...p, installment_id: "", amount: "" })); }}>
                <option value="">Select instalment…</option>
                {unpaidInstallments.map((i) => (
                  <option key={i.id} value={i.id}>
                    #{i.sequence} {i.name} · due {new Date(i.due_date).toLocaleDateString()} · {formatInrCents(instalmentRoom(i.id))} open
                  </option>
                ))}
              </select>
              {err("installment_id")}
            </div>
          )}

          <div className={`pw-field ${errors.amount ? "has-error" : ""}`}>
            <label htmlFor="sp-amount">Amount received (INR) *</label>
            <input
              id="sp-amount"
              type="text"
              inputMode="decimal"
              value={shownAmount}
              readOnly={isComputed}
              disabled={submitting}
              placeholder={isComputed ? "" : "e.g. 250000"}
              onChange={(e) => { setAmountText(e.target.value); setErrors((p) => ({ ...p, amount: "" })); }}
              aria-invalid={Boolean(errors.amount)}
            />
            <small>
              {isComputed
                ? "Calculated from the balance - choose Partial or Custom to type a different amount."
                : kind === "partial"
                ? "Enter the part of the amount due that was actually received."
                : "Enter the exact amount received."}
            </small>
            {err("amount")}
          </div>

          <div className="pw-field">
            <label htmlFor="sp-method">Payment method *</label>
            <select id="sp-method" value={method} disabled={submitting} onChange={(e) => { setMethod(e.target.value); setErrors((p) => ({ ...p, reference: "" })); }}>
              {PAYMENT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </div>

          <div className={`pw-field ${errors.reference ? "has-error" : ""}`}>
            <label htmlFor="sp-ref">Transaction / reference ID{PAYMENT_METHODS_REQUIRING_REFERENCE.includes(method) ? " *" : ""}</label>
            <input id="sp-ref" type="text" maxLength={255} value={reference} disabled={submitting} onChange={(e) => { setReference(e.target.value); setErrors((p) => ({ ...p, reference: "" })); }} placeholder="UTR / NEFT / cheque no." />
            <small>Each reference can be used for one payment only.</small>
            {err("reference")}
          </div>

          <div className={`pw-field ${errors.paymentDate ? "has-error" : ""}`}>
            <label htmlFor="sp-date">Payment date</label>
            <input id="sp-date" type="date" max={today()} value={paymentDate} disabled={submitting} onChange={(e) => setPaymentDate(e.target.value)} />
            {err("paymentDate")}
          </div>

          <div className="pw-field full">
            <label htmlFor="sp-notes">Notes</label>
            <textarea id="sp-notes" rows={2} maxLength={5000} value={notes} disabled={submitting} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cheque received at site office" />
            {err("notes")}
          </div>
        </div>
      </div>

      <div className="modal-footer">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={submitting || nothingToCollect}>
          {submitting ? "Saving…" : "Record payment (pending verification)"}
        </button>
      </div>
    </form>
  );
}
