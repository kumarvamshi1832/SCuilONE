import type { Contact } from "../../types/contact";
import { User } from "../../types/user";
import { formatDateTime } from "../../utils/dateFormatter";

interface ContactViewModalProps {
  contact: Contact;
  users: User[];
  accounts: any[];
  onClose: () => void;
}

export default function ContactViewModal({ contact, users, accounts, onClose }: ContactViewModalProps) {
  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((u) => u.id === userId);
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  const getAccountDisplay = (accountId?: string | null) => {
    if (!accountId) return "—";
    const account = accounts.find((a) => a.id === accountId);
    return account ? account.name : accountId;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2>Contact Details</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          <div className="detail-group">
            <label className="text-muted">Full Name</label>
            <p className="detail-value">{contact.full_name || "—"}</p>
          </div>

          <div className="detail-grid">
            <div className="detail-group">
              <label className="text-muted">Email</label>
              <p className="detail-value">{contact.email || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Account</label>
              <p className="detail-value">{getAccountDisplay(contact.account_id)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Phone</label>
              <p className="detail-value">{contact.phone || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Company</label>
              <p className="detail-value">{contact.company || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Job Title</label>
              <p className="detail-value">{contact.job_title || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Address</label>
              <p className="detail-value">{contact.address || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Source</label>
              <p className="detail-value">{contact.source || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Assigned To</label>
              <p className="detail-value">{getAssignedUser(contact.assigned_to)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Created At</label>
              <p className="detail-value">{formatDateTime(contact.created_at)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Updated At</label>
              <p className="detail-value">{formatDateTime(contact.updated_at)}</p>
            </div>
          </div>

          <div className="detail-group mt-4">
            <label className="text-muted">Notes</label>
            <div className="detail-value notes-box">
              {contact.notes ? (
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{contact.notes}</p>
              ) : (
                <span className="text-muted italic">No notes provided.</span>
              )}
            </div>
          </div>
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
