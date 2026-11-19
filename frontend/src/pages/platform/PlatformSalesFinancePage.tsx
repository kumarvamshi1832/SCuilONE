import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pagination } from "../../components/common/Pagination";
import {
  CheckCircleIcon,
  EditIcon,
  PlusIcon,
  RefreshIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformFinanceOverview,
  PlatformSalesProspect,
} from "../../types/platform";
import "./PlatformPages.css";

const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Qualified",
  "Unqualified",
  "Converted",
];
const PIPELINE_STAGES = [
  "New",
  "Qualified",
  "Demo",
  "Negotiation",
  "Won",
  "Lost",
];
const INTEREST_LEVELS = ["Low", "Medium", "High"];
const ONBOARDING_STATUSES = [
  "Not Started",
  "Setup In Progress",
  "Initial Configuration",
  "Handed Over to Support",
  "Completed",
];
const INDUSTRY_TYPES = [
  "real-estate",
  "software-company",
  "education-consulting",
  "training-institute",
  "digital-marketing-agency",
  "insurance-agency",
  "healthcare",
  "e-commerce",
  "manufacturing",
  "logistics",
];

export default function PlatformSalesFinancePage() {
  const canViewSales = hasPlatformPermission("platform.sales.view");
  const canManageSales = hasPlatformPermission("platform.sales.manage");
  const canViewFinance = hasPlatformPermission("platform.finance.view");
  const canManageFinance = hasPlatformPermission("platform.finance.manage");
  const canViewBilling = hasPlatformPermission("platform.billing.view");

  const [searchParams, setSearchParams] = useSearchParams();
  const resolveSalesFinanceTab = (
    requested: string | null
  ): "sales" | "finance" => {
    if (requested === "finance" && canViewFinance) return "finance";
    if (requested === "sales" && canViewSales) return "sales";
    return canViewSales ? "sales" : "finance";
  };

  const [tab, setTab] = useState<"sales" | "finance">(() =>
    resolveSalesFinanceTab(searchParams.get("tab"))
  );

  useEffect(() => {
    const nextTab = resolveSalesFinanceTab(searchParams.get("tab"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams, canViewSales, canViewFinance]);

  const handleSelectTab = (nextTab: "sales" | "finance") => {
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

  // Sales
  const [prospects, setProspects] = useState<PlatformSalesProspect[]>([]);
  const [stageFilter, setStageFilter] = useState("");
  const [onboardingFilter, setOnboardingFilter] = useState("");
  const [salesPage, setSalesPage] = useState(1);

  const [createProspectOpen, setCreateProspectOpen] = useState(false);
  const [editProspect, setEditProspect] = useState<PlatformSalesProspect | null>(
    null
  );
  const [pCompany, setPCompany] = useState("");
  const [pContactName, setPContactName] = useState("");
  const [pContactEmail, setPContactEmail] = useState("");
  const [pPhone, setPPhone] = useState("");
  const [pIndustry, setPIndustry] = useState("real-estate");
  const [pLeadStatus, setPLeadStatus] = useState("New");
  const [pStage, setPStage] = useState("New");
  const [pInterest, setPInterest] = useState("Medium");
  const [pMrr, setPMrr] = useState(4999);
  const [pPlan, setPPlan] = useState("Starter");
  const [pOnboarding, setPOnboarding] = useState("Not Started");
  const [pDemoOutcome, setPDemoOutcome] = useState("");
  const [pNotes, setPNotes] = useState("");

  // Finance
  const [finance, setFinance] = useState<PlatformFinanceOverview | null>(null);
  const [unreconciledPayments, setUnreconciledPayments] = useState<any[]>([]);
  const [expOpen, setExpOpen] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expCategory, setExpCategory] = useState("Operations");
  const [expIndustry, setExpIndustry] = useState("");
  const [expAmount, setExpAmount] = useState(1000);
  const [expCurrency, setExpCurrency] = useState("INR");
  const [expDesc, setExpDesc] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSales = async () => {
    if (!canViewSales) return;
    setLoading(true);
    setError(null);
    try {
      const res = await platformService.listSalesProspects({
        pipeline_stage: stageFilter || undefined,
        onboarding_status: onboardingFilter || undefined,
      });
      setProspects(res.items || []);
      setSalesPage(1);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load sales prospects."));
    } finally {
      setLoading(false);
    }
  };

  const loadFinance = async () => {
    if (!canViewFinance) return;
    setLoading(true);
    setError(null);
    try {
      const [finRes, payRes] = await Promise.all([
        platformService.getFinanceOverview(),
        canViewBilling
          ? platformService.listPayments({ status: "Succeeded" }).catch(() => ({
              items: [],
            }))
          : Promise.resolve({ items: [] }),
      ]);
      setFinance(finRes);
      setUnreconciledPayments(
        (payRes.items || []).filter((p) => !p.reconciled)
      );
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load finance overview."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "sales") loadSales();
    else loadFinance();
  }, [tab, stageFilter, onboardingFilter]);

  const handleCreateProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.createSalesProspect({
        company_name: pCompany.trim(),
        contact_name: pContactName.trim(),
        contact_email: pContactEmail.trim(),
        contact_phone: pPhone.trim() || undefined,
        industry_type: pIndustry,
        lead_status: pLeadStatus,
        pipeline_stage: pStage,
        interest_level: pInterest,
        estimated_mrr: pMrr,
        recommended_plan: pPlan,
        notes: pNotes.trim() || undefined,
      });
      setSuccess(`Added prospect "${pCompany.trim()}".`);
      setCreateProspectOpen(false);
      await loadSales();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to create prospect."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProspect) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.updateSalesProspect(editProspect.id, {
        lead_status: pLeadStatus,
        pipeline_stage: pStage,
        interest_level: pInterest,
        estimated_mrr: pMrr,
        recommended_plan: pPlan,
        demo_outcome: pDemoOutcome.trim() || undefined,
        onboarding_status: pOnboarding,
        notes: pNotes.trim() || undefined,
      });
      setSuccess(`Updated prospect "${editProspect.company_name}".`);
      setEditProspect(null);
      await loadSales();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update prospect."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.createExpense({
        title: expTitle.trim(),
        category: expCategory.trim() || "Operations",
        industry_type: expIndustry || undefined,
        amount: expAmount,
        currency: expCurrency || "INR",
        description: expDesc.trim() || undefined,
      });
      setSuccess(`Created expense "${expTitle.trim()}".`);
      setExpOpen(false);
      setExpTitle("");
      setExpDesc("");
      await loadFinance();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to create expense."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpenseDecision = async (
    expenseId: string,
    statusVal: "Approved" | "Rejected" | "Paid" | "Reconciled"
  ) => {
    setError(null);
    setSuccess(null);
    try {
      await platformService.decideExpense(expenseId, {
        status: statusVal,
        ...(statusVal === "Reconciled" ? { reconciled: true } : {}),
      });
      setSuccess(`Expense updated to ${statusVal}.`);
      await loadFinance();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update expense."));
    }
  };

  const handleReconcilePayment = async (paymentId: string) => {
    setError(null);
    setSuccess(null);
    try {
      await platformService.reconcilePayment(paymentId);
      setSuccess("Payment reconciled successfully.");
      await loadFinance();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to reconcile payment."));
    }
  };

  const pageSize = 10;
  const pagedProspects = prospects.slice(
    (salesPage - 1) * pageSize,
    salesPage * pageSize
  );

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>Platform Sales Pipeline & Finance Operations</h2>
          <p>
            Manage CRM SaaS prospects, demos, customer onboarding, team budgets,
            expenses, and payment reconciliation.
          </p>
        </div>
        <div className="platform-actions-row">
          <button
            type="button"
            className="platform-btn"
            onClick={() => (tab === "sales" ? loadSales() : loadFinance())}
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {tab === "sales" && canManageSales && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => {
                setPCompany("");
                setPContactName("");
                setPContactEmail("");
                setPPhone("");
                setPLeadStatus("New");
                setPStage("New");
                setPInterest("Medium");
                setPMrr(4999);
                setPNotes("");
                setCreateProspectOpen(true);
              }}
            >
              <PlusIcon size={15} />
              <span>Add Prospect</span>
            </button>
          )}
          {tab === "finance" && canManageFinance && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => setExpOpen(true)}
            >
              <PlusIcon size={15} />
              <span>Record Expense</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      <div className="platform-tabs">
        {canViewSales && (
          <button
            type="button"
            className={`platform-tab ${tab === "sales" ? "active" : ""}`}
            onClick={() => handleSelectTab("sales")}
          >
            Sales Prospects ({prospects.length})
          </button>
        )}
        {canViewFinance && (
          <button
            type="button"
            className={`platform-tab ${tab === "finance" ? "active" : ""}`}
            onClick={() => handleSelectTab("finance")}
          >
            Finance, Budgets & Expenses
          </button>
        )}
      </div>

      {tab === "sales" && canViewSales && (
        <>
          <div className="platform-filter-bar">
            <select
              className="platform-select"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
            >
              <option value="">All Pipeline Stages</option>
              {PIPELINE_STAGES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
            <select
              className="platform-select"
              value={onboardingFilter}
              onChange={(e) => setOnboardingFilter(e.target.value)}
            >
              <option value="">All Onboarding Statuses</option>
              {ONBOARDING_STATUSES.map((ob) => (
                <option key={ob} value={ob}>
                  {ob}
                </option>
              ))}
            </select>
          </div>

          <div className="platform-card">
            {loading ? (
              <div className="platform-empty">Loading sales prospects...</div>
            ) : prospects.length === 0 ? (
              <div className="platform-empty">No sales prospects found.</div>
            ) : (
              <>
                <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Company & Contact</th>
                        <th>Industry</th>
                        <th>Stage & Interest</th>
                        <th>Est. MRR / Plan</th>
                        <th>Onboarding</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedProspects.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.company_name}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {p.contact_name} • {p.contact_email}
                            </div>
                          </td>
                          <td>{p.industry_key}</td>
                          <td>
                            <span className="platform-badge indigo">
                              {p.pipeline_stage}
                            </span>{" "}
                            <span className="platform-badge">
                              {p.lead_status}
                            </span>{" "}
                            <span className="platform-badge yellow">
                              {p.interest_level}
                            </span>
                          </td>
                          <td>
                            <strong>₹{p.estimated_mrr}</strong>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {p.recommended_plan || "—"}
                            </div>
                          </td>
                          <td>
                            <span className="platform-badge blue">
                              {p.onboarding_status}
                            </span>
                          </td>
                          <td>
                            {canManageSales && (
                              <button
                                type="button"
                                className="platform-btn sm"
                                onClick={() => {
                                  setEditProspect(p);
                                  setPLeadStatus(p.lead_status);
                                  setPStage(p.pipeline_stage);
                                  setPInterest(p.interest_level);
                                  setPMrr(Number(p.estimated_mrr || 0));
                                  setPPlan(p.recommended_plan || "Starter");
                                  setPDemoOutcome(p.demo_outcome || "");
                                  setPOnboarding(p.onboarding_status || "Not Started");
                                  setPNotes(p.notes || "");
                                }}
                              >
                                <EditIcon size={13} />
                                <span>Update</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={salesPage}
                  totalItems={prospects.length}
                  pageSize={pageSize}
                  onPageChange={setSalesPage}
                  entityName="prospects"
                />
              </>
            )}
          </div>
        </>
      )}

      {tab === "finance" && canViewFinance && (
        <>
          {finance && (
            <div className="platform-kpi-grid">
              <div className="platform-kpi-card">
                <div className="platform-kpi-label">Allocated Budget</div>
                <div className="platform-kpi-value">₹{finance.allocated_budget}</div>
                <div className="platform-kpi-sub">
                  Scope: {finance.industry_key || "Global"}
                </div>
              </div>
              <div className="platform-kpi-card">
                <div className="platform-kpi-label">Spent / Remaining</div>
                <div className="platform-kpi-value">₹{finance.spent_budget}</div>
                <div className="platform-kpi-sub">
                  Remaining: ₹{finance.remaining_budget}
                </div>
              </div>
              <div className="platform-kpi-card">
                <div className="platform-kpi-label">Approved Expenses</div>
                <div className="platform-kpi-value">
                  ₹{finance.approved_expenses_total}
                </div>
                <div className="platform-kpi-sub">
                  Pending: ₹{finance.pending_expenses_total}
                </div>
              </div>
              {finance.subscription_revenue_total !== null && (
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Revenue / Net</div>
                  <div className="platform-kpi-value">
                    ₹{finance.subscription_revenue_total}
                  </div>
                  <div className="platform-kpi-sub">
                    Net: ₹{finance.net_position} • Unreconciled:{" "}
                    {finance.unreconciled_payments_count}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="platform-card">
            <div className="platform-card-title">
              <span>Expense Requests & Approvals</span>
            </div>
            {loading ? (
              <div className="platform-empty">Loading expenses...</div>
            ) : !finance || finance.expenses.length === 0 ? (
              <div className="platform-empty">No expenses recorded yet.</div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Ref & Title</th>
                      <th>Category / Industry</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finance.expenses.map((exp) => (
                      <tr key={exp.id}>
                        <td>
                          <strong>{exp.title}</strong>
                          <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                            {exp.expense_number} • {exp.expense_date}
                          </div>
                        </td>
                        <td>
                          {exp.category}{" "}
                          {exp.industry_key ? `• ${exp.industry_key}` : ""}
                        </td>
                        <td>
                          <strong>
                            {exp.currency} {exp.amount}
                          </strong>
                        </td>
                        <td>
                          <span
                            className={`platform-badge ${
                              exp.status === "Reconciled" || exp.status === "Paid"
                                ? "green"
                                : exp.status === "Rejected"
                                ? "red"
                                : "yellow"
                            }`}
                          >
                            {exp.status}
                          </span>
                        </td>
                        <td>
                          {canManageFinance && (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {exp.status === "Pending" && (
                                <>
                                  <button
                                    type="button"
                                    className="platform-btn sm success"
                                    onClick={() =>
                                      handleExpenseDecision(exp.id, "Approved")
                                    }
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="platform-btn sm danger"
                                    onClick={() =>
                                      handleExpenseDecision(exp.id, "Rejected")
                                    }
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {exp.status === "Approved" && (
                                <button
                                  type="button"
                                  className="platform-btn sm primary"
                                  onClick={() =>
                                    handleExpenseDecision(exp.id, "Paid")
                                  }
                                >
                                  Mark Paid
                                </button>
                              )}
                              {exp.status === "Paid" && !exp.reconciled && (
                                <button
                                  type="button"
                                  className="platform-btn sm success"
                                  onClick={() =>
                                    handleExpenseDecision(exp.id, "Reconciled")
                                  }
                                >
                                  Reconcile
                                </button>
                              )}
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

          {unreconciledPayments.length > 0 && canManageFinance && (
            <div className="platform-card">
              <div className="platform-card-title">
                <span>Unreconciled Succeeded Payments</span>
              </div>
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Provider / Method</th>
                      <th>Amount</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unreconciledPayments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.transaction_reference}</td>
                        <td>
                          {p.provider} • {p.payment_method}
                        </td>
                        <td>
                          {p.currency} {p.amount}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="platform-btn sm success"
                            onClick={() => handleReconcilePayment(p.id)}
                          >
                            <CheckCircleIcon size={13} />
                            <span>Reconcile Payment</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Prospect Modal */}
      {createProspectOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Add Sales Prospect</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setCreateProspectOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreateProspect}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Company Name</label>
                  <input
                    className="platform-input"
                    required
                    value={pCompany}
                    onChange={(e) => setPCompany(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Contact Name</label>
                  <input
                    className="platform-input"
                    required
                    value={pContactName}
                    onChange={(e) => setPContactName(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Contact Email</label>
                  <input
                    className="platform-input"
                    type="email"
                    required
                    value={pContactEmail}
                    onChange={(e) => setPContactEmail(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Contact Phone</label>
                  <input
                    className="platform-input"
                    value={pPhone}
                    onChange={(e) => setPPhone(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Industry</label>
                  <select
                    className="platform-select"
                    value={pIndustry}
                    onChange={(e) => setPIndustry(e.target.value)}
                  >
                    {INDUSTRY_TYPES.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Estimated MRR</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={0}
                    value={pMrr}
                    onChange={(e) => setPMrr(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Lead Status</label>
                  <select
                    className="platform-select"
                    value={pLeadStatus}
                    onChange={(e) => setPLeadStatus(e.target.value)}
                  >
                    {LEAD_STATUSES.map((ls) => (
                      <option key={ls} value={ls}>
                        {ls}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Pipeline Stage</label>
                  <select
                    className="platform-select"
                    value={pStage}
                    onChange={(e) => setPStage(e.target.value)}
                  >
                    {PIPELINE_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="platform-field">
                <label>Notes</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={pNotes}
                  onChange={(e) => setPNotes(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setCreateProspectOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Create Prospect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Prospect Modal */}
      {editProspect && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Update Prospect: {editProspect.company_name}</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setEditProspect(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleUpdateProspect}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Lead Status</label>
                  <select
                    className="platform-select"
                    value={pLeadStatus}
                    onChange={(e) => setPLeadStatus(e.target.value)}
                  >
                    {LEAD_STATUSES.map((ls) => (
                      <option key={ls} value={ls}>
                        {ls}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Pipeline Stage</label>
                  <select
                    className="platform-select"
                    value={pStage}
                    onChange={(e) => setPStage(e.target.value)}
                  >
                    {PIPELINE_STAGES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Interest Level</label>
                  <select
                    className="platform-select"
                    value={pInterest}
                    onChange={(e) => setPInterest(e.target.value)}
                  >
                    {INTEREST_LEVELS.map((il) => (
                      <option key={il} value={il}>
                        {il}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Onboarding Status</label>
                  <select
                    className="platform-select"
                    value={pOnboarding}
                    onChange={(e) => setPOnboarding(e.target.value)}
                  >
                    {ONBOARDING_STATUSES.map((ob) => (
                      <option key={ob} value={ob}>
                        {ob}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Estimated MRR</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={0}
                    value={pMrr}
                    onChange={(e) => setPMrr(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Demo Outcome</label>
                  <input
                    className="platform-input"
                    value={pDemoOutcome}
                    onChange={(e) => setPDemoOutcome(e.target.value)}
                  />
                </div>
              </div>
              <div className="platform-field">
                <label>Notes</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={pNotes}
                  onChange={(e) => setPNotes(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setEditProspect(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Updating..." : "Save Prospect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Expense Modal */}
      {expOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Record Platform / Team Expense</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setExpOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreateExpense}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Expense Title</label>
                  <input
                    className="platform-input"
                    required
                    value={expTitle}
                    onChange={(e) => setExpTitle(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Category</label>
                  <input
                    className="platform-input"
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Industry Team (optional)</label>
                  <select
                    className="platform-select"
                    value={expIndustry}
                    onChange={(e) => setExpIndustry(e.target.value)}
                  >
                    <option value="">Central Platform</option>
                    {INDUSTRY_TYPES.map((ind) => (
                      <option key={ind} value={ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="platform-field">
                  <label>Amount</label>
                  <input
                    className="platform-input"
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(Number(e.target.value))}
                  />
                </div>
                <div className="platform-field">
                  <label>Currency</label>
                  <input
                    className="platform-input"
                    value={expCurrency}
                    onChange={(e) => setExpCurrency(e.target.value)}
                  />
                </div>
              </div>
              <div className="platform-field">
                <label>Description</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={expDesc}
                  onChange={(e) => setExpDesc(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setExpOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

