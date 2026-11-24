import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  RefreshIcon,
  SendIcon,
  UploadIcon,
} from "../../components/common/SupportPortalIcons";
import { getPortalAccessToken, getPortalProfile } from "../../services/customerPortalAuthService";
import { getPortalBooking, getPortalSiteVisits } from "../../services/customerPortalCommercialService";
import {
  BOOKING_FILE_UPLOAD_ENDPOINT,
  JOURNEY_FILE_EXTENSIONS,
  acknowledgeAgreement,
  getBookingFileDownload,
  getBookingHandover,
  getBookingRequest,
  uploadBookingFile,
} from "../../services/customerPortalJourneyService";
import {
  BookingFacts,
  BookingStatusBadge,
  BookingTimeline,
} from "../../components/booking-journey/BookingJourneyWidgets";
import {
  describeHold,
  formatBookingDateTime,
  formatBookingMoney,
  parseBackendDate,
} from "../../utils/bookingJourney";
import { getApiErrorMessage } from "../../utils/apiError";
import { usePaymentAlerts } from "../../hooks/usePaymentAlerts";
import {
  buildJourneyUploadTrace,
  describeJourneyUploadError,
  formatFileSize,
  validateJourneyFile,
} from "../../utils/journeyFileUpload";
import PortalBuyerDetails from "../../components/bookings/PortalBuyerDetails";
import PortalPaymentDashboard from "../../components/bookings/PortalPaymentDashboard";
import type {
  BookingRequestDetail,
  JourneyFile,
  PortalHandover,
} from "../../types/customerBookingJourney";
import type { PortalBooking, PortalSiteVisit } from "../../types/customerPortal";
import { PortalHandoverCard } from "../../components/booking-journey/HandoverWidgets";
import PortalBookingOffer from "../../components/booking-journey/PortalBookingOffer";
import { PortalBookingNegotiation } from "../../components/portal/PortalBookingNegotiation";
import PortalBookingLifecycle from "../../components/portal/PortalBookingLifecycle";
import { loadNegotiation, type BookingNegotiation } from "../../services/customerPortalBookingNegotiation";
import { resolveRequestOfferDetails, summarizeNegotiation } from "../../utils/offerDisplay";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "../../components/booking-journey/BookingJourney.css";

const formatSize = formatFileSize;

