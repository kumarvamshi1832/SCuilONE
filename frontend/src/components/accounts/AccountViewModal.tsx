import type { Account } from "../../types/account";
import { User } from "../../types/user";
import { formatDateTime } from "../../utils/dateFormatter";

interface AccountViewModalProps {
  account: Account;
  users: User[];
  onClose: () => void;
}

export default function AccountViewModal({ account, users, onClose }: AccountViewModalProps) {
  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((u) => u.id === userId);
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
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
          <div className="detail-group">
            <label className="text-muted">Account Name</label>
            <p className="detail-value">{account.name || "—"}</p>
          </div>

          <div className="detail-grid">
            <div className="detail-group">
              <label className="text-muted">Email</label>
              <p className="detail-value">{account.email || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Phone</label>
              <p className="detail-value">{account.phone || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Website</label>
              <p className="detail-value">{account.website || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Industry</label>
              <p className="detail-value">{account.industry || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Status</label>
              <p className="detail-value">{account.status || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Source</label>
              <p className="detail-value">{account.source || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Assigned To</label>
              <p className="detail-value">{getAssignedUser(account.assigned_to)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">City</label>
              <p className="detail-value">{account.city || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">State</label>
              <p className="detail-value">{account.state || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Country</label>
              <p className="detail-value">{account.country || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Postal Code</label>
              <p className="detail-value">{account.postal_code || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Address</label>
              <p className="detail-value">{account.address || "—"}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Created At</label>
              <p className="detail-value">{formatDateTime(account.created_at)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Updated At</label>
              <p className="detail-value">{formatDateTime(account.updated_at)}</p>
            </div>
          </div>

          <div className="detail-group mt-4">
            <label className="text-muted">Notes</label>
            <div className="detail-value notes-box">
              {account.notes ? (
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{account.notes}</p>
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
