import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileTextIcon,
  RefreshIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  XIcon,
  SearchIcon,
  ShieldCheckIcon,
  PlusIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalEstimates,
  getPortalEstimate,
  acceptPortalEstimate,
  rejectPortalEstimate,
  ESTIMATE_STATUS_OPTIONS,
  isEstimatePendingApproval,
} from "../../services/customerPortalCommercialService";
import {
  CustomerPortalNotificationService,
  resolvePortalTenantId,
} from "../../services/customerPortalNotificationService";
import { createSoftwareEstimate } from "../../services/softwareEstimateService";
import { getPortalTenantId } from "../../services/customerPortalAuthService";
import type { PortalEstimate } from "../../types/customerPortal";
import type { SoftwareBillingType, SoftwareEstimateItemCreate } from "../../types/softwareEstimate";
import "./CustomerPortalTickets.css";

export default function CustomerPortalEstimates() {
  const [searchParams, setSearchParams] = useSearchParams();
  const targetEstimateId = searchParams.get("id") || searchParams.get("estimateId");

  const [estimates, setEstimates] = useState<PortalEstimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Selected Detail Modal
  const [selectedEstimate, setSelectedEstimate] = useState<PortalEstimate | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Decision Modal
  const [decisionType, setDecisionType] = useState<"accept" | "reject" | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Create Estimate Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{
    title: string;
    description: string;
    billing_type: SoftwareBillingType;
    currency: string;
    discount_amount: number;
    items: SoftwareEstimateItemCreate[];
  }>({
    title: "",
    description: "",
    billing_type: "Fixed Price",
    currency: "INR",
    discount_amount: 0,
    items: [
      {
        item_name: "Initial Discovery & Architecture",
        description: "Requirements analysis, architecture design, and sprint roadmap",
        quantity: 1,
        unit_price: 50000,
        tax_percent: 18,
        discount_percent: 0,
      },
    ],
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchEstimates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalEstimates(statusFilter || undefined);
      setEstimates(data || []);
    } catch (err: any) {
      console.error("Failed to load estimates:", err);
      setError(err?.response?.data?.detail || "Unable to load proposals and estimates.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchEstimates();

    const handleWorkspaceSwitch = () => {
      fetchEstimates();
    };
    window.addEventListener("portal:workspace-switched", handleWorkspaceSwitch);
    return () => {
      window.removeEventListener("portal:workspace-switched", handleWorkspaceSwitch);
    };
  }, [fetchEstimates]);

  const handleOpenDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await getPortalEstimate(id);
      setSelectedEstimate(data);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to load estimate details.", "error");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Handle deep linking by estimate ID
  useEffect(() => {
    if (targetEstimateId && !loading) {
      handleOpenDetail(targetEstimateId);
    }
  }, [targetEstimateId, loading, handleOpenDetail]);

  const handleCloseDetail = () => {
    setSelectedEstimate(null);
    if (searchParams.get("id") || searchParams.get("estimateId")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("id");
      nextParams.delete("estimateId");
      setSearchParams(nextParams);
    }
  };

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEstimate || !decisionType) return;
    setSubmittingDecision(true);
    try {
      let updated: PortalEstimate;
      const activeTenant = resolvePortalTenantId(getPortalTenantId() || undefined);
      if (decisionType === "accept") {
        updated = await acceptPortalEstimate(selectedEstimate.id, decisionNotes.trim() || null);
        showToast(`Estimate #${updated.estimate_number} accepted successfully!`, "success");
        CustomerPortalNotificationService.notifyEstimateDecision(activeTenant, updated, "accepted");
      } else {
        updated = await rejectPortalEstimate(selectedEstimate.id, decisionNotes.trim() || null);
        showToast(`Estimate #${updated.estimate_number} rejected.`, "success");
        CustomerPortalNotificationService.notifyEstimateDecision(activeTenant, updated, "rejected");
      }
      setSelectedEstimate(updated);
      setDecisionType(null);
      setDecisionNotes("");
      fetchEstimates();
      window.dispatchEvent(new CustomEvent("portal:workspace-switched"));
    } catch (err: any) {
      console.error("Decision error:", err);
      showToast(err?.response?.data?.detail || "Unable to submit your decision on this proposal.", "error");
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleCreateEstimateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      showToast("Please provide an estimate title.", "error");
      return;
    }
    setCreating(true);
    try {
      const activeTenant = resolvePortalTenantId(getPortalTenantId() || undefined);
      const created = await createSoftwareEstimate({
        software_requirement_id: "00000000-0000-0000-0000-000000000000",
        title: createForm.title.trim(),
        description: createForm.description?.trim() || undefined,
        billing_type: createForm.billing_type,
        currency: createForm.currency,
        discount_amount: createForm.discount_amount,
        items: createForm.items,
      });
      showToast(`Estimate #${created.estimate_number || created.id} created successfully!`, "success");
      CustomerPortalNotificationService.notifyEstimateCreated(activeTenant, created);
      setShowCreateModal(false);
      setCreateForm({
        title: "",
        description: "",
        billing_type: "Fixed Price",
        currency: "INR",
        discount_amount: 0,
        items: [
          {
            item_name: "Initial Discovery & Architecture",
            description: "Requirements analysis, architecture design, and sprint roadmap",
            quantity: 1,
            unit_price: 50000,
            tax_percent: 18,
            discount_percent: 0,
          },
        ],
      });
      fetchEstimates();
    } catch (err: any) {
      console.error("Failed to create estimate:", err);
      showToast(err?.response?.data?.detail || "Failed to create estimate.", "error");
    } finally {
      setCreating(false);
    }
  };

  const filtered = estimates.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.estimate_number.toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q) ||
      (e.description && e.description.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    if (isEstimatePendingApproval(status)) {
      return <span className="badge-status status-waiting">Pending Approval</span>;
    }
    const s = status ? status.trim().toLowerCase() : "";
    if (s === "accepted") {
      return <span className="badge-status status-resolved">Accepted</span>;
    }
    if (s === "rejected") {
      return <span className="badge-status status-closed">Rejected</span>;
    }
    if (s === "expired") {
      return (
        <span className="badge-status" style={{ background: "rgba(100, 116, 139, 0.12)", color: "#64748b" }}>
          Expired
        </span>
      );
    }
    return <span className="badge-status">{status}</span>;
  };

  return (
    <div className="cp-tickets-page">
      {toast && (
        <div className={`support-alert ${toast.type}`}>
          {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="cp-tickets-header">
        <div>
          <h1>Software Estimates & Proposals</h1>
          <p>
            Review commercial proposals, inspect line items, and approve or reject revisions directly.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-secondary" onClick={fetchEstimates} title="Refresh estimates">
            <RefreshIcon size={16} />
            <span>Refresh</span>
          </button>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <PlusIcon size={16} />
            <span>Create Estimate</span>
          </button>
        </div>
      </div>

      <div className="cp-tickets-toolbar">
        <div className="cp-search-box" style={{ flex: 1 }}>
          <SearchIcon size={16} className="cp-search-icon" />
          <input
            type="text"
            placeholder="Search by estimate #, title or keyword..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="cp-filters-group">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="cp-select"
          >
            <option value="">All Statuses</option>
            {ESTIMATE_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {statusFilter && (
            <button className="btn-secondary" onClick={() => setStatusFilter("")}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="cp-tickets-card">
        {error ? (
          <div className="support-alert error">
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#64748b" }}>
            <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 10px" }} />
            <div>Loading proposals...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cp-empty-state">
            <FileTextIcon size={36} style={{ color: "#94a3b8", margin: "0 auto 12px" }} />
            <h3>No estimates found</h3>
            <p>There are no commercial proposals available matching your filters.</p>
          </div>
        ) : (
          <div className="cp-table-responsive">
            <table className="cp-tickets-table">
              <thead>
                <tr>
                  <th>Estimate #</th>
                  <th>Rev</th>
                  <th>Title</th>
                  <th>Billing Type</th>
                  <th>Status</th>
                  <th>Issue Date</th>
                  <th>Expiry Date</th>
                  <th>Total Amount</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "var(--cp-accent)" }}>{item.estimate_number}</strong>
                    </td>
                    <td>v{item.revision_number}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      {item.description && (
                        <small style={{ color: "var(--cp-text-muted)" }}>
                          {item.description.slice(0, 60)}
                          {item.description.length > 60 ? "..." : ""}
                        </small>
                      )}
                    </td>
                    <td>{item.billing_type}</td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td style={{ color: "var(--cp-text-muted)", fontSize: "0.8125rem" }}>{item.issue_date}</td>
                    <td style={{ color: "var(--cp-text-muted)", fontSize: "0.8125rem" }}>{item.expiry_date || "—"}</td>
                    <td style={{ fontWeight: 700 }}>
                      {item.currency} {Number(item.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleOpenDetail(item.id)}
                        disabled={loadingDetail}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Estimate Details Modal */}
      {selectedEstimate && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 760, width: "100%" }}>
            <div className="modal-header">
              <div>
                <h2>
                  Estimate #{selectedEstimate.estimate_number} (Rev {selectedEstimate.revision_number})
                </h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 2 }}>
                  {selectedEstimate.title} &bull; {getStatusBadge(selectedEstimate.status)}
                </div>
              </div>
              <button className="modal-close-btn" onClick={handleCloseDetail}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {/* Proposal Overview */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Billing Type</small>
                  <strong>{selectedEstimate.billing_type}</strong>
                </div>
                {selectedEstimate.hourly_rate && (
                  <div>
                    <small style={{ color: "#64748b", display: "block" }}>Hourly Rate</small>
                    <strong>{selectedEstimate.currency} {Number(selectedEstimate.hourly_rate).toFixed(2)}/hr</strong>
                  </div>
                )}
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Issue Date</small>
                  <strong>{selectedEstimate.issue_date}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Valid Until</small>
                  <strong>{selectedEstimate.expiry_date || "No Expiry"}</strong>
                </div>
              </div>

              {selectedEstimate.description && (
                <div style={{ marginBottom: 20 }}>
                  <small style={{ color: "#64748b", display: "block", marginBottom: 4 }}>Proposal Scope & Notes</small>
                  <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                    {selectedEstimate.description}
                  </p>
                </div>
              )}

              {/* Line Items Table */}
              <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "16px 0 8px 0" }}>
                Proposed Line Items
              </h3>
              <div className="cp-table-responsive" style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 16 }}>
                <table className="cp-tickets-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Discount</th>
                      <th>Tax</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEstimate.items?.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <strong>{it.item_name}</strong>
                          {it.description && <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{it.description}</div>}
                        </td>
                        <td>{Number(it.quantity)}</td>
                        <td>{selectedEstimate.currency} {Number(it.unit_price).toFixed(2)}</td>
                        <td>{Number(it.discount_percent)}%</td>
                        <td>{Number(it.tax_percent)}%</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {selectedEstimate.currency} {Number(it.line_total).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
                <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 6, fontSize: "0.875rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--cp-text-muted)" }}>Subtotal:</span>
                    <strong>{selectedEstimate.currency} {Number(selectedEstimate.subtotal).toFixed(2)}</strong>
                  </div>
                  {Number(selectedEstimate.discount_amount) > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981" }}>
                      <span>Discount:</span>
                      <strong>- {selectedEstimate.currency} {Number(selectedEstimate.discount_amount).toFixed(2)}</strong>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--cp-text-muted)" }}>Tax Amount:</span>
                    <strong>{selectedEstimate.currency} {Number(selectedEstimate.tax_amount).toFixed(2)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--cp-border)", paddingTop: 6, fontSize: "1rem" }}>
                    <span>Total Amount:</span>
                    <strong style={{ color: "var(--cp-accent)" }}>
                      {selectedEstimate.currency} {Number(selectedEstimate.total_amount).toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>

              {selectedEstimate.terms_and_conditions && (
                <div style={{ background: "var(--cp-surface-2)", border: "1px solid var(--cp-border)", padding: 14, borderRadius: 8, fontSize: "0.8125rem", color: "var(--cp-text-muted)", marginBottom: 20 }}>
                  <strong style={{ color: "var(--cp-text)", display: "block", marginBottom: 4 }}>Terms & Conditions:</strong>
                  <div style={{ whiteSpace: "pre-wrap" }}>{selectedEstimate.terms_and_conditions}</div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn-secondary" onClick={handleCloseDetail}>
                Close
              </button>

              {/* Accept & Reject buttons shown only if status is Sent / Pending Approval */}
              {isEstimatePendingApproval(selectedEstimate.status) && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                    onClick={() => setDecisionType("reject")}
                  >
                    Reject Proposal
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ background: "#16a34a" }}
                    onClick={() => setDecisionType("accept")}
                  >
                    <ShieldCheckIcon size={16} />
                    <span>Accept Proposal</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {decisionType && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>
                {decisionType === "accept" ? "Accept Estimate Proposal" : "Reject Estimate Proposal"}
              </h2>
              <button
                className="modal-close-btn"
                onClick={() => setDecisionType(null)}
                disabled={submittingDecision}
              >
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleDecisionSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 14px 0" }}>
                  {decisionType === "accept"
                    ? "By accepting this estimate, you confirm approval of the proposed line items, scope of work, and pricing schedule."
                    : "Please provide feedback on why this proposal is rejected so our team can revise line items or pricing."}
                </p>
                <div className="form-group">
                  <label>{decisionType === "accept" ? "Optional Notes" : "Feedback & Revision Reason *"}</label>
                  <textarea
                    rows={4}
                    required={decisionType === "reject"}
                    placeholder={decisionType === "accept" ? "Add any project kickoff notes or procurement PO references..." : "Describe required changes..."}
                    value={decisionNotes}
                    onChange={(e) => setDecisionNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submittingDecision}
                  onClick={() => setDecisionType(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingDecision}
                  style={{ background: decisionType === "accept" ? "#16a34a" : "#dc2626" }}
                >
                  <span>
                    {submittingDecision
                      ? "Submitting..."
                      : decisionType === "accept"
                        ? "Confirm Acceptance"
                        : "Confirm Rejection"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Estimate Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal-dialog" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>Create New Software Estimate</h2>
              <button
                className="modal-close-btn"
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
              >
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateEstimateSubmit}>
              <div className="modal-body" style={{ maxHeight: "70vh", overflowY: "auto" }}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mobile App Redesign Proposal"
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div className="form-group">
                    <label>Billing Type</label>
                    <select
                      value={createForm.billing_type}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          billing_type: e.target.value as SoftwareBillingType,
                        })
                      }
                      className="cp-select"
                      style={{ width: "100%" }}
                    >
                      <option value="Fixed Price">Fixed Price</option>
                      <option value="Time & Material">Time & Material</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Currency</label>
                    <select
                      value={createForm.currency || "INR"}
                      onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
                      className="cp-select"
                      style={{ width: "100%" }}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Description & Scope Summary</label>
                  <textarea
                    rows={3}
                    placeholder="Brief description of the proposed project scope..."
                    value={createForm.description || ""}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  />
                </div>

                <h4 style={{ margin: "16px 0 8px 0", fontSize: "0.9375rem" }}>Line Items</h4>
                {createForm.items?.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      background: "var(--cp-surface-2)",
                      borderRadius: 6,
                      border: "1px solid var(--cp-border)",
                      marginBottom: 10,
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 8 }}>
                      <div>
                        <label style={{ fontSize: "0.75rem", display: "block", color: "var(--cp-text-muted)" }}>
                          Item Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={item.item_name}
                          onChange={(e) => {
                            const newItems = [...createForm.items];
                            const cur = newItems[idx];
                            if (!cur) return;
                            newItems[idx] = {
                              ...cur,
                              item_name: e.target.value,
                            };
                            setCreateForm({ ...createForm, items: newItems });
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.75rem", display: "block", color: "var(--cp-text-muted)" }}>
                          Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const newItems = [...createForm.items];
                            const cur = newItems[idx];
                            if (!cur) return;
                            newItems[idx] = {
                              ...cur,
                              quantity: Number(e.target.value) || 1,
                            };
                            setCreateForm({ ...createForm, items: newItems });
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.75rem", display: "block", color: "var(--cp-text-muted)" }}>
                          Unit Price
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={item.unit_price}
                          onChange={(e) => {
                            const newItems = [...createForm.items];
                            const cur = newItems[idx];
                            if (!cur) return;
                            newItems[idx] = {
                              ...cur,
                              unit_price: Number(e.target.value) || 0,
                            };
                            setCreateForm({ ...createForm, items: newItems });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={creating}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  <span>{creating ? "Submitting..." : "Create Estimate"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
