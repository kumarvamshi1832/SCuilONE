import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircleIcon, XIcon } from "../common/SupportPortalIcons";
import { RentalStatusBadge } from "../rentals/RentalWidgets";
import {
  createCancellationRequest,
  createRefundRequest,
  createServiceRequest,
  getCancellationRequests,
  getRefundRequests,
  getServiceRequests,
} from "../../services/customerPortalLifecycleService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime, formatBookingMoney } from "../../utils/bookingJourney";
import {
  CANCELLATION_REASON_MIN,
  REFUND_REASON_MIN,
  REFUND_RESERVING_STATUSES,
  SERVICE_REQUEST_CATEGORY_SUGGESTIONS,
  SERVICE_REQUEST_PRIORITIES,
} from "../../types/customerLifecycle";
import type { CancellationRequest, RefundRequest, ServiceRequest, ServiceRequestPriority } from "../../types/customerLifecycle";
import type { BookingRequestDetail } from "../../types/customerBookingJourney";

const cents = (v: string | number) => Math.round(Number(v) * 100);

/**
 * Cancellation, refund and after-sales requests of ONE booking (Customer Portal > Booking Requests > a request).
 * Rules mirrored from backend/app/routes/customer_portal_lifecycle.py - the server stays the authority and its messages are shown:
 *   cancellation  only Pending / Confirmed bookings, one Pending request at a time
 *   refund        only against a Verified payment, within what is not already reserved by a Pending / Processed refund,
 *                 and not once the sale is Completed; staff review and process it (the customer never approves a refund)
 *   after-sales   only once the sale is Completed
 */
