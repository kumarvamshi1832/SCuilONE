import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
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
  getActivityPermissions,
  getActivityUserContext,
  isActivityVisibleToUser,
} from "../../utils/activityPermissions";
import ActivityFormModal from "../../components/activities/ActivityFormModal";
import ActivityViewModal from "../../components/activities/ActivityViewModal";
import ActivityDeleteConfirm from "../../components/activities/ActivityDeleteConfirm";
import LeadViewModal from "../../components/leads/LeadViewModal";
import { formatDateTime } from "../../utils/dateFormatter";
import {
  isTask,
  isTaskOverdue,
  calculateTaskSummary,
  matchesStatusFilter,
} from "../../utils/taskStatus";
import "../users/Users.css";
import "../leads/Leads.css";
import "../activities/Activities.css";
import "./Tasks.css";

export default function Tasks() {
  /* ─── Permissions & User Context ─── */
  const userContext = useMemo(() => getActivityUserContext(), []);
  const permissions = useMemo(() => getActivityPermissions(), []);

  /* ─── State ─── */
  const [tasks, setTasks] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ─── URL Query Params ─── */
  const [searchParams, setSearchParams] = useSearchParams();

  // View Mode: Managers and Tenant Admins can toggle "all" vs "my"; ordinary users default to "my"
  const [viewMode, setViewMode] = useState<"all" | "my">(() => {
    return userContext.canViewAllActivities ? "all" : "my";
  });

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [dueDateFilter, setDueDateFilter] = useState<string>("");
  const [assignedFilter, setAssignedFilter] = useState<string>("");

  // Sync state from URL query parameters (e.g. from Dashboard Task Overview clicks)
  useEffect(() => {
    const rawStatus = searchParams.get("status");
    const isOverdue = searchParams.get("overdue") === "true";

    if (isOverdue || rawStatus?.toLowerCase() === "overdue") {
      setStatusFilter("Overdue");
    } else if (rawStatus) {
      const lower = rawStatus.toLowerCase();
      if (lower === "pending") setStatusFilter("Pending");
      else if (lower === "completed") setStatusFilter("Completed");
      else if (lower === "in progress" || lower === "in-progress") setStatusFilter("In Progress");
      else if (lower === "cancelled") setStatusFilter("Cancelled");
      else setStatusFilter(rawStatus);
    }
  }, [searchParams]);

  // Update URL search parameters when statusFilter changes
  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      if (newStatus) {
        updated.set("status", newStatus.toLowerCase());
        updated.delete("overdue");
      } else {
        updated.delete("status");
        updated.delete("overdue");
      }
      return updated;
    });
  };

  /* ─── Modals ─── */
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [viewActivity, setViewActivity] = useState<Activity | null>(null);
  const [viewLeadState, setViewLeadState] = useState<Lead | null>(null);
  const [deleteActivityState, setDeleteActivityState] = useState<Activity | null>(null);

  // Actions dropdown
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  // Toast
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  /* ─── Data Fetching ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const shouldFetchMyTasks = !userContext.canViewAllActivities || viewMode === "my";
      const fetchFunction = shouldFetchMyTasks ? getMyTasks : getActivities;
      const [activitiesData, usersData, leadsData, contactsData, accountsData, dealsData] =
        await Promise.all([
          fetchFunction(),
          getUsers().catch(() => []),
          getLeads().catch(() => []),
          getContacts().catch(() => []),
          getAccounts().catch(() => []),
          getDeals().catch(() => []),
        ]);
      // Filter strictly by task activities so meetings and calls are never mixed into Tasks
      const taskActivities = (activitiesData || []).filter(isTask);
      setTasks(taskActivities);
      setUsers(usersData || []);
      setLeads(leadsData || []);
      setContacts(contactsData || []);
      setAccounts(accountsData || []);
      setDeals(dealsData || []);
    } catch (err: any) {
      console.error("Fetch tasks error:", err);
      if (err?.response?.status === 401 || err?.status === 401) {
        setError("Your session has expired. Please log in again.");
      } else if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to view tasks.");
      } else if (err?.response?.status >= 500 || err?.status >= 500) {
        setError("Unable to load tasks from server. Please retry.");
      } else {
        setError(
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load tasks."
        );
      }
    } finally {
      setLoading(false);
    }
  }, [viewMode, userContext.canViewAllActivities]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Real-time update listener
  useEffect(() => {
    const handleUpdate = () => {
      void fetchData();
    };
    window.addEventListener("crm:activity-updated", handleUpdate);
    return () => window.removeEventListener("crm:activity-updated", handleUpdate);
  }, [fetchData]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ─── Visible & Filtered Tasks ─── */
  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => isActivityVisibleToUser(task, userContext, viewMode));
  }, [tasks, userContext, viewMode]);

  // Summary counts computed across all visible tasks using unified status helper
  const summaryCounts = useMemo(() => {
    return calculateTaskSummary(visibleTasks);
  }, [visibleTasks]);

  // Filtered tasks for the table
  const filteredTasks = useMemo(() => {
    return visibleTasks.filter((task) => {
      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const titleMatch = task.title?.toLowerCase().includes(q);
        const descMatch = task.description?.toLowerCase().includes(q);
        const lead = leads.find((l) => l.id === task.lead_id);
        const leadMatch = lead?.full_name?.toLowerCase().includes(q);
        const contact = contacts.find((c) => c.id === task.contact_id);
        const contactMatch = contact?.full_name?.toLowerCase().includes(q);
        const account = accounts.find((a) => a.id === task.account_id);
        const accountMatch = account?.name?.toLowerCase().includes(q);

        if (!titleMatch && !descMatch && !leadMatch && !contactMatch && !accountMatch) {
          return false;
        }
      }

      // Status filter using unified normalization logic
      if (statusFilter) {
        if (!matchesStatusFilter(task, statusFilter)) {
          return false;
        }
      }

      // Priority filter
      if (priorityFilter) {
        if ((task.priority || "").toLowerCase() !== priorityFilter.toLowerCase()) {
          return false;
        }
      }

      // Due date filter
      if (dueDateFilter) {
        if (!task.due_date) return false;
        const due = new Date(task.due_date);
        if (isNaN(due.getTime())) return false;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        if (dueDateFilter === "today") {
          if (due < todayStart || due > todayEnd) return false;
        } else if (dueDateFilter === "week") {
          const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          if (due < todayStart || due > weekEnd) return false;
        } else if (dueDateFilter === "overdue") {
          if (!isTaskOverdue(task)) return false;
        }
      }

      // Assigned user filter
      if (assignedFilter) {
        if (task.assigned_to !== assignedFilter) return false;
      }

      return true;
    });
  }, [visibleTasks, search, statusFilter, priorityFilter, dueDateFilter, assignedFilter, leads, contacts, accounts]);

  const hasActiveFilters = Boolean(
    search || statusFilter || priorityFilter || dueDateFilter || assignedFilter
  );

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setDueDateFilter("");
    setAssignedFilter("");
    setSearchParams((prev) => {
      const updated = new URLSearchParams(prev);
      updated.delete("status");
      updated.delete("overdue");
      return updated;
    });
  };

  return (
    <div className="tasks-page">
      {/* Toast Notification */}
      {notification && (
        <div
          className="notification-toast"
          style={{
            background: notification.type === "success" ? "#16a34a" : "#dc2626",
            color: "#ffffff",
          }}
          role="status"
        >
          {notification.message}
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>{viewMode === "my" || !userContext.canViewAllActivities ? "My Tasks" : "Tasks"}</h1>
          <p className="text-muted" style={{ margin: "4px 0 0" }}>
            {viewMode === "my" || !userContext.canViewAllActivities
              ? "Track, manage, and complete your assigned tasks."
              : "Track and manage tasks assigned across your entire organization."}
          </p>
        </div>

        <div className="header-actions">
          {/* Segmented View Mode Control (only for managers / admins) */}
          {userContext.canViewAllActivities && (
            <div className="view-segmented-control" role="group" aria-label="Task view filter">
              <button
                type="button"
                className={`view-segment-btn ${viewMode === "all" ? "active" : ""}`}
                onClick={() => setViewMode("all")}
              >
                All Tasks
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
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditActivity(null);
                setIsFormOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Create Task
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="tasks-summary-grid">
        <div
          className={`tasks-summary-card total ${!statusFilter ? "is-active" : ""}`}
          onClick={() => handleStatusFilterChange("")}
          title="Click to view all tasks"
        >
          <div className="tasks-summary-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <div className="tasks-summary-content">
            <span className="tasks-summary-title">Total Tasks</span>
            <span className="tasks-summary-value">{summaryCounts.total}</span>
            <span className="tasks-summary-subtitle">All active & finished</span>
          </div>
        </div>

        <div
          className={`tasks-summary-card pending ${statusFilter === "Pending" ? "is-active" : ""}`}
          onClick={() => handleStatusFilterChange(statusFilter === "Pending" ? "" : "Pending")}
          title="Click to filter by Pending tasks"
        >
          <div className="tasks-summary-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="tasks-summary-content">
            <span className="tasks-summary-title">Pending</span>
            <span className="tasks-summary-value">{summaryCounts.pending}</span>
            <span className="tasks-summary-subtitle">Requires attention</span>
          </div>
        </div>

        <div
          className={`tasks-summary-card completed ${statusFilter === "Completed" ? "is-active" : ""}`}
          onClick={() => handleStatusFilterChange(statusFilter === "Completed" ? "" : "Completed")}
          title="Click to filter by Completed tasks"
        >
          <div className="tasks-summary-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="tasks-summary-content">
            <span className="tasks-summary-title">Completed</span>
            <span className="tasks-summary-value">{summaryCounts.completed}</span>
            <span className="tasks-summary-subtitle">Finished tasks</span>
          </div>
        </div>

        <div
          className={`tasks-summary-card overdue ${statusFilter === "Overdue" ? "is-active" : ""}`}
          onClick={() => handleStatusFilterChange(statusFilter === "Overdue" ? "" : "Overdue")}
          title="Click to filter by Overdue tasks"
        >
          <div className="tasks-summary-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="tasks-summary-content">
            <span className="tasks-summary-title">Overdue</span>
            <span className="tasks-summary-value">{summaryCounts.overdue}</span>
            <span className="tasks-summary-subtitle">Past due date</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="tasks-filter-bar">
        <div className="tasks-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by title, description, or lead..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search tasks"
          />
        </div>

        <select
          className="tasks-filter-select"
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="Overdue">Overdue</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          className="tasks-filter-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          aria-label="Filter by priority"
        >
          <option value="">All Priorities</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <select
          className="tasks-filter-select"
          value={dueDateFilter}
          onChange={(e) => setDueDateFilter(e.target.value)}
          aria-label="Filter by due date"
        >
          <option value="">All Due Dates</option>
          <option value="today">Due Today</option>
          <option value="week">Due This Week</option>
          <option value="overdue">Overdue</option>
        </select>

        {userContext.canViewAllActivities && viewMode === "all" && (
          <select
            className="tasks-filter-select"
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            aria-label="Filter by assigned user"
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
          <button type="button" className="btn-clear-tasks-filters" onClick={clearFilters}>
            Clear Filters
          </button>
        )}
      </div>

      {/* Main Table Content */}
      <div className="tasks-table-card">
        {loading ? (
          <div className="tasks-loading-state" role="status">
            <div className="tasks-spinner" aria-hidden="true" />
            <span>Loading tasks...</span>
          </div>
        ) : error ? (
          <div className="tasks-error-state" role="alert">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <strong>{error}</strong>
            <button type="button" className="btn-primary" onClick={() => void fetchData()}>
              Retry
            </button>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="tasks-empty-state" role="status">
            <div className="tasks-empty-icon" aria-hidden="true">
              ✓
            </div>
            <h3>No tasks found</h3>
            <p>
              {hasActiveFilters
                ? "No tasks match your current filter criteria. Try clearing filters to see all tasks."
                : "No tasks scheduled. Create your first task to get started."}
            </p>
            {hasActiveFilters ? (
              <button type="button" className="btn-secondary" onClick={clearFilters} style={{ marginTop: "8px" }}>
                Clear Filters
              </button>
            ) : permissions.create ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setEditActivity(null);
                  setIsFormOpen(true);
                }}
                style={{ marginTop: "8px" }}
              >
                + Create Task
              </button>
            ) : null}
          </div>
        ) : (
          <div className="tasks-table-responsive">
            <table className="tasks-main-table">
              <thead>
                <tr>
                  <th className="col-title">Task Title</th>
                  <th className="col-lead">Related Lead</th>
                  <th className="col-assigned">Assigned To</th>
                  <th className="col-due">Due Date</th>
                  <th className="col-priority">Priority</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const relatedLead = leads.find((l) => l.id === task.lead_id);
                  const relatedContact = contacts.find((c) => c.id === task.contact_id);
                  const relatedAccount = accounts.find((a) => a.id === task.account_id);
                  const assignedUser = users.find((u) => u.id === task.assigned_to);
                  const overdue = isTaskOverdue(task);

                  const initials = assignedUser?.full_name
                    ? assignedUser.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "?";

                  return (
                    <tr key={task.id} className="tasks-table-row">
                      {/* Task Title */}
                      <td className="col-title">
                        <div className="task-title-cell-wrap">
                          <button
                            type="button"
                            className="task-title-link"
                            onClick={() => setViewActivity(task)}
                            title="Click to view details"
                          >
                            {task.title}
                          </button>
                          {task.description && (
                            <span className="task-desc-preview" title={task.description}>
                              {task.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Related Lead / Record */}
                      <td className="col-lead">
                        {relatedLead ? (
                          <button
                            type="button"
                            className="task-lead-btn"
                            onClick={() => setViewLeadState(relatedLead)}
                            title={`View lead: ${relatedLead.full_name}`}
                          >
                            {relatedLead.full_name}
                          </button>
                        ) : relatedContact ? (
                          <span className="text-muted" title="Contact">
                            {relatedContact.full_name}
                          </span>
                        ) : relatedAccount ? (
                          <span className="text-muted" title="Account">
                            {relatedAccount.name}
                          </span>
                        ) : task.lead_id ? (
                          <span className="text-muted">Lead #{task.lead_id.slice(0, 8)}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      {/* Assigned To */}
                      <td className="col-assigned">
                        <div className="task-user-cell">
                          <div className="task-user-avatar" aria-hidden="true">
                            {initials}
                          </div>
                          <span className="task-user-name">
                            {assignedUser?.full_name || "Unassigned"}
                          </span>
                        </div>
                      </td>

                      {/* Due Date */}
                      <td className="col-due">
                        <div className="task-due-cell-wrap">
                          <span className="task-due-date-text">
                            {task.due_date ? formatDateTime(task.due_date) : "—"}
                          </span>
                          {overdue && (
                            <span className="task-overdue-tag">
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="col-priority">
                        <span
                          className={`activity-priority-badge priority-${(task.priority || "medium").toLowerCase()}`}
                        >
                          {task.priority || "Medium"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="col-status">
                        <span
                          className={`activity-status-badge status-${(task.status || "pending")
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {task.status || "Pending"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="col-actions">
                        <div
                          className="task-actions-wrapper"
                          ref={openActionId === task.id ? actionsRef : null}
                        >
                          <button
                            type="button"
                            className="task-dots-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionId(openActionId === task.id ? null : task.id);
                            }}
                            aria-label={`Actions for ${task.title}`}
                            title="Actions"
                          >
                            ⋮
                          </button>

                          {openActionId === task.id && (
                            <div className="task-actions-dropdown" role="menu">
                              <button
                                type="button"
                                className="task-dropdown-item"
                                role="menuitem"
                                onClick={() => {
                                  setOpenActionId(null);
                                  setViewActivity(task);
                                }}
                              >
                                View Details
                              </button>

                              {permissions.update && (
                                <button
                                  type="button"
                                  className="task-dropdown-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    setEditActivity(task);
                                    setIsFormOpen(true);
                                  }}
                                >
                                  Edit Task
                                </button>
                              )}

                              {permissions.delete && (
                                <button
                                  type="button"
                                  className="task-dropdown-item delete"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    setDeleteActivityState(task);
                                  }}
                                >
                                  Delete Task
                                </button>
                              )}
                            </div>
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

      {/* ─── Modals ─── */}
      {isFormOpen && (
        <ActivityFormModal
          activity={editActivity}
          defaultType="Task"
          onClose={() => {
            setIsFormOpen(false);
            setEditActivity(null);
          }}
          onSuccess={(saved) => {
            setIsFormOpen(false);
            setEditActivity(null);
            if (editActivity) {
              setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
              showToast("Task updated successfully.");
            } else {
              setTasks((prev) => [saved, ...prev]);
              showToast("Task created successfully.");
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
          onEdit={() => {}}
        />
      )}

      {deleteActivityState && (
        <ActivityDeleteConfirm
          activity={deleteActivityState}
          onClose={() => setDeleteActivityState(null)}
          onSuccess={() => {
            const deletedId = deleteActivityState.id;
            setTasks((prev) => prev.filter((t) => t.id !== deletedId));
            setDeleteActivityState(null);
            showToast("Task deleted successfully.");
          }}
        />
      )}
    </div>
  );
}
