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
  getBookingRequest,
  submitBookingPayment,
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
import {
  buildJourneyUploadTrace,
  describeJourneyUploadError,
  formatFileSize,
  validateJourneyFile,
  validateJourneyFileBasics,
} from "../../utils/journeyFileUpload";
import { PAYMENT_METHODS } from "../../types/customerBookingJourney";
import type {
  BookingPaymentMethod,
  BookingRequestDetail,
  JourneyFile,
} from "../../types/customerBookingJourney";
import type { PortalBooking, PortalSiteVisit } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "../../components/booking-journey/BookingJourney.css";

const formatSize = formatFileSize;

export default function CustomerPortalBookingRequestDetail() {
  const { requestId } = useParams<{ requestId: string }>();

  const [detail, setDetail] = useState<BookingRequestDetail | null>(null);
  const [visit, setVisit] = useState<PortalSiteVisit | null>(null);
  const [booking, setBooking] = useState<PortalBooking | null>(null);
  const [contactName, setContactName] = useState("");
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
        // Optional context - failures never block the page.
        getPortalSiteVisits()
          .then((visits) => setVisit(visits.find((v) => v.id === data.site_visit_id) ?? null))
          .catch(() => setVisit(null));
        if (data.booking_id) {
          getPortalBooking(data.booking_id)
            .then(setBooking)
            .catch(() => setBooking(null));
        } else {
          setBooking(null);
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
  const canPay = canAct && Boolean(detail.booking_id) && !holdExpired;
  const holdText = describeHold(detail.hold_expires_at, detail.status);
  const refresh = () => load(true);

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

      <Link to="/portal/booking-requests" className="cp-back-link">
        <ArrowLeftIcon size={14} /> Back to booking requests
      </Link>

      <div className="cp-tickets-header">
        <div>
          <h1>{propertyName ?? `Booking request #${detail.id.slice(0, 8).toUpperCase()}`}</h1>
          <p>
            Request #{detail.id.slice(0, 8).toUpperCase()}
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
        <div className="bj-note">Your request is with our team for review. You will be notified when it is decided.</div>
      )}
      {detail.status === "Rejected" && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>
            Your booking request was declined.
            {detail.customer_message ? ` Message from our team: ${detail.customer_message}` : ""} You can submit a new
            request from the Booking Journey page.
          </span>
        </div>
      )}
      {detail.status === "Expired" && (
        <div className="bj-note bj-warn">
          The booking hold expired and the property was released. You can request the booking again from the Booking
          Journey page.
        </div>
      )}
      {detail.status === "Expired - Payment Review" && (
        <div className="bj-note bj-warn">
          The hold expired while verified payments remain on this booking. Our team is reviewing it — please contact us
          if you have questions.
        </div>
      )}
      {holdExpired && (
        <div className="bj-note bj-warn">
          The booking hold has expired. Contact our team before submitting payment or uploading files.
        </div>
      )}

      <div className="bj-layout">
        <div className="bj-stack">
          <section className="cp-panel" aria-label="Booking overview">
            <h2 className="cp-panel-title">Overview</h2>
            <BookingFacts
              items={[
                { label: "Property", value: propertyName },
                { label: "Site visit", value: visit ? formatBookingDateTime(visit.scheduled_start) : "—" },
                { label: "Agreed price", value: formatBookingMoney(detail.agreed_price) },
                { label: "Booking amount", value: formatBookingMoney(detail.booking_amount) },
                { label: "Payment preference", value: detail.payment_preference },
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
                {detail.customer_notes && (
                  <div className="bj-note" style={{ background: "transparent" }}>
                    <strong>Your notes:</strong> {detail.customer_notes}
                  </div>
                )}
              </div>
            )}
          </section>

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

          <AgreementSection
            detail={detail}
            canAct={canAct && !holdExpired}
            contactName={contactName}
            onChanged={refresh}
            notify={showToast}
          />

          <PaymentsSection
            detail={detail}
            booking={booking}
            canPay={canPay}
            onChanged={refresh}
            notify={showToast}
          />

          <DocumentsSection detail={detail} notify={showToast} />
        </div>

        <aside className="cp-panel" aria-label="Booking progress">
          <h2 className="cp-panel-title">Booking progress</h2>
          <BookingTimeline detail={detail} audience="customer" />
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
}: {
  detail: BookingRequestDetail;
  canAct: boolean;
  contactName: string;
  onChanged: () => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
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
    <section className="cp-panel" aria-label="Agreement">
      <h2 className="cp-panel-title">
        Booking agreement <BookingStatusBadge status={status} />
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

/* ─── Payments ─── */

interface PaymentFormState {
  installment_id: string;
  amount: string;
  method: BookingPaymentMethod;
  reference: string;
  paymentDate: string;
  notes: string;
}

const EMPTY_PAYMENT: PaymentFormState = {
  installment_id: "",
  amount: "",
  method: "Bank Transfer",
  reference: "",
  paymentDate: "",
  notes: "",
};

function PaymentsSection({
  detail,
  booking,
  canPay,
  onChanged,
  notify,
}: {
  detail: BookingRequestDetail;
  booking: PortalBooking | null;
  canPay: boolean;
  onChanged: () => Promise<void>;
  notify: (message: string, type?: "success" | "error") => void;
}) {
  const [form, setForm] = useState<PaymentFormState>(EMPTY_PAYMENT);
  const [proof, setProof] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [proofFor, setProofFor] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const proofInput = useRef<HTMLInputElement>(null);

  const plan = booking?.payment_plan && booking.payment_plan.status === "Active" ? booking.payment_plan : null;
  const installments = (plan?.installments ?? []).filter((i) => (i.status || "").toLowerCase() !== "paid");
  const needsPlan = detail.payment_preference === "Installments" && !plan && Boolean(booking);

  const setField = <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    const amount = Number(form.amount);
    if (!form.amount.trim() || !Number.isFinite(amount) || amount <= 0) nextErrors.amount = "Enter an amount greater than zero.";
    else if (detail.agreed_price && amount > Number(detail.agreed_price)) nextErrors.amount = "Amount cannot exceed the agreed price.";
    if (plan && !form.installment_id) nextErrors.installment_id = "Select the instalment this payment is for.";
    if (form.reference.length > 255) nextErrors.reference = "Reference cannot exceed 255 characters.";
    if (form.notes.length > 3000) nextErrors.notes = "Notes cannot exceed 3000 characters.";
    if (proof) {
      const problem = validateJourneyFileBasics(proof);
      if (problem) nextErrors.proof = problem;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const paymentDate = form.paymentDate ? new Date(form.paymentDate).toISOString() : null;
      const result = await submitBookingPayment(detail.id, {
        installment_id: form.installment_id || null,
        amount,
        payment_method: form.method,
        transaction_reference: form.reference.trim() || null,
        payment_date: paymentDate,
        notes: form.notes.trim() || null,
      });
      if (proof) {
        try {
          await uploadBookingFile(detail.id, proof, "Payment Proof", result.id);
        } catch (uploadErr) {
          notify(
            `Payment submitted, but the proof upload failed: ${describeJourneyUploadError(uploadErr, BOOKING_FILE_UPLOAD_ENDPOINT).message} You can attach it from the list below.`,
            "error"
          );
        }
      }
      notify(result.message || "Payment details submitted. The finance team must verify the payment.");
      setForm(EMPTY_PAYMENT);
      setProof(null);
      await onChanged();
    } catch (err) {
      setSubmitError(getApiErrorMessage(err, "Failed to submit the payment."));
    } finally {
      setSubmitting(false);
    }
  };

  const attachProof = async (paymentId: string) => {
    if (!proofFile) return;
    const problem = await validateJourneyFile(proofFile);
    if (problem) {
      setProofError(problem);
      return;
    }
    setProofError(null);
    try {
      await uploadBookingFile(detail.id, proofFile, "Payment Proof", paymentId);
      notify("Payment proof uploaded.");
      setProofFor(null);
      setProofFile(null);
      if (proofInput.current) proofInput.current.value = "";
      await onChanged();
    } catch (err) {
      setProofError(describeJourneyUploadError(err, BOOKING_FILE_UPLOAD_ENDPOINT).message);
    }
  };

  const err = (key: string) =>
    errors[key] ? (
      <p className="bj-field-error" role="alert">
        {errors[key]}
      </p>
    ) : null;

  return (
    <section className="cp-panel" aria-label="Payments">
      <h2 className="cp-panel-title">Payments</h2>

      {detail.payments.length === 0 ? (
        <p className="cp-ticket-snippet" style={{ margin: "0 0 12px" }}>
          No payments submitted yet.
        </p>
      ) : (
        <ul className="bj-list" style={{ marginBottom: 16 }}>
          {detail.payments.map((p) => {
            const hasProof = detail.files.some((f) => f.payment_id === p.id);
            return (
              <li key={p.id}>
                <div className="bj-list-main">
                  <strong>
                    {formatBookingMoney(p.amount)} · {p.method ?? "—"}
                  </strong>
                  <span>
                    {p.reference ? `Ref ${p.reference} · ` : ""}
                    {p.status === "Verified"
                      ? `Verified ${formatBookingDateTime(p.verified_at)}`
                      : p.status === "Pending"
                      ? "Awaiting finance verification"
                      : p.status}
                  </span>
                  {proofFor === p.id && (
                    <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                      <input
                        ref={proofInput}
                        type="file"
                        accept={JOURNEY_FILE_EXTENSIONS.join(",")}
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                        aria-label="Payment proof file"
                      />
                      <button className="btn-secondary" onClick={() => void attachProof(p.id)} disabled={!proofFile}>
                        Upload
                      </button>
                      <button className="btn-secondary" onClick={() => setProofFor(null)}>
                        Cancel
                      </button>
                    </span>
                  )}
                  {proofFor === p.id && proofError && <span className="bj-field-error">{proofError}</span>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <BookingStatusBadge status={p.status} />
                  {p.status === "Pending" && !hasProof && proofFor !== p.id && (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setProofFor(p.id);
                        setProofFile(null);
                        setProofError(null);
                      }}
                    >
                      Attach proof
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canPay ? (
        needsPlan ? (
          <div className="bj-note bj-warn">
            You chose to pay in instalments. Our team must create the instalment schedule before you can submit a
            payment.
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <h3 style={{ fontSize: "0.95rem", margin: "0 0 10px" }}>Submit payment details</h3>
            <p className="cp-ticket-snippet" style={{ marginTop: 0 }}>
              Pay using the instructions above, then record the payment here. It is only counted once our finance team
              verifies it.
            </p>
            {submitError && (
              <div className="support-alert error cp-inline-error" role="alert">
                <AlertCircleIcon size={18} />
                <span>{submitError}</span>
              </div>
            )}
            <div className="bj-inline-form">
              {plan && (
                <div className="bj-field full">
                  <label htmlFor="pay-installment">Instalment *</label>
                  <select id="pay-installment" value={form.installment_id} onChange={(e) => setField("installment_id", e.target.value)}>
                    <option value="">Select instalment…</option>
                    {installments.map((i) => (
                      <option key={i.id} value={i.id}>
                        #{i.sequence} {i.name} · {formatBookingMoney(i.amount)} · due {i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}
                      </option>
                    ))}
                  </select>
                  {err("installment_id")}
                </div>
              )}
              <div className="bj-field">
                <label htmlFor="pay-amount">Amount (INR) *</label>
                <input
                  id="pay-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  aria-invalid={Boolean(errors.amount)}
                />
                {err("amount")}
              </div>
              <div className="bj-field">
                <label htmlFor="pay-method">Payment method *</label>
                <select id="pay-method" value={form.method} onChange={(e) => setField("method", e.target.value as BookingPaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bj-field">
                <label htmlFor="pay-ref">Transaction reference</label>
                <input id="pay-ref" type="text" maxLength={255} value={form.reference} onChange={(e) => setField("reference", e.target.value)} />
                {err("reference")}
              </div>
              <div className="bj-field">
                <label htmlFor="pay-date">Payment date</label>
                <input id="pay-date" type="datetime-local" value={form.paymentDate} onChange={(e) => setField("paymentDate", e.target.value)} />
              </div>
              <div className="bj-field full">
                <label htmlFor="pay-notes">Notes</label>
                <textarea id="pay-notes" rows={2} maxLength={3000} value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
                {err("notes")}
              </div>
              <div className="bj-field full">
                <label htmlFor="pay-proof">Payment proof (optional)</label>
                <input
                  id="pay-proof"
                  type="file"
                  accept={JOURNEY_FILE_EXTENSIONS.join(",")}
                  onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                />
                <span className="cp-ticket-snippet">PDF, JPG or PNG, up to 5 MB.</span>
                {err("proof")}
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={submitting}>
              <SendIcon size={15} />
              <span>{submitting ? "Submitting…" : "Submit payment details"}</span>
            </button>
          </form>
        )
      ) : (
        <p className="cp-ticket-snippet" style={{ margin: 0 }}>
          {detail.booking_id
            ? "Payments can be submitted while the booking is approved or confirmed and the hold is active."
            : "Payments open once your booking request is approved."}
        </p>
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
