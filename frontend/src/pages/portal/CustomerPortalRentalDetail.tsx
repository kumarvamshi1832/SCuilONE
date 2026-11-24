import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  FileTextIcon,
  RefreshIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { BookingFacts } from "../../components/booking-journey/BookingJourneyWidgets";
import { ActionDialog, Field, inputStyle } from "../../components/booking-journey/StaffBookingActions";
import RentalFormModal from "../../components/rentals/RentalFormModal";
import { PortalAgreementViewerModal } from "../../components/portal/PortalAgreementViewerModal";
import { RentalStatusBadge } from "../../components/rentals/RentalWidgets";
import { getPortalProfile } from "../../services/customerPortalAuthService";
import {
  acknowledgePortalInspection,
  getPortalPropertyNameMap,
  getPortalRentalAgreement,
  getPortalRentalReceipt,
  requestPortalRentalExit,
  requestPortalRentalRenewal,
  signPortalRentalAgreement,
  submitPortalRentalPayment,
} from "../../services/customerPortalRentalService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { formatDay, formatRent, todayInput } from "../../utils/rentalHelpers";
import { resolveImageUrl } from "../../utils/imageUrl";
import { RENTAL_PAYMENT_METHODS } from "../../types/rental";
import type { PortalRentalDetail, RentalAgreement, RentalPayment, RentalReceipt, RentalScheduleItem } from "../../types/rental";
import { downloadRentalReceiptPdf } from "../../utils/rentalReceiptPdfGenerator";
import { downloadRentalAgreementPdf } from "../../utils/rentalAgreementPdfGenerator";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";
import "../../components/booking-journey/BookingJourney.css";
import "./CustomerPortalRentals.css";

type Modal =
  | { kind: "pay-deposit"; remaining: number }
  | { kind: "pay-item"; item: RentalScheduleItem }
  | { kind: "view-item"; item: RentalScheduleItem }
  | { kind: "ack"; inspectionId: string; type: string }
  | { kind: "exit" }
  | { kind: "renewal" }
  | { kind: "receipt"; receipt: RentalReceipt }
  | null;

const iso = (date: string) => date;
const amountOf = (v: string | boolean | undefined) => Number(String(v ?? "").trim() || 0);
const IN_FLIGHT = ["Pending", "Under Verification", "Verified"];

/**
 * One of the customer's own rent / lease agreements. The backend scopes the agreement to the signed-in customer (another
 * customer's id returns 404) and decides what is allowed; this screen only offers an action when the status and the
 * figures returned by the server allow it, and shows the server's message when a request is refused.
 */
