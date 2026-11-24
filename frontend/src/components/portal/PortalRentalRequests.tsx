import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  GridIcon,
  SendIcon,
  TableIcon,
  XIcon,
} from "../common/SupportPortalIcons";
import { RentalStatusBadge } from "../rentals/RentalWidgets";
import {
  cancelPortalRentalBookingRequest,
  createPortalRentalBookingRequest,
  getPortalRentalBookingRequest,
  getPortalRentalBookingRequests,
  getPortalRentalProperties,
} from "../../services/customerPortalRentalService";
import { emitPortalNotificationsChanged } from "../../services/customerPortalNotificationService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime, parseBackendDate } from "../../utils/bookingJourney";
import { formatDay, formatRent, frequencySuffix } from "../../utils/rentalHelpers";
import { RENTAL_REQUEST_OPEN_STATUSES } from "../../types/rentalBookingRequest";
import "../../pages/portal/CustomerPortalRentals.css";
import type {
  EligibleRentalProperty,
  PortalRentalBookingRequestDetail,
  RentalBookingRequest,
  RentalBookingRequestPortalCreate,
} from "../../types/rentalBookingRequest";

/** What happens next, from the status the backend returned (never inferred from anything else). */
const nextStep = (r: RentalBookingRequest): string => {
  switch (r.status) {
    case "Requested":
      return "Our team is reviewing your request. The property is held for you while they do.";
    case "Approved":
      return "Approved. Our team is preparing your agreement; you will be notified when it is ready to sign.";
    case "Agreement Created":
      return "Your agreement has been created. Open it under My Rentals & Leases to review and sign.";
    case "Activated":
      return "";
    case "Rejected":
      return r.rejection_reason ? `Declined: ${r.rejection_reason}` : "This request was declined.";
    case "Cancelled":
      return r.cancellation_reason ? `Cancelled: ${r.cancellation_reason}` : "This request was cancelled.";
    case "Expired":
      return "The hold on this property expired before the request was completed.";
    case "Expired - Payment Review":
      return "The hold expired while a payment was awaiting review. Our team will contact you.";
    default:
      return "";
  }
};

/** The hold is only shown as active while the request is still open and the expiry is in the future. */
const holdText = (r: RentalBookingRequest, now = Date.now()): string | null => {
  if (!RENTAL_REQUEST_OPEN_STATUSES.includes(r.status) || !r.hold_expires_at) return null;
  const expires = parseBackendDate(r.hold_expires_at);
  if (!expires) return null;
  return expires.getTime() > now ? `Property held until ${formatBookingDateTime(r.hold_expires_at)}` : "The hold has expired — refresh to see the latest status";
};

const parseMoney = (raw: string, allowZero: boolean): number | null => {
  const text = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  if (n > 999_999_999_999.99) return null;
  return n > 0 || (allowZero && n === 0) ? n : null;
};

export const RENTAL_PAYMENT_PLANS = [
  "Monthly Rent",
  "Quarterly Rent",
  "Half-Yearly Rent",
  "Annual Rent",
] as const;
export type RentalPaymentPlan = (typeof RENTAL_PAYMENT_PLANS)[number];

/**
 * The customer's rent / lease requests (separate from agreements): browse available rentals, request one, follow the
 * request and cancel it while it is still open. Everything comes from /api/v1/customer-portal/rental-* - the backend holds the
 * property when the request is submitted, and decides whether it can be cancelled.
 */