export default function CustomerPortalBookingRequestDetail() {
  const { requestId } = useParams<{ requestId: string }>();

  const [detail, setDetail] = useState<BookingRequestDetail | null>(null);
  const [visit, setVisit] = useState<PortalSiteVisit | null>(null);
  const [booking, setBooking] = useState<PortalBooking | null>(null);
  /** Why the portal booking (schedule, balances) is missing, so the payment section can say so instead of guessing. */
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [negotiation, setNegotiation] = useState<BookingNegotiation | null | undefined>(undefined);
  const [contactName, setContactName] = useState("");
  /** undefined = not loaded / failed, null = none scheduled, object = the handover record. */
  const [handover, setHandover] = useState<PortalHandover | null | undefined>(undefined);
  const [handoverFailed, setHandoverFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      if (!requestId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await getBookingRequest(requestId);
        setDetail(data);
        loadNegotiation(data.property_id, undefined, data.property_match_id)
          .then(setNegotiation)
          .catch(() => setNegotiation(null));
        // Optional context - failures never block the page.
        getPortalSiteVisits()
          .then((visits) => setVisit(visits.find((v) => v.id === data.site_visit_id) ?? null))
          .catch(() => setVisit(null));
        if (data.booking_id) {
          // Awaited so the request and the booking (payments, schedule, balances) always change together.
          try {
            setBooking(await getPortalBooking(data.booking_id));
            setBookingError(null);
          } catch (bookingErr) {
            setBooking(null);
            setBookingError(getApiErrorMessage(bookingErr, "the booking details request failed"));
          }
        } else {
          setBooking(null);
          setBookingError(null);
        }
      } catch (err) {
        setDetail(null);
        setError(getApiErrorMessage(err, "Failed to load this booking request."));
      } finally {
        setLoading(false);
      }
    },
    [requestId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Keep payments fresh without a manual reload: when the customer returns to the tab and once a minute while
  // it is visible (staff verify payments and create schedules at any time). A failed background refresh keeps
  // what is on screen instead of blanking the page.
  useEffect(() => {
    if (!requestId) return;
    let busy = false;
    const refreshQuietly = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const data = await getBookingRequest(requestId);
        setDetail(data);
        loadNegotiation(data.property_id, undefined, data.property_match_id)
          .then(setNegotiation)
          .catch(() => undefined);
        if (data.booking_id) {
          try {
            setBooking(await getPortalBooking(data.booking_id));
            setBookingError(null);
          } catch {
            /* keep the last good booking */
          }
        }
        // Handover changes made by staff do not touch the request, so refresh them explicitly.
        await refreshHandoverRef.current();
      } catch {
        /* keep the last good state */
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(() => void refreshQuietly(), 60_000);
    const onVisible = () => {
      if (!document.hidden) void refreshQuietly();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [requestId]);

  // Handover exists only for a confirmed booking. A failed lookup keeps the last good value (or hides the stage)
  // instead of guessing.
  const handoverBookingId = detail?.booking_id ?? null;
  const handoverEligible = detail?.status === "Confirmed" || detail?.status === "Completed";
  const refreshHandover = useCallback(async () => {
    if (!handoverBookingId || !handoverEligible) {
      setHandover(undefined);
      setHandoverFailed(false);
      return;
    }
    try {
      setHandover(await getBookingHandover(handoverBookingId));
      setHandoverFailed(false);
    } catch {
      setHandoverFailed(true);
    }
  }, [handoverBookingId, handoverEligible]);
  const refreshHandoverRef = useRef(refreshHandover);
  refreshHandoverRef.current = refreshHandover;
  useEffect(() => {
    void refreshHandover();
  }, [refreshHandover, detail?.updated_at]);

  // In-page alerts when the backend verifies the agreement or verifies / rejects a payment.
  usePaymentAlerts(detail, showToast);

  useEffect(() => {
    getPortalProfile()
      .then((p) => setContactName(p.contact?.full_name ?? ""))
      .catch(() => undefined);
  }, []);

  const holdExpired = useMemo(() => {
    if (!detail || detail.status !== "Approved") return false;
    const expiry = parseBackendDate(detail.hold_expires_at);
    return Boolean(expiry && expiry.getTime() <= Date.now());
  }, [detail]);

  if (loading && !detail) {
    return (
      <div className="cp-tickets-page" aria-busy="true">
        <div className="cp-skeleton" style={{ height: 110 }} />
        <div className="cp-skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="cp-tickets-page">
        <Link to="/portal/booking-requests" className="cp-back-link">
          <ArrowLeftIcon size={14} /> Back to booking requests
        </Link>
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error ?? "Booking request not found."}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const propertyName = visit?.property?.name ?? booking?.property?.name ?? null;
  const propertyAddress = [visit?.property?.address ?? booking?.property?.address, visit?.property?.city ?? booking?.property?.city]
    .filter(Boolean)
    .join(", ");
  const canAct = detail.status === "Approved" || detail.status === "Confirmed";
  const holdText = describeHold(detail.hold_expires_at, detail.status);
  const refresh = () => load(true);
  const activePlan = booking?.payment_plan && booking.payment_plan.status === "Active" ? booking.payment_plan : null;
  const timelineExtras = {
    // Only known once the booking (and its schedule) has actually loaded.
    schedule: booking
      ? activePlan
        ? {
            total: activePlan.installments.length,
            paid: activePlan.installments.filter((i) => (i.status || "").toLowerCase() === "paid").length,
          }
        : null
      : undefined,
    handover: handover === undefined ? undefined : handover,
  };

  const isRental = useMemo(() => {
    if (!detail) return false;
    if ((detail as any).booking_type === "Rent" || (detail as any).booking_type === "Lease") return true;
    if (booking?.property?.listing_type && ["Rent", "Lease"].includes(booking.property.listing_type)) return true;
    if (detail.customer_notes?.includes("Payment Plan:")) return true;
    if (propertyName?.toLowerCase().includes("rent") || propertyName?.toLowerCase().includes("lease")) return true;
    return false;
  }, [detail, booking, propertyName]);

  const summary = useMemo(() => (negotiation ? summarizeNegotiation(negotiation.offers) : null), [negotiation]);
  const currency = negotiation?.match.property.currency || "INR";
  const offerInfo = useMemo(
    () => (detail ? resolveRequestOfferDetails(detail, summary, currency, isRental) : null),
    [detail, summary, currency, isRental]
  );

  return (
    <div className="cp-tickets-page">
      {toast && (
        <div className="cp-toast-stack" role="status" aria-live="polite">
          <div className={`support-alert ${toast.type}`}>
            {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {isRental ? (
        <Link to="/portal/rentals" className="cp-back-link">
          <ArrowLeftIcon size={14} /> Back to my rentals
        </Link>
      ) : (
        <>
          <Link to="/portal/booking-requests" className="cp-back-link">
            <ArrowLeftIcon size={14} /> Back to booking requests
          </Link>
          {" "}
          <Link to="/portal/bookings" className="cp-back-link">
            All bookings
          </Link>
        </>
      )}

      <div className="cp-tickets-header">
        <div>
          <h1>{propertyName ?? (isRental ? `Rental request #${detail.id.slice(0, 8).toUpperCase()}` : `Booking request #${detail.id.slice(0, 8).toUpperCase()}`)}</h1>
          <p>
            {isRental ? "Rental request" : "Request"} #{detail.id.slice(0, 8).toUpperCase()}
            {propertyAddress ? ` · ${propertyAddress}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <BookingStatusBadge status={detail.status} />
          <button className="btn-secondary" onClick={() => void load()} aria-label="Refresh">
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {detail.status === "Requested" && (
        <div className="bj-note">{isRental ? "Your rental request is with our team for review. You will be notified when it is decided." : "Your request is with our team for review. You will be notified when it is decided."}</div>
      )}
      {detail.status === "Rejected" && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>
            {isRental ? "Your rental request was declined." : "Your booking request was declined."}
            {detail.customer_message ? ` Message from our team: ${detail.customer_message}` : ""} You can submit a new
            request from the {isRental ? "Rental Journey" : "Booking Journey"} page.
          </span>
        </div>
      )}
      {detail.status === "Expired" && (
        <div className="bj-note bj-warn">
          {isRental
            ? "The rental hold expired and the property was released. You can request the rental again from the Rental Journey page."
            : "The booking hold expired and the property was released. You can request the booking again from the Booking Journey page."}
        </div>
      )}
      {detail.status === "Expired - Payment Review" && (
        <div className="bj-note bj-warn">
          The hold expired while verified payments remain on this {isRental ? "rental" : "booking"}. Our team is reviewing it — please contact us
          if you have questions.
        </div>
      )}
      {holdExpired && (
        <div className="bj-note bj-warn">
          The {isRental ? "rental" : "booking"} hold has expired. Contact our team before submitting payment or uploading files.
        </div>
      )}

      <div className="bj-layout">
        <div className="bj-stack">
          <section className="cp-panel" aria-label={isRental ? "Rental overview" : "Booking overview"}>
            <h2 className="cp-panel-title">{isRental ? "Rental overview" : "Overview"}</h2>
            <BookingFacts
              items={[
                { label: isRental ? "Rental Request ID" : "Booking ID", value: detail.booking_id ? `#${detail.booking_id.slice(0, 8).toUpperCase()}` : "Assigned on approval" },
                { label: "Property", value: propertyName },
                { label: "Unit", value: booking?.property?.unit_number ? `Unit ${booking.property.unit_number}` : "—" },
                { label: isRental ? "Start date" : "Booking date", value: booking?.booking_date ? formatBookingDateTime(booking.booking_date) : "—" },
                { label: "Site visit", value: visit ? formatBookingDateTime(visit.scheduled_start) : "—" },
                {
                  label: isRental
                    ? summary?.state.accepted
                      ? "Agreed rent"
                      : summary?.state.open?.offer_type === "Seller"
                      ? "Proposed rent"
                      : summary?.state.open?.offer_type === "Buyer"
                      ? "Your proposed rent"
                      : "Proposed rent"
                    : summary?.state.accepted
                    ? "Agreed price"
                    : summary?.state.open?.offer_type === "Seller"
                    ? "Proposed offer"
                    : summary?.state.open?.offer_type === "Buyer"
                    ? "Your counteroffer"
                    : "Agreed price",
                  value: offerInfo?.formattedPrice ? (
                    <div>
                      <span>{offerInfo.formattedPrice}</span>
                      {offerInfo.statusLabel && (
                        <span className="pbn-chip" style={{ marginLeft: 8 }}>
                          {offerInfo.statusLabel}
                        </span>
                      )}
                    </div>
                  ) : (
                    formatBookingMoney(detail.agreed_price)
                  ),
                },
                {
                  label: isRental ? "Security deposit" : "Booking amount",
                  value: offerInfo?.formattedBookingAmount ?? formatBookingMoney(detail.booking_amount),
                },
                { label: "Total paid (verified)", value: booking?.verified_paid_amount !== undefined ? formatBookingMoney(booking.verified_paid_amount) : "—" },
                { label: "Remaining balance", value: booking?.remaining_balance !== undefined ? formatBookingMoney(booking.remaining_balance) : "—" },
                {
                  label: isRental ? "Payment Plan" : "Payment preference",
                  value: (() => {
                    if (isRental) {
                      const match = detail.customer_notes?.match(/Payment Plan:\s*([^\n\r]+)/);
                      if (match && match[1]) return match[1].trim();
                      return "Monthly Rent";
                    }
                    return detail.payment_preference;
                  })(),
                },
                { label: "Requested on", value: formatBookingDateTime(detail.created_at) },
                { label: "Last updated", value: formatBookingDateTime(detail.updated_at) },
                {
                  label: "Hold",
                  value: detail.hold_expires_at
                    ? `${formatBookingDateTime(detail.hold_expires_at)}${holdText ? ` (${holdText})` : ""}`
                    : "No active hold",
                },
                { label: "Hold extensions used", value: `${detail.extension_count} of 2` },
              ]}
            />
            {(detail.customer_message || detail.customer_notes) && (
              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {detail.customer_message && (
                  <div className="bj-note">
                    <strong>Message from our team:</strong> {detail.customer_message}
                  </div>
                )}
                {(() => {
                  if (!detail.customer_notes) return null;
                  const cleanNotes = isRental
                    ? detail.customer_notes.replace(/Payment Plan:\s*[^\n\r]+\n?/, "").trim()
                    : detail.customer_notes;
                  if (!cleanNotes) return null;
                  return (
                    <div className="bj-note" style={{ background: "transparent" }}>
                      <strong>Your notes:</strong> {cleanNotes}
                    </div>
                  );
                })()}
              </div>
            )}
          </section>

          <PortalBookingOffer
            detail={detail}
            propertyName={propertyName}
            holdExpired={holdExpired}
            summary={summary}
            negotiation={negotiation}
            isRental={isRental}
          />

          <PortalBookingNegotiation
            request={detail}
            propertyName={propertyName}
            notify={showToast}
            negotiation={negotiation}
            onNegotiationChange={setNegotiation}
          />

          <section className="cp-panel" aria-label="Payment instructions">
            <h2 className="cp-panel-title">Payment instructions</h2>
            {detail.payment_instructions ? (
              <div className="bj-agreement">{detail.payment_instructions}</div>
            ) : (
              <p className="cp-ticket-snippet" style={{ margin: 0 }}>
                {detail.status === "Requested"
                  ? "Payment instructions are shared once your request is approved."
                  : "Our team has not provided payment instructions yet."}
              </p>
            )}
          </section>

          <PortalBuyerDetails detail={detail} holdExpired={holdExpired} onChanged={refresh} notify={showToast} />

          <AgreementSection
            detail={detail}
            canAct={canAct && !holdExpired}
            contactName={contactName}
            onChanged={refresh}
            notify={showToast}
            isRental={isRental}
          />

          <PortalPaymentDashboard
            detail={detail}
            booking={booking}
            bookingError={bookingError}
            holdExpired={holdExpired}
            onChanged={refresh}
            notify={showToast}
          />

          <PortalHandoverCard
            eligible={handoverEligible}
            handover={handover}
            loadFailed={handoverFailed}
            onRetry={() => void refreshHandover()}
            onChanged={refreshHandover}
            notify={showToast}
          />

          <DocumentsSection detail={detail} notify={showToast} />

          <PortalBookingLifecycle detail={detail} notify={showToast} />
        </div>

        <aside className="cp-panel" aria-label={isRental ? "Rental progress" : "Booking progress"}>
          <h2 className="cp-panel-title">{isRental ? "Rental progress" : "Booking progress"}</h2>
          <BookingTimeline detail={detail} audience="customer" extras={timelineExtras} isRental={isRental} />
        </aside>
      </div>
    </div>
  );
}

/* ─── Agreement ─── */

function AgreementSection({
  detail,
  canAct,
  contactName,
  onChanged,
  notify,
  isRental = false,
}: {
  detail: BookingRequestDetail;
  canAct: boolean;
  contactName: string;
  onChanged: () => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
  isRental?: boolean;
}) {
  const [fullName, setFullName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedFile, setSignedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadDiagnostic, setUploadDiagnostic] = useState<string | null>(null);
  const [uploadTrace, setUploadTrace] = useState<string | null>(null);
  const uploadInFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (contactName && !fullName) setFullName(contactName);
  }, [contactName, fullName]);

  const status = detail.agreement_status;
  const prepared = status !== "Not Prepared";
  const canAcknowledge = canAct && detail.status === "Approved" && status === "Prepared";
  const canUploadSigned = canAct && detail.status === "Approved" && (status === "Prepared" || status === "Customer Acknowledged");

  const handleAcknowledge = async (e: FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 2) {
      setError("Enter your full name as it appears on your account.");
      return;
    }
    if (!confirmed) {
      setError("Please tick the confirmation box to acknowledge the agreement.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await acknowledgeAgreement(detail.id, { full_name: fullName.trim(), confirm: true });
      notify(result.message || "Acknowledgement recorded.");
      setConfirmed(false);
      await onChanged();
    } catch (err) {
      setError(getApiErrorMessage(err, "Failed to record your acknowledgement."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileSelected = async (file: File | null) => {
    setUploadError(null);
    setUploadDiagnostic(null);
    setUploadTrace(null);
    setUploadSuccess(null);
    setUploadProgress(0);
    if (!file) {
      setSignedFile(null);
      return;
    }
    const problem = await validateJourneyFile(file);
    if (problem) {
      // An unusable file is dropped from the input so the customer can pick another one.
      setSignedFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setUploadError(problem);
      return;
    }
    setSignedFile(file);
  };

  const handleUploadSigned = async () => {
    if (uploadInFlight.current) return; // prevents duplicate submissions on rapid clicks
    setUploadSuccess(null);
    setUploadDiagnostic(null);
    setUploadTrace(null);
    const problem = await validateJourneyFile(signedFile);
    if (problem || !signedFile) {
      setUploadError(problem ?? "Choose a file to upload first.");
      return;
    }
    uploadInFlight.current = true;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    try {
      const result = await uploadBookingFile(detail.id, signedFile, "Signed Agreement", undefined, setUploadProgress);
      setUploadSuccess(`${result.filename || signedFile.name} was uploaded. Our team will verify it.`);
      notify("Signed agreement uploaded. Our team will verify it.");
      setSignedFile(null);
      if (fileInput.current) fileInput.current.value = "";
      // Re-fetch the booking request so the new file and the unchanged acknowledgement state come from the API.
      await onChanged();
    } catch (err) {
      // The selected file is kept so the customer can simply retry.
      const { message, diagnostic } = describeJourneyUploadError(err, BOOKING_FILE_UPLOAD_ENDPOINT);
      setUploadError(message);
      setUploadDiagnostic(diagnostic);
      // Full request/response report (token redacted) for comparing against a working Swagger request.
      setUploadTrace(
        buildJourneyUploadTrace(err, {
          requestId: detail.id,
          purpose: "Signed Agreement",
          file: signedFile,
          accessToken: getPortalAccessToken(),
        })
      );
      console.warn("Signed agreement upload failed:", diagnostic);
    } finally {
      uploadInFlight.current = false;
      setUploading(false);
    }
  };

  const signedCurrent = detail.files.some(
    (f) => f.purpose === "Signed Agreement" && f.agreement_version === detail.agreement_version
  );

  return (
    <section className="cp-panel" aria-label={isRental ? "Rental agreement" : "Booking agreement"}>
      <h2 className="cp-panel-title">
        {isRental ? "Rental agreement" : "Booking agreement"} <BookingStatusBadge status={status} />
      </h2>

      {!prepared ? (
        <p className="cp-ticket-snippet" style={{ margin: 0 }}>
          Your agreement has not been prepared yet. You will be notified when it is ready to review.
        </p>
      ) : (
        <>
          <p className="cp-ticket-snippet" style={{ marginTop: 0 }}>
            Version {detail.agreement_version}
            {detail.agreement_acknowledged_at ? ` · acknowledged ${formatBookingDateTime(detail.agreement_acknowledged_at)}` : ""}
          </p>
          <div className="bj-agreement" tabIndex={0} aria-label="Agreement text">
            {detail.agreement_text}
          </div>

          {status === "Verified" && (
            <div className="bj-note" style={{ marginTop: 12 }}>
              Our team verified your signed agreement.
            </div>
          )}
          {status === "Rejected" && (
            <div className="bj-note bj-warn" style={{ marginTop: 12 }}>
              Our team asked for changes to your agreement. Please contact the sales team.
            </div>
          )}

          {canAcknowledge && (
            <form onSubmit={handleAcknowledge} noValidate style={{ marginTop: 16 }}>
              {error && (
                <div className="support-alert error cp-inline-error" role="alert">
                  <AlertCircleIcon size={18} />
                  <span>{error}</span>
                </div>
              )}
              <div className="bj-inline-form">
                <div className="bj-field full">
                  <label htmlFor="ack-name">Your full name *</label>
                  <input
                    id="ack-name"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    maxLength={200}
                    autoComplete="name"
                  />
                  <span className="cp-ticket-snippet">Must match the name on your customer portal account.</span>
                </div>
                <label className="bj-check full" style={{ marginBottom: 14 }}>
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>I have read the agreement above and acknowledge its contents.</span>
                </label>
              </div>
              <button type="submit" className="btn-primary" disabled={submitting}>
                <SendIcon size={15} />
                <span>{submitting ? "Submitting…" : "Acknowledge agreement"}</span>
              </button>
              <p className="cp-ticket-snippet" style={{ marginBottom: 0 }}>
                This acknowledgement is not an e-signature. After acknowledging, upload your signed copy below so our
                team can verify it.
              </p>
            </form>
          )}

          {canUploadSigned && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: "0.9rem", margin: "0 0 8px" }}>Upload signed agreement</h3>
              {signedCurrent && (
                <p className="cp-ticket-snippet" style={{ marginTop: 0 }}>
                  A signed copy for this version is already uploaded. Uploading again adds another file.
                </p>
              )}
              {uploadError && (
                <div className="support-alert error cp-inline-error" role="alert">
                  <AlertCircleIcon size={18} />
                  <div>
                    <span>{uploadError}</span>
                    {uploadDiagnostic && (
                      <div className="cp-ticket-snippet" style={{ marginTop: 4 }}>
                        Details: {uploadDiagnostic}
                      </div>
                    )}
                    {uploadTrace && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: "pointer" }}>Technical details (access token hidden)</summary>
                        <pre
                          style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: "0.75rem", maxHeight: 260, overflow: "auto" }}
                        >
                          {uploadTrace}
                        </pre>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => void navigator.clipboard?.writeText(uploadTrace)}
                        >
                          Copy details
                        </button>
                      </details>
                    )}
                  </div>
                </div>
              )}
              {uploadSuccess && !uploadError && (
                <div className="support-alert success" role="status" aria-live="polite">
                  <CheckCircleIcon size={18} />
                  <span>{uploadSuccess}</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  ref={fileInput}
                  type="file"
                  accept={JOURNEY_FILE_EXTENSIONS.join(",")}
                  disabled={uploading}
                  onChange={(e) => void handleFileSelected(e.target.files?.[0] ?? null)}
                  aria-label="Signed agreement file"
                />
                <button className="btn-secondary" onClick={() => void handleUploadSigned()} disabled={uploading}>
                  <UploadIcon size={15} />
                  <span>{uploading ? `Uploading… ${uploadProgress}%` : uploadError && signedFile ? "Retry upload" : "Upload"}</span>
                </button>
              </div>
              {signedFile && (
                <p className="cp-ticket-snippet" style={{ margin: "8px 0 0" }}>
                  Selected: <strong>{signedFile.name}</strong> ({formatSize(signedFile.size)})
                </p>
              )}
              {uploading && (
                <progress
                  value={uploadProgress}
                  max={100}
                  aria-label="Upload progress"
                  style={{ width: "100%", maxWidth: 360, marginTop: 8 }}
                />
              )}
              <p className="cp-ticket-snippet" style={{ marginBottom: 0 }}>
                PDF, JPG or PNG, up to 5 MB.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ─── Documents ─── */

function DocumentsSection({
  detail,
  notify,
}: {
  detail: BookingRequestDetail;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = async (file: JourneyFile) => {
    setOpeningId(file.id);
    try {
      const result = await getBookingFileDownload(detail.id, file.id);
      window.open(result.download_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      notify(getApiErrorMessage(err, "Could not open this file."), "error");
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <section className="cp-panel" aria-label="Documents">
      <h2 className="cp-panel-title">Documents</h2>
      {detail.files.length === 0 ? (
        <p className="cp-ticket-snippet" style={{ margin: 0 }}>
          No documents uploaded yet.
        </p>
      ) : (
        <ul className="bj-list">
          {detail.files.map((f) => (
            <li key={f.id}>
              <div className="bj-list-main">
                <strong>{f.filename}</strong>
                <span>
                  {f.purpose}
                  {f.agreement_version ? ` · agreement v${f.agreement_version}` : ""} · {formatSize(f.file_size)} ·{" "}
                  {formatBookingDateTime(f.uploaded_at)}
                </span>
              </div>
              <button className="btn-secondary" onClick={() => void open(f)} disabled={openingId === f.id}>
                {openingId === f.id ? "Opening…" : "Open"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
