import { useState, useEffect, useCallback, useMemo } from "react";
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

  const [, setRelatedRevision] = useState(0);
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


  // Toast
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  };

  /* ─── Cache Warmer for Related Records ─── */
  const warmRelatedModulesCache = useCallback((taskList: Activity[]) => {
    const modulesToFetch = new Set<string>();
    for (const t of taskList) {
      for (const link of t.related_records || []) {
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

      warmRelatedModulesCache(taskActivities);
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
  }, [viewMode, userContext.canViewAllActivities, warmRelatedModulesCache]);

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
      // Search filter (including resolved industry related names)
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
        const industryMatch = (task.related_records || []).some((link) => {
          const resolved = getCachedRecordLabel(link.module, link.record_id) || "";
          const modLabel = MODULE_DISPLAY_NAMES[link.module] || "";
          return resolved.toLowerCase().includes(q) || modLabel.toLowerCase().includes(q);
        });

        if (!titleMatch && !descMatch && !leadMatch && !contactMatch && !accountMatch && !industryMatch) {
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
              <span className="btn-icon">+</span>
              Create Task
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="task-summary-cards">
        <div
          className={`task-kpi-card ${!statusFilter ? "active" : ""}`}
          onClick={() => handleStatusFilterChange("")}
          role="button"
          tabIndex={0}
        >
          <span className="task-kpi-label">All Tasks</span>
          <span className="task-kpi-value">{summaryCounts.total}</span>
        </div>

        <div
          className={`task-kpi-card ${statusFilter.toLowerCase() === "pending" ? "active" : ""}`}
          onClick={() => handleStatusFilterChange("Pending")}
          role="button"
          tabIndex={0}
        >
          <span className="task-kpi-label">Pending</span>
          <span className="task-kpi-value text-amber">{summaryCounts.pending}</span>
        </div>

        <div
          className={`task-kpi-card ${statusFilter.toLowerCase() === "in progress" || statusFilter.toLowerCase() === "in-progress"
            ? "active"
            : ""
            }`}
          onClick={() => handleStatusFilterChange("In Progress")}
          role="button"
          tabIndex={0}
        >
          <span className="task-kpi-label">In Progress</span>
          <span className="task-kpi-value text-blue">{summaryCounts.inProgress}</span>
        </div>

        <div
          className={`task-kpi-card ${statusFilter.toLowerCase() === "completed" ? "active" : ""}`}
          onClick={() => handleStatusFilterChange("Completed")}
          role="button"
          tabIndex={0}
        >
          <span className="task-kpi-label">Completed</span>
          <span className="task-kpi-value text-green">{summaryCounts.completed}</span>
        </div>

        <div
          className={`task-kpi-card ${statusFilter.toLowerCase() === "overdue" ? "active" : ""}`}
          onClick={() => handleStatusFilterChange("Overdue")}
          role="button"
          tabIndex={0}
        >
          <span className="task-kpi-label">Overdue</span>
          <span className="task-kpi-value text-red">{summaryCounts.overdue}</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="filter-card">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by title, description, lead, account, contact, or industry project/property..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="filters-group">
          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Overdue">Overdue</option>
          </select>

          {/* Priority Dropdown */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            aria-label="Filter by priority"
          >
            <option value="">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>

          {/* Due Date Dropdown */}
          <select
            value={dueDateFilter}
            onChange={(e) => setDueDateFilter(e.target.value)}
            aria-label="Filter by due date"
          >
            <option value="">All Due Dates</option>
            <option value="today">Due Today</option>
            <option value="week">Due Next 7 Days</option>
            <option value="overdue">Overdue</option>
          </select>

          {/* Assigned User Dropdown */}
          {userContext.canViewAllActivities && viewMode === "all" && (
            <select
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
          )}

          {hasActiveFilters && (
            <button
              type="button"
              className="btn-secondary"
              onClick={clearFilters}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="tasks-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading tasks...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <button type="button" className="btn-secondary" onClick={() => void fetchData()}>
              Retry
            </button>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✓</div>
            <h3>{hasActiveFilters ? "No tasks match your filters" : "No tasks found"}</h3>
            <p className="text-muted">
              {hasActiveFilters
                ? "Try clearing filters to view all tasks."
                : "Create your first task to start organizing your work."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={clearFilters}
                style={{ marginTop: "12px" }}
              >
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
                style={{ marginTop: "12px" }}
              >
                + Create Task
              </button>
            ) : null}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table tasks-table">
              <thead>
                <tr>
                  <th className="col-task">Task</th>
                  <th className="col-lead">Related Entity</th>
                  <th className="col-assigned">Assigned To</th>
                  <th className="col-due">Due Date</th>
                  <th className="col-priority">Priority</th>
                  <th className="col-status">Status</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.map((task) => {
                  const assignedUser = users.find((u) => u.id === task.assigned_to);
                  const relatedLead = leads.find((l) => l.id === task.lead_id);
                  const relatedContact = contacts.find((c) => c.id === task.contact_id);
                  const relatedAccount = accounts.find((a) => a.id === task.account_id);
                  const overdue = isTaskOverdue(task);

                  const initials = assignedUser?.full_name
                    ? assignedUser.full_name
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)
                    : "—";

                  return (
                    <tr
                      key={task.id}
                      className={`task-row ${overdue ? "task-row-overdue" : ""}`}
                      onClick={() => setViewActivity(task)}
                      style={{ cursor: "pointer" }}
                    >
                      {/* Task Title & Description */}
                      <td className="col-task">
                        <div className="task-title-cell">
                          <span className="task-title-text">{task.title}</span>
                          {task.description && (
                            <span className="task-desc-text text-muted">
                              {task.description}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Related Lead / Record + Industry Records */}
                      <td className="col-lead">
                        {relatedLead ? (
                          <button
                            type="button"
                            className="task-lead-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewLeadState(relatedLead);
                            }}
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

                        {/* Industry Related Records */}
                        {task.related_records && task.related_records.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginTop: "4px" }}>
                            {task.related_records.map((link) => {
                              const resolved = getCachedRecordLabel(link.module, link.record_id);
                              const modName = MODULE_DISPLAY_NAMES[link.module] || link.module.replace("_", " ");
                              return (
                                <span
                                  key={`${link.module}-${link.record_id}`}
                                  style={{
                                    fontSize: "0.72rem",
                                    background: "#f1f5f9",
                                    color: "#334155",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    display: "inline-block",
                                  }}
                                  title={`${modName}: ${resolved || link.record_id}`}
                                >
                                  <strong>{modName}:</strong> {resolved || `#${link.record_id.slice(0, 8)}`}
                                </span>
                              );
                            })}
                          </div>
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
                        <div className="crm-inline-actions">
                          <button
                            type="button"
                            className="crm-action-btn view-btn"
                            title="View Task Details"
                            aria-label="View Task Details"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewActivity(task);
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
                              title="Edit Task"
                              aria-label="Edit Task"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditActivity(task);
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
                              title="Delete Task"
                              aria-label="Delete Task"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteActivityState(task);
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
          defaultType="Task"
          onClose={() => {
            setIsFormOpen(false);
            setEditActivity(null);
          }}
          onSuccess={(saved) => {
            if (editActivity) {
              setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
              showToast("Task updated successfully.");
            } else {
              setTasks((prev) => [saved, ...prev]);
              showToast("Task created successfully.");
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
            setTasks((prev) => prev.filter((t) => t.id !== deleteActivityState.id));
            showToast("Task deleted successfully.");
          }}
        />
      )}
    </div>
  );
}
