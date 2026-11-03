import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import type { Activity } from "../../types/activity";
import type { User } from "../../types/user";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import type { Account } from "../../types/account";
import type { Deal } from "../../types/deal";
import { getActivities, getMyTasks } from "../../services/activityService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
import {
  MODULE_DISPLAY_NAMES,
  getCachedRecordLabel,
  fetchRecordsForModule,
} from "../../services/activityRelatedRecordsService";
import {
  getActivityPermissions,
  getActivityUserContext,
  isActivityVisibleToUser,
} from "../../utils/activityPermissions";
import ActivityFormModal from "../../components/activities/ActivityFormModal";
import ActivityViewModal from "../../components/activities/ActivityViewModal";
import LeadViewModal from "../../components/leads/LeadViewModal";
import ActivityDeleteConfirm from "../../components/activities/ActivityDeleteConfirm";
import { formatDateTime } from "../../utils/dateFormatter";
import { normalizeTaskStatus } from "../../utils/taskStatus";
import { useTheme } from "../../context/ThemeContext";

import "./Activities.css";

/**
 * Splits formatted labels like "Fintech (PRJ-20261102-2816B787)"
 * into a distinct name and code for professional enterprise display.
 */
function parseRecordLabel(label: string): { name: string; code?: string } {
  if (!label) return { name: "" };
  const match = label.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (match && match[1] && match[2]) {
    return { name: match[1].trim(), code: match[2].trim() };
  }
  return { name: label.trim() };
}

