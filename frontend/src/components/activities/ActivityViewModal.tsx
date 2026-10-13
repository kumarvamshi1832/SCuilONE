import type { Activity } from "../../types/activity";
import { User } from "../../types/user";
import { Lead } from "../../types/lead";
import { Contact } from "../../types/contact";
import { Account } from "../../types/account";
import { Deal } from "../../types/deal";
import { formatDateTime } from "../../utils/dateFormatter";
import "../../pages/activities/Activities.css";

interface ActivityViewModalProps {
  activity: Activity;
  users: User[];
  leads: Lead[];
  contacts: Contact[];
  accounts: Account[];
  deals: Deal[];
  canEdit?: boolean;
  onEdit?: () => void;
  onViewLead?: (lead: Lead) => void;
  onClose: () => void;
}

export default function ActivityViewModal({
  activity,
  users,
  leads,
  contacts,
  accounts,
  deals,
  canEdit,
  onEdit,
  onViewLead,
  onClose,
}: ActivityViewModalProps) {
  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((u) => u.id === userId);
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  const getLeadName = (leadId: string | null) => {
    if (!leadId) return "—";
    const lead = leads.find((l) => l.id === leadId);
    return lead ? lead.full_name : "Unknown Lead";
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return "—";
    const contact = contacts.find((c) => c.id === contactId);
    return contact ? contact.full_name : "Unknown Contact";
  };

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "—";
    const account = accounts.find((a) => a.id === accountId);
    return account ? account.name : "Unknown Account";
  };

  const getDealName = (dealId: string | null) => {
    if (!dealId) return "—";
    const deal = deals.find((d) => d.id === dealId);
    return deal ? deal.name : "Unknown Deal";
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "Completed":
        return "status-completed";
      case "In Progress":
        return "status-in-progress";
      case "Cancelled":
        return "status-cancelled";
      case "Pending":
      default:
        return "status-pending";
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case "High":
        return "priority-high";
      case "Medium":
        return "priority-medium";
      case "Low":
      default:
        return "priority-low";
    }
  };

  const getTypeBadgeClass = (type: string) => {
    switch (type) {
      case "Call":
        return "activity-type-call";
      case "Meeting":
        return "activity-type-meeting";
      case "Task":
      default:
        return "activity-type-task";
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "650px" }}>
        <div className="modal-header">
          <h2>Activity Details</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          {/* Main Title & Type */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span className={`activity-type-badge ${getTypeBadgeClass(activity.activity_type)}`}>
                {activity.activity_type}
              </span>
              <span className={`activity-status-badge ${getStatusBadgeClass(activity.status)}`}>
                {activity.status}
              </span>
              <span className={`activity-priority-badge ${getPriorityBadgeClass(activity.priority)}`}>
                {activity.priority} Priority
              </span>
            </div>
            <h3 className="activity-view-title">
              {activity.title}
            </h3>
          </div>

          {/* Details Grid */}
          <div className="detail-grid" style={{ marginBottom: "20px" }}>
            <div className="detail-group">
              <label className="text-muted">Due Date</label>
              <p className="detail-value">{formatDateTime(activity.due_date)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Assigned To</label>
              <p className="detail-value">{getAssignedUser(activity.assigned_to)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Created At</label>
              <p className="detail-value">{formatDateTime(activity.created_at)}</p>
            </div>
            <div className="detail-group">
              <label className="text-muted">Updated At</label>
              <p className="detail-value">{formatDateTime(activity.updated_at)}</p>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: "20px" }}>
            <label className="text-muted" style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 500 }}>
              Description
            </label>
            <div className={`activity-view-description ${!activity.description ? "empty" : ""}`}>
              {activity.description || "No description provided."}
            </div>
          </div>

          {/* Related CRM Records */}
          <div>
            <h4 className="activity-view-section-title">
              Related Records
            </h4>
            <div className="detail-grid">
              <div className="detail-group">
                <label className="text-muted">Related Account</label>
                <p className="detail-value">{getAccountName(activity.account_id)}</p>
              </div>
              <div className="detail-group">
                <label className="text-muted">Related Lead</label>
                {(() => {
                  const leadObj = activity.lead_id ? leads.find((l) => l.id === activity.lead_id) : null;
                  if (leadObj && onViewLead) {
                    return (
                      <p
                        className="detail-value text-primary"
                        style={{
                          cursor: "pointer",
                          color: "var(--primary-color, #2563eb)",
                          textDecoration: "underline",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontWeight: 500,
                        }}
                        onClick={() => onViewLead(leadObj)}
                        title={`View lead ${leadObj.full_name}`}
                      >
                        <span>{leadObj.full_name}</span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </p>
                    );
                  }
                  return <p className="detail-value">{getLeadName(activity.lead_id)}</p>;
                })()}
              </div>
              <div className="detail-group">
                <label className="text-muted">Related Contact</label>
                <p className="detail-value">{getContactName(activity.contact_id)}</p>
              </div>
              <div className="detail-group">
                <label className="text-muted">Related Deal</label>
                <p className="detail-value">{getDealName(activity.deal_id)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {canEdit && onEdit && (
            <button className="btn-primary" onClick={onEdit}>
              Edit Activity
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
