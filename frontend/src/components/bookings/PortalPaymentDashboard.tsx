import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  BOOKING_FILE_UPLOAD_ENDPOINT,
  JOURNEY_FILE_EXTENSIONS,
  submitBookingPayment,
  uploadBookingFile,
} from "../../services/customerPortalJourneyService";
import { downloadPaymentReceiptPdf, getPaymentReceipt } from "../../services/customerPortalReceiptService";
import type { PaymentReceipt } from "../../services/customerPortalReceiptService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import {
  customerConfirmationSteps,
  customerInstallmentStatus,
  customerPayability,
  customerPaymentSummary,
  parseDueDate,
} from "../../utils/bookingPayments";
import {
  describeJourneyUploadError,
  validateJourneyFile,
  validateJourneyFileBasics,
} from "../../utils/journeyFileUpload";
import { centsToNumber, formatInr, formatInrCents, parseAmountToCents, toCents } from "../../utils/money";
import { PAYMENT_METHODS } from "../../types/customerBookingJourney";
import type { BookingPaymentMethod, BookingRequestDetail, JourneyPayment } from "../../types/customerBookingJourney";
import type { PortalBooking } from "../../types/customerPortal";
import { PAYMENT_METHODS_REQUIRING_REFERENCE } from "../../types/payment";
import ConfirmationChecklist from "./ConfirmationChecklist";
import "./BookingPayments.css";

interface PortalPaymentDashboardProps {
  detail: BookingRequestDetail;
  /** The customer's booking (schedule, balances). null when it could not be loaded - see `bookingError`. */
  booking: PortalBooking | null;
  bookingError: string | null;
  holdExpired: boolean;
  /** Re-fetches the request and booking from the API. */
  onChanged: () => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
}

interface FormState {
  installment_id: string;
  amount: string;
  method: BookingPaymentMethod;
  reference: string;
  paymentDate: string;
  notes: string;
}

const EMPTY_FORM: FormState = { installment_id: "", amount: "", method: "Bank Transfer", reference: "", paymentDate: "", notes: "" };

const chipClass = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "paid" || s === "verified") return "paid";
  if (s === "partially paid") return "partial";
  if (s === "overdue" || s === "rejected") return "overdue";
  if (s === "due today" || s === "pending" || s === "pending verification" || s === "awaiting verification") return "due";
  return "upcoming";
};

const formatDay = (value: string | null | undefined): string => {
  const d = parseDueDate(value);
  return d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
};

/**
 * Customer payment dashboard for one booking request. Every figure comes from the API:
 *   - the portal booking endpoint (price, token, verified paid, remaining balance, schedule),
 *   - the booking-request endpoint (payment list, proof files, agreement and buyer-detail state).
 * "Paid" always means VERIFIED by the finance team; payments awaiting verification are shown separately.
 */
