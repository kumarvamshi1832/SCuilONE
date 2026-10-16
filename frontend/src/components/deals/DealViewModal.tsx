import type { Deal } from "../../types/deal";
import { User } from "../../types/user";
import { Lead } from "../../types/lead";
import { Contact } from "../../types/contact";
import { Account } from "../../types/account";
import { formatDateTime } from "../../utils/dateFormatter";

interface DealViewModalProps {
  deal: Deal;
  users: User[];
  leads: Lead[];
  contacts: Contact[];
  accounts: Account[];
  onClose: () => void;
}

export default function DealViewModal({ deal, users, leads, contacts, accounts, onClose }: DealViewModalProps) {
  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((u) => u.id === userId);
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  const getLeadName = (leadId: string | null) => {
    if (!leadId) return "—";
    const lead = leads.find((l) => l.id === leadId);
    return lead ? lead.full_name : leadId;
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return "—";
    const contact = contacts.find((c) => c.id === contactId);
    return contact ? contact.full_name : contactId;
  };

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "—";
    const account = accounts.find((a) => a.id === accountId);
    return account ? account.name : accountId;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>Deal Details</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          <div className="detail-group" style={{ marginBottom: "16px" }}>
            <label className="text-muted">Deal Name</label>
            <p className="detail-value" style={{ fontSize: "1.1rem", fontWeight: 600 }}>{deal.name || "—"}</p>
          </div>

          <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="detail-group">
              <label className="text-muted">Amount</label>
              <p className="detail-value">
                {deal.amount != null
                  ? new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 0,
                    }).format(Number(deal.amount))
                  : "—"}
              </p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Stage</label>
              <p className="detail-value">
                <span className={`badge`} style={{ background: '#e2e8f0', color: '#1a202c' }}>
                  {deal.stage || "—"}
                </span>
              </p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Expected Close Date</label>
              <p className="detail-value">{deal.expected_close_date || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Assigned To</label>
              <p className="detail-value">{getAssignedUser(deal.assigned_to)}</p>
            </div>
            
            <div className="detail-group">
              <label className="text-muted">Account</label>
              <p className="detail-value">{getAccountName(deal.account_id)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Contact</label>
              <p className="detail-value">{getContactName(deal.contact_id)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Lead</label>
              <p className="detail-value">{getLeadName(deal.lead_id)}</p>
            </div>
            <div className="detail-group">
              {/* Spacer */}
            </div>

            <div className="detail-group">
              <label className="text-muted">Created At</label>
              <p className="detail-value">{formatDateTime(deal.created_at)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Updated At</label>
              <p className="detail-value">{formatDateTime(deal.updated_at)}</p>
            </div>
          </div>

          <div className="detail-group" style={{ marginTop: "24px" }}>
            <label className="text-muted">Description</label>
            <div className="detail-value notes-box" style={{ 
              marginTop: "8px", 
              padding: "12px", 
              background: "rgba(0,0,0,0.02)", 
              borderRadius: "6px",
              border: "1px solid rgba(0,0,0,0.05)"
            }}>
              {deal.description ? (
                <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.95rem" }}>{deal.description}</p>
              ) : (
                <span className="text-muted" style={{ fontStyle: "italic" }}>No description provided.</span>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: "16px 24px", borderTop: "1px solid #eaeaea", display: "flex", justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
