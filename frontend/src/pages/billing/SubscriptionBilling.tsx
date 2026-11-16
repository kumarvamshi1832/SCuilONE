import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  cancelSubscription,
  contactPlatformSupport,
  downloadSubscriptionInvoice,
  getBillingProfile,
  getPaymentHistory,
  getSubscriptionEvents,
  getSubscriptionInvoices,
  getSubscriptionPlans,
  getSubscriptionStatus,
  selectSubscriptionPlan,
  submitManualPayment,
  uploadPaymentProof,
  updateBillingProfile,
} from "../../services/subscriptionService";
import type {
  BillingCycle,
  BillingInvoice,
  BillingPayment,
  BillingProfile,
  InvoiceDownloadResponse,
  SubscriptionEvent,
  SubscriptionPlan,
  TenantSubscription,
} from "../../types/subscription";
import "./SubscriptionBilling.css";

type ActiveTab = "overview" | "plans" | "invoices" | "profile" | "support";

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusBadgeClass(statusValue?: string | null): string {
  const s = (statusValue || "").toLowerCase();
  if (s === "active" || s === "paid" || s === "succeeded") return "green";
  if (s === "trial" || s === "issued" || s === "under review") return "blue";
  if (s === "submitted" || s === "past due") return "amber";
  if (s === "expired" || s === "suspended" || s === "cancelled" || s === "rejected" || s === "overdue" || s === "failed") {
    return "red";
  }
  return "slate";
}

function extractApiError(err: any, fallback: string): string {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d?.msg || JSON.stringify(d)).join("; ");
  }
  return err?.message || fallback;
}

