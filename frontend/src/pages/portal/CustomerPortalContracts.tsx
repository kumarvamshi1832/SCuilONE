import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldIcon,
  RefreshIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  XIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalContracts,
  getPortalContract,
  signPortalContract,
} from "../../services/customerPortalCommercialService";
import type { PortalContract } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";

const CONTRACT_STATUSES = [
  "Sent",
  "Under Review",
  "Signed",
  "Active",
  "Completed",
  "Terminated",
  "Expired",
];

export default function CustomerPortalContracts() {
  const [contracts, setContracts] = useState<PortalContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Selected Detail Modal
  const [selectedContract, setSelectedContract] = useState<PortalContract | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Sign Modal
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signNotes, setSignNotes] = useState("");
  const [submittingSign, setSubmittingSign] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalContracts();
      setContracts(data || []);
    } catch (err: any) {
      console.error("Failed to load contracts:", err);
      setError(err?.response?.data?.detail || "Unable to load customer contracts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const handleOpenDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await getPortalContract(id);
      setSelectedContract(data);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to load contract details.", "error");
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedContract || !signerName.trim()) {
      showToast("Signer name is required to execute the agreement.", "error");
      return;
    }

    setSubmittingSign(true);
    try {
      const updated = await signPortalContract(selectedContract.id, {
        signer_name: signerName.trim(),
        signer_title: signerTitle.trim() || null,
        notes: signNotes.trim() || null,
      });
      showToast(`Contract #${updated.contract_number} has been signed successfully!`, "success");
      setSelectedContract(updated);
      setIsSignModalOpen(false);
      setSignerName("");
      setSignerTitle("");
      setSignNotes("");
      fetchContracts();
      window.dispatchEvent(new CustomEvent("portal:workspace-switched"));
    } catch (err: any) {
      console.error("Signing error:", err);
      showToast(err?.response?.data?.detail || "Failed to execute signature.", "error");
    } finally {
      setSubmittingSign(false);
    }
  };

  const filtered = contracts.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.contract_number.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Sent":
      case "Under Review":
        return <span className="badge-status status-waiting">{status}</span>;
      case "Signed":
      case "Active":
        return <span className="badge-status status-resolved">{status}</span>;
      case "Completed":
        return <span className="badge-status" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}>Completed</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
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
          <h1>Master Service Agreements & Contracts</h1>
          <p>
            Inspect deliverables, milestone payment schedules, and execute legal signatures on approved agreements.
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchContracts} title="Refresh contracts">
          <RefreshIcon size={16} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="cp-tickets-toolbar">
        <div className="cp-search-box" style={{ flex: 1 }}>
          <SearchIcon size={16} className="cp-search-icon" />
          <input
            type="text"
            placeholder="Search by contract #, title or keyword..."
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
            {CONTRACT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
            <div>Loading contracts...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cp-empty-state">
            <ShieldIcon size={36} style={{ color: "#94a3b8", margin: "0 auto 12px" }} />
            <h3>No contracts found</h3>
            <p>There are no contract agreements matching your filters.</p>
          </div>
        ) : (
          <div className="cp-table-responsive">
            <table className="cp-tickets-table">
              <thead>
                <tr>
                  <th>Contract #</th>
                  <th>Title</th>
                  <th>Billing Mode</th>
                  <th>Status</th>
                  <th>Issue Date</th>
                  <th>Start Date</th>
                  <th>Contract Value</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "#2563eb" }}>{item.contract_number}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      {item.description && (
                        <small style={{ color: "#64748b" }}>
                          {item.description.slice(0, 60)}
                          {item.description.length > 60 ? "..." : ""}
                        </small>
                      )}
                    </td>
                    <td>{item.milestone_billing_mode || item.billing_type}</td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td style={{ color: "#64748b", fontSize: "0.8125rem" }}>{item.issue_date}</td>
                    <td style={{ color: "#64748b", fontSize: "0.8125rem" }}>{item.start_date || "—"}</td>
                    <td style={{ fontWeight: 700 }}>
                      {item.currency} {Number(item.contract_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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

      {/* Contract Detail Modal */}
      {selectedContract && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 840, width: "100%" }}>
            <div className="modal-header">
              <div>
                <h2>Contract #{selectedContract.contract_number}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 2 }}>
                  {selectedContract.title} &bull; {getStatusBadge(selectedContract.status)}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedContract(null)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {/* Quick Info Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Contract Value</small>
                  <strong style={{ color: "#2563eb", fontSize: "1.1rem" }}>
                    {selectedContract.currency} {Number(selectedContract.contract_value).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Billing Type</small>
                  <strong>{selectedContract.billing_type}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Start Date</small>
                  <strong>{selectedContract.start_date || "—"}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Target End Date</small>
                  <strong>{selectedContract.end_date || "—"}</strong>
                </div>
                {selectedContract.signed_date && (
                  <div>
                    <small style={{ color: "#64748b", display: "block" }}>Signed On</small>
                    <strong style={{ color: "#16a34a" }}>{new Date(selectedContract.signed_date).toLocaleDateString()}</strong>
                  </div>
                )}
              </div>

              {/* Scope of Work */}
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 6px 0" }}>Scope of Work</h3>
                <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {selectedContract.scope_of_work}
                </div>
              </div>

              {/* Deliverables */}
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 6px 0" }}>Deliverables & Acceptance Criteria</h3>
                <div style={{ background: "rgba(0,0,0,0.02)", padding: 12, borderRadius: 8, fontSize: "0.875rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {selectedContract.deliverables}
                  {selectedContract.acceptance_criteria && (
                    <div style={{ marginTop: 8, borderTop: "1px solid #e2e8f0", paddingTop: 8 }}>
                      <strong>Acceptance Criteria:</strong> {selectedContract.acceptance_criteria}
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Milestones Table */}
              {selectedContract.payment_milestones && selectedContract.payment_milestones.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "0 0 8px 0" }}>
                    Payment Milestones Schedule
                  </h3>
                  <div className="cp-table-responsive" style={{ border: "1px solid #e2e8f0", borderRadius: 8 }}>
                    <table className="cp-tickets-table">
                      <thead>
                        <tr>
                          <th>Seq</th>
                          <th>Milestone Name</th>
                          <th>Percentage</th>
                          <th>Amount</th>
                          <th>Trigger Event</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedContract.payment_milestones.map((m) => (
                          <tr key={m.id}>
                            <td>#{m.sequence}</td>
                            <td><strong>{m.name}</strong></td>
                            <td>{Number(m.percentage)}%</td>
                            <td><strong>{selectedContract.currency} {Number(m.amount).toFixed(2)}</strong></td>
                            <td style={{ fontSize: "0.75rem", color: "#64748b" }}>{m.trigger_description || "—"}</td>
                            <td>{getStatusBadge(m.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Exclusions & Assumptions */}
              {(selectedContract.exclusions || selectedContract.assumptions) && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
                  {selectedContract.exclusions && (
                    <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      <strong style={{ color: "#0f172a", display: "block" }}>Exclusions:</strong>
                      <div style={{ whiteSpace: "pre-wrap" }}>{selectedContract.exclusions}</div>
                    </div>
                  )}
                  {selectedContract.assumptions && (
                    <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      <strong style={{ color: "#0f172a", display: "block" }}>Assumptions:</strong>
                      <div style={{ whiteSpace: "pre-wrap" }}>{selectedContract.assumptions}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Terms and Conditions */}
              {selectedContract.terms_and_conditions && (
                <div style={{ background: "rgba(0,0,0,0.02)", padding: 14, borderRadius: 8, fontSize: "0.8125rem", color: "#64748b" }}>
                  <strong style={{ color: "#0f172a", display: "block", marginBottom: 4 }}>Terms & Conditions:</strong>
                  <div style={{ whiteSpace: "pre-wrap" }}>{selectedContract.terms_and_conditions}</div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <button type="button" className="btn-secondary" onClick={() => setSelectedContract(null)}>
                Close
              </button>

              {/* Sign Contract action available only for Sent and Under Review statuses */}
              {["Sent", "Under Review"].includes(selectedContract.status) && (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: "#16a34a" }}
                  onClick={() => setIsSignModalOpen(true)}
                >
                  <ShieldCheckIcon size={16} />
                  <span>Execute & Sign Contract</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signature Execution Modal */}
      {isSignModalOpen && selectedContract && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }}>
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>Execute Legal Signature</h2>
              <button
                className="modal-close-btn"
                onClick={() => setIsSignModalOpen(false)}
                disabled={submittingSign}
              >
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleSignSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: "0.875rem", color: "#475569", margin: "0 0 14px 0" }}>
                  By signing, you legally acknowledge that you are an authorized representative of your organization and agree to the scope, milestones, and payment terms of Contract #{selectedContract.contract_number}.
                </p>

                <div className="form-group">
                  <label>Signer Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your legal full name"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Signer Job Title (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Chief Technology Officer, VP of Engineering"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Notes or Internal Reference (Optional)</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Approved per Procurement Purchase Order #PO-9418"
                    value={signNotes}
                    onChange={(e) => setSignNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={submittingSign}
                  onClick={() => setIsSignModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingSign || !signerName.trim()}
                  style={{ background: "#16a34a" }}
                >
                  <ShieldCheckIcon size={16} />
                  <span>{submittingSign ? "Executing Signature..." : "Sign Agreement"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

