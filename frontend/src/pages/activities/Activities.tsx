import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import type { Activity } from "../../types/activity";
import { User } from "../../types/user";
import { Lead } from "../../types/lead";
import { Contact } from "../../types/contact";
import { Account } from "../../types/account";
import { Deal } from "../../types/deal";
import { getActivities, getMyTasks } from "../../services/activityService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
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
import "../users/Users.css";
import "../leads/Leads.css";
import "./Activities.css";

export default function Activities() {
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ─── Route Context ─── */
  const location = useLocation();
const [searchParams] = useSearchParams();
const isTasksRoute = location.pathname.includes("tasks");
const overdueFilter = isTasksRoute && searchParams.get("overdue") === "true";

  // View Mode: Managers and Tenant Admins can toggle "all" vs "my"; ordinary users or /tasks route default to "my"
  const [viewMode, setViewMode] = useState<"all" | "my">(() => {
    if (isTasksRoute) return "my";
    return userContext.canViewAllActivities ? "all" : "my";
  });

  // Filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(() => (isTasksRoute ? "Task" : ""));
const [statusFilter, setStatusFilter] = useState(
  () => searchParams.get("status") || ""
);
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [viewLeadState, setViewLeadState] = useState<Lead | null>(null);
  const [deleteActivityState, setDeleteActivityState] = useState<Activity | null>(null);

  // Actions dropdown
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number; openUp: boolean } | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Toast
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  /* ─── Data Fetching ─── */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // If user has team-wide visibility and viewMode is "all", fetch all tenant activities.
      // Otherwise (ordinary user or "my" mode), query my-tasks endpoint.
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
  }, [viewMode, userContext.canViewAllActivities]);

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

  // Close actions dropdown on outside click, escape, scroll or resize
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
        setDropdownPos(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenActionId(null);
        setDropdownPos(null);
      }
    };
    const handleScrollOrResize = (e: Event) => {
      if (actionsRef.current && actionsRef.current.contains(e.target as Node)) {
        return;
      }
      setOpenActionId(null);
      setDropdownPos(null);
    };

    if (openActionId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
      window.addEventListener("scroll", handleScrollOrResize, true);
      window.addEventListener("resize", handleScrollOrResize);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [openActionId]);

  const toggleActions = (activityId: string) => {
    if (openActionId === activityId) {
      setOpenActionId(null);
      setDropdownPos(null);
      return;
    }
    const btn = triggerRefs.current[activityId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const menuWidth = 176;
      const menuHeight = 130;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < menuHeight + 12 && spaceAbove > menuHeight;

      // Align right edge of menu with right edge of trigger button
      let left = rect.right - menuWidth;

      // Prevent clipping on smaller viewports
      if (left < 8) {
        left = Math.max(8, rect.left);
      }
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuWidth - 8);
      }

      setDropdownPos({
        top: openUp ? undefined : Math.round(rect.bottom + 4),
        bottom: openUp ? Math.round(window.innerHeight - rect.top + 4) : undefined,
        left: Math.round(left),
        openUp,
      });
    }
    setOpenActionId(activityId);
  };

  /* ─── Helpers ─── */

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3500);
  };

  const getUserDisplay = (userId?: string | null): { name: string; role: string } => {
    if (!userId) return { name: "—", role: "" };
    const user = users.find((u) => u.id === userId);
    return user ? { name: user.full_name, role: user.role } : { name: "—", role: "" };
  };

  const getAccountName = (accountId: string | null) => {
    if (!accountId) return "";
    const account = accounts.find((a) => a.id === accountId);
    return account ? account.name : "";
  };

  const getLeadName = (leadId: string | null) => {
    if (!leadId) return "";
    const lead = leads.find((l) => l.id === leadId);
    return lead ? lead.full_name : "";
  };

  const getContactName = (contactId: string | null) => {
    if (!contactId) return "";
    const contact = contacts.find((c) => c.id === contactId);
    return contact ? contact.full_name : "";
  };

  const getDealName = (dealId: string | null) => {
    if (!dealId) return "";
    const deal = deals.find((d) => d.id === dealId);
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
    search ||
    overdueFilter ||
    typeFilter ||
    statusFilter ||
    priorityFilter ||
    (userContext.canViewAllActivities && viewMode === "all" && assignedFilter);

  /* ─── Filtering (client-side) ─── */

  const filteredActivities = activities.filter((act) => {
    // 1. Role-based assigned user & tenant isolation check
    if (!isActivityVisibleToUser(act, userContext, viewMode)) {
      return false;
    }

    // 2. Text search
    if (search) {
      const q = search.toLowerCase();
      const titleMatch = (act.title || "").toLowerCase().includes(q);
      const descMatch = (act.description || "").toLowerCase().includes(q);
      const acctMatch = getAccountName(act.account_id).toLowerCase().includes(q);
      const leadMatch = getLeadName(act.lead_id).toLowerCase().includes(q);
      const contMatch = getContactName(act.contact_id).toLowerCase().includes(q);
      const dealMatch = getDealName(act.deal_id).toLowerCase().includes(q);

      if (!titleMatch && !descMatch && !acctMatch && !leadMatch && !contMatch && !dealMatch) {
        return false;
      }
    }

    // 3. Type filter
    if (typeFilter && act.activity_type !== typeFilter) return false;

    
    // 4. Status and overdue filters
if (statusFilter && act.status !== statusFilter) return false;

if (overdueFilter) {
  if (
    !act.due_date ||
    act.status === "Completed" ||
    act.status === "Cancelled" ||
    new Date(act.due_date).getTime() >= Date.now()
  ) {
    return false;
  }
}

    // 5. Priority filter
    if (priorityFilter && act.priority !== priorityFilter) return false;

    // 6. Assigned filter (only applicable for users with team-wide visibility in "all" mode)
    if (userContext.canViewAllActivities && viewMode === "all" && assignedFilter) {
      if (act.assigned_to !== assignedFilter) return false;
    }

    return true;
  });

  const getStatusBadgeClass = (st: string) => {
    switch (st) {
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

  const getPriorityBadgeClass = (pr: string) => {
    switch (pr) {
      case "High":
        return "priority-high";
      case "Medium":
        return "priority-medium";
      case "Low":
      default:
        return "priority-low";
    }
  };

  const getTypeBadgeClass = (tp: string) => {
    switch (tp) {
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
    <div className="activities-page">
      {/* Toast Notification */}
      {notification && (
        <div
          className="notification-toast"
          style={{
            background: notification.type === "success" ? "#38a169" : "#e53e3e",
            color: "white",
          }}
        >
          {notification.message}
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>{isTasksRoute || viewMode === "my" ? "My Tasks" : "Activities"}</h1>
          <p className="text-muted" style={{ margin: "4px 0 0" }}>
            {isTasksRoute || viewMode === "my"
              ? "Manage and complete your assigned tasks and follow-ups."
              : "Track tasks, calls, and meetings across your CRM records."}
          </p>
        </div>

        <div className="header-actions">
          {/* Segmented View Mode Control (only for roles with team-wide visibility) */}
          {userContext.canViewAllActivities && (
            <div className="view-segmented-control">
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
                My Tasks
              </button>
            </div>
          )}

          {permissions.create && (
            <button
              className="btn-primary"
              onClick={() => {
                setEditActivity(null);
                setIsFormOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Activity
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="leads-filter-bar">
        <div className="leads-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by title, description or related record..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="Task">Task</option>
          <option value="Call">Call</option>
          <option value="Meeting">Meeting</option>
        </select>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          className="filter-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        {/* Assigned user filter only shown when user has team-wide visibility and is in "all" view */}
        {userContext.canViewAllActivities && viewMode === "all" && (
          <select
            className="filter-select"
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
          >
            <option value="">All Assigned Users</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button className="btn-clear-filters" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Table Content */}
      <div className="users-table-container">
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#718096" }}>
            Loading activities...
          </div>
        ) : error ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ color: "#e53e3e", marginBottom: "16px", fontSize: "1rem" }}>{error}</p>
            <button className="btn-secondary" onClick={fetchData}>
              Retry
            </button>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <p style={{ color: "#718096", marginBottom: "16px", fontSize: "1rem" }}>
              {hasActiveFilters
                ? "No activities found matching your filters."
                : !userContext.canViewAllActivities || viewMode === "my"
                ? "No activities currently assigned to you."
                : "No activities found."}
            </p>
            {hasActiveFilters ? (
              <button className="btn-secondary" onClick={clearFilters}>
                Clear Filters
              </button>
            ) : permissions.create ? (
              <button
                className="btn-primary"
                onClick={() => {
                  setEditActivity(null);
                  setIsFormOpen(true);
                }}
                style={{ margin: "0 auto" }}
              >
                Create First Activity
              </button>
            ) : null}
          </div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Type</th>
                <th>Related To</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Assigned To</th>
                <th>Updated</th>
                <th style={{ width: "80px", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredActivities.map((act) => {
                const assignedUser = getUserDisplay(act.assigned_to);
                const acctName = getAccountName(act.account_id);
                const leadName = getLeadName(act.lead_id);
                const contName = getContactName(act.contact_id);
                const dealName = getDealName(act.deal_id);

                return (
                  <tr key={act.id}>
                    {/* Title */}
                    <td>
                      <div style={{ lineHeight: 1.4 }}>
                        <span
                          className="activity-title"
                          onClick={() => setViewActivity(act)}
                        >
                          {act.title}
                        </span>
                        {act.description && (
                          <div className="activity-description">
                            {act.description}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td>
                      <span className={`activity-type-badge ${getTypeBadgeClass(act.activity_type)}`}>
                        {act.activity_type}
                      </span>
                    </td>

                    {/* Related Records */}
                    <td>
                      <div className="related-pill-container">
                        {acctName && (
                          <div className="related-pill">
                            <span className="related-pill-label">Acct:</span>
                            <span>{acctName}</span>
                          </div>
                        )}
                        {leadName && (
                          <div
                            className="related-pill related-pill-clickable"
                            title={`View lead: ${leadName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const leadObj = leads.find((l) => l.id === act.lead_id);
                              if (leadObj) {
                                setViewLeadState(leadObj);
                              }
                            }}
                            style={{ cursor: "pointer" }}
                          >
                            <span className="related-pill-label">Lead:</span>
                            <span style={{ textDecoration: "underline", fontWeight: 500 }}>{leadName}</span>
                          </div>
                        )}
                        {contName && (
                          <div className="related-pill">
                            <span className="related-pill-label">Contact:</span>
                            <span>{contName}</span>
                          </div>
                        )}
                        {dealName && (
                          <div className="related-pill">
                            <span className="related-pill-label">Deal:</span>
                            <span>{dealName}</span>
                          </div>
                        )}
                        {!acctName && !leadName && !contName && !dealName && (
                          <span className="text-muted">—</span>
                        )}
                      </div>
                    </td>

                    {/* Priority */}
                    <td>
                      <span className={`activity-priority-badge ${getPriorityBadgeClass(act.priority)}`}>
                        {act.priority}
                      </span>
                    </td>

                    {/* Status */}
                    <td>
                      <span className={`activity-status-badge ${getStatusBadgeClass(act.status)}`}>
                        {act.status}
                      </span>
                    </td>

                    {/* Due Date */}
                    <td>
                      <span style={{ fontSize: "0.85rem" }}>
                        {formatDateTime(act.due_date)}
                      </span>
                    </td>

                    {/* Assigned User */}
                    <td>
                      {act.assigned_to && assignedUser.name !== "—" ? (
                        <div className="lead-name-cell" style={{ gap: "10px" }}>
                          <div className="lead-avatar">
                            {assignedUser.name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ lineHeight: 1.3 }}>
                            <span className="lead-name-text">{assignedUser.name}</span>
                            {assignedUser.role && (
                              <>
                                <br />
                                <span className="text-dim" style={{ fontSize: "0.78rem" }}>
                                  {assignedUser.role}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>

                    {/* Updated At */}
                    <td>
                      <div className="text-sm text-muted">
                        {formatDateTime(act.updated_at)}
                      </div>
                    </td>

                    {/* Actions Cell */}
                    <td className="actions-cell">
                      <button
                        className={`btn-icon activity-action-btn ${openActionId === act.id ? "active" : ""}`}
                        ref={(el) => (triggerRefs.current[act.id] = el)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActions(act.id);
                        }}
                        aria-label={`Actions for ${act.title || "activity"}`}
                        aria-haspopup="true"
                        aria-expanded={openActionId === act.id}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                          <circle cx="12" cy="12" r="1.2"></circle>
                          <circle cx="12" cy="5" r="1.2"></circle>
                          <circle cx="12" cy="19" r="1.2"></circle>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Floating Actions Dropdown */}
      {openActionId && dropdownPos && (
        <div
          ref={actionsRef}
          className={`activity-actions-dropdown actions-dropdown actions-dropdown-fixed ${dropdownPos.openUp ? "open-up" : ""}`}
          style={{
            position: "fixed",
            top: dropdownPos.top !== undefined ? `${dropdownPos.top}px` : undefined,
            bottom: dropdownPos.bottom !== undefined ? `${dropdownPos.bottom}px` : undefined,
            left: `${dropdownPos.left}px`,
            zIndex: 9999,
          }}
        >
          {(() => {
            const activeActivity = activities.find((a) => a.id === openActionId);
            if (!activeActivity) return null;

            return (
              <>
                <button
                  type="button"
                  className="dropdown-item activity-dropdown-item"
                  onClick={() => {
                    setViewActivity(activeActivity);
                    setOpenActionId(null);
                    setDropdownPos(null);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <span>View Details</span>
                </button>

                {activeActivity.lead_id && (
                  <button
                    type="button"
                    className="dropdown-item activity-dropdown-item"
                    onClick={() => {
                      const leadObj = leads.find((l) => l.id === activeActivity.lead_id);
                      if (leadObj) {
                        setViewLeadState(leadObj);
                      }
                      setOpenActionId(null);
                      setDropdownPos(null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span>View Related Lead</span>
                  </button>
                )}

                {permissions.update && (
                  <button
                    type="button"
                    className="dropdown-item activity-dropdown-item"
                    onClick={() => {
                      setEditActivity(activeActivity);
                      setIsFormOpen(true);
                      setOpenActionId(null);
                      setDropdownPos(null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Edit Activity</span>
                  </button>
                )}

                {permissions.delete && (
                  <button
                    type="button"
                    className="dropdown-item activity-dropdown-item delete-action text-danger"
                    onClick={() => {
                      setDeleteActivityState(activeActivity);
                      setOpenActionId(null);
                      setDropdownPos(null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete Activity</span>
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Modals */}
      {isFormOpen && (
        <ActivityFormModal
          activity={editActivity}
          onClose={() => {
            setIsFormOpen(false);
            setEditActivity(null);
          }}
          onSuccess={(saved) => {
            if (editActivity) {
              setActivities((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
              showToast("Activity updated successfully.");
            } else {
              setActivities((prev) => [saved, ...prev]);
              showToast("Activity created successfully.");
            }
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
            setActivities((prev) => prev.filter((a) => a.id !== deleteActivityState.id));
            showToast("Activity deleted successfully.");
          }}
        />
      )}
    </div>
  );
}