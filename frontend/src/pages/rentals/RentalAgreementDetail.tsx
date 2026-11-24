import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { BookingFacts } from "../../components/booking-journey/BookingJourneyWidgets";
import RentalFormModal from "../../components/rentals/RentalFormModal";
import { StaffAgreementUploadModal } from "../../components/rentals/StaffAgreementUploadModal";
import { PortalAgreementViewerModal } from "../../components/portal/PortalAgreementViewerModal";
import { RentalStatusBadge } from "../../components/rentals/RentalWidgets";
import { DownloadIcon } from "../../components/common/SupportPortalIcons";
import * as rentals from "../../services/rentalService";
import { getPropertyNameMap } from "../../services/customerBookingWorkflowService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { agreementActions, formatDay, formatRent, todayInput } from "../../utils/rentalHelpers";
import { RENTAL_PAYMENT_METHODS } from "../../types/rental";
import type {
  DepositLedger,
  RentalAgreement,
  RentalExitRequest,
  RentalInspection,
  RentalPayment,
  RentalReceipt,
  RentalRenewal,
  RentalScheduleItem,
  RentalSettlement,
} from "../../types/rental";
import { downloadRentalReceiptPdf } from "../../utils/rentalReceiptPdfGenerator";
import { downloadRentalAgreementPdf } from "../../utils/rentalAgreementPdfGenerator";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";
import "../../components/booking-journey/BookingJourney.css";

type Tab = "overview" | "schedule" | "payments" | "deposit" | "exit" | "inspections" | "renewals";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "schedule", label: "Rent schedule" },
  { key: "payments", label: "Payments" },
  { key: "deposit", label: "Security deposit" },
  { key: "exit", label: "Exit & settlement" },
  { key: "inspections", label: "Inspections" },
  { key: "renewals", label: "Renewals" },
];

type Modal =
  | { kind: "send" }
  | { kind: "upload-pdf" }
  | { kind: "walkin" }
  | { kind: "activate" }
  | { kind: "cancel" }
  | { kind: "schedule" }
  | { kind: "payment" }
  | { kind: "payment-decision"; payment: RentalPayment; decision: "Verified" | "Rejected" }
  | { kind: "deposit" }
  | { kind: "exit" }
  | { kind: "exit-decision"; exit: RentalExitRequest }
  | { kind: "inspection"; exit?: RentalExitRequest }
  | { kind: "settlement"; exit: RentalExitRequest }
  | { kind: "refund"; settlement: RentalSettlement }
  | { kind: "collect"; settlement: RentalSettlement }
  | { kind: "renewal" }
  | { kind: "renewal-decision"; renewal: RentalRenewal; decision: "Approved" | "Rejected" }
  | { kind: "receipt"; receipt: RentalReceipt }
  | null;

interface TabData {
  schedule?: RentalScheduleItem[];
  payments?: RentalPayment[];
  deposit?: DepositLedger;
  exits?: RentalExitRequest[];
  settlements?: RentalSettlement[];
  inspections?: RentalInspection[];
  renewals?: RentalRenewal[];
}

const num = (v: string | boolean | undefined): number => Number(String(v ?? "").trim() || 0);
const iso = (date: string): string => new Date(`${date}T12:00:00`).toISOString();

/**
 * Staff view of one rent / lease agreement. Every action calls the matching /api/v1/rentals endpoint; the screen only
 * offers an action when the agreement's status allows it (the same rules the backend enforces) and always shows the
 * server's message when a request is refused. Nothing is computed locally except display.
 */
