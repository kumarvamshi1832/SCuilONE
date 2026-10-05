import type { Lead } from "../../types/lead";
import { User } from "../../types/user";
import { getLeadPermissions } from "../../utils/leadPermissions";
import { formatDateTime } from "../../utils/dateFormatter";

interface LeadViewModalProps {
  lead: Lead;
  users: User[];
  onClose: () => void;
  onEdit: () => void;
}

const permissions = getLeadPermissions();



function getStatusClass(status: string): string {
  switch (status) {
    case "New":
      return "status-new";
    case "Contacted":
      return "status-contacted";
    case "Qualified":
      return "status-qualified";
    case "Converted":
      return "status-converted";
    case "Lost":
      return "status-lost";
    default:
      return "";
  }
}

export default function LeadViewModal({ lead, users, onClose, onEdit }: LeadViewModalProps) {
  const assignedUser = lead.assigned_to
    ? users.find((u) => u.id === lead.assigned_to)
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content leads-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Lead Details</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body lead-view-body">
          <div className="lead-view-header">
            <div className="lead-view-avatar">
              {(lead.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="lead-view-title">
              <h3>{lead.full_name}</h3>
              <span className={`lead-status-badge ${getStatusClass(lead.status)}`}>
                {lead.status}
              </span>
            </div>
          </div>

          <div className="lead-view-grid">
            <div className="lead-view-item">
              <span className="lead-view-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                Email
              </span>
              <span className="lead-view-value">{lead.email || "—"}</span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                Phone
              </span>
              <span className="lead-view-value">{lead.phone || "—"}</span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                Source
              </span>
              <span className="lead-view-value">{lead.source || "—"}</span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
                Assigned To
              </span>
              <span className="lead-view-value">
                {assignedUser
                  ? `${assignedUser.full_name} — ${assignedUser.role}`
                  : lead.assigned_to
                  ? "Unknown User"
                  : "Unassigned"}
              </span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                Created
              </span>
              <span className="lead-view-value">{formatDateTime(lead.created_at)}</span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                Updated
              </span>
              <span className="lead-view-value">{formatDateTime(lead.updated_at)}</span>
            </div>
          </div>

          {lead.notes && (
            <div className="lead-view-notes">
              <span className="lead-view-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Notes
              </span>
              <p className="lead-notes-text">{lead.notes}</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {permissions.canEdit && (
            <button className="btn-primary" onClick={onEdit}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              Edit Lead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
