import { useState, useEffect } from "react";
import type { Activity, ActivityLinkResponse } from "../../types/activity";
import type { User } from "../../types/user";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import type { Account } from "../../types/account";
import type { Deal } from "../../types/deal";
import { formatDateTime } from "../../utils/dateFormatter";
import { useTheme } from "../../context/ThemeContext";
import {
  MODULE_DISPLAY_NAMES,
  getCachedRecordLabel,
  setCachedRecordLabel,
  fetchRecordsForModule,
} from "../../services/activityRelatedRecordsService";
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
  const { theme } = useTheme();
  const [resolvedRelatedNames, setResolvedRelatedNames] = useState<Record<string, string>>({});
  const [loadingRelated, setLoadingRelated] = useState(false);

  const areIdsEqual = (a?: string | null, b?: string | null): boolean => {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  };

  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((u) => areIdsEqual(u.id, userId));
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  const getLeadName = (leadId: string | null) => {
    if (!leadId) return "—";
    const lead = leads.find((l) => areIdsEqual(l.id, leadId));
    if (lead) return lead.full_name;
    if (activity.title?.toLowerCase().startsWith("follow up with ")) {
      return activity.title.slice(15).trim();
    }
    return "Unknown Lead";
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return "—";
    const contact = contacts.find((c) => areIdsEqual(c.id, contactId));
    return contact ? contact.full_name : "Unknown Contact";
  };

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "—";
    const account = accounts.find((a) => areIdsEqual(a.id, accountId));
    return account ? account.name : "Unknown Account";
  };

  const getDealName = (dealId: string | null) => {
    if (!dealId) return "—";
    const deal = deals.find((d) => areIdsEqual(d.id, dealId));
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

  /* ─── Resolve Industry-Related Records ─── */
  useEffect(() => {
    const links = activity.related_records || [];
    if (!links.length) return;

    // Check cached labels first
    const resolved: Record<string, string> = {};
    const modulesToFetch = new Set<string>();

    for (const link of links) {
      const cached = getCachedRecordLabel(link.module, link.record_id);
      if (cached) {
        resolved[`${link.module}:${link.record_id}`] = cached;
      } else {
        modulesToFetch.add(link.module);
      }
    }

    if (modulesToFetch.size === 0) {
      setResolvedRelatedNames(resolved);
      return;
    }

    setLoadingRelated(true);
    const fetchPromises = Array.from(modulesToFetch).map(async (modKey) => {
      try {
        const records = await fetchRecordsForModule(modKey as any);
        for (const r of records) {
          const label = r.secondaryText ? `${r.name} ${r.secondaryText}` : r.name;
          resolved[`${modKey}:${r.id}`] = label;
          setCachedRecordLabel(modKey as any, r.id, label);
        }
      } catch (e) {
        console.warn(`Failed to resolve names for module ${modKey}:`, e);
      }
    });

    Promise.allSettled(fetchPromises).finally(() => {
      // For any records still not resolved, provide graceful fallback
      for (const link of links) {
        const key = `${link.module}:${link.record_id}`;
        if (!resolved[key]) {
          const modName = MODULE_DISPLAY_NAMES[link.module] || link.module;
          resolved[key] = `${modName} #${link.record_id.slice(0, 8)} (unavailable)`;
        }
      }
      setResolvedRelatedNames({ ...resolved });
      setLoadingRelated(false);
    });
  }, [activity.related_records]);

  return (
    <div className={`modal-overlay activity-view-overlay ${theme}`} onClick={onClose}>
      <div
        className={`modal-content activity-view-modal ${theme}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "680px", width: "95%" }}
      >
        <div className="modal-header">
          <h2>
            {activity.activity_type === "Task" ? "Task Details" : "Activity Details"}
          </h2>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto", padding: "20px" }}>
          {/* Main Title & Type */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
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
            <h3
              className="activity-view-title"
              style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}
            >
              {activity.title}
            </h3>
          </div>

          {/* Details Grid */}
          <div
            className="detail-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              marginBottom: "20px",
            }}
          >
            <div className="detail-group">
              <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                Due Date
              </label>
              <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                {formatDateTime(activity.due_date)}
              </p>
            </div>
            <div className="detail-group">
              <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                Assigned To
              </label>
              <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                {getAssignedUser(activity.assigned_to)}
              </p>
            </div>
            <div className="detail-group">
              <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                Created At
              </label>
              <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                {formatDateTime(activity.created_at)}
              </p>
            </div>
            <div className="detail-group">
              <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                Updated At
              </label>
              <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                {formatDateTime(activity.updated_at)}
              </p>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: "20px" }}>
            <label
              className="text-muted activity-view-label"
              style={{ display: "block", marginBottom: "6px", fontSize: "0.85rem", fontWeight: 500 }}
            >
              Description
            </label>
            <div
              className={`activity-view-description ${!activity.description ? "empty" : ""}`}
            >
              {activity.description || "No description provided."}
            </div>
          </div>

          {/* ─── Industry-Related Records ─── */}
          {activity.related_records && activity.related_records.length > 0 && (
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h4
                  className="activity-view-section-title"
                  style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}
                >
                  Industry-Related Records
                </h4>
                {loadingRelated && (
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Resolving names...</span>
                )}
              </div>
              <div
                className="detail-grid activity-view-industry-box"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "12px",
                }}
              >
                {activity.related_records.map((link: ActivityLinkResponse) => {
                  const key = `${link.module}:${link.record_id}`;
                  const resolvedName = resolvedRelatedNames[key] || getCachedRecordLabel(link.module, link.record_id);
                  const moduleLabel = MODULE_DISPLAY_NAMES[link.module] || link.module;

                  const match = resolvedName ? resolvedName.match(/^(.+?)\s*\((PRJ-[^)]+)\)$/) : null;
                  const mainTitle = match ? match[1] : (resolvedName || `Record #${link.record_id.slice(0, 8)}`);
                  const subRef = match ? match[2] : null;

                  return (
                    <div className="detail-group" key={key}>
                      <label className="text-muted activity-view-label" style={{ fontSize: "0.75rem", fontWeight: 600 }}>
                        {moduleLabel}
                      </label>
                      <p
                        className="detail-value activity-view-value"
                        style={{ margin: "4px 0 0", fontWeight: 600, fontSize: "0.88rem" }}
                      >
                        {mainTitle}
                        {subRef && (
                          <span style={{ display: "block", fontSize: "0.75rem", fontWeight: 400, opacity: 0.8, marginTop: "2px" }}>
                            {subRef}
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Common CRM Relationships ─── */}
          <div>
            <h4
              className="activity-view-section-title"
              style={{ marginBottom: "10px", fontSize: "0.95rem", fontWeight: 600 }}
            >
              CRM Relationships
            </h4>
            <div
              className="detail-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
              }}
            >
              <div className="detail-group">
                <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  Account
                </label>
                <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                  {getAccountName(activity.account_id) || "—"}
                </p>
              </div>

              <div className="detail-group">
                <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  Lead
                </label>
                {(() => {
                  const leadObj = activity.lead_id ? leads.find((l) => areIdsEqual(l.id, activity.lead_id)) : null;
                  if (leadObj && onViewLead) {
                    return (
                      <p
                        className="detail-value text-primary"
                        style={{
                          margin: "4px 0 0",
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
                  return (
                    <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                      {getLeadName(activity.lead_id)}
                    </p>
                  );
                })()}
              </div>

              <div className="detail-group">
                <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  Contact
                </label>
                <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                  {getContactName(activity.contact_id) || "—"}
                </p>
              </div>

              <div className="detail-group">
                <label className="text-muted activity-view-label" style={{ fontSize: "0.78rem", fontWeight: 500 }}>
                  Deal
                </label>
                <p className="detail-value activity-view-value" style={{ margin: "4px 0 0", fontWeight: 500 }}>
                  {getDealName(activity.deal_id) || "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer activity-view-footer">
          <button className="btn-secondary" onClick={onClose} style={{ padding: "8px 16px", borderRadius: "6px" }}>
            Close
          </button>
          {canEdit && onEdit && (
            <button className="btn-primary" onClick={onEdit} style={{ padding: "8px 18px", borderRadius: "6px" }}>
              {activity.activity_type === "Task" ? "Edit Task" : "Edit Activity"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