export default function PortalBookingLifecycle({
  detail,
  notify,
}: {
  detail: BookingRequestDetail;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const bookingId = detail.booking?.id ?? detail.booking_id ?? null;
  const bookingStatus = detail.booking?.status ?? null;

  const [cancellations, setCancellations] = useState<CancellationRequest[] | undefined>(undefined);
  const [refunds, setRefunds] = useState<RefundRequest[] | undefined>(undefined);
  const [services, setServices] = useState<ServiceRequest[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "cancel" | "refund" | "service">(null);

  const load = useCallback(async () => {
    if (!bookingId) return;
    setError(null);
    const [c, r, s] = await Promise.allSettled([getCancellationRequests(), getRefundRequests(bookingId), getServiceRequests()]);
    if (c.status === "fulfilled") setCancellations(c.value.filter((x) => x.booking_id === bookingId));
    else setError(getApiErrorMessage(c.reason, "Failed to load your cancellation requests."));
    if (r.status === "fulfilled") setRefunds(r.value);
    else setError((prev) => prev ?? getApiErrorMessage(r.reason, "Failed to load your refund requests."));
    if (s.status === "fulfilled") setServices(s.value.filter((x) => x.booking_id === bookingId));
    else setError((prev) => prev ?? getApiErrorMessage(s.reason, "Failed to load your service requests."));
  }, [bookingId]);
  useEffect(() => {
    void load();
  }, [load, detail.updated_at]);

  // Verified payments with an unreserved balance (the same arithmetic the server applies).
  const refundable = useMemo(() => {
    return (detail.payments ?? [])
      .filter((p) => p.status === "Verified")
      .map((p) => {
        const reserved = (refunds ?? []).filter((x) => x.payment_id === p.id && REFUND_RESERVING_STATUSES.includes(x.status)).reduce((sum, x) => sum + cents(x.amount), 0);
        return { payment: p, availableCents: cents(p.amount) - reserved };
      })
      .filter((x) => x.availableCents > 0);
  }, [detail.payments, refunds]);

  if (!bookingId) return null;

  const pendingCancellation = cancellations?.find((c) => c.status === "Pending");
  const canCancel = (bookingStatus === "Pending" || bookingStatus === "Confirmed") && !pendingCancellation;
  const canRefund = bookingStatus !== "Completed" && bookingStatus !== null && refundable.length > 0;
  const completed = bookingStatus === "Completed";

  const done = async (message: string) => {
    setDialog(null);
    notify(message);
    await load();
  };

  return (
    <section className="cp-panel" aria-label="Cancellation, refunds and after-sales">
      <h2 className="cp-panel-title">Cancellation, refunds &amp; after-sales</h2>
      {error && (
        <div className="support-alert error" role="alert" style={{ marginBottom: 12 }}>
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <h3 style={{ fontSize: "0.95rem", margin: "4px 0 6px" }}>Booking cancellation</h3>
      {cancellations === undefined ? (
        <div className="cp-skeleton" aria-busy="true" />
      ) : cancellations.length === 0 ? (
        <p className="cp-ticket-snippet" style={{ margin: "0 0 8px" }}>
          {bookingStatus === "Cancelled" ? "This booking is cancelled." : completed ? "This sale is completed, so the booking can no longer be cancelled." : "You have not asked to cancel this booking."}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px", display: "grid", gap: 8 }}>
          {cancellations.map((c) => (
            <li key={c.id} className="bj-note" style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{formatBookingDateTime(c.created_at)}</strong>
                <RentalStatusBadge status={c.status} />
              </div>
              <div>{c.reason}</div>
              {c.staff_notes && (
                <div className="cp-ticket-snippet" style={{ marginTop: 4 }}>
                  <strong>Our team:</strong> {c.staff_notes}
                </div>
              )}
              {c.status === "Pending" && <div className="cp-ticket-snippet" style={{ marginTop: 4 }}>Waiting for our team to review it.</div>}
            </li>
          ))}
        </ul>
      )}
      {canCancel && (
        <button className="btn-secondary" onClick={() => setDialog("cancel")}>
          Request cancellation
        </button>
      )}

      <h3 style={{ fontSize: "0.95rem", margin: "18px 0 6px" }}>Refund requests</h3>
      {refunds === undefined ? (
        <div className="cp-skeleton" aria-busy="true" />
      ) : refunds.length === 0 ? (
        <p className="cp-ticket-snippet" style={{ margin: "0 0 8px" }}>No refund requests for this booking.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px", display: "grid", gap: 8 }}>
          {refunds.map((r) => (
            <li key={r.id} className="bj-note" style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{formatBookingMoney(r.amount)}</strong>
                <RentalStatusBadge status={r.status} />
              </div>
              <div>{r.reason}</div>
              <div className="cp-ticket-snippet" style={{ marginTop: 4 }}>
                Requested {formatBookingDateTime(r.created_at)}
                {r.processed_at ? ` · Processed ${formatBookingDateTime(r.processed_at)}` : ""}
                {r.external_reference ? ` · Reference ${r.external_reference}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canRefund && (
        <button className="btn-secondary" onClick={() => setDialog("refund")}>
          Request a refund
        </button>
      )}
      {!canRefund && refunds !== undefined && !completed && bookingStatus !== "Cancelled" && (
        <p className="cp-ticket-snippet" style={{ margin: 0 }}>A refund can be requested against a payment once our team has verified it.</p>
      )}
      {completed && <p className="cp-ticket-snippet" style={{ margin: 0 }}>Refund requests are not available after the sale is completed.</p>}

      <h3 style={{ fontSize: "0.95rem", margin: "18px 0 6px" }}>After-sales requests</h3>
      {!completed ? (
        <p className="cp-ticket-snippet" style={{ margin: 0 }}>After-sales and maintenance requests open once your sale is completed.</p>
      ) : services === undefined ? (
        <div className="cp-skeleton" aria-busy="true" />
      ) : (
        <>
          {services.length === 0 ? (
            <p className="cp-ticket-snippet" style={{ margin: "0 0 8px" }}>No after-sales requests yet.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px", display: "grid", gap: 8 }}>
              {services.map((s) => (
                <li key={s.id} className="bj-note" style={{ display: "block" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong>{s.subject}</strong>
                    <RentalStatusBadge status={s.status} />
                  </div>
                  <div className="cp-ticket-snippet">
                    {s.category} · {s.priority} priority · {formatBookingDateTime(s.created_at)}
                  </div>
                  <div>{s.description}</div>
                  {s.resolution && (
                    <div className="cp-ticket-snippet" style={{ marginTop: 4 }}>
                      <strong>Resolution:</strong> {s.resolution}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button className="btn-secondary" onClick={() => setDialog("service")}>
            New after-sales request
          </button>
        </>
      )}

      {dialog === "cancel" && <CancelDialog bookingId={bookingId} onClose={() => setDialog(null)} onDone={() => done("Your cancellation request was sent to our team.")} />}
      {dialog === "refund" && (
        <RefundDialog
          bookingId={bookingId}
          options={refundable.map((x) => ({ id: x.payment.id, label: `${formatBookingMoney(x.payment.amount)} paid ${x.payment.payment_date ? formatBookingDateTime(x.payment.payment_date) : ""}`.trim(), availableCents: x.availableCents }))}
          onClose={() => setDialog(null)}
          onDone={() => done("Your refund request was sent to our team. They will review and process it.")}
        />
      )}
      {dialog === "service" && <ServiceDialog bookingId={bookingId} onClose={() => setDialog(null)} onDone={() => done("Your after-sales request was submitted.")} />}
    </section>
  );
}

/* ─── dialogs ─── */

function Shell({ title, id, busy, onClose, onSubmit, submitLabel, error, children }: { title: string; id: string; busy: boolean; onClose: () => void; onSubmit: (e: FormEvent) => void; submitLabel: string; error: string | null; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-header">
          <h2 id={id}>{title}</h2>
          <button className="modal-close-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <form onSubmit={onSubmit} noValidate>
          <div className="modal-body">
            {error && (
              <div className="support-alert error cp-inline-error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{error}</span>
              </div>
            )}
            {children}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Close
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Sending…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const FieldError = ({ text }: { text?: string }) => (text ? <span className="bj-field-error" role="alert">{text}</span> : null);

function CancelDialog({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | undefined>();
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (reason.trim().length < CANCELLATION_REASON_MIN) {
      setErr(`Please explain why you want to cancel (at least ${CANCELLATION_REASON_MIN} characters).`);
      return;
    }
    setBusy(true);
    setApiError(null);
    try {
      await createCancellationRequest(bookingId, reason.trim());
      await onDone();
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Your cancellation request could not be sent."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Request cancellation" id="cx-title" busy={busy} onClose={onClose} onSubmit={submit} submitLabel="Send request" error={apiError}>
      <p style={{ margin: "0 0 12px" }} className="cp-ticket-snippet">
        Our team reviews every cancellation. If you have already paid, the refund has to be processed before the cancellation can be approved.
      </p>
      <div className="form-group">
        <label htmlFor="cx-reason">Reason *</label>
        <textarea id="cx-reason" rows={4} maxLength={5000} value={reason} onChange={(e) => { setReason(e.target.value); setErr(undefined); }} aria-invalid={Boolean(err)} />
        <FieldError text={err} />
      </div>
    </Shell>
  );
}

function RefundDialog({
  bookingId,
  options,
  onClose,
  onDone,
}: {
  bookingId: string;
  options: Array<{ id: string; label: string; availableCents: number }>;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [paymentId, setPaymentId] = useState(options.length === 1 ? (options[0]?.id ?? "") : "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const option = options.find((o) => o.id === paymentId);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const er: Record<string, string> = {};
    if (!option) er.payment = "Choose the payment to refund.";
    const text = amount.trim().replace(/,/g, "");
    const value = Number(text);
    if (!/^\d+(\.\d{1,2})?$/.test(text) || !(value > 0)) er.amount = "Enter an amount greater than zero (at most 2 decimals).";
    else if (option && Math.round(value * 100) > option.availableCents) er.amount = `You can request at most ${formatBookingMoney(option.availableCents / 100)} for this payment.`;
    if (reason.trim().length < REFUND_REASON_MIN) er.reason = `Please explain the refund (at least ${REFUND_REASON_MIN} characters).`;
    setErrors(er);
    if (Object.keys(er).length > 0 || !option) return;
    setBusy(true);
    setApiError(null);
    try {
      await createRefundRequest(bookingId, { payment_id: option.id, amount: value, reason: reason.trim() });
      await onDone();
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Your refund request could not be sent."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Request a refund" id="rf-title" busy={busy} onClose={onClose} onSubmit={submit} submitLabel="Send request" error={apiError}>
      <p style={{ margin: "0 0 12px" }} className="cp-ticket-snippet">A refund request is reviewed and processed by our team. Sending it does not return any money by itself.</p>
      <div className="form-group">
        <label htmlFor="rf-payment">Payment *</label>
        <select id="rf-payment" value={paymentId} onChange={(e) => { setPaymentId(e.target.value); setErrors((p) => ({ ...p, payment: "", amount: "" })); }}>
          <option value="">Select a verified payment…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label} — up to {formatBookingMoney(o.availableCents / 100)} refundable
            </option>
          ))}
        </select>
        <FieldError text={errors.payment} />
      </div>
      <div className="form-group">
        <label htmlFor="rf-amount">Amount *</label>
        <input id="rf-amount" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setErrors((p) => ({ ...p, amount: "" })); }} aria-invalid={Boolean(errors.amount)} />
        <FieldError text={errors.amount} />
      </div>
      <div className="form-group">
        <label htmlFor="rf-reason">Reason *</label>
        <textarea id="rf-reason" rows={3} maxLength={5000} value={reason} onChange={(e) => { setReason(e.target.value); setErrors((p) => ({ ...p, reason: "" })); }} aria-invalid={Boolean(errors.reason)} />
        <FieldError text={errors.reason} />
      </div>
    </Shell>
  );
}

function ServiceDialog({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ServiceRequestPriority>("Medium");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const er: Record<string, string> = {};
    if (category.trim().length < 2 || category.trim().length > 60) er.category = "Enter a category (2-60 characters).";
    if (subject.trim().length < 3 || subject.trim().length > 200) er.subject = "Enter a subject (3-200 characters).";
    if (description.trim().length < 10) er.description = "Describe the issue (at least 10 characters).";
    setErrors(er);
    if (Object.keys(er).length > 0) return;
    setBusy(true);
    setApiError(null);
    try {
      await createServiceRequest(bookingId, { category: category.trim(), subject: subject.trim(), description: description.trim(), priority });
      await onDone();
    } catch (error) {
      setApiError(getApiErrorMessage(error, "Your request could not be submitted."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="New after-sales request" id="sv-title" busy={busy} onClose={onClose} onSubmit={submit} submitLabel="Submit request" error={apiError}>
      <div className="form-group">
        <label htmlFor="sv-category">Category *</label>
        <input id="sv-category" list="sv-categories" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} aria-invalid={Boolean(errors.category)} />
        <datalist id="sv-categories">
          {SERVICE_REQUEST_CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <FieldError text={errors.category} />
      </div>
      <div className="form-group">
        <label htmlFor="sv-subject">Subject *</label>
        <input id="sv-subject" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={Boolean(errors.subject)} />
        <FieldError text={errors.subject} />
      </div>
      <div className="form-group">
        <label htmlFor="sv-description">Description *</label>
        <textarea id="sv-description" rows={4} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={Boolean(errors.description)} />
        <FieldError text={errors.description} />
      </div>
      <div className="form-group">
        <label htmlFor="sv-priority">Priority</label>
        <select id="sv-priority" value={priority} onChange={(e) => setPriority(e.target.value as ServiceRequestPriority)}>
          {SERVICE_REQUEST_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
    </Shell>
  );
}
