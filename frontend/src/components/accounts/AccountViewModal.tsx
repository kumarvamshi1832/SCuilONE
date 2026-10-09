import { useState, useEffect } from "react";
import type { Account, AccountDetails } from "../../types/account";
import { User } from "../../types/user";
import { formatDateTime } from "../../utils/dateFormatter";
import { getAccountById } from "../../services/accountService";

interface AccountViewModalProps {
  account: Account;
  users: User[];
  onClose: () => void;
}

export default function AccountViewModal({ account, users, onClose }: AccountViewModalProps) {
  const [details, setDetails] = useState<AccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getAccountById(account.id)
      .then((data) => {
        setDetails(data);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load account details:", err);
        setError("Failed to load account details.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [account.id]);

  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((u) => u.id === userId);
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(Number(amount));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2>Account Details</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>Loading account details...</div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#e53e3e" }}>{error}</div>
          ) : details ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
              {/* Overview Section */}
              <section>
                <h3 style={{ marginBottom: "16px", fontSize: "1.1rem", color: "#2d3748", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Overview</h3>
                <div className="detail-grid">
                  <div className="detail-group">
                    <label className="text-muted">Account Name</label>
                    <p className="detail-value">{details.name || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Email</label>
                    <p className="detail-value">{details.email || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Phone</label>
                    <p className="detail-value">{details.phone || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Website</label>
                    <p className="detail-value">{details.website || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Industry</label>
                    <p className="detail-value">{details.industry || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Status</label>
                    <p className="detail-value">{details.status || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Source</label>
                    <p className="detail-value">{details.source || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Assigned To</label>
                    <p className="detail-value">{getAssignedUser(details.assigned_to)}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">City</label>
                    <p className="detail-value">{details.city || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">State</label>
                    <p className="detail-value">{details.state || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Country</label>
                    <p className="detail-value">{details.country || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Postal Code</label>
                    <p className="detail-value">{details.postal_code || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Address</label>
                    <p className="detail-value">{details.address || "—"}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Created At</label>
                    <p className="detail-value">{formatDateTime(details.created_at)}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Updated At</label>
                    <p className="detail-value">{formatDateTime(details.updated_at)}</p>
                  </div>
                </div>
                {details.notes && (
                  <div className="detail-group mt-4">
                    <label className="text-muted">Notes</label>
                    <div className="detail-value notes-box">
                      <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{details.notes}</p>
                    </div>
                  </div>
                )}
              </section>

              {/* Revenue Summary */}
              <section>
                <h3 style={{ marginBottom: "16px", fontSize: "1.1rem", color: "#2d3748", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Revenue Summary</h3>
                <div className="detail-grid">
                  <div className="detail-group">
                    <label className="text-muted">Total Deals</label>
                    <p className="detail-value" style={{ fontWeight: 600 }}>{details.total_deals}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Won Deals</label>
                    <p className="detail-value" style={{ fontWeight: 600, color: "#38a169" }}>{details.won_deals}</p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Total Revenue (Won)</label>
                    <p className="detail-value" style={{ fontWeight: 600, color: "#38a169" }}>{formatCurrency(details.total_revenue)}</p>
                  </div>
                </div>
              </section>

              {/* Related Deals */}
              <section>
                <h3 style={{ marginBottom: "16px", fontSize: "1.1rem", color: "#2d3748", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Related Deals</h3>
                {details.deals.length === 0 ? (
                  <p className="text-muted italic">No deals related to this account.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {details.deals.map((deal) => (
                      <div key={deal.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                        <div>
                          <div style={{ fontWeight: 500 }}>{deal.name}</div>
                          <div className="text-muted" style={{ fontSize: "0.85rem" }}>Stage: {deal.stage}</div>
                        </div>
                        <div style={{ fontWeight: 600 }}>
                          {formatCurrency(deal.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Related Leads */}
              <section>
                <h3 style={{ marginBottom: "16px", fontSize: "1.1rem", color: "#2d3748", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Related Leads</h3>
                {details.leads.length === 0 ? (
                  <p className="text-muted italic">No leads related to this account.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {details.leads.map((lead) => (
                      <div key={lead.id} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                        <div style={{ fontWeight: 500 }}>{lead.full_name}</div>
                        <div className="text-muted" style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                          {lead.email && <span style={{ marginRight: "12px" }}>📧 {lead.email}</span>}
                          {lead.phone && <span style={{ marginRight: "12px" }}>📞 {lead.phone}</span>}
                          <span>Status: {lead.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Related Contacts */}
              <section>
                <h3 style={{ marginBottom: "16px", fontSize: "1.1rem", color: "#2d3748", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>Related Contacts</h3>
                {details.contacts.length === 0 ? (
                  <p className="text-muted italic">No contacts related to this account.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {details.contacts.map((contact) => (
                      <div key={contact.id} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "6px" }}>
                        <div style={{ fontWeight: 500 }}>{contact.full_name}</div>
                        <div className="text-muted" style={{ fontSize: "0.85rem", marginTop: "4px" }}>
                          {contact.email && <span style={{ marginRight: "12px" }}>📧 {contact.email}</span>}
                          {contact.phone && <span style={{ marginRight: "12px" }}>📞 {contact.phone}</span>}
                          {(contact.job_title || contact.company) && (
                            <span style={{ display: "block", marginTop: "4px" }}>
                              {contact.job_title} {contact.job_title && contact.company && "at"} {contact.company}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
