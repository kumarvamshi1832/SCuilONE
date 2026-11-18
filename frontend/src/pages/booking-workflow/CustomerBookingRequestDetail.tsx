import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getStaffBookingRequest,
  resolveStaffRequestContext,
  type StaffRequestContext,
} from "../../services/customerBookingWorkflowService";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { getApiErrorMessage } from "../../utils/apiError";
import {
  describeHold,
  formatBookingDateTime,
  formatBookingMoney,
  parseBackendDate,
} from "../../utils/bookingJourney";
import {
  BookingFacts,
  BookingStatusBadge,
  BookingTimeline,
} from "../../components/booking-journey/BookingJourneyWidgets";
import {
  AgreementPrepareModal,
  AgreementVerifyModal,
  DecisionModal,
  ExtendHoldModal,
  FinalConfirmModal,
  PaymentInstructionsModal,
} from "../../components/booking-journey/StaffBookingActions";
import type { BookingRequestDetail } from "../../types/customerBookingJourney";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";
import "../../components/booking-journey/BookingJourney.css";

type ModalKind = "decision" | "extend" | "instructions" | "agreement" | "verify" | "final" | null;

const formatSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function CustomerBookingRequestDetail() {
  const { industry, requestId } = useParams<{ industry: string; requestId: string }>();

  const perms = useMemo(
    () => ({
      view: hasFeaturePermission("booking.view"),
      decide: hasFeaturePermission("booking.create"),
      manage: hasFeaturePermission("booking.update"),
    }),
    []
  );

  const [detail, setDetail] = useState<BookingRequestDetail | null>(null);
  const [context, setContext] = useState<StaffRequestContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(
    async (silent = false) => {
      if (!requestId || !perms.view) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await getStaffBookingRequest(requestId);
        setDetail(data);
        resolveStaffRequestContext(data).then(setContext);
      } catch (err) {
        setDetail(null);
        setError(getApiErrorMessage(err, "Failed to load this booking request."));
      } finally {
        setLoading(false);
      }
    },
    [requestId, perms.view]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const backLink = (
    <Link to={`/${industry}/customer-booking-requests`} className="btn-secondary ins-btn-sm" style={{ textDecoration: "none", width: "fit-content" }}>
      ← Back to booking requests
    </Link>
  );

  if (!perms.view) {
    return (
      <div className="ins-page">
        <div className="leads-table-container">
          <div className="ins-empty">
            <h3>You do not have access to booking requests</h3>
            <p>Ask your administrator for the "View bookings" permission.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !detail) {
    return (
      <div className="ins-page" aria-busy="true">
        <div className="ins-skeleton" style={{ minHeight: 110 }} />
        <div className="ins-skeleton" style={{ minHeight: 260 }} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="ins-page">
        {backLink}
        <div className="ins-alert error" role="alert">
          <span>{error ?? "Booking request not found."}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const status = detail.status;
  const holdExpired = (() => {
    if (status !== "Approved") return false;
    const expiry = parseBackendDate(detail.hold_expires_at);
    return Boolean(expiry && expiry.getTime() <= Date.now());
  })();

  const can = {
    decide: perms.decide && status === "Requested",
    extend: perms.manage && status === "Approved" && Boolean(detail.hold_expires_at) && detail.extension_count < 2,
    instructions: perms.manage && (status === "Approved" || status === "Confirmed"),
    agreement: perms.manage && status === "Approved" && Boolean(detail.booking_id),
    verify: perms.manage && detail.agreement_status === "Customer Acknowledged",
    final: perms.manage && status === "Approved" && detail.agreement_status === "Verified" && !holdExpired,
  };
  const anyAction = Object.values(can).some(Boolean);
  const holdText = describeHold(detail.hold_expires_at, status);

  const onDone = async (message: string) => {
    setModal(null);
    showToast(message);
    await load(true);
  };
  const modalProps = { detail, onClose: () => setModal(null), onDone };

  return (
    <div className="ins-page">
      {toast && (
        <div className={`ins-alert ins-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      )}

      {backLink}

      <div className="page-header">
        <div>
          <h1>{context?.propertyName ?? `Booking request #${detail.id.slice(0, 8).toUpperCase()}`}</h1>
          <p className="text-muted">
            Request #{detail.id.slice(0, 8).toUpperCase()}
            {context?.customerName ? ` · ${context.customerName}` : ""}
          </p>
        </div>
        <div className="header-actions" style={{ alignItems: "center" }}>
          <BookingStatusBadge status={status} />
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {holdExpired && (
        <div className="ins-alert error" role="alert">
          <span>The hold expired. The request will be released automatically; extending is no longer possible.</span>
        </div>
      )}
      {status === "Expired - Payment Review" && (
        <div className="ins-alert info" role="status">
          <span>The hold expired while verified funds remain. Review the booking, refunds and reinstatement in the Payments and Bookings modules.</span>
        </div>
      )}

      <div className="bj-layout">
        <div className="bj-stack">
          <section className="ins-card" aria-label="Request overview">
            <h2 className="ins-card-title">Overview</h2>
            <BookingFacts
              items={[
                { label: "Property", value: context?.propertyName ?? "—" },
                { label: "Customer", value: context?.customerName ?? "—" },
                { label: "Customer requirement", value: context?.requirementSummary ?? "—" },
                { label: "Listed price", value: context?.propertyPrice != null ? formatBookingMoney(context.propertyPrice) : "—" },
                { label: "Agreed price", value: formatBookingMoney(detail.agreed_price) },
                { label: "Booking amount", value: formatBookingMoney(detail.booking_amount) },
                { label: "Payment preference", value: detail.payment_preference },
                { label: "Requested on", value: formatBookingDateTime(detail.created_at) },
                { label: "Last updated", value: formatBookingDateTime(detail.updated_at) },
                {
                  label: "Hold",
                  value: detail.hold_expires_at ? `${formatBookingDateTime(detail.hold_expires_at)}${holdText ? ` (${holdText})` : ""}` : "No active hold",
                },
                { label: "Hold extensions", value: `${detail.extension_count} of 2 used` },
                { label: "Booking", value: detail.booking_id ? `#${detail.booking_id.slice(0, 8).toUpperCase()}` : "Not created" },
              ]}
            />
            {(detail.customer_notes || detail.customer_message || detail.staff_notes) && (
              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                {detail.customer_notes && (
                  <div className="bj-note">
                    <strong>Customer notes:</strong> {detail.customer_notes}
                  </div>
                )}
                {detail.customer_message && (
                  <div className="bj-note">
                    <strong>Message sent to customer:</strong> {detail.customer_message}
                  </div>
                )}
                {detail.staff_notes && (
                  <div className="bj-note bj-warn" style={{ whiteSpace: "pre-wrap" }}>
                    <strong>Internal notes:</strong> {detail.staff_notes}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="ins-card" aria-label="Staff actions">
            <h2 className="ins-card-title">Actions</h2>
            {!anyAction ? (
              <p className="text-muted" style={{ margin: 0 }}>
                No actions are available for this request in its current state
                {!perms.manage && !perms.decide ? " or with your permissions" : ""}.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {can.decide && (
                  <button className="btn-primary" onClick={() => setModal("decision")}>
                    Approve / reject
                  </button>
                )}
                {can.instructions && (
                  <button className="btn-secondary" onClick={() => setModal("instructions")}>
                    {detail.payment_instructions ? "Edit payment instructions" : "Set payment instructions"}
                  </button>
                )}
                {can.agreement && (
                  <button className="btn-secondary" onClick={() => setModal("agreement")}>
                    {detail.agreement_status === "Not Prepared" ? "Prepare agreement" : "Prepare new agreement version"}
                  </button>
                )}
                {can.verify && (
                  <button className="btn-primary" onClick={() => setModal("verify")}>
                    Verify agreement
                  </button>
                )}
                {can.extend && (
                  <button className="btn-secondary" onClick={() => setModal("extend")}>
                    Extend hold
                  </button>
                )}
                {can.final && (
                  <button className="btn-primary" onClick={() => setModal("final")}>
                    Confirm booking
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="ins-card" aria-label="Payment instructions">
            <h2 className="ins-card-title">Payment instructions</h2>
            {detail.payment_instructions ? (
              <div className="bj-agreement">{detail.payment_instructions}</div>
            ) : (
              <p className="text-muted" style={{ margin: 0 }}>
                Not set yet{status === "Approved" || status === "Confirmed" ? " — customers need these to pay." : "."}
              </p>
            )}
          </section>

          <section className="ins-card" aria-label="Agreement">
            <h2 className="ins-card-title">
              Agreement <BookingStatusBadge status={detail.agreement_status} />
            </h2>
            {detail.agreement_status === "Not Prepared" ? (
              <p className="text-muted" style={{ margin: 0 }}>
                No agreement has been prepared.
              </p>
            ) : (
              <>
                <p className="text-muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
                  Version {detail.agreement_version}
                  {detail.agreement_acknowledged_at ? ` · acknowledged by the customer ${formatBookingDateTime(detail.agreement_acknowledged_at)}` : " · awaiting customer acknowledgement"}
                </p>
                <div className="bj-agreement" tabIndex={0} aria-label="Agreement text">
                  {detail.agreement_text}
                </div>
              </>
            )}
          </section>

          <section className="ins-card" aria-label="Payments">
            <h2 className="ins-card-title">
              Payments
              <Link to={`/${industry}/payments`} className="btn-secondary ins-btn-sm" style={{ textDecoration: "none" }}>
                Verify in Payments →
              </Link>
            </h2>
            {detail.payments.length === 0 ? (
              <p className="text-muted" style={{ margin: 0 }}>
                {detail.booking_id ? "The customer has not submitted any payments." : "Payments open after approval."}
              </p>
            ) : (
              <ul className="bj-list">
                {detail.payments.map((p) => (
                  <li key={p.id}>
                    <div className="bj-list-main">
                      <strong>
                        {formatBookingMoney(p.amount)} · {p.method ?? "—"}
                      </strong>
                      <span>
                        {p.reference ? `Ref ${p.reference} · ` : ""}
                        {p.verified_at ? `Verified ${formatBookingDateTime(p.verified_at)}` : "Awaiting verification"}
                      </span>
                    </div>
                    <BookingStatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ins-card" aria-label="Customer documents">
            <h2 className="ins-card-title">Customer documents</h2>
            {detail.files.length === 0 ? (
              <p className="text-muted" style={{ margin: 0 }}>
                No documents uploaded.
              </p>
            ) : (
              <ul className="bj-list">
                {detail.files.map((f) => (
                  <li key={f.id}>
                    <div className="bj-list-main">
                      <strong>{f.filename}</strong>
                      <span>
                        {f.purpose}
                        {f.agreement_version ? ` · agreement v${f.agreement_version}` : ""} · {formatSize(f.file_size)} · {formatBookingDateTime(f.uploaded_at)}
                      </span>
                    </div>
                    {f.file_url && (
                      <a className="btn-secondary ins-btn-sm" style={{ textDecoration: "none" }} href={f.file_url} target="_blank" rel="noopener noreferrer">
                        Open
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="ins-card" aria-label="Booking progress">
          <h2 className="ins-card-title">Booking progress</h2>
          <BookingTimeline detail={detail} audience="staff" />
        </aside>
      </div>

      {modal === "decision" && <DecisionModal {...modalProps} suggestedPrice={context?.propertyPrice ?? null} />}
      {modal === "extend" && <ExtendHoldModal {...modalProps} />}
      {modal === "instructions" && <PaymentInstructionsModal {...modalProps} />}
      {modal === "agreement" && <AgreementPrepareModal {...modalProps} />}
      {modal === "verify" && <AgreementVerifyModal {...modalProps} />}
      {modal === "final" && <FinalConfirmModal {...modalProps} />}
    </div>
  );
}