export default function Activities() {
  const { theme } = useTheme();

  /* ─── Permissions & User Context ─── */
  const userContext = useMemo(() => getActivityUserContext(), []);
  const permissions = useMemo(() => getActivityPermissions(), []);

  /* ─── State ─── */
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  const [, setRelatedRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ─── Route Context ─── */
  const location = useLocation();
  const isTasksRoute = location.pathname.includes("tasks");
  const isExplicitMyTasks = location.pathname.includes("my-tasks");

  // View Mode: Managers and Tenant Admins can toggle "all" vs "my"; ordinary users default to "my"
  const [viewMode, setViewMode] = useState<"all" | "my">(() => {
    if (isExplicitMyTasks) return "my";
    return userContext.canViewAllActivities ? "all" : "my";
  });

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Sync state when navigating between routes
  useEffect(() => {
    const isTasks = location.pathname.includes("tasks");
    const isExplicitMy = location.pathname.includes("my-tasks");

    if (isTasks) {
      if (isExplicitMy || !userContext.canViewAllActivities) {
        setViewMode("my");
      } else {
        setViewMode("all");
      }
    } else {
      if (!userContext.canViewAllActivities) {
        setViewMode("my");
      } else {
        setViewMode("all");
      }
    }
  }, [location.pathname, userContext.canViewAllActivities]);

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [viewLeadState, setViewLeadState] = useState<Lead | null>(null);
  const [deleteActivityState, setDeleteActivityState] = useState<Activity | null>(null);

  // Toast
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  /* ─── Warm cache for related modules ─── */
  const warmRelatedModulesCache = useCallback((acts: Activity[]) => {
    const modulesToFetch = new Set<string>();
    for (const act of acts) {
      for (const link of act.related_records || []) {
        if (!getCachedRecordLabel(link.module, link.record_id)) {
          modulesToFetch.add(link.module);
        }
      }
    }
    if (modulesToFetch.size > 0) {
      Promise.allSettled(
        Array.from(modulesToFetch).map((m) => fetchRecordsForModule(m as any))
      ).then(() => {
        setRelatedRevision((r) => r + 1);
      });
    }
  }, []);

  /* ─── Data Fetching ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const shouldFetchMyTasks = !userContext.canViewAllActivities || viewMode === "my";
      const fetchActivities = shouldFetchMyTasks ? getMyTasks : getActivities;
      const [activitiesData, usersData, leadsData, contactsData, accountsData, dealsData] =
        await Promise.all([
          fetchActivities(),
          getUsers().catch(() => []),
          getLeads().catch(() => []),
          getContacts().catch(() => []),
          getAccounts().catch(() => []),
          getDeals().catch(() => []),
        ]);
      setActivities(activitiesData);
      setUsers(usersData);
      setLeads(leadsData);
      setContacts(contactsData);
      setAccounts(accountsData);
      setDeals(dealsData);

      warmRelatedModulesCache(activitiesData);
    } catch (err: any) {
      console.error("Fetch activities error:", err);
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to view activities.");
      } else if (err?.response?.status >= 500 || err?.status >= 500) {
        setError("Unable to load activities. Please try again.");
      } else {
        setError(
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load activities."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [viewMode, userContext.canViewAllActivities, warmRelatedModulesCache]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time refresh when a task/activity is created elsewhere in the app
  useEffect(() => {
    const handleUpdate = () => {
      fetchData();
    };
    window.addEventListener("crm:activity-updated", handleUpdate);
    return () => window.removeEventListener("crm:activity-updated", handleUpdate);
  }, [fetchData]);


  /* ─── Helpers ─── */
  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const areIdsEqual = (a?: string | null, b?: string | null): boolean => {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  };

  const getUserDisplay = (userId?: string | null): { name: string; role: string } => {
    if (!userId) return { name: "—", role: "" };
    const user = users.find((u) => areIdsEqual(u.id, userId));
    return user ? { name: user.full_name, role: user.role } : { name: "—", role: "" };
  };

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "";
    const account = accounts.find((a) => areIdsEqual(a.id, accountId));
    return account ? account.name : "";
  };

  const getLeadName = (leadId: string | null, actTitle?: string) => {
    if (!leadId) return "";
    const lead = leads.find((l) => areIdsEqual(l.id, leadId));
    if (lead) return lead.full_name;
    if (actTitle && actTitle.toLowerCase().startsWith("follow up with ")) {
      return actTitle.slice(15).trim();
    }
    return "";
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return "";
    const contact = contacts.find((c) => areIdsEqual(c.id, contactId));
    return contact ? contact.full_name : "";
  };

  const getDealName = (dealId: string | null) => {
    if (!dealId) return "";
    const deal = deals.find((d) => areIdsEqual(d.id, dealId));
    return deal ? deal.name : "";
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
    setPriorityFilter("");
    setAssignedFilter("");
  };

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(typeFilter) ||
    Boolean(statusFilter) ||
    Boolean(priorityFilter) ||
    Boolean(userContext.canViewAllActivities && viewMode === "all" && assignedFilter);

  /* ─── Task Quick Status Transition (Enforcing Backend Rules) ─── */
  /* ─── Filtering (client-side) ─── */
  const filteredActivities = activities.filter((act) => {
    // 1. Role-based assigned user & tenant isolation check
    if (!isActivityVisibleToUser(act, userContext, viewMode)) {
      return false;
    }

    // 2. Text search (including resolved industry related names)
    if (search) {
      const q = search.toLowerCase();
      const titleMatch = (act.title || "").toLowerCase().includes(q);
      const descMatch = (act.description || "").toLowerCase().includes(q);
      const acctMatch = getAccountName(act.account_id).toLowerCase().includes(q);
      const leadMatch = getLeadName(act.lead_id, act.title).toLowerCase().includes(q);
      const contMatch = getContactName(act.contact_id).toLowerCase().includes(q);
      const dealMatch = getDealName(act.deal_id).toLowerCase().includes(q);
      const industryMatch = (act.related_records || []).some((link) => {
        const resolved = getCachedRecordLabel(link.module, link.record_id) || "";
        const modLabel = MODULE_DISPLAY_NAMES[link.module] || "";
        return resolved.toLowerCase().includes(q) || modLabel.toLowerCase().includes(q);
      });

      if (!titleMatch && !descMatch && !acctMatch && !leadMatch && !contMatch && !dealMatch && !industryMatch) {
        return false;
      }
    }

    // 3. Type filter (case-insensitive)
    if (typeFilter && (act.activity_type || "").toLowerCase() !== typeFilter.toLowerCase()) {
      return false;
    }

    // 4. Status filter (normalized)
    if (statusFilter && normalizeTaskStatus(act.status) !== normalizeTaskStatus(statusFilter)) {
      return false;
    }

    // 5. Priority filter (case-insensitive)
    if (priorityFilter && (act.priority || "").toLowerCase() !== priorityFilter.toLowerCase()) {
      return false;
    }

    // 6. Assigned filter (only applicable for users with team-wide visibility in "all" mode)
    if (userContext.canViewAllActivities && viewMode === "all" && assignedFilter) {
      if (act.assigned_to !== assignedFilter) return false;
    }

    return true;
  });

  const getStatusBadgeClass = (st: string) => {
    const normalized = normalizeTaskStatus(st);
    switch (normalized) {
      case "completed":
        return "status-completed";
      case "in_progress":
        return "status-in-progress";
      case "cancelled":
        return "status-cancelled";
      case "pending":
      default:
        return "status-pending";
    }
  };

  const getPriorityBadgeClass = (pr: string) => {
    switch ((pr || "").toLowerCase()) {
      case "high":
        return "priority-high";
      case "medium":
        return "priority-medium";
      case "low":
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
    <div className={`activities-page ${theme}`}>
      {/* Toast */}
      {notification && (
        <div
          className="notification-toast"
          style={{
            background: notification.type === "success" ? "#10b981" : "#ef4444",
            color: "#ffffff",
          }}
          role="status"
        >
          {notification.message}
        </div>
      )}

      {/* 1. Page Header */}
      <div className="activities-header">
        <div className="activities-header-left">
          <h1 className="activities-header-title">
            {isTasksRoute ? "Tasks" : "Activities & Tasks"}
            <span className="activities-count-badge">
              {filteredActivities.length} {filteredActivities.length === 1 ? "Item" : "Total"}
            </span>
          </h1>
          <p className="activities-header-subtitle">
            {isTasksRoute
              ? "Track, manage, and complete your assigned tasks."
              : "Manage tasks, calls, and meetings across your organization."}
          </p>
        </div>

        <div className="activities-header-right">
          {/* Segmented View Mode Control (All Activities vs My Activities) */}
          {userContext.canViewAllActivities && (
            <div className="view-segmented-control" role="group" aria-label="Activity view filter">
              <button
                type="button"
                className={`view-segment-btn ${viewMode === "all" ? "active" : ""}`}
                onClick={() => setViewMode("all")}
              >
                All Activities
              </button>
              <button
                type="button"
                className={`view-segment-btn ${viewMode === "my" ? "active" : ""}`}
                onClick={() => setViewMode("my")}
              >
                My Activities
              </button>
            </div>
          )}

          {permissions.create && (
            <button
              type="button"
              className="btn-create-activity"
              onClick={() => {
                setEditActivity(null);
                setIsFormOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>{isTasksRoute ? "Create Task" : "Create Activity"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Search & Filter Toolbar */}
      <div className="activities-filter-toolbar">
        {/* Search input (occupies available flex space) */}
        <div className="activities-search-box">
          <svg className="activities-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            className="activities-search-input"
            placeholder="Search by title, description, lead, account, contact, or project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="activities-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        {/* Dropdowns Group */}
        <div className="activities-filters-group">
          {/* Activity Type Dropdown */}
          {!isTasksRoute && (
            <div className="activities-select-wrapper">
              <select
                className="activities-filter-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by activity type"
              >
                <option value="">All Types</option>
                <option value="Task">Task</option>
                <option value="Call">Call</option>
                <option value="Meeting">Meeting</option>
              </select>
              <svg className="activities-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          )}

          {/* Status Dropdown */}
          <div className="activities-select-wrapper">
            <select
              className="activities-filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <svg className="activities-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          {/* Priority Dropdown */}
          <div className="activities-select-wrapper">
            <select
              className="activities-filter-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority"
            >
              <option value="">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
            <svg className="activities-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          {/* Assigned Users Dropdown */}
          {userContext.canViewAllActivities && viewMode === "all" && (
            <div className="activities-select-wrapper assignee-select">
              <select
                className="activities-filter-select"
                value={assignedFilter}
                onChange={(e) => setAssignedFilter(e.target.value)}
                aria-label="Filter by assigned user"
              >
                <option value="">All Assignees</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
              <svg className="activities-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </div>
          )}

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button type="button" className="activities-reset-btn" onClick={clearFilters}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Activities Table */}
      <div className="activities-table-card">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading activities & tasks...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" style={{ color: "#ef4444", marginBottom: "12px" }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h3>Unable to Load Activities</h3>
            <p>{error}</p>
            <button
              type="button"
              className="activities-reset-btn"
              onClick={fetchData}
              style={{ marginTop: "14px" }}
            >
              🔄 Retry
            </button>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" width="32" height="32">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
            </div>
            <h3>{hasActiveFilters ? "No matching activities found" : "No activities recorded"}</h3>
            <p>
              {hasActiveFilters
                ? "Try adjusting your search query, clear some filters, or select a different status/type."
                : "Create your first activity or task to get started tracking deliverables."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="activities-reset-btn"
                onClick={clearFilters}
                style={{ marginTop: "14px" }}
              >
                Clear All Filters
              </button>
            ) : permissions.create ? (
              <button
                type="button"
                className="btn-create-activity"
                onClick={() => {
                  setEditActivity(null);
                  setIsFormOpen(true);
                }}
                style={{ marginTop: "14px" }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>{isTasksRoute ? "Create Task" : "Create Activity"}</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="activities-table-wrapper">
            <table className="activities-table">
              <thead>
                <tr>
                  <th className="col-title">Title & Description</th>
                  <th className="col-type">Type</th>
                  <th className="col-related">Related Records</th>
                  <th className="col-priority">Priority</th>
                  <th className="col-status">Status</th>
                  <th className="col-due">Due Date</th>
                  <th className="col-assigned">Assigned To</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredActivities.map((act) => {
                  const assignedUser = getUserDisplay(act.assigned_to);
                  const acctName = getAccountName(act.account_id);
                  const leadName = getLeadName(act.lead_id, act.title);
                  const contName = getContactName(act.contact_id);
                  const dealName = getDealName(act.deal_id);

                  return (
                    <tr
                      key={act.id}
                      onClick={() => setViewActivity(act)}
                      className="activity-row"
                    >
                      {/* 1. Title & Description */}
                      <td>
                        <div className="activity-title-cell">
                          <span className="activity-title" title={act.title}>
                            {act.title}
                          </span>
                          {act.description && (
                            <span className="activity-desc" title={act.description}>
                              {act.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2. Type */}
                      <td>
                        <span className={`activity-type-badge ${getTypeBadgeClass(act.activity_type)}`}>
                          {act.activity_type}
                        </span>
                      </td>

                      {/* 3. Related Records (CRM + Industry) */}
                      <td>
                        <div className="activity-related-stack">
                          {acctName && (
                            <div className="activity-related-card" title={`Account: ${acctName}`}>
                              <span className="activity-related-tag">ACCOUNT</span>
                              <div className="activity-related-body">
                                <span className="activity-related-name">{acctName}</span>
                              </div>
                            </div>
                          )}

                          {leadName && (
                            <div
                              className="activity-related-card"
                              title={`Lead: ${leadName} (Click to view)`}
                              onClick={(e) => {
                                e.stopPropagation();
                                const leadObj = leads.find((l) => areIdsEqual(l.id, act.lead_id));
                                if (leadObj) {
                                  setViewLeadState(leadObj);
                                }
                              }}
                            >
                              <span className="activity-related-tag">LEAD</span>
                              <div className="activity-related-body">
                                <span className="activity-related-name is-link">{leadName}</span>
                              </div>
                            </div>
                          )}

                          {contName && (
                            <div className="activity-related-card" title={`Contact: ${contName}`}>
                              <span className="activity-related-tag">CONTACT</span>
                              <div className="activity-related-body">
                                <span className="activity-related-name">{contName}</span>
                              </div>
                            </div>
                          )}

                          {dealName && (
                            <div className="activity-related-card" title={`Deal: ${dealName}`}>
                              <span className="activity-related-tag">DEAL</span>
                              <div className="activity-related-body">
                                <span className="activity-related-name">{dealName}</span>
                              </div>
                            </div>
                          )}

                          {/* Industry Related Records (Projects, Sprints, Real Estate, etc.) */}
                          {act.related_records && act.related_records.length > 0 && act.related_records.map((link) => {
                            const resolved = getCachedRecordLabel(link.module, link.record_id);
                            const parsed = parseRecordLabel(resolved || `#${link.record_id.slice(0, 8)}`);
                            let tagLabel = MODULE_DISPLAY_NAMES[link.module] || link.module;
                            if (tagLabel.toLowerCase().includes("software project")) tagLabel = "PROJECT";
                            else if (tagLabel.toLowerCase().includes("software sprint")) tagLabel = "SPRINT";

                            return (
                              <div
                                className="activity-related-card"
                                key={`${link.module}-${link.record_id}`}
                                title={`${MODULE_DISPLAY_NAMES[link.module] || link.module}: ${resolved || link.record_id}`}
                              >
                                <span className="activity-related-tag">{tagLabel.toUpperCase()}</span>
                                <div className="activity-related-body">
                                  <span className="activity-related-name">{parsed.name}</span>
                                  {parsed.code && <span className="activity-related-code">({parsed.code})</span>}
                                </div>
                              </div>
                            );
                          })}

                          {!acctName &&
                            !leadName &&
                            !contName &&
                            !dealName &&
                            (!act.related_records || act.related_records.length === 0) && (
                              <span className="activity-related-empty">—</span>
                            )}
                        </div>
                      </td>

                      {/* 4. Priority */}
                      <td>
                        <span className={`activity-priority-badge ${getPriorityBadgeClass(act.priority)}`}>
                          {act.priority}
                        </span>
                      </td>

                      {/* 5. Status */}
                      <td>
                        <span className={`activity-status-badge ${getStatusBadgeClass(act.status)}`}>
                          {act.status}
                        </span>
                      </td>

                      {/* 6. Due Date with Overdue Indicator */}
                      <td>
                        {act.due_date ? (
                          (() => {
                            const isOverdue =
                              act.status !== "Completed" &&
                              act.status !== "Cancelled" &&
                              new Date(act.due_date).getTime() < Date.now();
                            return (
                              <div className="activity-date-cell">
                                <span className="activity-date-text">{formatDateTime(act.due_date)}</span>
                                {isOverdue && <span className="activity-overdue-tag">Overdue</span>}
                              </div>
                            );
                          })()
                        ) : (
                          <span className="activity-related-empty">—</span>
                        )}
                      </td>

                      {/* 7. Assigned To (Compact Avatar + Name + Role) */}
                      <td>
                        {act.assigned_to && assignedUser.name !== "—" ? (
                          <div className="activity-assigned-cell">
                            <div className="activity-avatar" title={assignedUser.name}>
                              {assignedUser.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="activity-assigned-meta">
                              <span className="activity-user-name" title={assignedUser.name}>
                                {assignedUser.name}
                              </span>
                              {assignedUser.role && (
                                <span className="activity-user-role" title={assignedUser.role}>
                                  {assignedUser.role}
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="activity-related-empty">—</span>
                        )}
                      </td>

                      {/* 8. Actions */}
                      <td className="actions-cell">
                        <div className="crm-inline-actions">
                          <button
                            type="button"
                            className="crm-action-btn view-btn"
                            title="View Activity Details"
                            aria-label="View Activity Details"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewActivity(act);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                              <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                          </button>
                          {permissions.update && (
                            <button
                              type="button"
                              className="crm-action-btn edit-btn"
                              title="Edit Activity"
                              aria-label="Edit Activity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditActivity(act);
                                setIsFormOpen(true);
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                          )}
                          {permissions.delete && (
                            <button
                              type="button"
                              className="crm-action-btn delete-btn"
                              title="Delete Activity"
                              aria-label="Delete Activity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteActivityState(act);
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      

      {/* Modals */}
      {isFormOpen && (
        <ActivityFormModal
          activity={editActivity}
          defaultType={isTasksRoute ? "Task" : undefined}
          onClose={() => {
            setIsFormOpen(false);
            setEditActivity(null);
          }}
          onSuccess={(saved) => {
            if (editActivity) {
              setActivities((prev) => prev.map((a) => (areIdsEqual(a.id, saved.id) ? saved : a)));
              showToast(isTasksRoute ? "Task updated successfully." : "Activity updated successfully.");
            } else {
              setActivities((prev) => [saved, ...prev]);
              showToast(isTasksRoute ? "Task created successfully." : "Activity created successfully.");
            }
            warmRelatedModulesCache([saved]);
          }}
        />
      )}

      {viewActivity && (
        <ActivityViewModal
          activity={viewActivity}
          users={users}
          leads={leads}
          contacts={contacts}
          accounts={accounts}
          deals={deals}
          canEdit={permissions.update}
          onEdit={() => {
            setEditActivity(viewActivity);
            setViewActivity(null);
            setIsFormOpen(true);
          }}
          onViewLead={(lead) => {
            setViewActivity(null);
            setViewLeadState(lead);
          }}
          onClose={() => setViewActivity(null)}
        />
      )}

      {viewLeadState && (
        <LeadViewModal
          lead={viewLeadState}
          users={users}
          onClose={() => setViewLeadState(null)}
          onEdit={() => {
            setViewLeadState(null);
          }}
        />
      )}

      {deleteActivityState && (
        <ActivityDeleteConfirm
          activity={deleteActivityState}
          onClose={() => setDeleteActivityState(null)}
          onSuccess={() => {
            setActivities((prev) => prev.filter((a) => !areIdsEqual(a.id, deleteActivityState.id)));
            showToast(isTasksRoute ? "Task deleted successfully." : "Activity deleted successfully.");
          }}
        />
      )}
    </div>
  );
}