export default function SubscriptionBilling() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [billingProfile, setBillingProfile] = useState<BillingProfile | null>(null);
  const [events, setEvents] = useState<SubscriptionEvent[]>([]);

  const [billingCycle, setBillingCycle] = useState<BillingCycle>("Monthly");
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("");

  // Invoice download/preview modal
  const [invoicePreview, setInvoicePreview] = useState<InvoiceDownloadResponse | null>(null);
  const [loadingInvoicePreview, setLoadingInvoicePreview] = useState(false);

  // Manual Payment modal
  const [payModalInvoice, setPayModalInvoice] = useState<BillingInvoice | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    transaction_reference: "",
    amount: "",
    currency: "INR",
    payment_method: "Bank Transfer",
    payment_date: new Date().toISOString().slice(0, 10),
    notes: "",
    proof_reference: "",
  });
  const [paymentProofFile, setPaymentProofFile] = useState<File | null>(null);
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Attach Proof modal for existing payment
  const [proofModalPayment, setProofModalPayment] = useState<BillingPayment | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachRef, setAttachRef] = useState("");
  const [uploadingProof, setUploadingProof] = useState(false);

  // Billing profile form
  const [profileForm, setProfileForm] = useState({
    company_name: "",
    billing_email: "",
    billing_phone: "",
    billing_address: "",
    gst_number: "",
    email_reminders_opt_out: false,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelImmediately, setCancelImmediately] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Support ticket form
  const [supportForm, setSupportForm] = useState({
    subject: "",
    description: "",
    category: "Billing",
    priority: "High",
    requester_name: "",
    requester_email: "",
  });
  const [sendingSupport, setSendingSupport] = useState(false);

  const showMessage = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [subRes, plansRes, invRes, payRes, profRes, evRes] = await Promise.all([
        getSubscriptionStatus(),
        getSubscriptionPlans(true),
        getSubscriptionInvoices(invoiceStatusFilter || undefined),
        getPaymentHistory(),
        getBillingProfile(),
        getSubscriptionEvents(),
      ]);
      setSubscription(subRes);
      setPlans(plansRes.items || []);
      setInvoices(invRes.items || []);
      setPayments(payRes.items || []);
      setBillingProfile(profRes);
      setEvents(evRes.items || []);
      setProfileForm({
        company_name: profRes.company_name || "",
        billing_email: profRes.billing_email || "",
        billing_phone: profRes.billing_phone || "",
        billing_address: profRes.billing_address || "",
        gst_number: profRes.gst_number || "",
        email_reminders_opt_out: Boolean(profRes.email_reminders_opt_out),
      });
    } catch (err) {
      setError(extractApiError(err, "Unable to load subscription and billing details."));
    } finally {
      setLoading(false);
    }
  }, [invoiceStatusFilter]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (plan.plan_key === "free_trial") return;
    setSelectingPlanId(plan.id);
    setToast(null);
    try {
      const res = await selectSubscriptionPlan({
        plan_id: plan.id,
        billing_cycle: billingCycle,
      });
      showMessage(res.message);
      await loadAll();
      setActiveTab("invoices");
      if (res.invoice && (res.invoice.status === "Issued" || res.invoice.status === "Overdue")) {
        openPayModal(res.invoice);
      }
    } catch (err) {
      showMessage(extractApiError(err, "Could not select subscription plan."), "error");
    } finally {
      setSelectingPlanId(null);
    }
  };

  const handleViewInvoice = async (inv: BillingInvoice) => {
    setLoadingInvoicePreview(true);
    setToast(null);
    try {
      const data = await downloadSubscriptionInvoice(inv.id);
      setInvoicePreview(data);
    } catch (err) {
      showMessage(extractApiError(err, "Failed to load invoice document."), "error");
    } finally {
      setLoadingInvoicePreview(false);
    }
  };

  const openPayModal = (inv: BillingInvoice) => {
    setPayModalInvoice(inv);
    setPaymentForm({
      transaction_reference: "",
      amount: inv.balance_due || inv.total_amount,
      currency: inv.currency || "INR",
      payment_method: "Bank Transfer",
      payment_date: new Date().toISOString().slice(0, 10),
      notes: "",
      proof_reference: "",
    });
    setPaymentProofFile(null);
  };

  const handleSubmitManualPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!payModalInvoice) return;
    setSubmittingPayment(true);
    setToast(null);
    try {
      const amt = Number(paymentForm.amount);
      if (!amt || amt <= 0) {
        showMessage("Enter a valid payment amount greater than zero.", "error");
        setSubmittingPayment(false);
        return;
      }
      const res = await submitManualPayment({
        invoice_id: payModalInvoice.id,
        transaction_reference: paymentForm.transaction_reference.trim(),
        amount: amt,
        currency: paymentForm.currency || payModalInvoice.currency,
        payment_method: paymentForm.payment_method,
        payment_date: paymentForm.payment_date || undefined,
        notes: paymentForm.notes.trim() || undefined,
      });
      if ((paymentProofFile || paymentForm.proof_reference.trim()) && res.payment?.payment_id) {
        await uploadPaymentProof(res.payment.payment_id, {
          file: paymentProofFile || undefined,
          proof_reference: paymentForm.proof_reference.trim() || undefined,
        });
      }
      showMessage(res.message);
      setPayModalInvoice(null);
      await loadAll();
    } catch (err) {
      showMessage(extractApiError(err, "Failed to submit payment details."), "error");
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleUploadExistingProof = async (e: FormEvent) => {
    e.preventDefault();
    if (!proofModalPayment) return;
    if (!attachFile && !attachRef.trim()) {
      showMessage("Provide a proof file or a proof reference.", "error");
      return;
    }
    setUploadingProof(true);
    try {
      const res = await uploadPaymentProof(proofModalPayment.payment_id || proofModalPayment.id, {
        file: attachFile || undefined,
        proof_reference: attachRef.trim() || undefined,
      });
      showMessage(res.message);
      setProofModalPayment(null);
      setAttachFile(null);
      setAttachRef("");
      await loadAll();
    } catch (err) {
      showMessage(extractApiError(err, "Failed to upload payment proof."), "error");
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSaveBillingProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setToast(null);
    try {
      const res = await updateBillingProfile({
        company_name: profileForm.company_name.trim() || undefined,
        billing_email: profileForm.billing_email.trim() || undefined,
        billing_phone: profileForm.billing_phone.trim() || undefined,
        billing_address: profileForm.billing_address.trim() || undefined,
        gst_number: profileForm.gst_number.trim() || undefined,
        email_reminders_opt_out: profileForm.email_reminders_opt_out,
      });
      showMessage(res.message);
      await loadAll();
    } catch (err) {
      showMessage(extractApiError(err, "Failed to update billing profile."), "error");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCancelSubscription = async (e: FormEvent) => {
    e.preventDefault();
    setCancelling(true);
    try {
      const res = await cancelSubscription({
        reason: cancelReason.trim() || undefined,
        cancel_immediately: cancelImmediately,
      });
      showMessage(res.message);
      setShowCancelModal(false);
      setCancelReason("");
      await loadAll();
    } catch (err) {
      showMessage(extractApiError(err, "Failed to cancel subscription."), "error");
    } finally {
      setCancelling(false);
    }
  };

  const handleSubmitSupport = async (e: FormEvent) => {
    e.preventDefault();
    if (!supportForm.subject.trim() || !supportForm.description.trim()) {
      showMessage("Subject and description are required.", "error");
      return;
    }
    setSendingSupport(true);
    try {
      const res = await contactPlatformSupport({
        subject: supportForm.subject.trim(),
        description: supportForm.description.trim(),
        category: supportForm.category,
        priority: supportForm.priority,
        requester_name: supportForm.requester_name.trim() || undefined,
        requester_email: supportForm.requester_email.trim() || undefined,
      });
      showMessage(`${res.message} (${res.ticket_number})`);
      setSupportForm({
        subject: "",
        description: "",
        category: "Billing",
        priority: "High",
        requester_name: "",
        requester_email: "",
      });
      await loadAll();
    } catch (err) {
      showMessage(extractApiError(err, "Could not submit support ticket."), "error");
    } finally {
      setSendingSupport(false);
    }
  };

  const resources = subscription?.resources;
  const usage = resources?.usage;

  const bannerVariant =
    !subscription || subscription.status === "None"
      ? ""
      : !subscription.crm_access_allowed
      ? "blocked"
      : subscription.is_in_trial
      ? "trial"
      : "active";

  const renderMeter = (label: string, used: number, limit: number, displayUsed?: string, displayLimit?: string) => {
    const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const fillClass = pct >= 90 ? "danger" : pct >= 75 ? "warn" : "";
    return (
      <div className="sub-meter">
        <div className="sub-meter-top">
          <span>{label}</span>
          <strong>
            {displayUsed ?? used} / {displayLimit ?? (limit > 0 ? limit : "0")}
          </strong>
        </div>
        <div className="sub-meter-track">
          <div className={`sub-meter-fill ${fillClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="sub-page">
      <div className="sub-header">
        <div>
          <h1>Subscription & Platform Billing</h1>
          <p className="sub-subtitle">
            Manage your workspace plan, resource quotas, platform invoices, manual bank/UPI payments, and billing profile.
          </p>
        </div>
        <div className="sub-header-actions">
          <button type="button" className="sub-btn sub-btn-secondary" onClick={() => void loadAll()} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="sub-btn sub-btn-secondary" onClick={() => setActiveTab("support")}>
            Contact Platform Support
          </button>
          <button type="button" className="sub-btn sub-btn-primary" onClick={() => setActiveTab("plans")}>
            Explore Plans
          </button>
        </div>
      </div>

      {toast && (
        <div className={`sub-alert ${toast.type}`} role="status">
          {toast.text}
        </div>
      )}

      {error && (
        <div className="sub-alert error" role="alert">
          {error}
        </div>
      )}

      {subscription && (
        <div className={`sub-banner ${bannerVariant}`}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <strong>{subscription.company_name || "Your Workspace"}</strong>
              <span className={`sub-badge ${getStatusBadgeClass(subscription.status)}`}>
                {subscription.status === "None" ? "No Subscription" : subscription.status}
              </span>
              {subscription.is_complimentary && <span className="sub-badge blue">Complimentary</span>}
              {subscription.is_in_trial && (
                <span className="sub-badge blue">
                  {subscription.trial_days_remaining ?? 0} day(s) left in Free Trial
                </span>
              )}
            </div>
            <p className="sub-subtitle" style={{ marginTop: "6px" }}>
              {subscription.access_message ||
                (subscription.current_plan
                  ? `Active plan: ${subscription.current_plan.name} (${subscription.billing_cycle || "Monthly"})`
                  : subscription.status === "None"
                  ? "No active subscription plan. Select a plan below to activate your workspace."
                  : "No active subscription plan assigned yet.")}
            </p>
          </div>
          {subscription.selected_plan && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Selected Next Plan</div>
              <strong>
                {subscription.selected_plan.name} ({subscription.selected_billing_cycle || "Monthly"})
              </strong>
            </div>
          )}
        </div>
      )}

      <div className="sub-tabs" role="tablist">
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview & Quotas
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "plans" ? "active" : ""}`}
          onClick={() => setActiveTab("plans")}
        >
          Plans & Upgrade ({plans.filter((p) => p.plan_key !== "free_trial").length})
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "invoices" ? "active" : ""}`}
          onClick={() => setActiveTab("invoices")}
        >
          Invoices ({invoices.length}) & Payments ({payments.length})
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "profile" ? "active" : ""}`}
          onClick={() => setActiveTab("profile")}
        >
          Billing Profile & Cancellation
        </button>
        <button
          type="button"
          className={`sub-tab-btn ${activeTab === "support" ? "active" : ""}`}
          onClick={() => setActiveTab("support")}
        >
          History & Support
        </button>
      </div>

      {loading && !subscription ? (
        <div className="sub-card">Loading subscription details...</div>
      ) : null}

      {/* TAB 1: OVERVIEW */}
      {!loading && activeTab === "overview" && subscription && (
        <>
          <div className="sub-grid-2">
            <div className="sub-card">
              <h2 className="sub-card-title">Current Subscription Summary</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "0.88rem" }}>
                <div>
                  <div className="sub-subtitle">Current Plan</div>
                  <strong>
                    {subscription.current_plan?.name ||
                      (subscription.status === "Trial" ? "Free Trial" : "No Plan Assigned")}
                  </strong>
                </div>
                <div>
                  <div className="sub-subtitle">Billing Cycle</div>
                  <strong>{subscription.billing_cycle || (subscription.status === "None" ? "—" : "Monthly")}</strong>
                </div>
                <div>
                  <div className="sub-subtitle">Trial Period</div>
                  <strong>
                    {subscription.trial_start_date || subscription.trial_end_date
                      ? `${formatDate(subscription.trial_start_date)} – ${formatDate(subscription.trial_end_date)}`
                      : "Not in trial"}
                  </strong>
                </div>
                <div>
                  <div className="sub-subtitle">Renewal / End Date</div>
                  <strong>{formatDate(subscription.renewal_date || subscription.ends_at)}</strong>
                </div>
                <div>
                  <div className="sub-subtitle">CRM Access</div>
                  <span className={`sub-badge ${subscription.crm_access_allowed ? "green" : "red"}`}>
                    {subscription.crm_access_allowed ? "Allowed" : "Restricted"}
                  </span>
                </div>
                <div>
                  <div className="sub-subtitle">Auto Renew</div>
                  <strong>
                    {subscription.status === "None"
                      ? "—"
                      : subscription.auto_renew
                      ? "Enabled"
                      : "Disabled"}
                  </strong>
                </div>
              </div>
              {subscription.suspension_reason && (
                <div className="sub-alert error" style={{ marginTop: "14px", marginBottom: 0 }}>
                  Suspension reason: {subscription.suspension_reason}
                </div>
              )}
            </div>

            <div className="sub-card">
              <h2 className="sub-card-title">Resource Usage & Plan Quotas</h2>
              {resources && usage ? (
                <>
                  {renderMeter("Active Users", usage.active_users, resources.max_users)}
                  {renderMeter(
                    "Storage Used",
                    usage.storage_used_bytes,
                    resources.storage_limit_bytes,
                    formatBytes(usage.storage_used_bytes),
                    `${resources.storage_limit_gb} GB`
                  )}
                  {resources.limits?.leads !== undefined &&
                    renderMeter("Leads", usage.leads, Number(resources.limits.leads))}
                  {resources.limits?.contacts !== undefined &&
                    renderMeter("Contacts", usage.contacts, Number(resources.limits.contacts))}
                  {resources.limits?.deals !== undefined &&
                    renderMeter("Deals", usage.deals, Number(resources.limits.deals))}
                  <div style={{ fontSize: "0.84rem", color: "var(--text-secondary)" }}>
                    Max Branches Allowed: <strong>{resources.max_branches}</strong>
                  </div>
                </>
              ) : (
                <p className="sub-subtitle">Usage metrics unavailable.</p>
              )}
            </div>
          </div>

          <div className="sub-grid-2">
            <div className="sub-card">
              <h2 className="sub-card-title">Enabled CRM Modules</h2>
              {resources?.enabled_modules?.length ? (
                <div className="sub-chip-list">
                  {resources.enabled_modules.map((mod) => (
                    <span key={mod} className="sub-chip">
                      {mod}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="sub-subtitle">No active modules in current subscription state.</p>
              )}
            </div>

            <div className="sub-card">
              <h2 className="sub-card-title">Included Plan Features</h2>
              {resources?.features?.length ? (
                <ul className="sub-feature-list">
                  {resources.features.map((feat) => (
                    <li key={feat}>• {feat}</li>
                  ))}
                </ul>
              ) : (
                <p className="sub-subtitle">No feature metadata listed.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* TAB 2: PLANS */}
      {activeTab === "plans" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div className="sub-cycle-toggle">
              <button
                type="button"
                className={`sub-cycle-btn ${billingCycle === "Monthly" ? "active" : ""}`}
                onClick={() => setBillingCycle("Monthly")}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                className={`sub-cycle-btn ${billingCycle === "Annual" ? "active" : ""}`}
                onClick={() => setBillingCycle("Annual")}
              >
                Annual Billing
              </button>
            </div>
            <p className="sub-subtitle">
              Selecting a paid plan generates an invoice while preserving your active free trial until payment approval.
            </p>
          </div>

          <div className="sub-grid-3">
            {plans.map((plan) => {
              const isTrialPlan = plan.plan_key === "free_trial";
              const isCurrent = subscription?.current_plan?.id === plan.id;
              const isSelected = subscription?.selected_plan?.id === plan.id;
              const displayPrice = billingCycle === "Annual" ? plan.annual_price : plan.monthly_price;
              return (
                <div key={plan.id} className={`sub-card sub-plan-card ${isSelected ? "selected" : ""}`}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                      <h3 style={{ margin: 0, fontSize: "1.1rem" }}>{plan.name}</h3>
                      {isCurrent && <span className="sub-badge green">Current</span>}
                      {!isCurrent && isSelected && <span className="sub-badge blue">Selected</span>}
                    </div>
                    <p className="sub-subtitle" style={{ marginTop: "6px" }}>
                      {plan.description}
                    </p>
                    <div className="sub-plan-price" style={{ marginTop: "14px" }}>
                      {plan.currency} {displayPrice} <span>/ {billingCycle.toLowerCase()}</span>
                    </div>
                    <div style={{ fontSize: "0.82rem", marginTop: "10px", color: "var(--text-secondary)" }}>
                      Up to <strong>{plan.max_users}</strong> users • <strong>{plan.max_branches}</strong> branches •{" "}
                      <strong>{plan.storage_limit_gb} GB</strong> storage
                    </div>
                    <ul className="sub-feature-list" style={{ marginTop: "12px" }}>
                      {(plan.features || []).slice(0, 6).map((f) => (
                        <li key={f}>✓ {f}</li>
                      ))}
                    </ul>
                  </div>

                  {!isTrialPlan ? (
                    <button
                      type="button"
                      className="sub-btn sub-btn-primary"
                      disabled={selectingPlanId === plan.id}
                      onClick={() => void handleSelectPlan(plan)}
                    >
                      {selectingPlanId === plan.id ? "Generating Invoice..." : `Choose ${plan.name}`}
                    </button>
                  ) : (
                    <button type="button" className="sub-btn sub-btn-secondary" disabled>
                      Global {plan.global_free_trial_days}-Day Trial
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: INVOICES & PAYMENTS */}
      {activeTab === "invoices" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="sub-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
              <h2 className="sub-card-title" style={{ margin: 0 }}>
                Platform Invoices
              </h2>
              <select
                className="sub-select"
                style={{ maxWidth: "200px" }}
                value={invoiceStatusFilter}
                onChange={(e) => setInvoiceStatusFilter(e.target.value)}
                aria-label="Filter invoices by status"
              >
                <option value="">All Invoice Statuses</option>
                <option value="Issued">Issued</option>
                <option value="Overdue">Overdue</option>
                <option value="Paid">Paid</option>
                <option value="Void">Void</option>
              </select>
            </div>

            {invoices.length === 0 ? (
              <p className="sub-subtitle">No invoices found. Choose a paid subscription plan to generate an invoice.</p>
            ) : (
              <div className="sub-table-wrap">
                <table className="sub-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Plan / Cycle</th>
                      <th>Total</th>
                      <th>Balance Due</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const canPay = inv.status !== "Paid" && inv.status !== "Void" && Number(inv.balance_due) > 0;
                      return (
                        <tr key={inv.id}>
                          <td>
                            <strong>{inv.invoice_number}</strong>
                            <div className="sub-subtitle" style={{ fontSize: "0.75rem" }}>
                              Issued {formatDate(inv.issue_date)}
                            </div>
                          </td>
                          <td>
                            {inv.plan_name || "Subscription"} ({inv.billing_cycle || "Monthly"})
                          </td>
                          <td>
                            {inv.currency} {inv.total_amount}
                          </td>
                          <td>
                            <strong>
                              {inv.currency} {inv.balance_due}
                            </strong>
                          </td>
                          <td>{formatDate(inv.due_date)}</td>
                          <td>
                            <span className={`sub-badge ${getStatusBadgeClass(inv.status)}`}>{inv.status}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="sub-btn sub-btn-secondary sub-btn-sm"
                                disabled={loadingInvoicePreview}
                                onClick={() => void handleViewInvoice(inv)}
                              >
                                View / Download
                              </button>
                              {canPay && (
                                <button
                                  type="button"
                                  className="sub-btn sub-btn-primary sub-btn-sm"
                                  onClick={() => openPayModal(inv)}
                                >
                                  Submit Payment
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
            )}
          </div>

          <div className="sub-card">
            <h2 className="sub-card-title">Manual Payment Submissions</h2>
            {payments.length === 0 ? (
              <p className="sub-subtitle">No manual payments have been submitted yet.</p>
            ) : (
              <div className="sub-table-wrap">
                <table className="sub-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Invoice</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Proof</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.transaction_reference}</strong>
                          <div className="sub-subtitle" style={{ fontSize: "0.75rem" }}>
                            {formatDate(p.payment_date || p.created_at)}
                          </div>
                        </td>
                        <td>{p.invoice_number || p.invoice_id}</td>
                        <td>{p.payment_method}</td>
                        <td>
                          {p.currency} {p.amount}
                        </td>
                        <td>
                          {p.payment_proof_filename || p.payment_proof_url ? (
                            <span style={{ fontSize: "0.8rem" }}>
                              {p.payment_proof_filename || p.payment_proof_url}
                            </span>
                          ) : (
                            <span className="sub-subtitle">None attached</span>
                          )}
                        </td>
                        <td>
                          <span className={`sub-badge ${getStatusBadgeClass(p.status)}`}>{p.status}</span>
                          {p.rejection_reason && (
                            <div style={{ fontSize: "0.75rem", color: "#ef4444", marginTop: "4px" }}>
                              {p.rejection_reason}
                            </div>
                          )}
                        </td>
                        <td>
                          {p.status !== "Succeeded" && (
                            <button
                              type="button"
                              className="sub-btn sub-btn-secondary sub-btn-sm"
                              onClick={() => {
                                setProofModalPayment(p);
                                setAttachFile(null);
                                setAttachRef("");
                              }}
                            >
                              Upload Proof
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: BILLING PROFILE & CANCELLATION */}
      {activeTab === "profile" && (
        <div className="sub-grid-2">
          <div className="sub-card">
            <h2 className="sub-card-title">Company Billing Profile</h2>
            <form onSubmit={handleSaveBillingProfile} className="sub-form-grid">
              <div className="sub-field">
                <label htmlFor="bp-company">Company Legal Name</label>
                <input
                  id="bp-company"
                  className="sub-input"
                  value={profileForm.company_name}
                  onChange={(e) => setProfileForm((f) => ({ ...f, company_name: e.target.value }))}
                  required
                />
              </div>
              <div className="sub-field">
                <label htmlFor="bp-email">Billing Email</label>
                <input
                  id="bp-email"
                  type="email"
                  className="sub-input"
                  value={profileForm.billing_email}
                  onChange={(e) => setProfileForm((f) => ({ ...f, billing_email: e.target.value }))}
                />
              </div>
              <div className="sub-field">
                <label htmlFor="bp-phone">Billing Phone</label>
                <input
                  id="bp-phone"
                  className="sub-input"
                  value={profileForm.billing_phone}
                  onChange={(e) => setProfileForm((f) => ({ ...f, billing_phone: e.target.value }))}
                />
              </div>
              <div className="sub-field">
                <label htmlFor="bp-gst">GST / Tax ID</label>
                <input
                  id="bp-gst"
                  className="sub-input"
                  value={profileForm.gst_number}
                  onChange={(e) => setProfileForm((f) => ({ ...f, gst_number: e.target.value }))}
                />
              </div>
              <div className="sub-field full">
                <label htmlFor="bp-address">Billing Address</label>
                <textarea
                  id="bp-address"
                  className="sub-textarea"
                  value={profileForm.billing_address}
                  onChange={(e) => setProfileForm((f) => ({ ...f, billing_address: e.target.value }))}
                />
              </div>
              <div className="sub-field full">
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={profileForm.email_reminders_opt_out}
                    onChange={(e) => setProfileForm((f) => ({ ...f, email_reminders_opt_out: e.target.checked }))}
                  />
                  Opt out of automated trial & renewal email reminders
                </label>
              </div>
              <div className="sub-field full">
                <button type="submit" className="sub-btn sub-btn-primary" disabled={savingProfile}>
                  {savingProfile ? "Saving Profile..." : "Save Billing Profile"}
                </button>
              </div>
            </form>
          </div>

          <div className="sub-card">
            <h2 className="sub-card-title">Subscription Lifecycle Controls</h2>
            <p className="sub-subtitle">
              Current status: <strong>{billingProfile ? subscription?.status : "—"}</strong>. You can cancel
              auto-renewal at period end or cancel immediately.
            </p>
            <div style={{ marginTop: "16px" }}>
              <button
                type="button"
                className="sub-btn sub-btn-danger"
                onClick={() => setShowCancelModal(true)}
                disabled={subscription?.status === "Cancelled"}
              >
                {subscription?.status === "Cancelled" ? "Already Cancelled" : "Cancel Subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: HISTORY & SUPPORT */}
      {activeTab === "support" && (
        <div className="sub-grid-2">
          <div className="sub-card">
            <h2 className="sub-card-title">Contact SCuilONE Platform Support</h2>
            <p className="sub-subtitle" style={{ marginBottom: "14px" }}>
              Need help with plan activation, bank verification, or account access? Reach platform teams directly even if
              your trial has expired.
            </p>
            <form onSubmit={handleSubmitSupport} className="sub-form-grid">
              <div className="sub-field full">
                <label htmlFor="sup-subject">Subject</label>
                <input
                  id="sup-subject"
                  className="sub-input"
                  value={supportForm.subject}
                  onChange={(e) => setSupportForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. Manual payment verification for INV-..."
                  required
                />
              </div>
              <div className="sub-field">
                <label htmlFor="sup-cat">Category</label>
                <select
                  id="sup-cat"
                  className="sub-select"
                  value={supportForm.category}
                  onChange={(e) => setSupportForm((f) => ({ ...f, category: e.target.value }))}
                >
                  <option value="Billing">Billing</option>
                  <option value="Support">Support</option>
                  <option value="Technical">Technical</option>
                </select>
              </div>
              <div className="sub-field">
                <label htmlFor="sup-prio">Priority</label>
                <select
                  id="sup-prio"
                  className="sub-select"
                  value={supportForm.priority}
                  onChange={(e) => setSupportForm((f) => ({ ...f, priority: e.target.value }))}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <div className="sub-field">
                <label htmlFor="sup-name">Contact Name (optional)</label>
                <input
                  id="sup-name"
                  className="sub-input"
                  value={supportForm.requester_name}
                  onChange={(e) => setSupportForm((f) => ({ ...f, requester_name: e.target.value }))}
                />
              </div>
              <div className="sub-field">
                <label htmlFor="sup-email">Contact Email (optional)</label>
                <input
                  id="sup-email"
                  type="email"
                  className="sub-input"
                  value={supportForm.requester_email}
                  onChange={(e) => setSupportForm((f) => ({ ...f, requester_email: e.target.value }))}
                />
              </div>
              <div className="sub-field full">
                <label htmlFor="sup-desc">Description</label>
                <textarea
                  id="sup-desc"
                  className="sub-textarea"
                  value={supportForm.description}
                  onChange={(e) => setSupportForm((f) => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>
              <div className="sub-field full">
                <button type="submit" className="sub-btn sub-btn-primary" disabled={sendingSupport}>
                  {sendingSupport ? "Submitting Ticket..." : "Send to Platform Support"}
                </button>
              </div>
            </form>
          </div>

          <div className="sub-card">
            <h2 className="sub-card-title">Subscription Lifecycle Events ({events.length})</h2>
            {events.length === 0 ? (
              <p className="sub-subtitle">No subscription events recorded yet.</p>
            ) : (
              <div className="sub-timeline">
                {events.map((ev) => (
                  <div key={ev.id} className="sub-timeline-item">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "0.84rem" }}>
                      <strong>{ev.event_type}</strong>
                      <span className="sub-subtitle">{formatDate(ev.created_at)}</span>
                    </div>
                    <div style={{ fontSize: "0.85rem", marginTop: "3px" }}>{ev.description}</div>
                    {(ev.previous_status || ev.new_status) && (
                      <div className="sub-subtitle" style={{ fontSize: "0.78rem", marginTop: "2px" }}>
                        {ev.previous_status || "—"} → {ev.new_status || "—"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INVOICE PREVIEW MODAL */}
      {invoicePreview && (
        <div className="sub-modal-backdrop" onClick={() => setInvoicePreview(null)}>
          <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sub-modal-header">
              <h3>{invoicePreview.document_title}</h3>
              <button type="button" className="sub-modal-close" onClick={() => setInvoicePreview(null)}>
                ×
              </button>
            </div>
            <p className="sub-subtitle" style={{ marginBottom: "14px" }}>
              Issued by {invoicePreview.issuer}
            </p>
            <div className="sub-instructions-box">
              <strong>Payment Instructions</strong>
              <div style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {Object.entries(invoicePreview.invoice.payment_instructions || {}).map(([k, v]) => (
                  <div key={k}>
                    <span style={{ textTransform: "capitalize" }}>{k.replace(/_/g, " ")}:</span>{" "}
                    <strong>{String(v ?? "—")}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "0.88rem" }}>
              <div>Invoice Number: <strong>{invoicePreview.invoice.invoice_number}</strong></div>
              <div>Status: <strong>{invoicePreview.invoice.status}</strong></div>
              <div>Company: <strong>{invoicePreview.invoice.company_name || "—"}</strong></div>
              <div>Plan: <strong>{invoicePreview.invoice.plan_name || "—"}</strong></div>
              <div>Subtotal: <strong>{invoicePreview.invoice.currency} {invoicePreview.invoice.amount}</strong></div>
              <div>Tax: <strong>{invoicePreview.invoice.currency} {invoicePreview.invoice.tax_amount}</strong></div>
              <div>Total Amount: <strong>{invoicePreview.invoice.currency} {invoicePreview.invoice.total_amount}</strong></div>
              <div>Balance Due: <strong>{invoicePreview.invoice.currency} {invoicePreview.invoice.balance_due}</strong></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
              <button type="button" className="sub-btn sub-btn-secondary" onClick={() => window.print()}>
                Print / Save PDF
              </button>
              <button type="button" className="sub-btn sub-btn-primary" onClick={() => setInvoicePreview(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL PAYMENT SUBMISSION MODAL */}
      {payModalInvoice && (
        <div className="sub-modal-backdrop" onClick={() => setPayModalInvoice(null)}>
          <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sub-modal-header">
              <h3>Submit Manual Payment — {payModalInvoice.invoice_number}</h3>
              <button type="button" className="sub-modal-close" onClick={() => setPayModalInvoice(null)}>
                ×
              </button>
            </div>
            {payModalInvoice.payment_instructions && (
              <div className="sub-instructions-box">
                <strong>Transfer Details</strong>
                <div style={{ marginTop: "4px", fontSize: "0.82rem" }}>
                  {Object.entries(payModalInvoice.payment_instructions).map(([k, v]) => (
                    <div key={k}>
                      {k.replace(/_/g, " ")}: <strong>{String(v ?? "")}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <form onSubmit={handleSubmitManualPayment} className="sub-form-grid">
              <div className="sub-field">
                <label htmlFor="pay-ref">Transaction / UTR Reference *</label>
                <input
                  id="pay-ref"
                  className="sub-input"
                  value={paymentForm.transaction_reference}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, transaction_reference: e.target.value }))}
                  required
                  minLength={2}
                />
              </div>
              <div className="sub-field">
                <label htmlFor="pay-amt">Amount ({paymentForm.currency}) *</label>
                <input
                  id="pay-amt"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="sub-input"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="sub-field">
                <label htmlFor="pay-method">Payment Method</label>
                <select
                  id="pay-method"
                  className="sub-select"
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
                >
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="UPI">UPI</option>
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="IMPS">IMPS</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div className="sub-field">
                <label htmlFor="pay-date">Payment Date</label>
                <input
                  id="pay-date"
                  type="date"
                  className="sub-input"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
                />
              </div>
              <div className="sub-field">
                <label htmlFor="pay-file">Payment Proof Receipt (Max 5MB)</label>
                <input
                  id="pay-file"
                  type="file"
                  accept="image/*,.pdf"
                  className="sub-input"
                  onChange={(e) => setPaymentProofFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="sub-field">
                <label htmlFor="pay-proof-ref">Or Proof URL / Reference</label>
                <input
                  id="pay-proof-ref"
                  className="sub-input"
                  value={paymentForm.proof_reference}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, proof_reference: e.target.value }))}
                />
              </div>
              <div className="sub-field full">
                <label htmlFor="pay-notes">Notes</label>
                <textarea
                  id="pay-notes"
                  className="sub-textarea"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="sub-field full" style={{ flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="sub-btn sub-btn-secondary" onClick={() => setPayModalInvoice(null)}>
                  Cancel
                </button>
                <button type="submit" className="sub-btn sub-btn-primary" disabled={submittingPayment}>
                  {submittingPayment ? "Submitting..." : "Submit Payment for Verification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ATTACH PROOF MODAL */}
      {proofModalPayment && (
        <div className="sub-modal-backdrop" onClick={() => setProofModalPayment(null)}>
          <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sub-modal-header">
              <h3>Upload Proof — {proofModalPayment.transaction_reference}</h3>
              <button type="button" className="sub-modal-close" onClick={() => setProofModalPayment(null)}>
                ×
              </button>
            </div>
            <form onSubmit={handleUploadExistingProof} className="sub-form-grid">
              <div className="sub-field full">
                <label htmlFor="att-file">Upload Proof Image or PDF (Max 5MB)</label>
                <input
                  id="att-file"
                  type="file"
                  accept="image/*,.pdf"
                  className="sub-input"
                  onChange={(e) => setAttachFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="sub-field full">
                <label htmlFor="att-ref">Proof URL or Reference Note</label>
                <input
                  id="att-ref"
                  className="sub-input"
                  value={attachRef}
                  onChange={(e) => setAttachRef(e.target.value)}
                />
              </div>
              <div className="sub-field full" style={{ flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="sub-btn sub-btn-secondary" onClick={() => setProofModalPayment(null)}>
                  Cancel
                </button>
                <button type="submit" className="sub-btn sub-btn-primary" disabled={uploadingProof}>
                  {uploadingProof ? "Uploading..." : "Attach Proof"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL SUBSCRIPTION MODAL */}
      {showCancelModal && (
        <div className="sub-modal-backdrop" onClick={() => setShowCancelModal(false)}>
          <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sub-modal-header">
              <h3>Cancel Subscription</h3>
              <button type="button" className="sub-modal-close" onClick={() => setShowCancelModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCancelSubscription} className="sub-form-grid">
              <div className="sub-field full">
                <label htmlFor="cancel-reason">Cancellation Reason</label>
                <textarea
                  id="cancel-reason"
                  className="sub-textarea"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Optional reason for cancellation"
                />
              </div>
              <div className="sub-field full">
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={cancelImmediately}
                    onChange={(e) => setCancelImmediately(e.target.checked)}
                  />
                  Cancel immediately (disables CRM access right away instead of stopping auto-renewal at period end)
                </label>
              </div>
              <div className="sub-field full" style={{ flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
                <button type="button" className="sub-btn sub-btn-secondary" onClick={() => setShowCancelModal(false)}>
                  Keep Subscription
                </button>
                <button type="submit" className="sub-btn sub-btn-danger" disabled={cancelling}>
                  {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