export default function PortalPaymentDashboard({ detail, booking, bookingError, holdExpired, onChanged, notify }: PortalPaymentDashboardProps) {
  const summary = useMemo(
    () => customerPaymentSummary({ booking, request: { agreed_price: detail.agreed_price, booking_amount: detail.booking_amount, payments: detail.payments } }),
    [booking, detail]
  );
  const plan = booking?.payment_plan && booking.payment_plan.status === "Active" ? booking.payment_plan : null;
  const installments = useMemo(() => [...(plan?.installments ?? [])].sort((a, b) => a.sequence - b.sequence), [plan]);
  const preference = booking?.payment_preference ?? detail.payment_preference;
  const buyerDetailsSubmitted = Boolean(detail.booking?.buyer_details_submitted_at);

  const payability = customerPayability({
    requestStatus: detail.status,
    holdExpired,
    buyerDetailsSubmitted,
    hasBooking: Boolean(detail.booking_id),
    paymentPreference: preference,
    planActive: booking ? Boolean(plan) : null,
    summary,
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const proofInput = useRef<HTMLInputElement>(null);

  const [proofFor, setProofFor] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);

  const [receipt, setReceipt] = useState<{ payment: JourneyPayment; data: PaymentReceipt | null; error: string | null; loading: boolean } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const payableInstallments = installments.filter((i) => (i.status || "").toLowerCase() !== "paid");
  const selectedInstallment = installments.find((i) => i.id === form.installment_id) ?? null;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const onPickInstallment = (id: string) => {
    const inst = installments.find((i) => i.id === id);
    setForm((prev) => ({
      ...prev,
      installment_id: id,
      // Pre-fill only for an untouched instalment: a part-paid one has an outstanding amount only the server knows.
      amount:
        prev.amount || !inst
          ? prev.amount
          : inst.payable_amount !== undefined
          ? toCents(inst.payable_amount) > 0 ? String(centsToNumber(toCents(inst.payable_amount))) : prev.amount
          : (inst.status || "").toLowerCase() !== "pending" ? prev.amount : String(centsToNumber(toCents(inst.amount))),
    }));
    setErrors((prev) => ({ ...prev, installment_id: "" }));
  };

  const dueQuickFill = (): number | null => {
    if (payability.needsInstallment) {
      if (!selectedInstallment) return null;
      if (selectedInstallment.payable_amount !== undefined) return toCents(selectedInstallment.payable_amount);
      return (selectedInstallment.status || "").toLowerCase() === "pending" ? toCents(selectedInstallment.amount) : null;
    }
    return payability.maxCents;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || !payability.allowed) return;
    const next: Record<string, string> = {};
    const cents = parseAmountToCents(form.amount);
    if (cents === null || cents <= 0) next.amount = "Enter an amount greater than zero (up to 2 decimals).";
    else if (payability.maxCents !== null && cents > payability.maxCents) {
      next.amount = `The most you can pay right now is ${formatInrCents(payability.maxCents)}.`;
    }
    if (payability.needsInstallment) {
      if (!selectedInstallment) next.installment_id = "Select the instalment this payment is for.";
      else if (selectedInstallment.payable_amount !== undefined && cents !== null && cents > toCents(selectedInstallment.payable_amount)) {
        next.amount =
          toCents(selectedInstallment.payable_amount) <= 0
            ? "Nothing more can be submitted for this instalment right now (the rest is already awaiting verification or paid)."
            : `You can pay at most ${formatInr(selectedInstallment.payable_amount)} towards this instalment right now.`;
      } else if (cents !== null && cents > toCents(selectedInstallment.amount)) {
        next.amount = `This instalment is ${formatInr(selectedInstallment.amount)}; you cannot pay more than that towards it.`;
      }
    }
    if (PAYMENT_METHODS_REQUIRING_REFERENCE.includes(form.method) && !form.reference.trim()) {
      next.reference = `A transaction/reference number is required for ${form.method}.`;
    }
    if (form.reference.length > 255) next.reference = "Reference cannot exceed 255 characters.";
    if (form.notes.length > 3000) next.notes = "Notes cannot exceed 3000 characters.";
    if (form.paymentDate && new Date(form.paymentDate).getTime() > Date.now() + 60_000) next.paymentDate = "The payment date cannot be in the future.";
    if (proof) {
      const problem = validateJourneyFileBasics(proof);
      if (problem) next.proof = problem;
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || cents === null) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitBookingPayment(detail.id, {
        installment_id: payability.needsInstallment ? form.installment_id : null,
        amount: centsToNumber(cents),
        payment_method: form.method,
        transaction_reference: form.reference.trim() || null,
        payment_date: form.paymentDate ? new Date(form.paymentDate).toISOString() : null,
        notes: form.notes.trim() || null,
      });
      if (proof) {
        try {
          await uploadBookingFile(detail.id, proof, "Payment Proof", result.id);
        } catch (uploadErr) {
          notify(`Payment submitted, but the proof upload failed: ${describeJourneyUploadError(uploadErr, BOOKING_FILE_UPLOAD_ENDPOINT).message} You can attach it from the history below.`, "error");
        }
      }
      notify(result.message || "Payment details submitted. The finance team must verify the payment.");
      setForm(EMPTY_FORM);
      setProof(null);
      if (proofInput.current) proofInput.current.value = "";
      await onChanged();
    } catch (err) {
      // 409/422 carry the exact reason (limit exceeded, duplicate reference, buyer details missing, ...).
      setSubmitError(getApiErrorMessage(err, "Failed to submit the payment."));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const attachProof = async (paymentId: string) => {
    if (!proofFile) return;
    const problem = await validateJourneyFile(proofFile);
    if (problem) return setProofError(problem);
    setProofError(null);
    try {
      await uploadBookingFile(detail.id, proofFile, "Payment Proof", paymentId);
      notify("Payment proof uploaded.");
      setProofFor(null);
      setProofFile(null);
      await onChanged();
    } catch (err) {
      setProofError(describeJourneyUploadError(err, BOOKING_FILE_UPLOAD_ENDPOINT).message);
    }
  };

  const openReceipt = async (payment: JourneyPayment) => {
    if (!detail.booking_id) return;
    setReceipt({ payment, data: null, error: null, loading: true });
    try {
      const data = await getPaymentReceipt(detail.booking_id, payment.id);
      setReceipt({ payment, data, error: null, loading: false });
    } catch (err) {
      setReceipt({ payment, data: null, error: getApiErrorMessage(err, "The receipt could not be loaded."), loading: false });
    }
  };

  const downloadPdf = async (payment: JourneyPayment) => {
    if (!detail.booking_id) return;
    setDownloadingId(payment.id);
    try {
      await downloadPaymentReceiptPdf(detail.booking_id, payment.id);
    } catch (err) {
      notify(err instanceof Error ? err.message : "The receipt could not be downloaded.", "error");
    } finally {
      setDownloadingId(null);
    }
  };

  const tokenRemaining = Math.max(0, summary.bookingAmountCents - summary.tokenPaidCents);
  const tokenStatus =
    tokenRemaining === 0 && summary.bookingAmountCents > 0
      ? "Paid"
      : summary.pendingCents > 0 && detail.status === "Approved"
      ? "Awaiting verification"
      : detail.status === "Approved"
      ? "Due"
      : "Upcoming";

  const history = [...detail.payments].sort((a, b) => (Date.parse(b.payment_date ?? "") || 0) - (Date.parse(a.payment_date ?? "") || 0));
  const hasSchedule = installments.length > 0;
  const err = (key: string) => (errors[key] ? <small className="pw-err" role="alert">{errors[key]}</small> : null);
  const quick = dueQuickFill();

  const confirmationSteps = customerConfirmationSteps({
    requestStatus: detail.status,
    holdExpired,
    buyerDetailsSubmitted,
    agreementStatus: detail.agreement_status,
    verifiedNetCents: summary.paidCents,
    pendingCents: summary.pendingCents,
    bookingAmountCents: summary.bookingAmountCents,
  });

  if (!detail.booking_id) {
    return (
      <section className="cp-panel pw-root" aria-label="Payments">
        <h2 className="cp-panel-title">Payments</h2>
        <p className="pw-notice">Payments open once your booking request is approved.</p>
      </section>
    );
  }

  return (
    <>
      <section className="cp-panel pw-root pw-section" aria-label="Payment summary">
        <h2 className="cp-panel-title">Payment summary</h2>

        {bookingError && (
          <div className="pw-notice warn" role="status">
            Your full payment details could not be loaded ({bookingError}). The figures below come from your booking request; your instalment schedule is
            unavailable. Use Refresh to try again.
          </div>
        )}

        <div className="pw-cards">
          <div className="pw-card"><div className="pw-card-label">Total property price</div><div className="pw-card-value">{formatInrCents(summary.priceCents)}</div></div>
          <div className="pw-card"><div className="pw-card-label">Booking amount</div><div className="pw-card-value">{formatInrCents(summary.bookingAmountCents)}</div><div className="pw-card-note">Part of the price, not extra</div></div>
          <div className="pw-card good"><div className="pw-card-label">Total amount paid</div><div className="pw-card-value">{formatInrCents(summary.paidCents)}</div><div className="pw-card-note">Verified payments only{summary.refundedCents > 0 ? `, after ${formatInrCents(summary.refundedCents)} refunded` : ""}</div></div>
          <div className="pw-card warn"><div className="pw-card-label">Remaining balance</div><div className="pw-card-value">{formatInrCents(summary.remainingCents)}</div></div>
          <div className="pw-card"><div className="pw-card-label">Instalments</div><div className="pw-card-value">{hasSchedule ? summary.installmentCount : "—"}</div>{!hasSchedule && <div className="pw-card-note">{booking ? "No schedule yet" : "Could not be loaded"}</div>}</div>
          <div className="pw-card good"><div className="pw-card-label">Instalments paid</div><div className="pw-card-value">{hasSchedule ? summary.installmentsPaid : "—"}</div></div>
          <div className="pw-card"><div className="pw-card-label">Instalments remaining</div><div className="pw-card-value">{hasSchedule ? summary.installmentsRemaining : "—"}</div></div>
        </div>

        <div className="pw-progress">
          <div className="pw-progress-head">
            <span>{formatInrCents(summary.paidCents)} of {formatInrCents(summary.priceCents)} paid</span>
            <strong>{summary.progressPercent}%</strong>
          </div>
          <div className="pw-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.progressPercent} aria-label="Payment progress">
            <div className="pw-progress-fill" style={{ width: `${summary.progressPercent}%` }} />
          </div>
        </div>

        {summary.pendingCount > 0 && (
          <div className="pw-notice" role="status">
            {summary.pendingCount} payment{summary.pendingCount === 1 ? "" : "s"} totalling <strong>{formatInrCents(summary.pendingCents)}</strong> {summary.pendingCount === 1 ? "is" : "are"} awaiting
            verification by our finance team. {summary.pendingCount === 1 ? "It is" : "They are"} not counted as paid until verified.
          </div>
        )}

        {summary.next && (
          <div className="pw-next">
            <strong>Next instalment:</strong> #{summary.next.sequence} {summary.next.name} — {formatInr(summary.next.amount)} due {formatDay(summary.next.due_date)}
            {customerInstallmentStatus(summary.next) === "Overdue" ? " (overdue)" : ""}
          </div>
        )}
      </section>

      <section className="cp-panel pw-root pw-section" aria-label="Payment schedule">
        <h2 className="cp-panel-title">Payment schedule</h2>
        <div className="pw-table-wrap">
          <table className="pw-table">
            <thead>
              <tr>
                <th>Instalment</th>
                <th>Due date</th>
                <th className="num">Amount</th>
                <th className="num">Paid</th>
                <th className="num">Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.bookingAmountCents > 0 && (
                <tr>
                  <td>
                    <strong>Booking / token amount</strong>
                    <div className="pw-sub">Part of the agreed price</div>
                  </td>
                  <td>On booking</td>
                  <td className="num">{formatInrCents(summary.bookingAmountCents)}</td>
                  <td className="num">{formatInrCents(summary.tokenPaidCents)}</td>
                  <td className="num">{formatInrCents(tokenRemaining)}</td>
                  <td><span className={`pw-chip ${chipClass(tokenStatus)}`}>{tokenStatus}</span></td>
                </tr>
              )}
              {installments.map((inst) => {
                const derived = customerInstallmentStatus(inst);
                const hasAllocation = inst.paid_amount !== undefined;
                // The backend's payment_state (Paid / Partially Paid / Pending Verification / Overdue / Upcoming) when present.
                const status: string = inst.payment_state && inst.payment_state !== "Cancelled" ? inst.payment_state : derived;
                const isNext = summary.next?.id === inst.id;
                const paid = status === "Paid";
                return (
                  <tr key={inst.id} className={isNext ? "pw-row-next" : ""}>
                    <td>
                      <strong>#{inst.sequence} {inst.name}</strong>
                    </td>
                    <td>{formatDay(inst.due_date)}</td>
                    <td className="num">{formatInr(inst.amount)}</td>
                    <td className="num">
                      {hasAllocation ? (
                        <>
                          {formatInr(inst.paid_amount)}
                          {toCents(inst.pending_amount) > 0 && <div className="pw-sub">{formatInr(inst.pending_amount)} awaiting verification</div>}
                        </>
                      ) : paid ? formatInr(inst.amount) : <span className="pw-unknown" title="This server version does not report part-payments per instalment.">—</span>}
                    </td>
                    <td className="num">{hasAllocation ? formatInr(inst.outstanding_amount) : paid ? formatInrCents(0) : status === "Partially Paid" ? <span className="pw-unknown" title="The remaining amount of a part-paid instalment is shown when you pay.">see below</span> : formatInr(inst.amount)}</td>
                    <td><span className={`pw-chip ${chipClass(status)}`}>{status}</span></td>
                  </tr>
                );
              })}
              {!hasSchedule && (
                <tr>
                  <td colSpan={6} className="pw-unknown">
                    {booking
                      ? booking.payment_plan && booking.payment_plan.status !== "Active"
                        ? "Your previous instalment schedule was cancelled. Our team will set up a new one if needed."
                        : preference === "Installments"
                        ? "Your instalment schedule has not been created yet. Our team will create it and you will be notified here."
                        : "You chose full payment, so there is no instalment schedule."
                      : `The schedule could not be loaded${bookingError ? ` (${bookingError})` : ""}. Use Refresh to try again.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cp-panel pw-root pw-section" aria-label="Submit a payment">
        <h2 className="cp-panel-title">Submit a payment</h2>
        {!payability.allowed ? (
          <div className="pw-notice warn" role="status">{payability.reason}</div>
        ) : (
          <form className="pw-form" onSubmit={handleSubmit} noValidate>
            <p className="pw-notice" style={{ margin: 0 }}>
              {payability.phase === "token"
                ? <>You can pay up to <strong>{formatInrCents(payability.maxCents ?? 0)}</strong> now (the booking amount). </>
                : payability.needsInstallment
                ? <>Choose the instalment you are paying. </>
                : <>You can pay up to <strong>{formatInrCents(payability.maxCents ?? 0)}</strong> (your remaining balance). </>}
              Pay using the instructions above, then record it here. It only counts once our finance team verifies it.
            </p>
            {submitError && <div className="pw-notice error" role="alert">{submitError}</div>}
            <div className="pw-grid">
              {payability.needsInstallment && (
                <div className={`pw-field full ${errors.installment_id ? "has-error" : ""}`}>
                  <label htmlFor="pw-installment">Instalment *</label>
                  <select id="pw-installment" value={form.installment_id} onChange={(e) => onPickInstallment(e.target.value)} disabled={submitting}>
                    <option value="">Select instalment…</option>
                    {payableInstallments.map((i) => (
                      <option key={i.id} value={i.id}>
                        #{i.sequence} {i.name} · {formatInr(i.payable_amount ?? i.amount)}{i.payable_amount !== undefined ? " payable" : ""} · due {formatDay(i.due_date)}
                      </option>
                    ))}
                  </select>
                  {payableInstallments.length === 0 && <small>All instalments are paid.</small>}
                  {err("installment_id")}
                </div>
              )}
              <div className={`pw-field ${errors.amount ? "has-error" : ""}`}>
                <label htmlFor="pw-amount">Amount (INR) *</label>
                <input id="pw-amount" type="text" inputMode="decimal" value={form.amount} disabled={submitting} onChange={(e) => setField("amount", e.target.value)} aria-invalid={Boolean(errors.amount)} placeholder="e.g. 50000" />
                {quick !== null && quick > 0 && (
                  <small>
                    <button type="button" className="btn-link" style={{ background: "none", border: "none", color: "var(--pw-accent)", cursor: "pointer", padding: 0 }} onClick={() => setField("amount", String(centsToNumber(quick)))}>
                      Use {formatInrCents(quick)}
                    </button>
                  </small>
                )}
                {err("amount")}
              </div>
              <div className="pw-field">
                <label htmlFor="pw-method">Payment method *</label>
                <select id="pw-method" value={form.method} disabled={submitting} onChange={(e) => setField("method", e.target.value as BookingPaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              </div>
              <div className={`pw-field ${errors.reference ? "has-error" : ""}`}>
                <label htmlFor="pw-ref">Transaction reference{PAYMENT_METHODS_REQUIRING_REFERENCE.includes(form.method) ? " *" : ""}</label>
                <input id="pw-ref" type="text" maxLength={255} value={form.reference} disabled={submitting} onChange={(e) => setField("reference", e.target.value)} />
                {err("reference")}
              </div>
              <div className={`pw-field ${errors.paymentDate ? "has-error" : ""}`}>
                <label htmlFor="pw-date">Payment date</label>
                <input id="pw-date" type="datetime-local" value={form.paymentDate} disabled={submitting} onChange={(e) => setField("paymentDate", e.target.value)} />
                {err("paymentDate")}
              </div>
              <div className="pw-field full">
                <label htmlFor="pw-notes">Notes</label>
                <textarea id="pw-notes" rows={2} maxLength={3000} value={form.notes} disabled={submitting} onChange={(e) => setField("notes", e.target.value)} />
                {err("notes")}
              </div>
              <div className="pw-field full">
                <label htmlFor="pw-proof">Payment proof (optional)</label>
                <input id="pw-proof" ref={proofInput} type="file" accept={JOURNEY_FILE_EXTENSIONS.join(",")} disabled={submitting} onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
                <small>PDF, JPG or PNG, up to 5 MB.</small>
                {err("proof")}
              </div>
            </div>
            <div className="pw-actions">
              <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Submitting…" : "Submit payment details"}</button>
            </div>
          </form>
        )}
      </section>

      <section className="cp-panel pw-root pw-section" aria-label="Payment history">
        <h2 className="cp-panel-title">Payment history</h2>
        {history.length === 0 ? (
          <p className="pw-notice">No payments have been recorded for this booking yet.</p>
        ) : (
          <ul className="pw-history">
            {history.map((p) => {
              const hasProof = detail.files.some((f) => f.payment_id === p.id);
              return (
                <li key={p.id}>
                  <div className="pw-main">
                    <span className="pw-amount">{formatInr(p.amount)} · {p.method ?? "—"}</span>
                    <span className="pw-meta">
                      {p.reference ? `Ref ${p.reference} · ` : ""}
                      {p.payment_date ? `Paid on ${formatBookingDateTime(p.payment_date)}` : ""}
                      {p.status === "Verified" && p.verified_at ? ` · Verified ${formatBookingDateTime(p.verified_at)}` : ""}
                      {p.status === "Pending" ? " · Awaiting finance verification" : ""}
                      {p.status === "Rejected" ? " · Rejected — contact our team or submit the payment again" : ""}
                    </span>
                    {proofFor === p.id && (
                      <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                        <input type="file" accept={JOURNEY_FILE_EXTENSIONS.join(",")} onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} aria-label="Payment proof file" />
                        <button type="button" className="btn-secondary" onClick={() => void attachProof(p.id)} disabled={!proofFile}>Upload</button>
                        <button type="button" className="btn-secondary" onClick={() => setProofFor(null)}>Cancel</button>
                      </span>
                    )}
                    {proofFor === p.id && proofError && <span className="pw-notice error">{proofError}</span>}
                  </div>
                  <div className="pw-side">
                    <span className={`pw-chip ${chipClass(p.status)}`}>{p.status === "Pending" ? "Pending verification" : p.status}</span>
                    {p.status === "Pending" && !hasProof && proofFor !== p.id && (
                      <button type="button" className="btn-secondary" onClick={() => { setProofFor(p.id); setProofFile(null); setProofError(null); }}>Attach proof</button>
                    )}
                    {hasProof && p.status === "Pending" && <span className="pw-meta">Proof uploaded</span>}
                    {p.status === "Verified" && (
                      <>
                        <button type="button" className="btn-secondary" onClick={() => void openReceipt(p)}>Receipt</button>
                        <button type="button" className="btn-secondary" onClick={() => void downloadPdf(p)} disabled={downloadingId === p.id}>{downloadingId === p.id ? "Preparing…" : "PDF"}</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {detail.status !== "Rejected" && detail.status !== "Expired" && detail.status !== "Cancelled" && (
        <section className="cp-panel pw-root">
          <ConfirmationChecklist
            title="Booking confirmation"
            intro="Your booking is confirmed by our sales team once these steps are complete."
            checks={confirmationSteps}
          />
        </section>
      )}

      {receipt && (
        <div className="pw-modal-overlay" role="presentation" onClick={() => setReceipt(null)}>
          <div className="pw-modal pw-root" role="dialog" aria-modal="true" aria-labelledby="pw-receipt-title" onClick={(e) => e.stopPropagation()}>
            <h3 id="pw-receipt-title">Payment receipt</h3>
            {receipt.loading ? (
              <p>Loading receipt…</p>
            ) : receipt.error ? (
              <div className="pw-notice error" role="alert">{receipt.error}</div>
            ) : receipt.data ? (
              <>
                <dl className="pw-facts">
                  <div><dt>Amount</dt><dd>{formatInr(receipt.data.amount)}</dd></div>
                  <div><dt>Method</dt><dd>{receipt.data.payment_method}</dd></div>
                  <div><dt>Reference</dt><dd>{receipt.data.transaction_reference || "Not provided"}</dd></div>
                  <div><dt>Payment date</dt><dd>{formatBookingDateTime(receipt.data.payment_date)}</dd></div>
                  <div><dt>Verified</dt><dd>{formatBookingDateTime(receipt.data.verified_at)}</dd></div>
                  <div><dt>Status</dt><dd>{receipt.data.status}</dd></div>
                </dl>
                <p className="pw-notice" style={{ marginTop: 10 }}>{receipt.data.note}</p>
              </>
            ) : null}
            <div className="pw-actions" style={{ justifyContent: "flex-end", marginTop: 12 }}>
              <button type="button" className="btn-secondary" onClick={() => setReceipt(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