export default function CustomerPortalRentalDetail() {
  const { agreementId } = useParams<{ agreementId: string }>();
  const [detail, setDetail] = useState<PortalRentalDetail | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [contactName, setContactName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);
  const [isRentScheduleExpanded, setIsRentScheduleExpanded] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(
    async (silent = false) => {
      if (!agreementId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await getPortalRentalAgreement(agreementId);
        setDetail(data);
        getPortalPropertyNameMap().then((names) => setPropertyName(names[data.agreement.property_id] ?? null)).catch(() => undefined);
      } catch (err) {
        if (!silent) setDetail(null);
        if (!silent) setError(getApiErrorMessage(err, "Failed to load this agreement."));
      } finally {
        setLoading(false);
      }
    },
    [agreementId]
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    getPortalProfile().then((p) => setContactName(p.contact?.full_name ?? "")).catch(() => undefined);
  }, []);

  // Staff activate agreements and verify payments elsewhere: refresh quietly when the customer returns to the tab.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void load(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  const done = (message: string) => {
    setModal(null);
    notify(message);
    void load(true);
  };

  const handleDownloadReceipt = async (p: RentalPayment) => {
    if (downloadingReceiptId) return;
    setDownloadingReceiptId(p.id);
    try {
      const agrId = agreementId || detail?.agreement.id;
      let officialReceipt: RentalReceipt | null = null;
      if (agrId) {
        try {
          officialReceipt = await getPortalRentalReceipt(agrId, p.id);
        } catch {
          /* Fall back gracefully to available payment data */
        }
      }

      const effectiveReceiptNum =
        officialReceipt?.receipt_number ||
        p.receipt_number ||
        officialReceipt?.transaction_reference ||
        p.transaction_reference ||
        `REC-${p.id.slice(0, 8).toUpperCase()}`;

      const effectivePropName =
        propertyName ||
        (detail?.agreement.agreement_type ? `${detail.agreement.agreement_type} Property` : "Rental Property");

      const effectiveTenantName = officialReceipt?.customer_name || contactName || "Tenant";

      await downloadRentalReceiptPdf({
        companyName: "SCuilONE Real Estate",
        portalName: "Rentals & Leases Portal",
        receiptNumber: effectiveReceiptNum,
        propertyName: effectivePropName,
        tenantName: effectiveTenantName,
        paymentType: officialReceipt?.payment_type || p.payment_type || "Rent",
        amount: officialReceipt?.amount ?? p.amount,
        currency: officialReceipt?.currency,
        paymentMethod: officialReceipt?.payment_method || p.payment_method || "Online",
        paymentDate: officialReceipt?.payment_date || p.payment_date,
        paymentStatus: p.status === "Verified" ? "Verified" : p.status,
        transactionReference: officialReceipt?.transaction_reference || p.transaction_reference,
        paymentId: p.id,
        agreementId: agrId,
        notes: officialReceipt?.notes || p.notes,
        verifiedAt: officialReceipt?.verified_at || p.verified_at,
      });
      notify("Receipt downloaded successfully.", "success");
    } catch (err) {
      notify(getApiErrorMessage(err, "Failed to generate receipt PDF."), "error");
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  const handleViewReceipt = async (p: RentalPayment) => {
    try {
      const agrId = agreementId || detail?.agreement.id;
      let receipt: RentalReceipt;
      if (agrId) {
        try {
          receipt = await getPortalRentalReceipt(agrId, p.id);
        } catch {
          receipt = {
            receipt_number: p.receipt_number || p.transaction_reference || `REC-${p.id.slice(0, 8).toUpperCase()}`,
            payment_id: p.id,
            agreement_id: agrId,
            customer_name: contactName || "Tenant",
            payment_type: p.payment_type || "Rent",
            amount: p.amount,
            currency: "INR",
            payment_method: p.payment_method || "Online",
            transaction_reference: p.transaction_reference,
            payment_date: p.payment_date,
            verified_at: p.verified_at,
            notes: p.notes,
          };
        }
      } else {
        receipt = {
          receipt_number: p.receipt_number || p.transaction_reference || `REC-${p.id.slice(0, 8).toUpperCase()}`,
          payment_id: p.id,
          agreement_id: "",
          customer_name: contactName || "Tenant",
          payment_type: p.payment_type || "Rent",
          amount: p.amount,
          currency: "INR",
          payment_method: p.payment_method || "Online",
          transaction_reference: p.transaction_reference,
          payment_date: p.payment_date,
          verified_at: p.verified_at,
          notes: p.notes,
        };
      }
      setModal({ kind: "receipt", receipt });
    } catch (err) {
      notify(getApiErrorMessage(err, "The receipt could not be loaded."), "error");
    }
  };

  const deposit = useMemo(() => {
    if (!detail) return { reserved: 0, verified: 0, remaining: 0 };
    const rows = detail.payments.filter((p) => p.payment_type === "Deposit");
    const reserved = rows.filter((p) => IN_FLIGHT.includes(p.status)).reduce((s, p) => s + Number(p.amount), 0);
    const verified = rows.filter((p) => p.status === "Verified").reduce((s, p) => s + Number(p.amount), 0);
    return { reserved, verified, remaining: Math.max(0, Number(detail.agreement.deposit_amount) - reserved) };
  }, [detail]);

  if (loading && !detail) {
    return (
      <div className="cp-tickets-page" aria-busy="true">
        <div className="cp-skeleton" style={{ height: 110 }} />
        <div className="cp-skeleton" style={{ height: 240 }} />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="cp-tickets-page">
        <Link to="/portal/rentals" className="cp-back-link">
          <ArrowLeftIcon size={14} /> Back to my rentals
        </Link>
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error ?? "Agreement not found."}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const a = detail.agreement;
  const needsSignature = a.status === "Pending Signature" && !a.customer_signed_at;
  const canPayDeposit = a.status === "Pending Signature" && Boolean(a.customer_signed_at) && deposit.remaining > 0;
  const recurringOpen = a.status === "Active" || a.status === "Expired" || a.status === "Termination Requested";
  const canExit = a.status === "Active" || a.status === "Expired";
  const canRenew = (a.status === "Active" || a.status === "Expired") && Boolean(a.agreement_end);
  const heading = propertyName ?? `${a.agreement_type} property`;

  const banner = ((): { tone: "warn" | "ok" | "info"; text: string } | null => {
    if (needsSignature) return { tone: "warn", text: "Your agreement is ready. Read it carefully, then sign below. Your signature is your acceptance of its terms." };
    if (a.status === "Pending Signature") {
      return deposit.remaining > 0
        ? { tone: "warn", text: `You have signed. The security deposit of ${formatRent(a.deposit_amount)} must be paid and verified before the agreement can be activated.` }
        : { tone: "info", text: "You have signed and your deposit is submitted. Our team will verify it and activate your agreement." };
    }
    if (a.status === "Termination Requested") return { tone: "info", text: "Your exit request is being processed by our team." };
    return null;
  })();

  const handleDownloadAgreement = async () => {
    if (!a) {
      notify("No agreement details are available to download.", "error");
      return;
    }
    setIsDownloading(true);
    try {
      const fileName = await downloadRentalAgreementPdf({
        agreement: a,
        propertyName,
        companyName: "SCuilONE Real Estate",
        portalName: "Rentals & Leases Portal",
      });
      notify(`Agreement document (${fileName}) downloaded successfully.`);
    } catch (err: any) {
      console.error("Failed to download agreement document:", err);
      notify(getApiErrorMessage(err, "Failed to download agreement document. Please try again."), "error");
    } finally {
      setIsDownloading(false);
    }
  };

  const renderModal = (): ReactNode => {
    if (!modal) return null;
    const close = () => setModal(null);
    if (modal.kind === "view-item") {
      const s = modal.item;
      const outstanding = Number(s.outstanding ?? 0);
      const canPayItem = recurringOpen && outstanding > 0 && (s.charge_type === "Rent" || s.charge_type === "Maintenance");
      return (
        <PortalInstallmentPaymentDetailsModal
          item={s}
          payments={detail.payments}
          canPay={Boolean(canPayItem)}
          onClose={close}
          onPay={() => setModal({ kind: "pay-item", item: s })}
        />
      );
    }
    if (modal.kind === "pay-item") {
      return (
        <PortalRentPaymentModal
          agreement={a}
          item={modal.item}
          schedule={detail.payment_schedule}
          onClose={close}
          onSuccess={(msg) => done(msg)}
          onError={(msg) => notify(msg, "error")}
        />
      );
    }
    if (modal.kind === "pay-deposit") {
      const max = modal.remaining;
      return (
        <RentalFormModal
          title="Pay security deposit"
          intro={`Pay using the details given by our team, then record it here. It counts once our team verifies it. You can pay up to ${formatRent(max)}.`}
          fields={[
            { key: "amount", label: "Amount (INR)", type: "number", required: true },
            { key: "method", label: "Payment method", type: "select", options: [...RENTAL_PAYMENT_METHODS], required: true },
            { key: "reference", label: "Transaction reference", hint: "Required for bank, UPI and card payments." },
            { key: "proof", label: "Proof document URL (optional)" },
            { key: "date", label: "Payment date", type: "date", required: true },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          initial={{ amount: String(max), method: "Bank Transfer", date: todayInput() }}
          validate={(v) => {
            const out: Record<string, string> = {};
            const amount = amountOf(v.amount);
            if (amount <= 0) out.amount = "Enter an amount greater than zero.";
            else if (amount > max + 0.004) out.amount = `The most you can pay now is ${formatRent(max)}.`;
            if (String(v.method) !== "Cash" && String(v.method) !== "Other" && !String(v.reference).trim()) out.reference = `Enter the transaction reference for ${String(v.method)}.`;
            if (String(v.date) > todayInput()) out.date = "The payment date cannot be in the future.";
            return out;
          }}
          submitLabel="Submit payment"
          onClose={close}
          onSubmit={async (v) => {
            await submitPortalRentalPayment(a.id, {
              payment_type: "Deposit",
              schedule_id: null,
              amount: amountOf(v.amount),
              payment_method: v.method as (typeof RENTAL_PAYMENT_METHODS)[number],
              transaction_reference: String(v.reference).trim() || null,
              proof_document_url: String(v.proof).trim() || null,
              payment_date: iso(String(v.date)),
              notes: String(v.notes).trim() || null,
            });
            done("Payment submitted. Our team will verify it and you will be notified.");
          }}
        />
      );
    }
    if (modal.kind === "ack") {
      return (
        <RentalFormModal
          title={`Acknowledge the ${modal.type.toLowerCase()} inspection`}
          intro="By acknowledging, you confirm you have seen the inspection report. You can add a comment."
          fields={[{ key: "notes", label: "Comments (optional)", type: "textarea" }]}
          submitLabel="Acknowledge"
          onClose={close}
          onSubmit={async (v) => {
            await acknowledgePortalInspection(a.id, modal.inspectionId, String(v.notes).trim() || null);
            done("Thank you — your acknowledgement was recorded.");
          }}
        />
      );
    }
    if (modal.kind === "exit") {
      return (
        <RentalFormModal
          title="Request to end your tenancy"
          intro={`Your notice period is ${a.notice_period_days} days${a.lock_in_months ? ` and there is a ${a.lock_in_months}-month lock-in` : ""}. Our team reviews the request and may agree charges for leaving early.`}
          fields={[
            { key: "vacate", label: "Date you plan to vacate", type: "date", required: true },
            { key: "reason", label: "Reason", type: "textarea", required: true },
          ]}
          validate={(v) => (String(v.vacate) < todayInput() ? { vacate: "The vacate date cannot be in the past." } : {})}
          submitLabel="Send request"
          onClose={close}
          onSubmit={async (v) => {
            await requestPortalRentalExit(a.id, { requested_vacate_date: String(v.vacate), notice_served_date: todayInput(), reason: String(v.reason).trim() });
            done("Your exit request was sent to our team.");
          }}
        />
      );
    }
    if (modal.kind === "renewal") {
      return (
        <RentalFormModal
          title="Request a renewal"
          intro={`Your agreement ends on ${formatDay(a.agreement_end)}; your rent is ${formatRent(a.rent_amount, a.rent_frequency)}.`}
          fields={[
            { key: "end", label: "New end date", type: "date", required: true },
            { key: "rent", label: "Rent you are proposing (INR)", type: "number", required: true },
            { key: "reason", label: "Comments", type: "textarea" },
          ]}
          initial={{ rent: String(Number(a.rent_amount)) }}
          validate={(v) => ({ ...(a.agreement_end && String(v.end) <= a.agreement_end ? { end: "The new end date must be after the current end date." } : {}), ...(amountOf(v.rent) <= 0 ? { rent: "Enter a rent greater than zero." } : {}) })}
          submitLabel="Send request"
          onClose={close}
          onSubmit={async (v) => {
            await requestPortalRentalRenewal(a.id, { new_end_date: String(v.end), new_rent_amount: amountOf(v.rent), reason: String(v.reason).trim() || null });
            done("Your renewal request was sent to our team.");
          }}
        />
      );
    }
    const r = modal.receipt;
    return (
      <RentalFormModal
        title={`Receipt ${r.receipt_number || "Payment"}`}
        intro={`${formatRent(r.amount)} · ${r.payment_type} · ${r.payment_method}${r.transaction_reference ? ` · ref ${r.transaction_reference}` : ""}. Paid ${formatDay(r.payment_date)}${r.verified_at ? `, verified ${formatBookingDateTime(r.verified_at)}` : ""}.`}
        fields={[]}
        submitLabel="Download Receipt PDF"
        onClose={close}
        onSubmit={async () => {
          try {
            await downloadRentalReceiptPdf({
              companyName: "SCuilONE Real Estate",
              portalName: "Rentals & Leases Portal",
              receiptNumber: r.receipt_number || r.transaction_reference || `REC-${r.payment_id.slice(0, 8).toUpperCase()}`,
              propertyName: propertyName || (detail?.agreement.agreement_type ? `${detail.agreement.agreement_type} Property` : "Rental Property"),
              tenantName: r.customer_name || contactName || "Tenant",
              paymentType: r.payment_type,
              amount: r.amount,
              currency: r.currency,
              paymentMethod: r.payment_method,
              paymentDate: r.payment_date,
              paymentStatus: "Verified",
              transactionReference: r.transaction_reference,
              paymentId: r.payment_id,
              agreementId: r.agreement_id || a.id,
              notes: r.notes,
              verifiedAt: r.verified_at,
            });
            notify("Receipt downloaded successfully.", "success");
          } catch (err) {
            notify(getApiErrorMessage(err, "Failed to download receipt PDF."), "error");
          }
          close();
        }}
      />
    );
  };

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

      <Link to="/portal/rentals" className="cp-back-link">
        <ArrowLeftIcon size={14} /> Back to my rentals
      </Link>

      <div className="cp-tickets-header">
        <div>
          <h1>{heading}</h1>
          <p>
            {a.agreement_type} agreement · #{a.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <RentalStatusBadge status={a.status} />
          <button className="btn-secondary" onClick={() => void load()} aria-label="Refresh">
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {banner && <div className={`bj-note${banner.tone === "warn" ? " bj-warn" : ""}`}>{banner.text}</div>}

      <section className="cp-panel" aria-label="Agreement">
        <h2 className="cp-panel-title">Agreement</h2>

        <BookingFacts
          items={[
            { label: "Rent", value: formatRent(a.rent_amount, a.rent_frequency) },
            { label: "Security deposit", value: formatRent(a.deposit_amount) },
            { label: "Maintenance", value: Number(a.maintenance_amount) > 0 ? formatRent(a.maintenance_amount, a.maintenance_frequency) : "None" },
            { label: "Start", value: formatDay(a.agreement_start) },
            { label: "End", value: a.agreement_end ? formatDay(a.agreement_end) : "Open-ended" },
            { label: "Lock-in", value: `${a.lock_in_months} month${a.lock_in_months === 1 ? "" : "s"}` },
            { label: "Notice period", value: `${a.notice_period_days} days` },
            { label: "Rent due on", value: `Day ${a.due_day} of the period` },
            { label: "Late fee", value: Number(a.late_fee_amount) > 0 ? `${a.late_fee_type === "Percentage" ? `${a.late_fee_amount}%` : formatRent(a.late_fee_amount)} after ${a.late_fee_grace_days} grace days` : "None" },
            { label: "Escalation", value: a.escalation_percentage != null ? `${a.escalation_percentage}% every ${a.escalation_interval_months} months` : "None" },
            { label: "You signed", value: a.customer_signed_at ? `${formatBookingDateTime(a.customer_signed_at)} (${a.customer_signature_name ?? "—"})` : "Not yet" },
            { label: "Activated", value: a.activated_at ? formatBookingDateTime(a.activated_at) : "—" },
            {
              label: "Agreement document",
              value: (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--cp-accent, #3285F6)",
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0,
                      font: "inherit",
                      fontWeight: 600,
                    }}
                    onClick={() => setIsViewerOpen(true)}
                  >
                    View Agreement
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--cp-accent, #3285F6)",
                      textDecoration: "underline",
                      cursor: "pointer",
                      padding: 0,
                      font: "inherit",
                      fontWeight: 600,
                    }}
                    onClick={() => void handleDownloadAgreement()}
                    disabled={isDownloading}
                  >
                    {isDownloading ? "Downloading..." : "Download (PDF)"}
                  </button>
                </span>
              ),
            },
          ]}
        />
        {needsSignature && <SignForm agreementId={a.id} hasDocument={Boolean(a.agreement_document_url)} contactName={contactName} onSigned={() => done("Agreement signed. Thank you.")} onError={(m) => notify(m, "error")} />}
      </section>

      {(canPayDeposit || deposit.reserved > 0 || a.status === "Pending Signature") && Number(a.deposit_amount) > 0 && (
        <section className="cp-panel" aria-label="Security deposit">
          <h2 className="cp-panel-title">Security deposit</h2>
          <BookingFacts
            items={[
              { label: "Agreed deposit", value: formatRent(a.deposit_amount) },
              { label: "Verified", value: formatRent(deposit.verified) },
              { label: "Submitted, awaiting verification", value: formatRent(Math.max(0, deposit.reserved - deposit.verified)) },
              { label: "Still to pay", value: formatRent(deposit.remaining) },
            ]}
          />
          {canPayDeposit && (
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={() => setModal({ kind: "pay-deposit", remaining: deposit.remaining })}>
              Pay deposit
            </button>
          )}
          {a.status === "Pending Signature" && !a.customer_signed_at && <p className="cp-ticket-snippet" style={{ margin: "10px 0 0" }}>Sign the agreement first; the deposit can then be paid.</p>}
        </section>
      )}

      {detail.payment_schedule.length > 0 && (
        <section className="cp-panel cp-rent-schedule-accordion" aria-label="Rent schedule">
          <button
            type="button"
            className="cp-accordion-header"
            onClick={() => setIsRentScheduleExpanded((prev) => !prev)}
            aria-expanded={isRentScheduleExpanded}
            aria-controls="cp-rent-schedule-content"
          >
            <div className="cp-accordion-title-wrap">
              <h2 className="cp-panel-title" style={{ margin: 0 }}>Rent Schedule</h2>
              <span className="cp-accordion-badge">
                {detail.payment_schedule.length} {detail.payment_schedule.length === 1 ? "installment" : "installments"}
              </span>
            </div>
            <div className="cp-accordion-chevron" aria-hidden="true">
              {isRentScheduleExpanded ? <ChevronUpIcon size={18} /> : <ChevronDownIcon size={18} />}
            </div>
          </button>

          <div
            id="cp-rent-schedule-content"
            className={`cp-accordion-content ${isRentScheduleExpanded ? "expanded" : "collapsed"}`}
            aria-hidden={!isRentScheduleExpanded}
          >
            <div className="cp-accordion-inner">
              <div className="cp-table-card" style={{ overflowX: "auto" }}>
                <table className="cp-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>For</th>
                      <th>Due</th>
                      <th>Amount</th>
                      <th>Paid</th>
                      <th>Outstanding</th>
                      <th>Status</th>
                      <th style={{ textAlign: "right", minWidth: 160 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payment_schedule.map((s) => {
                      const outstanding = Number(s.outstanding ?? 0);
                      return (
                        <tr key={s.id}>
                          <td>{s.sequence}</td>
                          <td>
                            {s.charge_type}
                            <div className="cp-ticket-snippet" style={{ margin: 0 }}>{formatDay(s.period_start)} – {formatDay(s.period_end)}</div>
                          </td>
                          <td>{formatDay(s.due_date)}</td>
                          <td>
                            {formatRent(s.total_due)}
                            {Number(s.late_fee_amount) > 0 && <div className="cp-ticket-snippet" style={{ margin: 0 }}>includes late fee {formatRent(s.late_fee_amount)}</div>}
                          </td>
                          <td>{formatRent(s.paid ?? 0)}</td>
                          <td>{formatRent(outstanding)}</td>
                          <td>
                            <RentalStatusBadge status={s.status} />
                          </td>
                          <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => setModal({ kind: "view-item", item: s })}
                                title="View payment details for this installment"
                              >
                                View Details
                              </button>
                              {recurringOpen && outstanding > 0 && (s.charge_type === "Rent" || s.charge_type === "Maintenance") && (
                                <button
                                  type="button"
                                  className="btn-primary"
                                  onClick={() => setModal({ kind: "pay-item", item: s })}
                                >
                                  Pay
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="cp-panel" aria-label="Payment history">
        <h2 className="cp-panel-title">Payment history</h2>
        {detail.payments.length === 0 ? (
          <p className="cp-ticket-snippet" style={{ margin: 0 }}>No payments recorded yet.</p>
        ) : (
          <ul className="bj-list">
            {detail.payments.map((p: RentalPayment) => (
              <li key={p.id}>
                <div className="bj-list-main">
                  <strong>
                    {formatRent(p.amount)} · {p.payment_type}
                  </strong>{" "}
                  <RentalStatusBadge status={p.status} />
                  <div className="cp-ticket-snippet" style={{ margin: 0 }}>
                    {p.payment_method} · {formatDay(p.payment_date)}
                    {p.transaction_reference ? ` · ref ${p.transaction_reference}` : ""}
                    {p.status === "Under Verification" || p.status === "Pending" ? " · awaiting verification" : ""}
                    {p.status === "Rejected" ? " · rejected — please contact our team or pay again" : ""}
                  </div>
                </div>
                {(p.status === "Verified" || p.status === "Paid" || Boolean(p.receipt_number)) && (
                  <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void handleViewReceipt(p)}
                      title="View receipt details"
                    >
                      Receipt
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px" }}
                      disabled={downloadingReceiptId === p.id}
                      onClick={() => void handleDownloadReceipt(p)}
                      title="Download PDF receipt"
                      aria-label="Download receipt"
                    >
                      <DownloadIcon size={14} />
                      {downloadingReceiptId === p.id && <span style={{ fontSize: "0.8rem" }}>Generating…</span>}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.inspections.length > 0 && (
        <section className="cp-panel" aria-label="Inspections">
          <h2 className="cp-panel-title">Inspections</h2>
          <ul className="bj-list">
            {detail.inspections.map((i) => (
              <li key={i.id}>
                <div className="bj-list-main">
                  <strong>
                    {i.inspection_type} inspection · {i.condition}
                  </strong>
                  <div className="cp-ticket-snippet" style={{ margin: 0 }}>
                    {formatBookingDateTime(i.inspected_at)}
                    {i.damage_details ? ` · ${i.damage_details}` : ""}
                    {Number(i.damage_amount) > 0 ? ` · damage charge ${formatRent(i.damage_amount)}` : ""}
                  </div>
                  {i.tenant_acknowledged && <div className="cp-ticket-snippet" style={{ margin: 0 }}>You acknowledged this on {formatBookingDateTime(i.tenant_acknowledged_at)}.</div>}
                </div>
                {!i.tenant_acknowledged && (
                  <button className="btn-secondary" onClick={() => setModal({ kind: "ack", inspectionId: i.id, type: i.inspection_type })}>
                    Acknowledge
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.settlement && (
        <section className="cp-panel" aria-label="Move-out settlement">
          <h2 className="cp-panel-title">
            Move-out settlement <RentalStatusBadge status={detail.settlement.status} />
          </h2>
          <BookingFacts
            items={[
              { label: "Deposit held", value: formatRent(detail.settlement.deposit_balance) },
              { label: "Rent arrears", value: formatRent(detail.settlement.rent_arrears) },
              { label: "Utility charges", value: formatRent(detail.settlement.utility_charges) },
              { label: "Damage charges", value: formatRent(detail.settlement.damage_charges) },
              { label: "Exit & notice charges", value: formatRent(Number(detail.settlement.early_exit_charge) + Number(detail.settlement.notice_shortfall_charge)) },
              { label: "Other charges", value: formatRent(detail.settlement.other_charges) },
              { label: "Total deductions", value: formatRent(detail.settlement.deductions_total) },
              { label: "Refund to you", value: formatRent(detail.settlement.refund_amount) },
              { label: "Amount you owe", value: formatRent(detail.settlement.amount_due_from_tenant) },
            ]}
          />
        </section>
      )}

      {(canExit || canRenew) && (
        <section className="cp-panel" aria-label="Manage tenancy">
          <h2 className="cp-panel-title">Manage your tenancy</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {canRenew && (
              <button className="btn-secondary" onClick={() => setModal({ kind: "renewal" })}>
                Request renewal
              </button>
            )}
            {canExit && (
              <button className="btn-secondary" onClick={() => setModal({ kind: "exit" })}>
                Request to end tenancy
              </button>
            )}
          </div>
        </section>
      )}

      {/* Agreement PDF Viewer Modal */}
      <PortalAgreementViewerModal
        isOpen={isViewerOpen}
        onClose={() => setIsViewerOpen(false)}
        agreement={a}
        agreementUrl={a.agreement_document_url}
        agreementNumber={a.id.slice(0, 8).toUpperCase()}
        propertyName={propertyName}
        agreementType={a.agreement_type}
        status={a.status}
        onDownload={() => void handleDownloadAgreement()}
        isDownloading={isDownloading}
        updatedAt={a.updated_at ? formatDay(a.updated_at) : undefined}
      />

      {renderModal()}
    </div>
  );
}

/** Sign form: the typed name must match the full name on the customer's account (the server checks it too). */
function SignForm({
  agreementId,
  hasDocument,
  contactName,
  onSigned,
  onError,
}: {
  agreementId: string;
  hasDocument: boolean;
  contactName: string;
  onSigned: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!hasDocument) return setProblem("The agreement document is not available yet. Please try again later.");
    if (name.trim().length < 2) return setProblem("Type your full name to sign.");
    if (contactName && name.trim().toLowerCase() !== contactName.trim().toLowerCase()) return setProblem(`Type your full name exactly as it appears on your account: ${contactName}.`);
    if (!accepted) return setProblem("Please confirm that you have read and accept the agreement.");
    setProblem(null);
    setBusy(true);
    try {
      await signPortalRentalAgreement(agreementId, { accepted_terms: true, signature_name: name.trim() });
      onSigned();
    } catch (err) {
      const message = getApiErrorMessage(err, "The agreement could not be signed.");
      setProblem(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 16, display: "grid", gap: 10, maxWidth: 520 }} noValidate>
      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Sign this agreement</h3>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={busy} style={{ marginTop: 3 }} />
        <span>I have read the agreement document and I accept its terms.</span>
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Type your full name to sign{contactName ? ` (${contactName})` : ""}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoComplete="name" aria-invalid={Boolean(problem)} style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid rgba(100,116,139,0.5)", background: "transparent", color: "inherit" }} />
      </label>
      {problem && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={16} />
          <span>{problem}</span>
        </div>
      )}
      <button type="submit" className="btn-primary" disabled={busy} style={{ width: "fit-content" }}>
        {busy ? "Signing…" : "Sign agreement"}
      </button>
      <p className="cp-ticket-snippet" style={{ margin: 0 }}>Your typed name, the time and your device details are recorded as your electronic signature.</p>
    </form>
  );
}

type PaymentForOption = "Rent Only" | "Maintenance Only" | "Rent + Maintenance";

function PortalRentPaymentModal({
  agreement,
  item,
  schedule,
  onClose,
  onSuccess,
  onError,
}: {
  agreement: RentalAgreement;
  item: RentalScheduleItem;
  schedule: RentalScheduleItem[];
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const isItemRent = item.charge_type === "Rent";
  const rentItem = isItemRent
    ? item
    : schedule.find((s) => s.charge_type === "Rent" && (s.period_start === item.period_start || s.sequence === item.sequence)) ?? item;

  const maintItem = !isItemRent
    ? item
    : schedule.find((s) => s.charge_type === "Maintenance" && (s.period_start === item.period_start || s.sequence === item.sequence));

  const rentAmount = Number(rentItem.outstanding ?? rentItem.total_due ?? rentItem.amount ?? 0);
  const maintAmount = maintItem
    ? Number(maintItem.outstanding ?? maintItem.total_due ?? maintItem.amount ?? 0)
    : Number(agreement.maintenance_amount ?? 0);

  const hasMaintenance = maintAmount > 0;
  const defaultOption: PaymentForOption = !isItemRent && hasMaintenance ? "Maintenance Only" : "Rent Only";
  const [paymentFor, setPaymentFor] = useState<PaymentForOption>(defaultOption);

  const getDefaultAmount = (opt: PaymentForOption) => {
    if (opt === "Maintenance Only") return String(maintAmount);
    if (opt === "Rent + Maintenance") return String(rentAmount + maintAmount);
    return String(rentAmount);
  };

  const [amount, setAmount] = useState<string>(() => getDefaultAmount(defaultOption));
  const [method, setMethod] = useState<(typeof RENTAL_PAYMENT_METHODS)[number]>("Bank Transfer");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState("");
  const [date, setDate] = useState(todayInput());
  const [notes, setNotes] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handlePaymentForChange = (newOpt: PaymentForOption) => {
    setPaymentFor(newOpt);
    setAmount(getDefaultAmount(newOpt));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.amount;
      delete next.paymentFor;
      return next;
    });
  };

  const currentMax = useMemo(() => {
    if (paymentFor === "Maintenance Only") return maintAmount;
    if (paymentFor === "Rent + Maintenance") return rentAmount + maintAmount;
    return rentAmount;
  }, [paymentFor, maintAmount, rentAmount]);

  const modalTitle =
    paymentFor === "Maintenance Only"
      ? `Pay maintenance due ${formatDay(item.due_date)}`
      : paymentFor === "Rent + Maintenance"
      ? `Pay rent & maintenance due ${formatDay(item.due_date)}`
      : `Pay rent due ${formatDay(item.due_date)}`;

  const modalIntro =
    paymentFor === "Maintenance Only"
      ? `Pay maintenance charges using the details provided below, then record your payment here. Maintenance due: ${formatRent(maintAmount)}.`
      : paymentFor === "Rent + Maintenance"
      ? `Pay combined rent and maintenance charges. Total due: ${formatRent(rentAmount + maintAmount)}.`
      : `Pay rent using the details provided below, then record your payment here. Outstanding rent: ${formatRent(rentAmount)}.`;

  const validateForm = () => {
    const errs: Record<string, string> = {};
    const num = amountOf(amount);
    if (num <= 0) {
      errs.amount = "Enter an amount greater than zero.";
    } else if (num > currentMax + 0.004) {
      errs.amount = `The most you can pay now is ${formatRent(currentMax)}.`;
    }

    if (method !== "Cash" && method !== "Other" && !reference.trim()) {
      errs.reference = `Enter the transaction reference for ${method}.`;
    }

    if (date > todayInput()) {
      errs.date = "The payment date cannot be in the future.";
    }

    return errs;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const formErrors = validateForm();
    setErrors(formErrors);
    if (Object.keys(formErrors).length > 0) return;

    setBusy(true);
    setApiError(null);

    try {
      const enteredAmount = amountOf(amount);

      if (paymentFor === "Rent Only") {
        await submitPortalRentalPayment(agreement.id, {
          payment_type: "Rent",
          schedule_id: rentItem.id,
          amount: enteredAmount,
          payment_method: method,
          transaction_reference: reference.trim() || null,
          proof_document_url: proof.trim() || null,
          payment_date: iso(date),
          notes: notes.trim() || null,
        });
      } else if (paymentFor === "Maintenance Only") {
        await submitPortalRentalPayment(agreement.id, {
          payment_type: "Maintenance",
          schedule_id: maintItem ? maintItem.id : rentItem.id,
          amount: enteredAmount,
          payment_method: method,
          transaction_reference: reference.trim() || null,
          proof_document_url: proof.trim() || null,
          payment_date: iso(date),
          notes: notes.trim() || null,
        });
      } else {
        // Rent + Maintenance
        if (maintItem) {
          const rentPortion = Math.min(rentAmount, enteredAmount);
          const maintPortion = Math.max(0, enteredAmount - rentPortion);

          await submitPortalRentalPayment(agreement.id, {
            payment_type: "Rent",
            schedule_id: rentItem.id,
            amount: rentPortion,
            payment_method: method,
            transaction_reference: reference.trim() || null,
            proof_document_url: proof.trim() || null,
            payment_date: iso(date),
            notes: notes.trim() ? `[Rent + Maintenance] ${notes.trim()}` : "Rent payment (combined)",
          });

          if (maintPortion > 0) {
            await submitPortalRentalPayment(agreement.id, {
              payment_type: "Maintenance",
              schedule_id: maintItem.id,
              amount: maintPortion,
              payment_method: method,
              transaction_reference: reference.trim() ? `${reference.trim()}-MAINT` : null,
              proof_document_url: proof.trim() || null,
              payment_date: iso(date),
              notes: notes.trim() ? `[Rent + Maintenance] ${notes.trim()}` : "Maintenance payment (combined)",
            });
          }
        } else {
          await submitPortalRentalPayment(agreement.id, {
            payment_type: "Rent",
            schedule_id: rentItem.id,
            amount: enteredAmount,
            payment_method: method,
            transaction_reference: reference.trim() || null,
            proof_document_url: proof.trim() || null,
            payment_date: iso(date),
            notes: `[Rent: ${formatRent(rentAmount)}, Maintenance: ${formatRent(maintAmount)}] ${notes.trim()}`.trim(),
          });
        }
      }

      onSuccess("Payment submitted. Our team will verify it and you will be notified.");
    } catch (err) {
      const msg = getApiErrorMessage(err, "The payment could not be submitted.");
      setApiError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ActionDialog
      title={modalTitle}
      titleId="rent-payment-modal-title"
      error={apiError}
      busy={busy}
      submitLabel="Submit payment"
      onClose={onClose}
      onSubmit={(e) => void handleSubmit(e)}
    >
      <p className="text-muted" style={{ marginTop: 0, fontSize: "0.88rem" }}>
        {modalIntro}
      </p>

      {/* Payment For Dropdown */}
      <Field id="rf-payment-for" label="Payment For *" hint="Select the charges you are paying for">
        <select
          id="rf-payment-for"
          className="filter-select"
          style={inputStyle}
          value={paymentFor}
          onChange={(e) => handlePaymentForChange(e.target.value as PaymentForOption)}
          disabled={busy}
        >
          <option value="Rent Only">Rent Only</option>
          {hasMaintenance && <option value="Maintenance Only">Maintenance Only</option>}
          {hasMaintenance && <option value="Rent + Maintenance">Rent + Maintenance</option>}
        </select>
      </Field>

      {/* Breakdown display when Rent + Maintenance is selected */}
      {paymentFor === "Rent + Maintenance" && (
        <div className="cp-payment-breakdown">
          <div className="cp-payment-breakdown-title">Payment Breakdown</div>
          <div className="cp-payment-breakdown-row">
            <span>Rent:</span>
            <span className="cp-payment-breakdown-val">{formatRent(rentAmount)}</span>
          </div>
          <div className="cp-payment-breakdown-row">
            <span>Maintenance:</span>
            <span className="cp-payment-breakdown-val">{formatRent(maintAmount)}</span>
          </div>
          <div className="cp-payment-breakdown-row total">
            <span>Total:</span>
            <span className="cp-payment-breakdown-val highlight">{formatRent(rentAmount + maintAmount)}</span>
          </div>
        </div>
      )}

      {/* Amount field */}
      <Field
        id="rf-amount"
        label="Amount (INR) *"
        error={errors.amount}
        hint={
          paymentFor === "Rent Only"
            ? `Outstanding rent: ${formatRent(rentAmount)}`
            : paymentFor === "Maintenance Only"
            ? `Maintenance charges: ${formatRent(maintAmount)}`
            : `Total: ${formatRent(rentAmount + maintAmount)}`
        }
      >
        <input
          id="rf-amount"
          className="ins-prob-input"
          style={{ ...inputStyle, textAlign: "left" }}
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (errors.amount) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next.amount;
                return next;
              });
            }
          }}
          disabled={busy}
        />
      </Field>

      {/* Payment method */}
      <Field id="rf-method" label="Payment method *" error={errors.method}>
        <select
          id="rf-method"
          className="filter-select"
          style={inputStyle}
          value={method}
          onChange={(e) => setMethod(e.target.value as (typeof RENTAL_PAYMENT_METHODS)[number])}
          disabled={busy}
        >
          {RENTAL_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>

      {/* Transaction reference */}
      <Field id="rf-reference" label="Transaction reference" error={errors.reference} hint="Required for bank, UPI and card payments.">
        <input
          id="rf-reference"
          className="ins-prob-input"
          style={{ ...inputStyle, textAlign: "left" }}
          type="text"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value);
            if (errors.reference) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next.reference;
                return next;
              });
            }
          }}
          disabled={busy}
        />
      </Field>

      {/* Proof document URL */}
      <Field id="rf-proof" label="Proof document URL (optional)">
        <input
          id="rf-proof"
          className="ins-prob-input"
          style={{ ...inputStyle, textAlign: "left" }}
          type="text"
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          disabled={busy}
        />
      </Field>

      {/* Payment date */}
      <Field id="rf-date" label="Payment date *" error={errors.date}>
        <input
          id="rf-date"
          className="ins-prob-input"
          style={{ ...inputStyle, textAlign: "left" }}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            if (errors.date) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next.date;
                return next;
              });
            }
          }}
          disabled={busy}
        />
      </Field>

      {/* Notes */}
      <Field id="rf-notes" label="Notes">
        <textarea
          id="rf-notes"
          className="ins-prob-input"
          style={{ ...inputStyle, textAlign: "left" }}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
        />
      </Field>
    </ActionDialog>
  );
}

function PortalInstallmentPaymentDetailsModal({
  item,
  payments,
  canPay,
  onClose,
  onPay,
}: {
  item: RentalScheduleItem;
  payments: RentalPayment[];
  canPay: boolean;
  onClose: () => void;
  onPay?: () => void;
}) {
  const matchingPayments = useMemo(
    () => payments.filter((p) => p.schedule_id === item.id),
    [payments, item.id]
  );

  const outstanding = Number(item.outstanding ?? 0);
  const paid = Number(item.paid ?? 0);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="installment-payment-modal-title"
        style={{ maxWidth: 640, width: "100%" }}
      >
        <div className="modal-header">
          <div>
            <h2 id="installment-payment-modal-title" style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
              Payment Details — Installment #{item.sequence}
            </h2>
            <div style={{ fontSize: "0.8125rem", color: "var(--cp-text-muted)", marginTop: 2 }}>
              {item.charge_type} · Period: {formatDay(item.period_start)} – {formatDay(item.period_end)}
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>

        <div
          className="modal-body"
          style={{
            maxHeight: "calc(85vh - 130px)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          {/* Installment Summary */}
          <div>
            <h3
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--cp-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "0 0 10px",
              }}
            >
              Installment Summary
            </h3>
            <BookingFacts
              items={[
                { label: "Installment #", value: `#${item.sequence}` },
                { label: "Charge For", value: item.charge_type },
                { label: "Payment Period", value: `${formatDay(item.period_start)} – ${formatDay(item.period_end)}` },
                { label: "Due Date", value: formatDay(item.due_date) },
                {
                  label: "Amount Due",
                  value: (
                    <span>
                      {formatRent(item.total_due)}
                      {Number(item.late_fee_amount) > 0 && (
                        <span style={{ fontSize: "0.8125rem", color: "var(--cp-text-muted)", marginLeft: 6 }}>
                          (includes late fee {formatRent(item.late_fee_amount)})
                        </span>
                      )}
                    </span>
                  ),
                },
                { label: "Amount Paid", value: formatRent(paid) },
                { label: "Outstanding Amount", value: formatRent(outstanding) },
                { label: "Installment Status", value: <RentalStatusBadge status={item.status} /> },
              ]}
            />
          </div>

          {/* Payment Details */}
          <div>
            <h3
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--cp-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "0 0 10px",
              }}
            >
              Payment Information {matchingPayments.length > 0 ? `(${matchingPayments.length})` : ""}
            </h3>

            {matchingPayments.length === 0 ? (
              <div
                style={{
                  border: "1px solid var(--cp-border)",
                  borderRadius: 10,
                  padding: 16,
                  background: "var(--cp-surface-2, rgba(255,255,255,0.02))",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <AlertCircleIcon size={18} color="var(--cp-text-muted)" />
                  <span style={{ fontSize: "0.875rem", color: "var(--cp-text-muted)" }}>
                    {paid > 0
                      ? "Payment details are not available for this installment."
                      : "Payment details are not available for this installment. No payments have been recorded yet."}
                  </span>
                </div>
                <BookingFacts
                  items={[
                    { label: "Payment Date", value: "Not Available" },
                    { label: "Amount Paid", value: formatRent(paid) },
                    { label: "Payment Method", value: "Not Available" },
                    { label: "Transaction Reference", value: "Not Available" },
                    { label: "Payment Status", value: <RentalStatusBadge status={item.status} /> },
                    { label: "Notes", value: "Not Available" },
                    { label: "Payment Proof", value: "Not Available" },
                  ]}
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {matchingPayments.map((p, idx) => (
                  <div
                    key={p.id || idx}
                    style={{
                      border: "1px solid var(--cp-border)",
                      borderRadius: 10,
                      padding: 14,
                      background: "var(--cp-surface-2, rgba(255,255,255,0.02))",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                        borderBottom: "1px solid var(--cp-border)",
                        paddingBottom: 8,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                        Payment {matchingPayments.length > 1 ? `#${idx + 1} ` : ""}· {formatRent(p.amount)}
                      </span>
                      <RentalStatusBadge status={p.status} />
                    </div>
                    <BookingFacts
                      items={[
                        { label: "Payment Date", value: p.payment_date ? formatDay(p.payment_date) : "Not Available" },
                        { label: "Amount Paid", value: formatRent(p.amount) },
                        { label: "Payment Method", value: p.payment_method || "Not Available" },
                        { label: "Transaction Reference", value: p.transaction_reference || "Not Available" },
                        { label: "Payment Status", value: <RentalStatusBadge status={p.status} /> },
                        { label: "Receipt Number", value: p.receipt_number || "Not Available" },
                        {
                          label: "Verification",
                          value: p.verified_at
                            ? `Verified on ${formatBookingDateTime(p.verified_at)}`
                            : p.status === "Verified"
                            ? "Verified"
                            : "Pending Verification",
                        },
                        { label: "Notes", value: p.notes || "Not Available" },
                        {
                          label: "Payment Proof",
                          value: p.proof_document_url ? (
                            <a
                              href={resolveImageUrl(p.proof_document_url)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cp-ticket-link"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                              <FileTextIcon size={14} />
                              <span>View Proof Document</span>
                            </a>
                          ) : (
                            "Not Available"
                          ),
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {canPay && onPay && (
            <button type="button" className="btn-primary" onClick={onPay}>
              Pay Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