export default function PortalRentalRequests({ names, onChanged }: { names: Record<string, string>; onChanged?: () => void }) {
  const [requests, setRequests] = useState<RentalBookingRequest[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [propertyNames, setPropertyNames] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    try {
      return (localStorage.getItem("cp_rental_requests_view") as "grid" | "table") || "grid";
    } catch {
      return "grid";
    }
  });

  const handleToggleView = (mode: "grid" | "table") => {
    setViewMode(mode);
    try {
      localStorage.setItem("cp_rental_requests_view", mode);
    } catch {
      /* storage unavailable */
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await getPortalRentalBookingRequests());
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to load your rental requests."));
      setRequests((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const nameOf = (r: RentalBookingRequest) => propertyNames[r.property_id] ?? names[r.property_id] ?? `${r.booking_type} property`;
  const changed = async (message: string) => {
    setNotice(message);
    emitPortalNotificationsChanged();
    await load();
    onChanged?.();
  };

  return (
    <section className="cp-panel cp-rentals-section" aria-label="Rental requests">
      <div className="cp-rentals-section-header">
        <div className="cp-rentals-section-title-wrap">
          <h2 className="cp-rentals-section-title">Rental Requests</h2>
          <p className="cp-rentals-section-desc">Request a rent or lease property. Once approved, our team prepares your agreement.</p>
        </div>
        <div className="cp-rentals-header-actions">
          <div className="cp-view-toggle" role="group" aria-label="Rental requests view mode">
            <button
              type="button"
              className={`cp-view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => handleToggleView("grid")}
              aria-pressed={viewMode === "grid"}
              title="Grid view"
            >
              <GridIcon size={14} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`cp-view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => handleToggleView("table")}
              aria-pressed={viewMode === "table"}
              title="Table view"
            >
              <TableIcon size={14} />
              <span>Table</span>
            </button>
          </div>
          <button className="btn-primary cp-rentals-action-btn" onClick={() => setRequesting(true)}>
            Request a rental
          </button>
        </div>
      </div>

      {notice && (
        <div className="support-alert success" role="status" style={{ marginTop: 12 }}>
          <CheckCircleIcon size={18} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="support-alert error" role="alert" style={{ marginTop: 12 }}>
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {requests === undefined ? (
        <div className="cp-rentals-grid" aria-busy="true" style={{ marginTop: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="cp-skeleton cp-rental-skeleton" />
          ))}
        </div>
      ) : requests.length === 0 && !error ? (
        <div className="cp-empty-state cp-rentals-empty-state">
          <p>You have not requested a rental yet. Browse available properties and submit a request to start your tenancy.</p>
        </div>
      ) : viewMode === "table" ? (
        <div className="cp-table-card" style={{ marginTop: 12 }}>
          <div className="cp-table-responsive">
            <table className="cp-table cp-rentals-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Property Status</th>
                  <th>Request Status</th>
                  <th>Rent</th>
                  <th>Deposit</th>
                  <th>Term</th>
                  <th>Hold / Note</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const hold = holdText(r);
                  const approved = r.approved_rent_amount != null;
                  const isBooked =
                    r.status === "Approved" ||
                    r.status === "Agreement Created" ||
                    r.status === "Activated";
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="cp-table-cell-title">
                          <strong>{nameOf(r)}</strong>
                          <span className="cp-table-cell-sub">
                            {r.booking_type} request · #{r.id.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td>
                        {isBooked ? (
                          <RentalStatusBadge status="Booked" />
                        ) : (
                          <span style={{ color: "var(--cp-text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <RentalStatusBadge status={r.status} />
                      </td>
                      <td>
                        <div className="cp-table-cell-amount">
                          <strong>
                            {formatRent(
                              approved ? r.approved_rent_amount : r.proposed_rent_amount,
                              r.rent_frequency
                            )}
                          </strong>
                          <span className="cp-table-cell-sub">
                            {approved ? "Approved" : "Proposed"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="cp-table-cell-amount">
                          <strong>
                            {formatRent(
                              r.approved_deposit_amount ?? r.proposed_deposit_amount
                            )}
                          </strong>
                          <span className="cp-table-cell-sub">
                            {r.approved_deposit_amount != null ? "Approved" : "Proposed"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="cp-table-cell-dates">
                          <span>
                            {formatDay(r.desired_start_date)} →{" "}
                            {r.desired_end_date ? formatDay(r.desired_end_date) : "open-ended"}
                          </span>
                          {r.duration_months && (
                            <span className="cp-table-cell-sub">
                              {r.duration_months} mo
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="cp-table-cell-note">
                          {hold ? (
                            <span className="cp-hold-pill">{hold}</span>
                          ) : nextStep(r) ? (
                            <span className="cp-nextstep-text">{nextStep(r)}</span>
                          ) : (
                            <span style={{ color: "var(--cp-text-muted)" }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn-secondary cp-table-action-btn"
                          onClick={() => setOpenId(r.id)}
                        >
                          View details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="cp-rentals-grid" style={{ marginTop: 12 }}>
          {requests.map((r) => {
            const hold = holdText(r);
            const approved = r.approved_rent_amount != null;
            const isBooked = r.status === "Approved" || r.status === "Agreement Created" || r.status === "Activated";
            return (
              <article key={r.id} className="cp-req-card cp-rental-card">
                <div className="cp-req-card-head cp-rental-card-head">
                  <div className="cp-rental-card-title-group">
                    <h3 className="cp-req-card-title cp-rental-card-title">{nameOf(r)}</h3>
                    <p className="cp-req-card-sub cp-rental-card-sub">
                      {r.booking_type} request · #{r.id.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {isBooked && <RentalStatusBadge status="Booked" />}
                    <RentalStatusBadge status={r.status} />
                  </div>
                </div>
                <div className="cp-rental-card-body">
                  <dl className="cp-req-facts cp-rental-facts">
                    {isBooked && (
                      <div className="cp-req-fact cp-rental-fact">
                        <dt>Property Status</dt>
                        <dd>
                          <RentalStatusBadge status="Booked" />
                        </dd>
                      </div>
                    )}
                    <div className="cp-req-fact cp-rental-fact">
                      <dt>{approved ? "Approved rent" : "Proposed rent"}</dt>
                      <dd>{formatRent(approved ? r.approved_rent_amount : r.proposed_rent_amount, r.rent_frequency)}</dd>
                    </div>
                    <div className="cp-req-fact cp-rental-fact">
                      <dt>{r.approved_deposit_amount != null ? "Approved deposit" : "Proposed deposit"}</dt>
                      <dd>{formatRent(r.approved_deposit_amount ?? r.proposed_deposit_amount)}</dd>
                    </div>
                    <div className="cp-req-fact cp-rental-fact full-width">
                      <dt>Term</dt>
                      <dd>
                        {formatDay(r.desired_start_date)} → {r.desired_end_date ? formatDay(r.desired_end_date) : "open-ended"}
                        {r.duration_months ? ` (${r.duration_months} mo)` : ""}
                      </dd>
                    </div>
                  </dl>
                  {hold && <p className="bj-note bj-warn cp-rental-note">{hold}</p>}
                  {nextStep(r) && <p className="cp-ticket-snippet cp-rental-snippet">{nextStep(r)}</p>}
                </div>
                <div className="cp-rental-card-foot">
                  <button className="btn-secondary cp-rental-card-btn" onClick={() => setOpenId(r.id)}>
                    View details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {requesting && (
        <RequestDialog
          onClose={() => setRequesting(false)}
          onNames={(map) => setPropertyNames((prev) => ({ ...prev, ...map }))}
          onSubmitted={async (created) => {
            setRequesting(false);
            const until = created.hold_expires_at ? ` The property is held for you until ${formatBookingDateTime(created.hold_expires_at)}.` : "";
            await changed(`Your rental request was submitted.${until}`);
          }}
        />
      )}
      {openId && (
        <DetailDialog
          id={openId}
          name={nameOf(requests?.find((r) => r.id === openId) ?? ({ property_id: "", booking_type: "Rent" } as RentalBookingRequest))}
          onClose={() => setOpenId(null)}
          onCancelled={async () => {
            setOpenId(null);
            await changed("Your rental request was cancelled and the property hold was released.");
          }}
        />
      )}
    </section>
  );
}

/* ─── new request ─── */

function RequestDialog({
  onClose,
  onSubmitted,
  onNames,
}: {
  onClose: () => void;
  onSubmitted: (created: RentalBookingRequest) => void | Promise<void>;
  onNames: (map: Record<string, string>) => void;
}) {
  const [properties, setProperties] = useState<EligibleRentalProperty[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [paymentPlan, setPaymentPlan] = useState<RentalPaymentPlan>("Monthly Rent");
  const [rent, setRent] = useState("");
  const [deposit, setDeposit] = useState("");
  const [start, setStart] = useState("");
  const [duration, setDuration] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPortalRentalProperties()
      .then((list) => {
        if (cancelled) return;
        setProperties(list);
        onNames(Object.fromEntries(list.map((p) => [p.id, p.name])));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(getApiErrorMessage(err, "Failed to load the available rentals."));
        setProperties([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const property = useMemo(() => properties?.find((p) => p.id === propertyId) ?? null, [properties, propertyId]);

  const pick = (id: string) => {
    const p = properties?.find((x) => x.id === id);
    setPropertyId(id);
    setRent(p ? String(Number(p.price)) : "");
    setDeposit(p?.security_deposit != null ? String(Number(p.security_deposit)) : "");
    setErrors({});
    setFormError(null);
  };

  const validate = (): RentalBookingRequestPortalCreate | null => {
    const e: Record<string, string> = {};
    if (!property) e.property = "Choose a property.";
    const rentValue = parseMoney(rent, false);
    if (rentValue === null) e.rent = "Enter a valid rent greater than zero (at most 2 decimals).";
    const depositValue = deposit.trim() === "" ? null : parseMoney(deposit, true);
    if (deposit.trim() !== "" && depositValue === null) e.deposit = "Enter a valid deposit (0 or more, at most 2 decimals).";
    if (!start) e.start = "Choose the date you want to move in.";
    let months: number | null = null;
    if (duration.trim() !== "") {
      months = Number(duration);
      if (!Number.isInteger(months) || months < 1 || months > 600) e.duration = "Duration must be a whole number of months between 1 and 600.";
    }
    if (end && start && end < start) e.end = "The end date cannot be before the start date.";
    if (property && !e.duration && months !== null) {
      if (property.minimum_term_months != null && months < property.minimum_term_months) e.duration = `The minimum term for this property is ${property.minimum_term_months} months.`;
      if (property.maximum_term_months != null && months > property.maximum_term_months) e.duration = `The maximum term for this property is ${property.maximum_term_months} months.`;
    }
    // Backend rule: a Lease needs a fixed end (a duration or an end date).
    if (property?.listing_type === "Lease" && !end && months === null) e.duration = "A lease needs a fixed term: enter the duration in months or an end date.";
    setErrors(e);
    if (Object.keys(e).length > 0 || !property || rentValue === null) return null;
    const effectiveNotes = [`Payment Plan: ${paymentPlan}`, notes.trim()].filter(Boolean).join("\n");
    return {
      property_id: property.id,
      booking_type: property.listing_type as "Rent" | "Lease",
      proposed_rent_amount: rentValue,
      ...(depositValue !== null ? { proposed_deposit_amount: depositValue } : {}),
      desired_start_date: start,
      desired_end_date: end || null,
      duration_months: months,
      customer_notes: effectiveNotes || null,
    };
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const payload = validate();
    if (!payload) return;
    setBusy(true);
    setFormError(null);
    try {
      await onSubmitted(await createPortalRentalBookingRequest(payload));
    } catch (err) {
      setFormError(getApiErrorMessage(err, "Your request could not be submitted."));
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (k: string) => (errors[k] ? <span className="bj-field-error" role="alert">{errors[k]}</span> : null);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="rr-title">
        <div className="modal-header">
          <h2 id="rr-title">Request a rental</h2>
          <button className="modal-close-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="modal-body">
            {formError && (
              <div className="support-alert error cp-inline-error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{formError}</span>
              </div>
            )}
            {loadError && (
              <div className="support-alert error cp-inline-error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{loadError}</span>
              </div>
            )}
            {properties === undefined ? (
              <div className="cp-skeleton" aria-busy="true" />
            ) : properties.length === 0 && !loadError ? (
              <p className="cp-ticket-snippet">There are no rent or lease properties available right now.</p>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="rr-property">Property *</label>
                  <select id="rr-property" value={propertyId} onChange={(e) => pick(e.target.value)} aria-invalid={Boolean(errors.property)}>
                    <option value="">Select a property…</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.listing_type}, {formatRent(p.price, p.price_frequency)}
                        {p.city ? ` · ${p.city}` : ""}
                      </option>
                    ))}
                  </select>
                  {fieldError("property")}
                </div>
                {property && (
                  <p className="cp-ticket-snippet" style={{ margin: "0 0 12px" }}>
                    {[property.property_type, property.bedrooms != null ? `${property.bedrooms} bed` : null, property.furnishing, property.address, [property.city, property.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                    {property.minimum_term_months != null || property.maximum_term_months != null
                      ? ` · Term: ${property.minimum_term_months ?? "any"}–${property.maximum_term_months ?? "any"} months`
                      : ""}
                  </p>
                )}
                <div className="form-group">
                  <label htmlFor="rr-rent">Your proposed rent{property && frequencySuffix(property.price_frequency) ? ` ${frequencySuffix(property.price_frequency)}` : ""} *</label>
                  <input id="rr-rent" inputMode="decimal" value={rent} onChange={(e) => setRent(e.target.value)} aria-invalid={Boolean(errors.rent)} />
                  {fieldError("rent")}
                </div>
                <div className="form-group">
                  <label htmlFor="rr-deposit">Security deposit you will pay</label>
                  <input id="rr-deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} aria-invalid={Boolean(errors.deposit)} />
                  {fieldError("deposit")}
                </div>
                <div className="form-group">
                  <label htmlFor="rr-start">Move-in date *</label>
                  <input id="rr-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-invalid={Boolean(errors.start)} />
                  {fieldError("start")}
                </div>
                <div className="form-group">
                  <label htmlFor="rr-duration">Duration (months){property?.listing_type === "Lease" ? " *" : ""}</label>
                  <input id="rr-duration" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} aria-invalid={Boolean(errors.duration)} />
                  {fieldError("duration")}
                </div>
                <div className="form-group">
                  <label htmlFor="rr-end">Or end date</label>
                  <input id="rr-end" type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={Boolean(errors.end)} />
                  {fieldError("end")}
                </div>
                <div className="form-group">
                  <label htmlFor="rr-payment-plan">Payment Plan *</label>
                  <select
                    id="rr-payment-plan"
                    value={paymentPlan}
                    onChange={(e) => setPaymentPlan(e.target.value as RentalPaymentPlan)}
                  >
                    {RENTAL_PAYMENT_PLANS.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="rr-notes">Notes for our team (optional)</label>
                  <textarea id="rr-notes" rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
                <p className="cp-ticket-snippet" style={{ margin: 0 }}>
                  Submitting places a temporary hold on the property while our team reviews your request.
                </p>
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Close
            </button>
            <button type="submit" className="btn-primary" disabled={busy || !properties || properties.length === 0}>
              <SendIcon size={15} />
              <span>{busy ? "Submitting…" : "Submit Rental Request"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── details + cancel ─── */

function DetailDialog({ id, name, onClose, onCancelled }: { id: string; name: string; onClose: () => void; onCancelled: () => void | Promise<void> }) {
  const [detail, setDetail] = useState<PortalRentalBookingRequestDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPortalRentalBookingRequest(id)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err, "Failed to load this request."));
        setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const canCancel = Boolean(detail && RENTAL_REQUEST_OPEN_STATUSES.includes(detail.status));
  const isDetailBooked = Boolean(
    detail && (detail.status === "Approved" || detail.status === "Agreement Created" || detail.status === "Activated")
  );

  const extractedPaymentPlan = useMemo(() => {
    if (!detail?.customer_notes) return null;
    const match = detail.customer_notes.match(/Payment Plan:\s*([^\n\r]+)/);
    return match && match[1] ? match[1].trim() : null;
  }, [detail?.customer_notes]);

  const cleanCustomerNotes = useMemo(() => {
    if (!detail?.customer_notes) return "";
    return detail.customer_notes.replace(/Payment Plan:\s*[^\n\r]+\n?/, "").trim();
  }, [detail?.customer_notes]);

  const confirmCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (reason.trim().length < 3) {
      setReasonError("Tell us why you are cancelling (at least 3 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await cancelPortalRentalBookingRequest(id, reason.trim());
      await onCancelled();
    } catch (err) {
      setError(getApiErrorMessage(err, "The request could not be cancelled."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="rd-title">
        <div className="modal-header">
          <h2 id="rd-title">{name}</h2>
          <button className="modal-close-btn" onClick={onClose} disabled={busy} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="support-alert error cp-inline-error" role="alert">
              <AlertCircleIcon size={18} />
              <span>{error}</span>
            </div>
          )}
          {detail === undefined && <div className="cp-skeleton" aria-busy="true" />}
          {detail && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className="cp-req-card-sub">
                  {detail.booking_type} request · #{detail.id.slice(0, 8).toUpperCase()}
                </span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {isDetailBooked && <RentalStatusBadge status="Booked" />}
                  <RentalStatusBadge status={detail.status} />
                </div>
              </div>
              <dl className="cp-req-facts">
                {isDetailBooked && <Fact label="Property Status" value="Booked" />}
                <Fact label="Proposed rent" value={formatRent(detail.proposed_rent_amount, detail.rent_frequency)} />
                <Fact label="Approved rent" value={detail.approved_rent_amount != null ? formatRent(detail.approved_rent_amount, detail.rent_frequency) : "Awaiting approval"} />
                <Fact label="Proposed deposit" value={formatRent(detail.proposed_deposit_amount)} />
                <Fact label="Approved deposit" value={detail.approved_deposit_amount != null ? formatRent(detail.approved_deposit_amount) : "Awaiting approval"} />
                <Fact label="Maintenance" value={Number(detail.maintenance_amount) > 0 ? formatRent(detail.maintenance_amount, detail.maintenance_frequency) : "None"} />
                <Fact label="Move-in" value={formatDay(detail.desired_start_date)} />
                <Fact label="End" value={detail.desired_end_date ? formatDay(detail.desired_end_date) : "Open-ended"} />
                <Fact label="Duration" value={detail.duration_months ? `${detail.duration_months} months` : "—"} />
                <Fact label="Payment Plan" value={extractedPaymentPlan ?? "Monthly Rent"} />
                <Fact label="Lock-in" value={`${detail.lock_in_months} months`} />
                <Fact label="Notice period" value={`${detail.notice_period_days} days`} />
                <Fact label="Rent due day" value={`Day ${detail.due_day} of the period`} />
                <Fact label="Submitted" value={formatBookingDateTime(detail.created_at)} />
              </dl>
              {holdText(detail) && <p className="bj-note bj-warn" style={{ margin: "12px 0 0" }}>{holdText(detail)}</p>}
              {nextStep(detail) && <p className="cp-ticket-snippet" style={{ margin: "12px 0 0" }}>{nextStep(detail)}</p>}
              {detail.terms_notes && (
                <p className="cp-ticket-snippet" style={{ margin: "12px 0 0" }}>
                  <strong>Terms from our team:</strong> {detail.terms_notes}
                </p>
              )}
              {cleanCustomerNotes && (
                <p className="cp-ticket-snippet" style={{ margin: "12px 0 0" }}>
                  <strong>Your notes:</strong> {cleanCustomerNotes}
                </p>
              )}
              {detail.agreement && (
                <p style={{ margin: "14px 0 0" }}>
                  <Link to={`/portal/rentals/${detail.agreement.id}`} className="btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
                    Open your agreement ({detail.agreement.status})
                  </Link>
                </p>
              )}
              {cancelling && (
                <form onSubmit={confirmCancel} noValidate style={{ marginTop: 16 }}>
                  <div className="form-group">
                    <label htmlFor="rd-reason">Why are you cancelling? *</label>
                    <textarea id="rd-reason" rows={3} maxLength={5000} value={reason} onChange={(e) => { setReason(e.target.value); setReasonError(null); }} aria-invalid={Boolean(reasonError)} />
                    {reasonError && <span className="bj-field-error" role="alert">{reasonError}</span>}
                  </div>
                  <p className="cp-ticket-snippet" style={{ margin: "0 0 10px" }}>Cancelling releases the property hold. This cannot be undone.</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn-secondary" onClick={() => setCancelling(false)} disabled={busy}>
                      Keep my request
                    </button>
                    <button type="submit" className="btn-primary" disabled={busy}>
                      {busy ? "Cancelling…" : "Yes, cancel rental request"}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
          {canCancel && !cancelling && (
            <button type="button" className="btn-secondary" onClick={() => setCancelling(true)}>
              Cancel rental request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="cp-req-fact">
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);