export default function RentalAgreementDetail() {
  const { industry, agreementId } = useParams<{ industry: string; agreementId: string }>();
  const perms = useMemo(
    () => ({
      view: hasFeaturePermission("booking.view"),
      update: hasFeaturePermission("booking.update"),
      payCreate: hasFeaturePermission("booking.payment.create"),
      payVerify: hasFeaturePermission("booking.payment.verify"),
      payView: hasFeaturePermission("booking.payment.view"),
    }),
    []
  );

  const [agreement, setAgreement] = useState<RentalAgreement | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<TabData>({});
  const [tabError, setTabError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isDownloadingAgreement, setIsDownloadingAgreement] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const notify = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const handleDownloadAgreement = async () => {
    if (!agreement) {
      notify("No agreement details are available to download.", "error");
      return;
    }
    setIsDownloadingAgreement(true);
    try {
      const fileName = await downloadRentalAgreementPdf({
        agreement,
        propertyName,
        companyName: "SCuilONE Real Estate",
        portalName: "Rentals & Leases Management Portal",
      });
      notify(`Agreement document (${fileName}) downloaded successfully.`);
    } catch (err: any) {
      notify(getApiErrorMessage(err, "Failed to generate agreement PDF. Please try again."), "error");
    } finally {
      setIsDownloadingAgreement(false);
    }
  };

  /** Re-reads the agreement and drops every cached tab so nothing stale is shown after a change. */
  const refresh = useCallback(() => {
    setData({});
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!agreementId || !perms.view) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading((prev) => prev || version === 0);
    setError(null);
    rentals
      .getRentalAgreement(agreementId)
      .then((row) => {
        if (cancelled) return;
        setAgreement(row);
        getPropertyNameMap().then((names) => !cancelled && setPropertyName(names[row.property_id] ?? null)).catch(() => undefined);
      })
      .catch((err) => !cancelled && setError(getApiErrorMessage(err, "Failed to load this agreement.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [agreementId, perms.view, version]);

  // Load the data of the open tab (and the schedule, which the payment form needs).
  useEffect(() => {
    if (!agreementId || !agreement) return;
    let cancelled = false;
    setTabError(null);
    const put = (patch: TabData) => !cancelled && setData((prev) => ({ ...prev, ...patch }));
    const fail = (err: unknown) => !cancelled && setTabError(getApiErrorMessage(err, "Failed to load this section."));
    const mine = <T extends { agreement_id: string }>(rows: T[]) => rows.filter((r) => r.agreement_id === agreementId);
    if (tab === "schedule" || tab === "payments") rentals.listRentalSchedule(agreementId).then((schedule) => put({ schedule })).catch(fail);
    if (tab === "payments" && perms.payView) rentals.listRentalPayments(agreementId).then((payments) => put({ payments })).catch(fail);
    if (tab === "deposit") rentals.getDepositLedger(agreementId).then((deposit) => put({ deposit })).catch(fail);
    if (tab === "exit") {
      rentals.listRentalExitRequests().then((rows) => put({ exits: mine(rows) })).catch(fail);
      rentals.listRentalSettlements().then((rows) => put({ settlements: mine(rows) })).catch(fail);
      rentals.listRentalInspections(agreementId).then((inspections) => put({ inspections })).catch(fail);
    }
    if (tab === "inspections") rentals.listRentalInspections(agreementId).then((inspections) => put({ inspections })).catch(fail);
    if (tab === "renewals") rentals.listRentalRenewals().then((rows) => put({ renewals: mine(rows) })).catch(fail);
    return () => {
      cancelled = true;
    };
  }, [tab, agreementId, agreement, version, perms.payView]);

  const done = (message: string) => {
    setModal(null);
    notify(message);
    refresh();
  };
  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id);
    try {
      await action();
      notify(success);
      refresh();
    } catch (err) {
      notify(getApiErrorMessage(err, "The action could not be completed."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const base = `/${industry ?? "real-estate"}/rentals`;
  if (!perms.view) {
    return (
      <div className="ins-page">
        <div className="ins-empty">
          <h3>You do not have access to rentals</h3>
          <p>Ask your administrator for the &ldquo;View bookings&rdquo; permission.</p>
        </div>
      </div>
    );
  }
  if (loading && !agreement) {
    return (
      <div className="ins-page" aria-busy="true">
        <div className="ins-skeleton" style={{ minHeight: 120 }} />
      </div>
    );
  }
  if (error || !agreement) {
    return (
      <div className="ins-page">
        <Link to={base} className="btn-secondary ins-btn-sm" style={{ textDecoration: "none", width: "fit-content" }}>
          ← Back to rentals
        </Link>
        <div className="ins-alert error" role="alert" style={{ marginTop: 12 }}>
          <span>{error ?? "Agreement not found."}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const can = agreementActions(agreement.status, Boolean(agreement.customer_signed_at), Boolean(agreement.agreement_end));
  const a = agreement;

  /* ─────────── modals ─────────── */
  const renderModal = (): ReactNode => {
    if (!modal) return null;
    const close = () => setModal(null);
    switch (modal.kind) {
      case "send":
        return (
          <StaffAgreementUploadModal
            isOpen={true}
            onClose={close}
            agreementId={a.id}
            customerName={a.customer_name}
            contactId={a.contact_id}
            leadId={a.lead_id}
            existingUrl={a.agreement_document_url}
            mode="send-for-signature"
            onSuccess={(msg) => done(msg)}
          />
        );
      case "upload-pdf":
        return (
          <StaffAgreementUploadModal
            isOpen={true}
            onClose={close}
            agreementId={a.id}
            customerName={a.customer_name}
            contactId={a.contact_id}
            leadId={a.lead_id}
            existingUrl={a.agreement_document_url}
            mode="upload-only"
            onSuccess={(msg) => done(msg)}
          />
        );
      case "walkin":
        return (
          <RentalFormModal
            title="Record a walk-in signature"
            intro="For a customer who signed a paper copy in person. A staff member must have witnessed it."
            fields={[
              { key: "name", label: "Signer's full name", required: true },
              { key: "url", label: "Executed document URL", required: true, placeholder: "https://…" },
              { key: "witnessed", label: "A staff member witnessed the signature and received the executed document", type: "checkbox", required: true },
            ]}
            submitLabel="Record signature"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.recordWalkInSignature(a.id, { signer_name: String(v.name).trim(), signed_document_url: String(v.url).trim(), witnessed: v.witnessed === true });
              done("Signature recorded.");
            }}
          />
        );
      case "activate":
        return (
          <RentalFormModal
            title="Activate agreement"
            intro="Activation needs the customer's signature and the full security deposit to be verified. It marks the property Rented and generates the first rent schedule."
            fields={[
              { key: "signedAt", label: "Owner / staff signed on", type: "date", required: !a.signed_at, hint: a.signed_at ? `Already recorded: ${formatDay(a.signed_at)}.` : undefined },
              { key: "url", label: "Signed document URL (optional if already set)" },
            ]}
            initial={{ signedAt: a.signed_at ? "" : todayInput() }}
            submitLabel="Activate agreement"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.activateRentalAgreement(a.id, { signed_at: v.signedAt ? iso(String(v.signedAt)) : null, agreement_document_url: String(v.url).trim() || null });
              done("Agreement activated. The property is now rented.");
            }}
          />
        );
      case "cancel":
        return (
          <RentalFormModal
            title="Cancel agreement"
            intro="Only a draft or pending-signature agreement can be cancelled."
            fields={[{ key: "reason", label: "Reason", type: "textarea", required: true }]}
            submitLabel="Cancel agreement"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.cancelRentalAgreement(a.id, String(v.reason).trim());
              done("Agreement cancelled.");
            }}
          />
        );
      case "schedule":
        return (
          <RentalFormModal
            title="Generate rent schedule"
            intro="Creates the missing rent (and maintenance) due items. Items that already exist are not duplicated."
            fields={[{ key: "through", label: "Generate through", type: "date", hint: a.agreement_end ? `Capped at the agreement end (${formatDay(a.agreement_end)}).` : "Defaults to 12 months from the start." }]}
            submitLabel="Generate"
            onClose={close}
            onSubmit={async (v) => {
              const result = await rentals.generateRentalSchedule(a.id, v.through ? String(v.through) : null);
              done(`${result.created_count} schedule item${result.created_count === 1 ? "" : "s"} created.`);
            }}
          />
        );
      case "payment": {
        const open = (data.schedule ?? []).filter((s) => s.status !== "Paid" && s.status !== "Cancelled");
        return (
          <RentalFormModal
            title="Record a payment"
            intro="Payments are saved as Under Verification until someone with the verify permission confirms them."
            fields={[
              { key: "type", label: "Payment type", type: "select", options: a.status === "Pending Signature" ? ["Deposit"] : ["Rent", "Maintenance", "Deposit", "Other"], required: true },
              {
                key: "scheduleId",
                label: "Schedule item (for rent / maintenance)",
                type: "select",
                options: open.map((s) => ({ value: s.id, label: `#${s.sequence} ${s.charge_type} · due ${formatDay(s.due_date)} · outstanding ${formatRent(s.outstanding ?? s.total_due)}` })),
              },
              { key: "amount", label: "Amount (INR)", type: "number", required: true },
              { key: "method", label: "Method", type: "select", options: [...RENTAL_PAYMENT_METHODS], required: true },
              { key: "reference", label: "Transaction reference" },
              { key: "proof", label: "Proof document URL" },
              { key: "date", label: "Payment date", type: "date", required: true },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            initial={{ type: a.status === "Pending Signature" ? "Deposit" : "Rent", method: "Bank Transfer", date: todayInput() }}
            validate={(v) => {
              const out: Record<string, string> = {};
              if ((v.type === "Rent" || v.type === "Maintenance") && !v.scheduleId) out.scheduleId = "Choose the schedule item this payment is for.";
              if (v.type !== "Rent" && v.type !== "Maintenance" && v.scheduleId) out.scheduleId = "Only rent and maintenance payments belong to a schedule item.";
              if (num(v.amount) <= 0) out.amount = "Enter an amount greater than zero.";
              if (String(v.date) > todayInput()) out.date = "The payment date cannot be in the future.";
              return out;
            }}
            submitLabel="Record payment"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.createRentalPayment(a.id, {
                payment_type: v.type as "Rent",
                schedule_id: v.scheduleId ? String(v.scheduleId) : null,
                amount: num(v.amount),
                payment_method: v.method as (typeof RENTAL_PAYMENT_METHODS)[number],
                transaction_reference: String(v.reference).trim() || null,
                proof_document_url: String(v.proof).trim() || null,
                payment_date: String(v.date),
                notes: String(v.notes).trim() || null,
              });
              done("Payment recorded and awaiting verification.");
            }}
          />
        );
      }
      case "payment-decision":
        return (
          <RentalFormModal
            title={modal.decision === "Verified" ? "Verify payment" : "Reject payment"}
            intro={`${formatRent(modal.payment.amount)} · ${modal.payment.payment_type} · ${modal.payment.payment_method}${modal.payment.transaction_reference ? ` · ref ${modal.payment.transaction_reference}` : ""}. ${
              modal.decision === "Verified" ? "Verifying issues a receipt and notifies the customer." : "The customer is told the payment was rejected."
            }`}
            fields={[{ key: "notes", label: modal.decision === "Rejected" ? "Reason" : "Notes", type: "textarea", required: modal.decision === "Rejected" }]}
            submitLabel={modal.decision === "Verified" ? "Verify" : "Reject"}
            onClose={close}
            onSubmit={async (v) => {
              await rentals.decideRentalPayment(modal.payment.id, modal.decision, String(v.notes).trim() || null);
              done(modal.decision === "Verified" ? "Payment verified." : "Payment rejected.");
            }}
          />
        );
      case "deposit":
        return (
          <RentalFormModal
            title="Add a deposit ledger entry"
            intro="Deposits received are posted automatically when a deposit payment is verified. Use this for adjustments and deductions."
            fields={[
              { key: "kind", label: "Entry", type: "select", required: true, options: [{ value: "Credit:Deposit Adjustment", label: "Credit — deposit adjustment" }, { value: "Debit:Damage Deduction", label: "Debit — damage deduction" }, { value: "Debit:Utility Deduction", label: "Debit — utility deduction" }, { value: "Debit:Other Deduction", label: "Debit — other deduction" }] },
              { key: "amount", label: "Amount (INR)", type: "number", required: true },
              { key: "description", label: "Description", type: "textarea", required: true },
              { key: "reference", label: "Reference" },
            ]}
            validate={(v) => (num(v.amount) <= 0 ? { amount: "Enter an amount greater than zero." } : {})}
            submitLabel="Add entry"
            onClose={close}
            onSubmit={async (v) => {
              const [direction, type] = String(v.kind).split(":") as ["Credit" | "Debit", "Deposit Adjustment"];
              await rentals.createDepositTransaction(a.id, { direction, transaction_type: type, amount: num(v.amount), description: String(v.description).trim(), reference: String(v.reference).trim() || null });
              done("Ledger entry added.");
            }}
          />
        );
      case "exit":
        return (
          <RentalFormModal
            title="Record a tenant exit request"
            intro="Use this when the tenant gives notice directly to staff. Customers can also request an exit from their portal."
            fields={[
              { key: "vacate", label: "Requested vacate date", type: "date", required: true },
              { key: "notice", label: "Notice served on", type: "date", hint: "Defaults to today." },
              { key: "reason", label: "Reason", type: "textarea", required: true },
            ]}
            validate={(v) => ({ ...(String(v.vacate) < todayInput() ? { vacate: "The vacate date cannot be in the past." } : {}), ...(String(v.notice) > todayInput() ? { notice: "The notice date cannot be in the future." } : {}) })}
            submitLabel="Record exit request"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.createRentalExitRequest(a.id, { requested_vacate_date: String(v.vacate), notice_served_date: v.notice ? String(v.notice) : null, reason: String(v.reason).trim() });
              done("Exit request recorded.");
            }}
          />
        );
      case "exit-decision":
        return (
          <RentalFormModal
            title="Decide the exit request"
            intro={`Vacate on ${formatDay(modal.exit.requested_vacate_date)}; notice served ${formatDay(modal.exit.notice_served_date)}. Inside the lock-in period, or with too little notice, an approval needs an explicit exception.`}
            fields={[
              { key: "decision", label: "Decision", type: "select", options: ["Approved", "Rejected"], required: true },
              { key: "early", label: "Approve as an early-exit exception (inside lock-in)", type: "checkbox" },
              { key: "earlyCharge", label: "Early-exit charge (INR)", type: "number" },
              { key: "waived", label: "Waive the notice-period shortfall", type: "checkbox" },
              { key: "noticeCharge", label: "Notice shortfall charge (INR)", type: "number" },
              { key: "notes", label: "Decision notes", type: "textarea" },
            ]}
            initial={{ decision: "Approved" }}
            submitLabel="Save decision"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.decideRentalExitRequest(modal.exit.id, {
                decision: v.decision as "Approved",
                early_exit_approved: v.early === true,
                early_exit_charge: num(v.earlyCharge),
                notice_period_waived: v.waived === true,
                notice_shortfall_charge: num(v.noticeCharge),
                decision_notes: String(v.notes).trim() || null,
              });
              done(`Exit request ${String(v.decision).toLowerCase()}.`);
            }}
          />
        );
      case "inspection": {
        const exit = modal.exit;
        return (
          <RentalFormModal
            title={exit ? "Record the move-out inspection" : "Record an inspection"}
            intro={exit ? "A move-out inspection moves the exit request on to settlement." : undefined}
            fields={[
              { key: "type", label: "Type", type: "select", options: exit ? ["Move Out"] : ["Move In", "Periodic"], required: true },
              { key: "condition", label: "Condition", type: "select", options: ["Excellent", "Good", "Fair", "Damaged"], required: true },
              { key: "damage", label: "Damage details", type: "textarea" },
              { key: "amount", label: "Damage charge (INR)", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            initial={{ type: exit ? "Move Out" : "Move In", condition: "Good", amount: "0" }}
            validate={(v) => (String(v.condition) === "Damaged" && !String(v.damage).trim() ? { damage: "Describe the damage." } : {})}
            submitLabel="Save inspection"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.createRentalInspection(a.id, {
                exit_request_id: exit?.id ?? null,
                inspection_type: v.type as "Move In",
                condition: v.condition as "Good",
                damage_details: String(v.damage).trim() || null,
                damage_amount: num(v.amount),
                notes: String(v.notes).trim() || null,
              });
              done("Inspection saved.");
            }}
          />
        );
      }
      case "settlement":
        return (
          <RentalFormModal
            title="Calculate the settlement"
            intro="The server works out arrears, damages and exit charges against the deposit. You can add utility and other charges."
            fields={[
              { key: "utility", label: "Utility charges (INR)", type: "number" },
              { key: "notice", label: "Extra notice-shortfall charge (INR)", type: "number" },
              { key: "other", label: "Other charges (INR)", type: "number" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            initial={{ utility: "0", notice: "0", other: "0" }}
            submitLabel="Calculate"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.calculateRentalSettlement(a.id, { exit_request_id: modal.exit.id, utility_charges: num(v.utility), notice_shortfall_charge: num(v.notice), other_charges: num(v.other), notes: String(v.notes).trim() || null });
              done("Settlement calculated. Review it, then approve.");
            }}
          />
        );
      case "refund":
        return (
          <RentalFormModal
            title="Record a deposit refund"
            intro={`Approved refund: ${formatRent(modal.settlement.refund_amount)}.`}
            fields={[
              { key: "amount", label: "Amount refunded (INR)", type: "number", required: true },
              { key: "reference", label: "Payment reference", required: true },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            validate={(v) => (num(v.amount) <= 0 ? { amount: "Enter an amount greater than zero." } : {})}
            submitLabel="Record refund"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.recordRentalRefund(modal.settlement.id, { amount: num(v.amount), reference: String(v.reference).trim(), notes: String(v.notes).trim() || null });
              done("Refund recorded.");
            }}
          />
        );
      case "collect":
        return (
          <RentalFormModal
            title="Collect the amount due"
            intro={`The tenant owes ${formatRent(modal.settlement.amount_due_from_tenant)}. The payment is saved for verification.`}
            fields={[
              { key: "amount", label: "Amount collected (INR)", type: "number", required: true },
              { key: "method", label: "Method", type: "select", options: [...RENTAL_PAYMENT_METHODS], required: true },
              { key: "reference", label: "Transaction reference" },
              { key: "notes", label: "Notes", type: "textarea" },
            ]}
            initial={{ method: "Bank Transfer" }}
            validate={(v) => (num(v.amount) <= 0 ? { amount: "Enter an amount greater than zero." } : {})}
            submitLabel="Record collection"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.collectRentalSettlement(modal.settlement.id, { amount: num(v.amount), payment_method: v.method as "Cash", transaction_reference: String(v.reference).trim() || null, notes: String(v.notes).trim() || null });
              done("Collection recorded and awaiting verification.");
            }}
          />
        );
      case "renewal":
        return (
          <RentalFormModal
            title="Request a renewal"
            intro={`Current end date: ${formatDay(a.agreement_end)}; current rent ${formatRent(a.rent_amount, a.rent_frequency)}.`}
            fields={[
              { key: "end", label: "New end date", type: "date", required: true },
              { key: "rent", label: "New rent (INR)", type: "number", required: true },
              { key: "reason", label: "Reason", type: "textarea" },
            ]}
            initial={{ rent: String(Number(a.rent_amount)) }}
            validate={(v) => ({ ...(a.agreement_end && String(v.end) <= a.agreement_end ? { end: "The new end date must be after the current end date." } : {}), ...(num(v.rent) <= 0 ? { rent: "Enter a rent greater than zero." } : {}) })}
            submitLabel="Request renewal"
            onClose={close}
            onSubmit={async (v) => {
              await rentals.requestRentalRenewal(a.id, { new_end_date: String(v.end), new_rent_amount: num(v.rent), reason: String(v.reason).trim() || null });
              done("Renewal requested.");
            }}
          />
        );
      case "renewal-decision":
        return (
          <RentalFormModal
            title={modal.decision === "Approved" ? "Approve renewal" : "Reject renewal"}
            intro={`Until ${formatDay(modal.renewal.new_end_date)} at ${formatRent(modal.renewal.new_rent_amount)}. ${modal.decision === "Approved" ? "Approving extends the agreement and generates the new rent schedule." : ""}`}
            fields={[{ key: "notes", label: "Notes", type: "textarea" }]}
            submitLabel={modal.decision === "Approved" ? "Approve" : "Reject"}
            onClose={close}
            onSubmit={async (v) => {
              await rentals.decideRentalRenewal(modal.renewal.id, modal.decision, String(v.notes).trim() || null);
              done(`Renewal ${modal.decision.toLowerCase()}.`);
            }}
          />
        );
      case "receipt":
        return (
          <RentalFormModal
            title={`Receipt ${modal.receipt.receipt_number || "Payment"}`}
            intro={`${formatRent(modal.receipt.amount)} · ${modal.receipt.payment_type} · ${modal.receipt.payment_method}${modal.receipt.transaction_reference ? ` · ref ${modal.receipt.transaction_reference}` : ""}. Paid ${formatDay(modal.receipt.payment_date)}${modal.receipt.verified_at ? `, verified ${formatBookingDateTime(modal.receipt.verified_at)}` : ""}.`}
            fields={[]}
            submitLabel="Download Receipt PDF"
            onClose={close}
            onSubmit={async () => {
              try {
                await downloadRentalReceiptPdf({
                  companyName: "SCuilONE Real Estate",
                  portalName: "Rentals & Leases Management",
                  receiptNumber: modal.receipt.receipt_number || modal.receipt.transaction_reference || `REC-${modal.receipt.payment_id.slice(0, 8).toUpperCase()}`,
                  propertyName: propertyName || (agreement?.agreement_type ? `${agreement.agreement_type} Property` : "Rental Property"),
                  tenantName: modal.receipt.customer_name || "Tenant",
                  paymentType: modal.receipt.payment_type,
                  amount: modal.receipt.amount,
                  currency: modal.receipt.currency,
                  paymentMethod: modal.receipt.payment_method,
                  paymentDate: modal.receipt.payment_date,
                  paymentStatus: "Verified",
                  transactionReference: modal.receipt.transaction_reference,
                  paymentId: modal.receipt.payment_id,
                  agreementId: modal.receipt.agreement_id || agreement?.id,
                  notes: modal.receipt.notes,
                  verifiedAt: modal.receipt.verified_at,
                });
                notify("Receipt downloaded successfully.", "success");
              } catch (err) {
                notify(getApiErrorMessage(err, "Failed to download receipt PDF."), "error");
              }
              close();
            }}
          />
        );
    }
  };

  const act = (label: string, onClick: () => void, primary = false, id?: string) => (
    <button key={label} className={primary ? "btn-primary" : "btn-secondary"} onClick={onClick} disabled={id ? busyId === id : false}>
      {label}
    </button>
  );
  const settlementFor = (exit: RentalExitRequest) => (data.settlements ?? []).find((s) => s.exit_request_id === exit.id);
  const table = (head: string[], rows: ReactNode[][], empty: string) =>
    rows.length === 0 ? (
      <p className="text-muted" style={{ margin: 0 }}>{empty}</p>
    ) : (
      <div className="ins-table-wrap">
        <table className="leads-table">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((cells, i) => (
              <tr key={i}>
                {cells.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="ins-page">
      {toast && (
        <div className={`ins-alert ${toast.type === "error" ? "error" : ""}`} role="status" style={{ position: "fixed", right: 24, bottom: 24, zIndex: 2000 }}>
          <span>{toast.message}</span>
        </div>
      )}

      <Link to={base} className="btn-secondary ins-btn-sm" style={{ textDecoration: "none", width: "fit-content" }}>
        ← Back to rentals
      </Link>

      <div className="page-header" style={{ marginTop: 12 }}>
        <div>
          <h1>
            {a.customer_name} <RentalStatusBadge status={a.status} />
          </h1>
          <p className="text-muted">
            {a.agreement_type} agreement · {propertyName ?? "Property"} · #{a.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn-secondary" onClick={() => setIsViewerOpen(true)}>
            View Document
          </button>
          <button
            className="btn-secondary"
            onClick={() => void handleDownloadAgreement()}
            disabled={isDownloadingAgreement}
          >
            {isDownloadingAgreement ? "Downloading…" : "Download PDF"}
          </button>
          <button className="btn-secondary" onClick={refresh}>
            Refresh
          </button>
        </div>
      </div>

      {perms.update && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          {can.sendForSignature && act("Send for signature", () => setModal({ kind: "send" }), true)}
          {can.recordWalkIn && act("Record walk-in signature", () => setModal({ kind: "walkin" }))}
          {can.activate && act("Activate agreement", () => setModal({ kind: "activate" }), true)}
          {can.generateSchedule && act("Generate schedule", () => setModal({ kind: "schedule" }))}
          {can.renewal && act("Request renewal", () => setModal({ kind: "renewal" }))}
          {can.cancel && act("Cancel agreement", () => setModal({ kind: "cancel" }))}
        </div>
      )}
      {a.status === "Pending Signature" && !a.customer_signed_at && (
        <div className="bj-note bj-warn" style={{ marginBottom: 12 }}>
          Waiting for the customer to sign in their portal, or record a witnessed walk-in signature. Activation needs the signature and the full security deposit verified.
        </div>
      )}

      <div className="cp-tab-bar" role="tablist" aria-label="Agreement sections" style={{ display: "flex", flexWrap: "wrap", gap: 4, borderBottom: "1px solid rgba(100,116,139,0.3)", marginBottom: 14 }}>
        {TABS.filter((t) => t.key !== "payments" || perms.payView).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className="btn-secondary ins-btn-sm"
            style={{ border: 0, borderBottom: tab === t.key ? "2px solid #6366f1" : "2px solid transparent", borderRadius: 0, background: "transparent", fontWeight: tab === t.key ? 700 : 500 }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabError && (
        <div className="ins-alert error" role="alert" style={{ marginBottom: 12 }}>
          <span>{tabError}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={refresh}>
            Retry
          </button>
        </div>
      )}

      <section className="ins-card" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === "overview" && (
          <BookingFacts
            items={[
              { label: "Customer", value: a.customer_name },
              { label: "Email", value: a.customer_email ?? "—" },
              { label: "Phone", value: a.customer_phone ?? "—" },
              { label: "Property", value: propertyName ?? "—" },
              { label: "Type", value: a.agreement_type },
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
              { label: "Customer signed", value: a.customer_signed_at ? `${formatBookingDateTime(a.customer_signed_at)} (${a.customer_signature_name ?? "—"})` : "Not yet" },
              { label: "Signature method", value: a.customer_signature_method ?? "—" },
              { label: "Owner / staff signed", value: a.signed_at ? formatBookingDateTime(a.signed_at) : "Not yet" },
              { label: "Activated", value: a.activated_at ? formatBookingDateTime(a.activated_at) : "—" },
              {
                label: "Agreement document",
                value: (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-color, #2563eb)",
                        textDecoration: "underline",
                        cursor: "pointer",
                        padding: 0,
                        font: "inherit",
                        fontWeight: 600,
                      }}
                      onClick={() => setIsViewerOpen(true)}
                      title="View official agreement document summary"
                    >
                      View Document
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-color, #2563eb)",
                        textDecoration: "underline",
                        cursor: isDownloadingAgreement ? "not-allowed" : "pointer",
                        padding: 0,
                        font: "inherit",
                        fontWeight: 600,
                      }}
                      disabled={isDownloadingAgreement}
                      onClick={() => void handleDownloadAgreement()}
                      title="Download agreement document"
                    >
                      {isDownloadingAgreement ? "Downloading…" : "Download PDF"}
                    </button>
                    {a.agreement_document_url && (
                      <>
                        <span>·</span>
                        <a href={a.agreement_document_url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                          Original File
                        </a>
                      </>
                    )}
                    {a.status === "Draft" && perms.update && (
                      <>
                        <span>·</span>
                        <button
                          type="button"
                          className="btn-secondary ins-btn-sm"
                          style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                          onClick={() => setModal({ kind: "upload-pdf" })}
                        >
                          {a.agreement_document_url ? "Replace PDF" : "Upload PDF"}
                        </button>
                      </>
                    )}
                  </span>
                ),
              },
              { label: "Linked accepted offer", value: a.accepted_offer_id ? `#${a.accepted_offer_id.slice(0, 8).toUpperCase()}` : "None" },
            ]}
          />
        )}

        {tab === "schedule" &&
          (data.schedule === undefined ? (
            <div className="ins-skeleton" style={{ minHeight: 80 }} />
          ) : (
            table(
              ["#", "Charge", "Period", "Due", "Amount", "Late fee", "Paid", "Outstanding", "Status"],
              data.schedule.map((s) => [s.sequence, s.charge_type, `${formatDay(s.period_start)} – ${formatDay(s.period_end)}`, formatDay(s.due_date), formatRent(s.amount), Number(s.late_fee_amount) > 0 ? formatRent(s.late_fee_amount) : "—", s.paid !== undefined ? formatRent(s.paid) : "—", s.outstanding !== undefined ? formatRent(s.outstanding) : "—", <RentalStatusBadge key={s.id} status={s.status} />]),
              a.status === "Active" || a.status === "Termination Requested" ? "No schedule items yet. Use Generate schedule." : "The rent schedule is created when the agreement is activated."
            )
          ))}

        {tab === "payments" && (
          <>
            {perms.payCreate && can.recordPayment && <div style={{ marginBottom: 12 }}>{act("Record payment", () => setModal({ kind: "payment" }), true)}</div>}
            {data.payments === undefined ? (
              <div className="ins-skeleton" style={{ minHeight: 80 }} />
            ) : (
              table(
                ["Date", "Type", "Method", "Reference", "Amount", "Status", "Receipt", ""],
                data.payments.map((p) => [
                  formatDay(p.payment_date),
                  p.payment_type,
                  p.payment_method,
                  p.transaction_reference ?? "—",
                  formatRent(p.amount),
                  <RentalStatusBadge key={p.id} status={p.status} />,
                  p.receipt_number ?? "—",
                  <span key={`a-${p.id}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {perms.payVerify && (p.status === "Pending" || p.status === "Under Verification") && (
                      <>
                        <button className="btn-primary ins-btn-sm" onClick={() => setModal({ kind: "payment-decision", payment: p, decision: "Verified" })}>Verify</button>
                        <button className="btn-secondary ins-btn-sm" onClick={() => setModal({ kind: "payment-decision", payment: p, decision: "Rejected" })}>Reject</button>
                      </>
                    )}
                    {p.status === "Verified" && (
                      <>
                        <button
                          className="btn-secondary ins-btn-sm"
                          disabled={busyId === p.id}
                          onClick={() => void run(p.id, async () => setModal({ kind: "receipt", receipt: await rentals.getRentalPaymentReceipt(p.id) }), "Receipt loaded.")}
                          title="View receipt"
                        >
                          Receipt
                        </button>
                        <button
                          className="btn-secondary ins-btn-sm"
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 8px" }}
                          disabled={busyId === p.id}
                          onClick={() => void run(p.id, async () => {
                            const r = await rentals.getRentalPaymentReceipt(p.id);
                            await downloadRentalReceiptPdf({
                              companyName: "SCuilONE Real Estate",
                              portalName: "Rentals & Leases Management",
                              receiptNumber: r.receipt_number || r.transaction_reference || `REC-${r.payment_id.slice(0, 8).toUpperCase()}`,
                              propertyName: propertyName || (agreement?.agreement_type ? `${agreement.agreement_type} Property` : "Rental Property"),
                              tenantName: r.customer_name || "Tenant",
                              paymentType: r.payment_type,
                              amount: r.amount,
                              currency: r.currency,
                              paymentMethod: r.payment_method,
                              paymentDate: r.payment_date,
                              paymentStatus: "Verified",
                              transactionReference: r.transaction_reference,
                              paymentId: r.payment_id,
                              agreementId: r.agreement_id || agreement?.id,
                              notes: r.notes,
                              verifiedAt: r.verified_at,
                            });
                          }, "Receipt downloaded.")}
                          title="Download PDF receipt"
                          aria-label="Download receipt"
                        >
                          <DownloadIcon size={13} />
                        </button>
                      </>
                    )}
                    {p.proof_document_url && <a href={p.proof_document_url} target="_blank" rel="noreferrer">Proof</a>}
                  </span>,
                ]),
                "No payments have been recorded for this agreement yet."
              )
            )}
          </>
        )}

        {tab === "deposit" &&
          (data.deposit === undefined ? (
            <div className="ins-skeleton" style={{ minHeight: 80 }} />
          ) : (
            <>
              <BookingFacts items={[{ label: "Agreed deposit", value: formatRent(data.deposit.agreed_deposit) }, { label: "Current balance held", value: formatRent(data.deposit.current_balance) }]} />
              {perms.update && <div style={{ margin: "12px 0" }}>{act("Add ledger entry", () => setModal({ kind: "deposit" }))}</div>}
              {table(
                ["Date", "Entry", "Type", "Amount", "Description", "Reference", "Status"],
                data.deposit.transactions.map((t) => [formatBookingDateTime(t.created_at), t.direction, t.transaction_type, formatRent(t.amount), t.description, t.reference ?? "—", <RentalStatusBadge key={t.id} status={t.status === "Posted" ? "Verified" : t.status} />]),
                "No deposit entries yet. A verified deposit payment posts the first credit."
              )}
            </>
          ))}

        {tab === "exit" && (
          <>
            {perms.update && can.exitRequest && <div style={{ marginBottom: 12 }}>{act("Record exit request", () => setModal({ kind: "exit" }))}</div>}
            {data.exits === undefined ? (
              <div className="ins-skeleton" style={{ minHeight: 80 }} />
            ) : data.exits.length === 0 ? (
              <p className="text-muted" style={{ margin: 0 }}>No exit has been requested for this agreement.</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {data.exits.map((x) => {
                  const settlement = settlementFor(x);
                  return (
                    <div key={x.id} className="bj-note" style={{ display: "grid", gap: 8 }}>
                      <div>
                        <strong>Vacate {formatDay(x.requested_vacate_date)}</strong> <RentalStatusBadge status={x.status} />
                        <div className="text-muted" style={{ fontSize: "0.85rem" }}>Notice served {formatDay(x.notice_served_date)} · {x.reason}</div>
                        {x.decision_notes && <div style={{ fontSize: "0.85rem" }}>Decision notes: {x.decision_notes}</div>}
                        {(Number(x.early_exit_charge) > 0 || Number(x.notice_shortfall_charge) > 0) && (
                          <div style={{ fontSize: "0.85rem" }}>Charges: early exit {formatRent(x.early_exit_charge)} · notice shortfall {formatRent(x.notice_shortfall_charge)}</div>
                        )}
                      </div>
                      {settlement && (
                        <BookingFacts
                          items={[
                            { label: "Settlement", value: <RentalStatusBadge status={settlement.status} /> },
                            { label: "Deposit held", value: formatRent(settlement.deposit_balance) },
                            { label: "Rent arrears", value: formatRent(settlement.rent_arrears) },
                            { label: "Damages", value: formatRent(settlement.damage_charges) },
                            { label: "Total deductions", value: formatRent(settlement.deductions_total) },
                            { label: "Refund to tenant", value: formatRent(settlement.refund_amount) },
                            { label: "Due from tenant", value: formatRent(settlement.amount_due_from_tenant) },
                          ]}
                        />
                      )}
                      {perms.update && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {(x.status === "Requested" || x.status === "Under Review") && act("Decide request", () => setModal({ kind: "exit-decision", exit: x }), true)}
                          {x.status === "Inspection Pending" && act("Record move-out inspection", () => setModal({ kind: "inspection", exit: x }), true)}
                          {x.status === "Settlement Pending" && (!settlement || settlement.status === "Draft" || settlement.status === "Under Review") && act(settlement ? "Recalculate settlement" : "Calculate settlement", () => setModal({ kind: "settlement", exit: x }), !settlement)}
                          {settlement?.status === "Under Review" && act("Approve settlement", () => void run(settlement.id, () => rentals.approveRentalSettlement(settlement.id), "Settlement approved."), true, settlement.id)}
                          {settlement && (settlement.status === "Approved" || settlement.status === "Partially Refunded") && act("Record refund", () => setModal({ kind: "refund", settlement }))}
                          {settlement && perms.payCreate && (settlement.status === "Amount Due" || settlement.status === "Partially Collected") && act("Collect amount due", () => setModal({ kind: "collect", settlement }))}
                          {x.status === "Settlement Pending" && settlement && ["Approved", "Partially Refunded", "Refunded", "Amount Due", "Partially Collected", "Collected"].includes(settlement.status) &&
                            act("Complete handover", () => void run(x.id, () => rentals.completeRentalHandover(x.id), "Move-out complete. The property is available again."), true, x.id)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "inspections" && (
          <>
            {perms.update && <div style={{ marginBottom: 12 }}>{act("Record inspection", () => setModal({ kind: "inspection" }))}</div>}
            {data.inspections === undefined ? (
              <div className="ins-skeleton" style={{ minHeight: 80 }} />
            ) : (
              table(
                ["Date", "Type", "Condition", "Damage", "Charge", "Tenant acknowledged"],
                data.inspections.map((i) => [formatBookingDateTime(i.inspected_at), i.inspection_type, i.condition, i.damage_details ?? "—", Number(i.damage_amount) > 0 ? formatRent(i.damage_amount) : "—", i.tenant_acknowledged ? `Yes — ${formatBookingDateTime(i.tenant_acknowledged_at)}` : "Not yet"]),
                "No inspections recorded."
              )
            )}
          </>
        )}

        {tab === "renewals" &&
          (data.renewals === undefined ? (
            <div className="ins-skeleton" style={{ minHeight: 80 }} />
          ) : (
            table(
              ["#", "Requested", "New end", "New rent", "Reason", "Status", ""],
              data.renewals.map((r) => [
                r.revision_number,
                formatBookingDateTime(r.created_at),
                formatDay(r.new_end_date),
                formatRent(r.new_rent_amount),
                r.reason ?? "—",
                <RentalStatusBadge key={r.id} status={r.status} />,
                perms.update && r.status === "Pending" ? (
                  <span key={`d-${r.id}`} style={{ display: "flex", gap: 6 }}>
                    <button className="btn-primary ins-btn-sm" onClick={() => setModal({ kind: "renewal-decision", renewal: r, decision: "Approved" })}>Approve</button>
                    <button className="btn-secondary ins-btn-sm" onClick={() => setModal({ kind: "renewal-decision", renewal: r, decision: "Rejected" })}>Reject</button>
                  </span>
                ) : (
                  ""
                ),
              ]),
              can.renewal ? "No renewals requested. Use Request renewal above." : "No renewals requested."
            )
          ))}
      </section>

      {renderModal()}

      {a && (
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
          isDownloading={isDownloadingAgreement}
          updatedAt={a.updated_at ? formatDay(a.updated_at) : undefined}
        />
      )}
    </div>
  );
}
