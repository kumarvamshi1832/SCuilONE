import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircleIcon,
  EditIcon,
  PlusIcon,
  RefreshIcon,
  XIcon,
  ZapIcon,
} from "../../components/common/SupportPortalIcons";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformInvoiceItem,
  PlatformPaymentItem,
  PlatformPlan,
  PlatformRefundItem,
  PlatformReminderCampaign,
  PlatformSubscriptionEventItem,
  PlatformSubscriptionItem,
  PlatformTenantCompany,
} from "../../types/platform";
import "./PlatformPages.css";

type BillingTab =
  | "plans"
  | "subscriptions"
  | "invoices"
  | "payments"
  | "refunds"
  | "reminders";

type SubView =
  | "all"
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "expired"
  | "expired_trials"
  | "cancelled"
  | "upcoming";

export default function PlatformBillingSubsPage() {
  const canViewPlans = hasPlatformPermission("platform.plans.view");
  const canManagePlans = hasPlatformPermission("platform.plans.manage");
  const canViewBilling = hasPlatformPermission("platform.billing.view");
  const canManageBilling = hasPlatformPermission("platform.billing.manage");
  const canGrantComplimentary = hasPlatformPermission("platform.owner.manage");

  const [searchParams, setSearchParams] = useSearchParams();
  const resolveBillingTab = (requested: string | null): BillingTab => {
    if (requested === "plans" && canViewPlans) return "plans";
    if (
      canViewBilling &&
      (requested === "subscriptions" ||
        requested === "invoices" ||
        requested === "payments" ||
        requested === "refunds" ||
        requested === "reminders")
    ) {
      return requested;
    }
    return canViewBilling ? "payments" : "plans";
  };

  const [tab, setTab] = useState<BillingTab>(() =>
    resolveBillingTab(searchParams.get("tab"))
  );

  useEffect(() => {
    const nextTab = resolveBillingTab(searchParams.get("tab"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams, canViewBilling, canViewPlans]);

  const handleSelectTab = (nextTab: BillingTab) => {
    setTab(nextTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", nextTab);
        return next;
      },
      { replace: true }
    );
  };

  // Catalog / tenants for selectors
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [tenants, setTenants] = useState<PlatformTenantCompany[]>([]);

  // Subscriptions
  const [subView, setSubView] = useState<SubView>("all");
  const [subs, setSubs] = useState<PlatformSubscriptionItem[]>([]);
  const [withinDays, setWithinDays] = useState(30);
  const [eventsModalSubId, setEventsModalSubId] = useState<string | null>(null);
  const [subEvents, setSubEvents] = useState<PlatformSubscriptionEventItem[]>(
    []
  );

  // Invoices
  const [invoiceMode, setInvoiceMode] = useState<"all" | "overdue">("all");
  const [invoices, setInvoices] = useState<PlatformInvoiceItem[]>([]);

  // Payments
  const [paymentMode, setPaymentMode] = useState<"submitted" | "all">(
    "submitted"
  );
  const [payments, setPayments] = useState<PlatformPaymentItem[]>([]);
  const [rejectTarget, setRejectTarget] = useState<PlatformPaymentItem | null>(
    null
  );
  const [rejectReason, setRejectReason] = useState("");
  const [adminNotes, setAdminNotes] = useState("");

  // Refunds
  const [refunds, setRefunds] = useState<PlatformRefundItem[]>([]);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refInvId, setRefInvId] = useState("");
  const [refAmt, setRefAmt] = useState(100);
  const [refReason, setRefReason] = useState("");

  // Reminders & Audit
  const [campaigns, setCampaigns] = useState<PlatformReminderCampaign[]>([]);
  const [auditHistory, setAuditHistory] = useState<
    PlatformSubscriptionEventItem[]
  >([]);

  // Plan Create / Edit Modal
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlatformPlan | null>(null);
  const [plKey, setPlKey] = useState("");
  const [plName, setPlName] = useState("");
  const [plDesc, setPlDesc] = useState("");
  const [plCycle, setPlCycle] = useState<"Monthly" | "Annual">("Monthly");
  const [plPrice, setPlPrice] = useState(999);
  const [plTrialDays, setPlTrialDays] = useState(14);
  const [plUsers, setPlUsers] = useState(10);
  const [plBranches, setPlBranches] = useState(1);
  const [plStorage, setPlStorage] = useState(10);
  const [plFeatures, setPlFeatures] = useState("");
  const [plActive, setPlActive] = useState(true);

  // Assign Subscription / Complimentary / Create Invoice / Record Payment Modals
  const [assignSubOpen, setAssignSubOpen] = useState(false);
  const [compOpen, setCompOpen] = useState(false);
  const [selTenantId, setSelTenantId] = useState("");
  const [selPlanId, setSelPlanId] = useState("");
  const [selCycle, setSelCycle] = useState<"Monthly" | "Annual">("Monthly");
  const [selStatus, setSelStatus] = useState("Active");
  const [selDurationDays, setSelDurationDays] = useState(30);
  const [selReason, setSelReason] = useState("");

  const [invModalOpen, setInvModalOpen] = useState(false);
  const [invAmount, setInvAmount] = useState(999);
  const [invTax, setInvTax] = useState(0);
  const [invNotes, setInvNotes] = useState("");

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState("");
  const [payProvider, setPayProvider] = useState("Bank Transfer");
  const [payRef, setPayRef] = useState("");
  const [payAmount, setPayAmount] = useState(999);
  const [payMethod, setPayMethod] = useState("UPI / NEFT");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadReferenceLists = async () => {
    const [plRes, tenRes] = await Promise.all([
      canViewPlans
        ? platformService.listPlans().catch(() => ({ items: [] }))
        : Promise.resolve({ items: [] }),
      platformService.listTenants().catch(() => ({ items: [], total: 0 })),
    ]);
    setPlans(plRes.items || []);
    setTenants(tenRes.items || []);
    if (!selPlanId && plRes.items?.[0]) setSelPlanId(plRes.items[0].id);
    if (!selTenantId && tenRes.items?.[0]) setSelTenantId(tenRes.items[0].id);
  };

  const loadActiveTab = async () => {
    setLoading(true);
    setError(null);
    try {
      await loadReferenceLists();
      if (tab === "plans" && canViewPlans) {
        const res = await platformService.listPlans();
        setPlans(res.items || []);
      } else if (tab === "subscriptions" && canViewBilling) {
        let res: { items?: PlatformSubscriptionItem[] };
        if (subView === "trialing") {
          const [trialRes, subTrialRes] = await Promise.all([
            platformService.listTrialingSubscriptions().catch(() => ({ items: [] })),
            platformService.listSubscriptions({ status: "Trial" }).catch(() => ({ items: [] })),
          ]);
          const seen = new Set<string>();
          const combined: PlatformSubscriptionItem[] = [];
          for (const item of [...(trialRes.items || []), ...(subTrialRes.items || [])]) {
            const key = item.subscription_id || item.id || item.tenant_id;
            if (key && !seen.has(key)) {
              seen.add(key);
              combined.push(item);
            }
          }
          res = { items: combined };
        } else if (subView === "expired_trials") {
          res = await platformService.listExpiredTrialSubscriptions();
        } else if (subView === "upcoming") {
          res = await platformService.listUpcomingRenewals(withinDays);
        } else if (subView === "expired") {
          res = await platformService.listExpiredSubscriptions();
        } else if (subView === "active") {
          res = await platformService.listSubscriptions({ status: "Active" });
        } else if (subView === "past_due") {
          res = await platformService.listSubscriptions({ status: "Past Due" });
        } else if (subView === "suspended") {
          res = await platformService.listSubscriptions({ status: "Suspended" });
        } else if (subView === "cancelled") {
          res = await platformService.listSubscriptions({ status: "Cancelled" });
        } else {
          // "all": fetch all subscriptions from /subscriptions and merge with /subscriptions/trialing
          const [allRes, trialRes] = await Promise.all([
            platformService.listSubscriptions(),
            platformService.listTrialingSubscriptions().catch(() => ({ items: [] })),
          ]);
          const allItems = allRes.items || [];
          const seenIds = new Set(allItems.map((s) => s.subscription_id || s.id || s.tenant_id));
          const trialItems = trialRes.items || [];
          const missingTrials = trialItems.filter(
            (t) => !seenIds.has(t.subscription_id || t.id || t.tenant_id)
          );
          const trialMap = new Map(
            trialItems.map((t) => [t.subscription_id || t.id || t.tenant_id, t])
          );
          const merged = [
            ...allItems.map((s) => {
              const match = trialMap.get(s.subscription_id || s.id || s.tenant_id);
              if (match) {
                return {
                  ...s,
                  trial_start_date: s.trial_start_date || match.trial_start_date,
                  trial_end_date: s.trial_end_date || match.trial_end_date,
                  trial_days_remaining: match.trial_days_remaining,
                  is_in_trial: match.is_in_trial ?? true,
                  current_plan: s.current_plan || match.current_plan,
                  selected_plan: s.selected_plan || match.selected_plan,
                };
              }
              return s;
            }),
            ...missingTrials,
          ];
          res = { items: merged };
        }
        setSubs(res.items || []);
      } else if (tab === "invoices" && canViewBilling) {
        const res =
          invoiceMode === "overdue"
            ? await platformService.listOverdueInvoices()
            : await platformService.listInvoices();
        setInvoices(res.items || []);
      } else if (tab === "payments" && canViewBilling) {
        const res =
          paymentMode === "submitted"
            ? await platformService.listSubmittedPayments()
            : await platformService.listPayments();
        setPayments(res.items || []);
      } else if (tab === "refunds" && canViewBilling) {
        const [refRes, invRes] = await Promise.all([
          platformService.listRefunds(),
          platformService.listInvoices().catch(() => ({ items: [] })),
        ]);
        setRefunds(refRes.items || []);
        setInvoices(invRes.items || []);
      } else if (tab === "reminders" && canViewBilling) {
        const [campRes, histRes] = await Promise.all([
          platformService.listReminderCampaigns(),
          platformService.listSubscriptionAuditHistory(),
        ]);
        setCampaigns(campRes.items || []);
        setAuditHistory(histRes.items || []);
      }
    } catch (err) {
      setError(
        extractApiErrorMessage(err, "Failed to load billing workspace data.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveTab();
  }, [tab, subView, invoiceMode, paymentMode]);

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const featuresArr = plFeatures
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (editingPlan) {
        await platformService.updatePlan(editingPlan.id, {
          name: plName.trim(),
          description: plDesc.trim(),
          billing_cycle: plCycle,
          price: plPrice,
          trial_days: plTrialDays,
          max_users: plUsers,
          max_branches: plBranches,
          storage_limit_gb: plStorage,
          features_json: featuresArr,
          is_active: plActive,
        });
        setSuccess(`Updated subscription plan "${plName.trim()}".`);
      } else {
        await platformService.createPlan({
          plan_key: plKey.trim(),
          name: plName.trim(),
          description: plDesc.trim(),
          billing_cycle: plCycle,
          price: plPrice,
          trial_days: plTrialDays,
          max_users: plUsers,
          max_branches: plBranches,
          storage_limit_gb: plStorage,
          features_json: featuresArr,
          is_active: plActive,
        });
        setSuccess(`Created subscription plan "${plName.trim()}".`);
      }
      setPlanModalOpen(false);
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to save plan."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignSub = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.assignSubscription({
        tenant_id: selTenantId,
        plan_id: selPlanId,
        status: selStatus,
        billing_cycle: selCycle,
        auto_renew: true,
      });
      setSuccess("Assigned subscription to tenant.");
      setAssignSubOpen(false);
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to assign subscription."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplimentary = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.grantComplimentarySubscription({
        tenant_id: selTenantId,
        plan_id: selPlanId,
        billing_cycle: selCycle,
        duration_days: selDurationDays,
        reason: selReason.trim(),
      });
      setSuccess("Granted complimentary subscription.");
      setCompOpen(false);
      await loadActiveTab();
    } catch (err) {
      setError(
        extractApiErrorMessage(err, "Failed to grant complimentary access.")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubLifecycle = async (
    subId: string,
    action: "suspend" | "reactivate" | "cancel"
  ) => {
    const promptMsg =
      action === "suspend"
        ? "Reason for suspending subscription:"
        : action === "cancel"
        ? "Reason for cancelling subscription:"
        : "Reason for reactivating subscription (optional):";
    const reason = window.prompt(promptMsg, `${action} by Platform Billing`);
    if (reason === null) return;
    if ((action === "suspend" || action === "cancel") && reason.trim().length < 3) {
      setError("Please enter a brief reason (at least 3 characters).");
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      if (action === "suspend") {
        await platformService.suspendSubscription(subId, reason.trim());
      } else if (action === "reactivate") {
        await platformService.reactivateSubscription(subId, {
          reason: reason.trim() || "Reactivated by admin",
        });
      } else {
        await platformService.cancelSubscription(subId, reason.trim());
      }
      setSuccess(`Subscription ${action} action completed.`);
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, `Failed to ${action} subscription.`));
    }
  };

  const handleOpenEvents = async (subId: string) => {
    setEventsModalSubId(subId);
    try {
      const res = await platformService.getSubscriptionEvents(subId);
      setSubEvents(res.items || []);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load events."));
    }
  };

  const handleReviewPayment = async (p: PlatformPaymentItem) => {
    setError(null);
    setSuccess(null);
    try {
      await platformService.reviewPayment(
        p.payment_id || p.id,
        "Marked Under Review by billing desk"
      );
      setSuccess(`Payment ${p.transaction_reference} marked Under Review.`);
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to mark under review."));
    }
  };

  const handleApprovePayment = async (p: PlatformPaymentItem) => {
    setError(null);
    setSuccess(null);
    try {
      await platformService.approvePayment(
        p.payment_id || p.id,
        "Verified & Approved via Platform Portal"
      );
      setSuccess(
        `Payment ${p.transaction_reference} approved & subscription activated.`
      );
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to approve payment."));
    }
  };

  const handleRejectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.rejectPayment(
        rejectTarget.payment_id || rejectTarget.id,
        rejectReason.trim(),
        adminNotes.trim() || undefined
      );
      setSuccess(`Rejected payment ${rejectTarget.transaction_reference}.`);
      setRejectTarget(null);
      setRejectReason("");
      setAdminNotes("");
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to reject payment."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.createInvoice({
        tenant_id: selTenantId,
        amount: invAmount,
        tax_amount: invTax,
        notes: invNotes.trim() || undefined,
      });
      setSuccess("Created billing invoice.");
      setInvModalOpen(false);
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to create invoice."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.recordPayment({
        invoice_id: payInvoiceId,
        provider: payProvider,
        transaction_reference: payRef.trim(),
        amount: payAmount,
        payment_method: payMethod,
        status: "Succeeded",
      });
      setSuccess("Recorded payment against invoice.");
      setPayModalOpen(false);
      setPayRef("");
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to record payment."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.createRefund({
        invoice_id: refInvId,
        amount: refAmt,
        reason: refReason.trim(),
      });
      setSuccess("Created refund request.");
      setRefundOpen(false);
      setRefReason("");
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to create refund request."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecideRefund = async (
    refundId: string,
    statusVal: "Approved" | "Rejected" | "Processed"
  ) => {
    setError(null);
    setSuccess(null);
    try {
      await platformService.decideRefund(refundId, {
        status: statusVal,
        resolution_notes: `${statusVal} by Platform Billing`,
      });
      setSuccess(`Refund updated to ${statusVal}.`);
      await loadActiveTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update refund."));
    }
  };

  const getSubStatusBadge = (status?: string | null): string => {
    const s = (status || "").toLowerCase();
    if (s === "active") return "green";
    if (s === "trial" || s === "trialing") return "blue";
    if (s === "past due" || s === "past_due") return "amber";
    if (s === "suspended") return "amber";
    if (s === "expired") return "red";
    if (s === "cancelled") return "neutral";
    return "neutral";
  };

  const getSubPriceDisplay = (s: PlatformSubscriptionItem): string => {
    const rawPrice = s.price ?? s.current_plan?.price ?? s.selected_plan?.price;
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== "") {
      const num = Number(rawPrice);
      if (num === 0 || rawPrice === "0" || rawPrice === "0.00") {
        return "Free (₹0)";
      }
      return `₹${rawPrice}`;
    }
    if (s.status?.toLowerCase() === "trial") {
      return "Free (₹0)";
    }
    return "—";
  };

  const getSubViewLabel = (view: SubView): string => {
    switch (view) {
      case "trialing":
        return "Free Trial / Currently Trialing";
      case "active":
        return "Active Subscriptions";
      case "past_due":
        return "Past Due Subscriptions";
      case "suspended":
        return "Suspended Subscriptions";
      case "expired":
        return "All Expired Subscriptions";
      case "expired_trials":
        return "Expired Free Trials";
      case "cancelled":
        return "Cancelled Subscriptions";
      case "upcoming":
        return "Upcoming Renewals";
      default:
        return "All Tenant Subscriptions";
    }
  };

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>Plans, Subscriptions, Verification & Renewals</h2>
          <p>
            Manage catalog plans, trials, manual payment proof verification,
            invoices, refunds, automated reminders, and audit trails.
          </p>
        </div>
        <div className="platform-actions-row">
          <button type="button" className="platform-btn" onClick={loadActiveTab}>
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {tab === "plans" && canManagePlans && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => {
                setEditingPlan(null);
                setPlKey("");
                setPlName("");
                setPlDesc("");
                setPlCycle("Monthly");
                setPlPrice(999);
                setPlTrialDays(14);
                setPlUsers(10);
                setPlBranches(1);
                setPlStorage(10);
                setPlFeatures("");
                setPlActive(true);
                setPlanModalOpen(true);
              }}
            >
              <PlusIcon size={15} />
              <span>Create Plan</span>
            </button>
          )}
          {tab === "subscriptions" && canManageBilling && (
            <>
              <button
                type="button"
                className="platform-btn primary"
                onClick={() => setAssignSubOpen(true)}
              >
                <PlusIcon size={15} />
                <span>Assign Plan</span>
              </button>
              {canGrantComplimentary && (
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setCompOpen(true)}
                >
                  <ZapIcon size={15} />
                  <span>Grant Complimentary</span>
                </button>
              )}
            </>
          )}
          {tab === "invoices" && canManageBilling && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => setInvModalOpen(true)}
            >
              <PlusIcon size={15} />
              <span>Create Invoice</span>
            </button>
          )}
          {tab === "payments" && canManageBilling && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => {
                if (!payInvoiceId && invoices[0]) setPayInvoiceId(invoices[0].id);
                setPayModalOpen(true);
              }}
            >
              <PlusIcon size={15} />
              <span>Record Payment</span>
            </button>
          )}
          {tab === "refunds" && canManageBilling && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => {
                if (!refInvId && invoices[0]) setRefInvId(invoices[0].id);
                setRefundOpen(true);
              }}
            >
              <PlusIcon size={15} />
              <span>New Refund Request</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      <div className="platform-tabs">
        {canViewBilling && (
          <button
            type="button"
            className={`platform-tab ${tab === "payments" ? "active" : ""}`}
            onClick={() => handleSelectTab("payments")}
          >
            Manual Payment Verification
          </button>
        )}
        {canViewBilling && (
          <button
            type="button"
            className={`platform-tab ${tab === "subscriptions" ? "active" : ""}`}
            onClick={() => handleSelectTab("subscriptions")}
          >
            Subscriptions & Trials
          </button>
        )}
        {canViewBilling && (
          <button
            type="button"
            className={`platform-tab ${tab === "invoices" ? "active" : ""}`}
            onClick={() => handleSelectTab("invoices")}
          >
            Invoices
          </button>
        )}
        {canViewPlans && (
          <button
            type="button"
            className={`platform-tab ${tab === "plans" ? "active" : ""}`}
            onClick={() => handleSelectTab("plans")}
          >
            Subscription Plans
          </button>
        )}
        {canViewBilling && (
          <>
            <button
              type="button"
              className={`platform-tab ${tab === "refunds" ? "active" : ""}`}
              onClick={() => handleSelectTab("refunds")}
            >
              Refunds
            </button>
            <button
              type="button"
              className={`platform-tab ${tab === "reminders" ? "active" : ""}`}
              onClick={() => handleSelectTab("reminders")}
            >
              Reminders & Audit
            </button>
          </>
        )}
      </div>

      {tab === "plans" && (
        <div className="platform-grid-2">
          {plans.map((pl) => (
            <div key={pl.id} className="platform-card">
              <div className="platform-card-title">
                <span>
                  {pl.name} (<code>{pl.plan_key}</code>)
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <span
                    className={`platform-badge ${
                      pl.is_active ? "green" : "red"
                    }`}
                  >
                    {pl.is_active ? "Active" : "Inactive"}
                  </span>
                  {canManagePlans && (
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={() => {
                        setEditingPlan(pl);
                        setPlKey(pl.plan_key);
                        setPlName(pl.name);
                        setPlDesc(pl.description || "");
                        setPlCycle(
                          pl.billing_cycle === "Annual" ? "Annual" : "Monthly"
                        );
                        setPlPrice(Number(pl.price || 0));
                        setPlTrialDays(pl.trial_days || 14);
                        setPlUsers(pl.max_users || 10);
                        setPlBranches(pl.max_branches || 1);
                        setPlStorage(pl.storage_limit_gb || 10);
                        setPlFeatures((pl.features || []).join(", "));
                        setPlActive(Boolean(pl.is_active));
                        setPlanModalOpen(true);
                      }}
                    >
                      <EditIcon size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
                {pl.currency} {pl.price} / {pl.billing_cycle}
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--plat-muted)" }}>
                {pl.description || "No description"}
              </p>
              <div style={{ fontSize: 12.5, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>Trial: {pl.trial_days}d</span>
                <span>Users: {pl.max_users}</span>
                <span>Branches: {pl.max_branches}</span>
                <span>Storage: {pl.storage_limit_gb} GB</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "subscriptions" && (
        <>
          <div className="platform-filter-bar">
            <select
              className="platform-select"
              value={subView}
              onChange={(e) => setSubView(e.target.value as SubView)}
            >
              <option value="all">All Tenant Subscriptions</option>
              <option value="trialing">Free Trial / Currently Trialing</option>
              <option value="active">Active Subscriptions</option>
              <option value="past_due">Past Due Subscriptions</option>
              <option value="suspended">Suspended Subscriptions</option>
              <option value="expired">All Expired Subscriptions</option>
              <option value="expired_trials">Expired Free Trials</option>
              <option value="cancelled">Cancelled Subscriptions</option>
              <option value="upcoming">Upcoming Renewals</option>
            </select>
            {subView === "upcoming" && (
              <>
                <span style={{ fontSize: 13 }}>Within days:</span>
                <input
                  className="platform-input"
                  type="number"
                  min={1}
                  max={365}
                  style={{ width: 90 }}
                  value={withinDays}
                  onChange={(e) => setWithinDays(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="platform-btn sm primary"
                  onClick={loadActiveTab}
                >
                  Apply
                </button>
              </>
            )}
          </div>

          <div className="platform-card">
            {loading ? (
              <div className="platform-empty">Loading subscriptions...</div>
            ) : subs.length === 0 ? (
              <div className="platform-empty" style={{ padding: "36px 20px", textAlign: "center" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--plat-text)", marginBottom: 6 }}>
                  No subscriptions in this view.
                </div>
                <div style={{ fontSize: 13, color: "var(--plat-muted)", maxWidth: 540, margin: "0 auto 16px" }}>
                  {tenants.length > 0
                    ? `${tenants.length} tenant companies are registered on the platform, but no subscription records matching "${getSubViewLabel(subView)}" were returned by the API.`
                    : "No tenant companies or subscriptions exist yet."}
                </div>
                {canManageBilling && tenants.length > 0 && (
                  <button
                    type="button"
                    className="platform-btn primary sm"
                    onClick={() => setAssignSubOpen(true)}
                  >
                    <PlusIcon size={14} />
                    <span>Assign Subscription to Tenant</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Company & Industry</th>
                      <th>Plan</th>
                      <th>Amount</th>
                      <th>Billing Cycle</th>
                      <th>Status</th>
                      <th>Trial Period</th>
                      <th>Renewal Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => {
                      const subId = s.subscription_id || s.id || "";
                      const planLabel =
                        s.plan_name ||
                        s.current_plan?.name ||
                        s.selected_plan?.name ||
                        s.plan?.name ||
                        (s.status?.toLowerCase() === "trial" ? "Free Trial" : "—");
                      const billingCycle =
                        s.billing_cycle ||
                        s.selected_billing_cycle ||
                        s.current_plan?.billing_cycle ||
                        s.selected_plan?.billing_cycle ||
                        "—";
                      const amountLabel = getSubPriceDisplay(s);
                      const trialStart = s.trial_start_date
                        ? s.trial_start_date.slice(0, 10)
                        : (s.status?.toLowerCase() === "trial" && s.starts_at ? s.starts_at.slice(0, 10) : null);
                      const trialEnd = s.trial_end_date
                        ? s.trial_end_date.slice(0, 10)
                        : (s.status?.toLowerCase() === "trial" && s.ends_at ? s.ends_at.slice(0, 10) : null);
                      const renewalDate = s.renewal_date
                        ? s.renewal_date.slice(0, 10)
                        : (s.status?.toLowerCase() !== "trial" && s.ends_at ? s.ends_at.slice(0, 10) : null);

                      return (
                        <tr key={subId || s.tenant_id}>
                          <td>
                            <strong>{s.company_name || s.tenant_id}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {s.industry || "—"}
                            </div>
                          </td>
                          <td>
                            <strong>{planLabel}</strong>
                            {s.selected_plan?.name && s.selected_plan.name !== planLabel && (
                              <div style={{ fontSize: 11, color: "var(--plat-muted)" }}>
                                Next: {s.selected_plan.name}
                              </div>
                            )}
                          </td>
                          <td>
                            <strong style={{ fontVariantNumeric: "tabular-nums" }}>{amountLabel}</strong>
                          </td>
                          <td>
                            <span>{billingCycle}</span>
                          </td>
                          <td>
                            <span className={`platform-badge ${getSubStatusBadge(s.status)}`}>
                              {s.status}
                            </span>
                            {s.is_complimentary && (
                              <span className="platform-badge blue" style={{ marginLeft: 4 }}>
                                Comp
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: 12.5 }}>
                            {trialStart || trialEnd ? (
                              <>
                                <div>Start: {trialStart || "—"}</div>
                                <div>Ends: {trialEnd || "—"}</div>
                                {s.trial_days_remaining !== undefined && s.trial_days_remaining > 0 && (
                                  <span className="platform-badge blue" style={{ marginTop: 2, fontSize: 11 }}>
                                    {s.trial_days_remaining}d left
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ color: "var(--plat-muted)" }}>—</span>
                            )}
                          </td>
                          <td style={{ fontSize: 12.5 }}>
                            <span>{renewalDate || "—"}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {subId && (
                                <button
                                  type="button"
                                  className="platform-btn sm"
                                  onClick={() => handleOpenEvents(subId)}
                                >
                                  Events
                                </button>
                              )}
                              {canManageBilling && subId && (
                                <>
                                  {s.status !== "Suspended" && (
                                    <button
                                      type="button"
                                      className="platform-btn sm danger"
                                      onClick={() =>
                                        handleSubLifecycle(subId, "suspend")
                                      }
                                    >
                                      Suspend
                                    </button>
                                  )}
                                  {(s.status === "Suspended" ||
                                    s.status === "Expired" ||
                                    s.status === "Cancelled") && (
                                    <button
                                      type="button"
                                      className="platform-btn sm success"
                                      onClick={() =>
                                        handleSubLifecycle(subId, "reactivate")
                                      }
                                    >
                                      Reactivate
                                    </button>
                                  )}
                                  {s.status !== "Cancelled" && (
                                    <button
                                      type="button"
                                      className="platform-btn sm"
                                      onClick={() =>
                                        handleSubLifecycle(subId, "cancel")
                                      }
                                    >
                                      Cancel
                                    </button>
                                  )}
                                </>
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
        </>
      )}

      {tab === "invoices" && (
        <>
          <div className="platform-filter-bar">
            <select
              className="platform-select"
              value={invoiceMode}
              onChange={(e) =>
                setInvoiceMode(e.target.value as "all" | "overdue")
              }
            >
              <option value="all">All Invoices</option>
              <option value="overdue">Issued & Overdue Invoices</option>
            </select>
          </div>

          <div className="platform-card">
            {loading ? (
              <div className="platform-empty">Loading invoices...</div>
            ) : invoices.length === 0 ? (
              <div className="platform-empty">No invoices found.</div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Company</th>
                      <th>Total / Balance</th>
                      <th>Status</th>
                      <th>Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td>
                          <strong>{inv.invoice_number}</strong>
                        </td>
                        <td>{inv.company_name || inv.tenant_id}</td>
                        <td>
                          <strong>
                            {inv.currency} {inv.total_amount}
                          </strong>
                          <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                            Paid: {inv.paid_amount} • Balance: {inv.balance_due}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`platform-badge ${
                              inv.status === "Paid"
                                ? "green"
                                : inv.status === "Overdue"
                                ? "red"
                                : "yellow"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td>{inv.due_date || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "payments" && (
        <>
          <div className="platform-filter-bar">
            <select
              className="platform-select"
              value={paymentMode}
              onChange={(e) =>
                setPaymentMode(e.target.value as "submitted" | "all")
              }
            >
              <option value="submitted">
                Submitted / Under Review Proofs Awaiting Verification
              </option>
              <option value="all">All Billing Payments</option>
            </select>
          </div>

          <div className="platform-card">
            {loading ? (
              <div className="platform-empty">Loading payments...</div>
            ) : payments.length === 0 ? (
              <div className="platform-empty">
                No payment records in this view.
              </div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Reference & Proof</th>
                      <th>Company / Invoice</th>
                      <th>Amount & Method</th>
                      <th>Status</th>
                      <th>Verification Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const proofUrl = p.payment_proof_url || p.proof_file_url;
                      const isVerifiable =
                        p.status === "Submitted" || p.status === "Under Review";
                      return (
                        <tr key={p.payment_id || p.id}>
                          <td>
                            <strong>{p.transaction_reference}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {proofUrl ? (
                                <a
                                  href={proofUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ color: "var(--plat-accent)" }}
                                >
                                  View Proof ({p.payment_proof_filename || "file"})
                                </a>
                              ) : (
                                "No proof file uploaded"
                              )}
                            </div>
                          </td>
                          <td>
                            <div>{p.company_name || p.tenant_id}</div>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {p.invoice_number || p.invoice_id}
                            </div>
                          </td>
                          <td>
                            <strong>
                              {p.currency} {p.amount}
                            </strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {p.payment_method} ({p.provider})
                            </div>
                          </td>
                          <td>
                            <span
                              className={`platform-badge ${
                                p.status === "Succeeded"
                                  ? "green"
                                  : p.status === "Failed" || p.status === "Rejected"
                                  ? "red"
                                  : "yellow"
                              }`}
                            >
                              {p.status}
                            </span>
                          </td>
                          <td>
                            {canManageBilling && isVerifiable && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {p.status === "Submitted" && (
                                  <button
                                    type="button"
                                    className="platform-btn sm"
                                    onClick={() => handleReviewPayment(p)}
                                  >
                                    Under Review
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="platform-btn sm success"
                                  onClick={() => handleApprovePayment(p)}
                                >
                                  <CheckCircleIcon size={13} />
                                  <span>Approve & Activate</span>
                                </button>
                                <button
                                  type="button"
                                  className="platform-btn sm danger"
                                  onClick={() => {
                                    setRejectTarget(p);
                                    setRejectReason("");
                                    setAdminNotes("");
                                  }}
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "refunds" && (
        <div className="platform-card">
          {refunds.length === 0 ? (
            <div className="platform-empty">No refund requests.</div>
          ) : (
            <div className="platform-table-wrap">
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Invoice / Tenant</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((rf) => (
                    <tr key={rf.id}>
                      <td>
                        <div style={{ fontSize: 12 }}>Inv: {rf.invoice_id}</div>
                        <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                          Tenant: {rf.tenant_id}
                        </div>
                      </td>
                      <td>
                        <strong>
                          {rf.currency} {rf.amount}
                        </strong>
                      </td>
                      <td>{rf.reason}</td>
                      <td>
                        <span className="platform-badge blue">{rf.status}</span>
                      </td>
                      <td>
                        {canManageBilling && rf.status === "Pending" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              className="platform-btn sm success"
                              onClick={() =>
                                handleDecideRefund(rf.id, "Approved")
                              }
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="platform-btn sm primary"
                              onClick={() =>
                                handleDecideRefund(rf.id, "Processed")
                              }
                            >
                              Process
                            </button>
                            <button
                              type="button"
                              className="platform-btn sm danger"
                              onClick={() =>
                                handleDecideRefund(rf.id, "Rejected")
                              }
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "reminders" && (
        <>
          {canManageBilling && (
            <div className="platform-filter-bar">
              <button
                type="button"
                className="platform-btn primary sm"
                onClick={async () => {
                  try {
                    const res = await platformService.runReminders();
                    setSuccess(
                      res.message || "Reminder campaign run completed."
                    );
                    await loadActiveTab();
                  } catch (err) {
                    setError(
                      extractApiErrorMessage(err, "Failed to run reminders.")
                    );
                  }
                }}
              >
                <ZapIcon size={14} />
                <span>Run Trial / Post-Trial Reminders Now</span>
              </button>
              <button
                type="button"
                className="platform-btn sm"
                onClick={async () => {
                  try {
                    const res = await platformService.generateRenewalInvoices({
                      lead_days: 7,
                    });
                    setSuccess(
                      res.message || "Renewal invoice generation completed."
                    );
                    await loadActiveTab();
                  } catch (err) {
                    setError(
                      extractApiErrorMessage(
                        err,
                        "Failed to generate renewal invoices."
                      )
                    );
                  }
                }}
              >
                Generate Upcoming Renewal Invoices (7d)
              </button>
            </div>
          )}

          <div className="platform-grid-2">
            <div className="platform-card">
              <div className="platform-card-title">
                <span>Reminder Campaigns ({campaigns.length})</span>
              </div>
              {campaigns.length === 0 ? (
                <div className="platform-empty">No reminder campaigns yet.</div>
              ) : (
                <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Company / Type</th>
                        <th>Status</th>
                        <th>Sent Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.company_name || c.tenant_id}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {c.campaign_type || "reminder"}
                            </div>
                          </td>
                          <td>
                            <span className="platform-badge indigo">
                              {c.campaign_status}
                            </span>
                          </td>
                          <td>{c.emails_sent_count ?? 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="platform-card">
              <div className="platform-card-title">
                <span>Subscription & Verification Audit History</span>
              </div>
              {auditHistory.length === 0 ? (
                <div className="platform-empty">No events recorded yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
                  {auditHistory.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--plat-border)",
                        background: "var(--plat-surface-alt)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                        <strong>{ev.event_type}</strong>
                        <span style={{ color: "var(--plat-muted)" }}>
                          {ev.created_at?.slice(0, 19).replace("T", " ")}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>{ev.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Reject Payment Modal */}
      {rejectTarget && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Reject Payment Proof ({rejectTarget.transaction_reference})</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setRejectTarget(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleRejectPayment}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Rejection Reason (sent to tenant)</label>
                <textarea
                  className="platform-textarea"
                  required
                  minLength={3}
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
              <div className="platform-field">
                <label>Admin Notes (optional)</label>
                <input
                  className="platform-input"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setRejectTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn danger"
                  disabled={submitting}
                >
                  {submitting ? "Rejecting..." : "Confirm Reject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Events Timeline Modal */}
      {eventsModalSubId && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Subscription Events</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setEventsModalSubId(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            {subEvents.length === 0 ? (
              <div className="platform-empty">No events found.</div>
            ) : (
              subEvents.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid var(--plat-border)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.event_type}</div>
                  <div style={{ fontSize: 13 }}>{ev.description}</div>
                  <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                    {ev.previous_status || "—"} → {ev.new_status || "—"} •{" "}
                    {ev.created_at}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Plan Modal */}
      {planModalOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>{editingPlan ? `Edit Plan: ${editingPlan.name}` : "Create Plan"}</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setPlanModalOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleSavePlan}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                {!editingPlan && (
                  <div className="platform-field">
                    <label>Plan Key</label>
                    <input
                      className="platform-input"
                      required
                      value={plKey}
                      onChange={(e) => setPlKey(e.target.value)}
                    />
                  </div>
                )}
                <div className="platform-field">
                  <label>Plan Name</label>
                  <input
                    className="platform-input"
                    required
                    value={plName}
                    onChange={(e) => setPlName(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Cycle</label>
                  <select
                    className="platform-select"
                    value={plCycle}
                    onChange={(e) =>
                      setPlCycle(e.target.value as "Monthly" | "Annual")
                    }
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Annual">Annual</option>
                  </select>
                </div>
                <div className="platform-field">
                  <label>Price</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={0}
                    value={plPrice}
                    onChange={(e) => setPlPrice(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Trial Days</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={0}
                    value={plTrialDays}
                    onChange={(e) => setPlTrialDays(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Max Users</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    value={plUsers}
                    onChange={(e) => setPlUsers(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Max Branches</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    value={plBranches}
                    onChange={(e) => setPlBranches(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Storage Limit (GB)</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    value={plStorage}
                    onChange={(e) => setPlStorage(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="platform-field">
                <label>Description</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={plDesc}
                  onChange={(e) => setPlDesc(e.target.value)}
                />
              </div>
              <div className="platform-field">
                <label>Features (comma-separated)</label>
                <input
                  className="platform-input"
                  value={plFeatures}
                  onChange={(e) => setPlFeatures(e.target.value)}
                />
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={plActive}
                  onChange={(e) => setPlActive(e.target.checked)}
                />
                Plan Active
              </label>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setPlanModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save Plan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Subscription / Complimentary / Create Invoice / Record Payment Modals */}
      {(assignSubOpen || compOpen) && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>
                {compOpen
                  ? "Grant Complimentary Subscription (Super Admin)"
                  : "Assign Subscription to Tenant"}
              </h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => {
                  setAssignSubOpen(false);
                  setCompOpen(false);
                }}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={compOpen ? handleComplimentary : handleAssignSub}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Customer Tenant</label>
                <select
                  className="platform-select"
                  required
                  value={selTenantId}
                  onChange={(e) => setSelTenantId(e.target.value)}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.industry})
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-field">
                <label>Plan</label>
                <select
                  className="platform-select"
                  required
                  value={selPlanId}
                  onChange={(e) => setSelPlanId(e.target.value)}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.currency} {p.price})
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-field">
                <label>Billing Cycle</label>
                <select
                  className="platform-select"
                  value={selCycle}
                  onChange={(e) =>
                    setSelCycle(e.target.value as "Monthly" | "Annual")
                  }
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              {compOpen ? (
                <>
                  <div className="platform-field">
                    <label>Duration Days</label>
                    <input
                      className="platform-input"
                      type="number"
                      min={1}
                      max={3650}
                      value={selDurationDays}
                      onChange={(e) => setSelDurationDays(Number(e.target.value))}
                    />
                  </div>
                  <div className="platform-field">
                    <label>Reason</label>
                    <textarea
                      className="platform-textarea"
                      required
                      minLength={3}
                      value={selReason}
                      onChange={(e) => setSelReason(e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="platform-field">
                  <label>Status</label>
                  <select
                    className="platform-select"
                    value={selStatus}
                    onChange={(e) => setSelStatus(e.target.value)}
                  >
                    <option value="Active">Active</option>
                    <option value="Trial">Trial</option>
                    <option value="Past Due">Past Due</option>
                    <option value="Suspended">Suspended</option>
                  </select>
                </div>
              )}
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => {
                    setAssignSubOpen(false);
                    setCompOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Applying..." : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {invModalOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Create Manual Invoice</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setInvModalOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreateInvoice}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Customer Tenant</label>
                <select
                  className="platform-select"
                  required
                  value={selTenantId}
                  onChange={(e) => setSelTenantId(e.target.value)}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Base Amount</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    required
                    value={invAmount}
                    onChange={(e) => setInvAmount(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Tax Amount</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={0}
                    value={invTax}
                    onChange={(e) => setInvTax(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="platform-field">
                <label>Notes</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={invNotes}
                  onChange={(e) => setInvNotes(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setInvModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  Create Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payModalOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Record Payment Against Invoice</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setPayModalOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleRecordPayment}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Invoice</label>
                <select
                  className="platform-select"
                  required
                  value={payInvoiceId}
                  onChange={(e) => setPayInvoiceId(e.target.value)}
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} — {inv.company_name || inv.tenant_id} (
                      {inv.currency} {inv.total_amount})
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Transaction Reference</label>
                  <input
                    className="platform-input"
                    required
                    minLength={2}
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Amount</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Provider</label>
                  <input
                    className="platform-input"
                    value={payProvider}
                    onChange={(e) => setPayProvider(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Method</label>
                  <input
                    className="platform-input"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  />
                </div>
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setPayModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {refundOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Create Refund Request</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setRefundOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreateRefund}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Invoice</label>
                <select
                  className="platform-select"
                  required
                  value={refInvId}
                  onChange={(e) => setRefInvId(e.target.value)}
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number} — Paid {inv.paid_amount} {inv.currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-field">
                <label>Refund Amount</label>
                <input
                  className="platform-input"
                  type="number"
                  min={1}
                  required
                  value={refAmt}
                  onChange={(e) => setRefAmt(Number(e.target.value))}
                />
              </div>
              <div className="platform-field">
                <label>Reason</label>
                <textarea
                  className="platform-textarea"
                  required
                  minLength={3}
                  rows={3}
                  value={refReason}
                  onChange={(e) => setRefReason(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setRefundOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  Submit Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
