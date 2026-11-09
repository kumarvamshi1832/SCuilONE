import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSoftwareSprints,
  createSoftwareSprint,
  updateSoftwareSprint,
  deleteSoftwareSprint,
} from "../../services/softwareSprintService";
import {
  clearSoftwareForbidden,
  extractBackendDetail,
} from "../../services/softwareRequestManager";
import { getSoftwareProjects } from "../../services/softwareProjectService";
import { getActivities, updateActivity } from "../../services/activityService";
import { getTimeEntries } from "../../services/softwareTimeEntryService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
import {
  getActivityPermissions,
  getActivityUserContext,
} from "../../utils/activityPermissions";
import { getAllowedStatuses } from "../../utils/activityStatusTransitions";

import ActivityFormModal from "../../components/activities/ActivityFormModal";
import ActivityViewModal from "../../components/activities/ActivityViewModal";
import ActivityDeleteConfirm from "../../components/activities/ActivityDeleteConfirm";

import type {
  SoftwareSprint,
  SoftwareSprintCreate,
  SoftwareSprintUpdate,
  SoftwareSprintStatus,
} from "../../types/softwareSprint";
import { SOFTWARE_SPRINT_STATUSES } from "../../types/softwareSprint";
import type { SoftwareProject } from "../../types/softwareProject";
import type {
  Activity,
  ActivityStatus,
  ActivityLinkInput,
} from "../../types/activity";
import type { SoftwareTimeEntry } from "../../types/softwareTimeEntry";
import type { User } from "../../types/user";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import type { Account } from "../../types/account";
import type { Deal } from "../../types/deal";

import "./SoftwareModules.css";
import SoftwareViewToggle from "./SoftwareViewToggle";
import "./SoftwareSprints.css";

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getDaysRemaining(endDateStr: string): { label: string; isPast: boolean; days: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDateStr);
  end.setHours(0, 0, 0, 0);
  const diffTime = end.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return { label: `${Math.abs(diffDays)}d overdue`, isPast: true, days: diffDays };
  } else if (diffDays === 0) {
    return { label: "Ends today", isPast: false, days: 0 };
  } else {
    return { label: `${diffDays} days left`, isPast: false, days: diffDays };
  }
}

function isDateOverdue(dateStr?: string | null, status?: ActivityStatus): boolean {
  if (!dateStr || status === "Completed" || status === "Cancelled") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function getSprintNumber(sprint: SoftwareSprint, index: number): string {
  const match = sprint.name.match(/sprint\s*(\d+)/i) || sprint.name.match(/(\d+)/);
  if (match) {
    return `SP-${String(match[1]).padStart(2, "0")}`;
  }
  return `SP-${String(index + 1).padStart(2, "0")}`;
}

export default function SoftwareSprints() {
  /* ─── View Toggle State (Grid by default, persisted in localStorage) ─── */
  const [viewMode, setViewMode] = useState<"grid" | "table">(() => {
    try {
      const saved = localStorage.getItem("software_sprints_view_mode");
      if (saved === "table" || saved === "grid") return saved;
    } catch {
      // ignore storage access errors
    }
    return "grid";
  });

  const handleViewModeChange = (mode: "grid" | "table") => {
    setViewMode(mode);
    try {
      localStorage.setItem("software_sprints_view_mode", mode);
    } catch {
      // ignore storage access errors
    }
  };

  /* ─── State ─── */
  const [sprints, setSprints] = useState<SoftwareSprint[]>([]);
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [tasks, setTasks] = useState<Activity[]>([]);
  const [timeEntries, setTimeEntries] = useState<SoftwareTimeEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Lookup data for modals
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenDetail, setForbiddenDetail] = useState<string | null>(null);

  // User Context & Permissions
  const userContext = useMemo(() => getActivityUserContext(), []);
  const permissions = useMemo(() => getActivityPermissions(), []);
  const currentUserId = userContext.userId;

  // Filter Tabs: Me, All, Members, Teams
  const [activeTab, setActiveTab] = useState<"all" | "me" | "members" | "teams">("all");
  const [selectedMemberId, setSelectedMemberId] = useState<string>("");
  const [taskSearch, setTaskSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  // Expand / collapse section IDs
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(new Set());
  const [isBacklogExpanded, setIsBacklogExpanded] = useState(true);

  // Modals state for Sprint CRUD
  const [isSprintModalOpen, setIsSprintModalOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState<SoftwareSprint | null>(null);
  const [viewingSprint, setViewingSprint] = useState<SoftwareSprint | null>(null);
  const [deletingSprint, setDeletingSprint] = useState<SoftwareSprint | null>(null);
  const [sprintFormError, setSprintFormError] = useState<string | null>(null);
  const [sprintSubmitting, setSprintSubmitting] = useState(false);

  const [sprintFormData, setSprintFormData] = useState<SoftwareSprintCreate>({
    software_project_id: "",
    name: "",
    goal: "",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    status: "Planned",
  });

  // Modals state for Task CRUD
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Activity | null>(null);
  const [viewingTask, setViewingTask] = useState<Activity | null>(null);
  const [deletingTask, setDeletingTask] = useState<Activity | null>(null);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  /* ─── Data Fetching ─── */
  const loadData = useCallback(async (forceRetry = false, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    if (forceRetry) {
      clearSoftwareForbidden("software_sprints");
      setIsForbidden(false);
      setForbiddenDetail(null);
    }
    try {
      const [sprintData, projData, actData, timeData, usersData, leadsData, contactsData, accountsData, dealsData] =
        await Promise.all([
          getSoftwareSprints(undefined, { signal, forceRetry }),
          getSoftwareProjects(undefined, { signal, forceRetry }).catch(() => []),
          getActivities().catch(() => []),
          getTimeEntries().catch(() => []),
          getUsers().catch(() => []),
          getLeads().catch(() => []),
          getContacts().catch(() => []),
          getAccounts().catch(() => []),
          getDeals().catch(() => []),
        ]);

      setSprints(Array.isArray(sprintData) ? sprintData : []);
      setProjects(Array.isArray(projData) ? projData : []);

      // Filter only tasks
      const allTasks = (Array.isArray(actData) ? actData : []).filter(
        (a) => (a.activity_type || "").toLowerCase() === "task"
      );
      setTasks(allTasks);

      setTimeEntries(Array.isArray(timeData) ? timeData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setContacts(Array.isArray(contactsData) ? contactsData : []);
      setAccounts(Array.isArray(accountsData) ? accountsData : []);
      setDeals(Array.isArray(dealsData) ? dealsData : []);

      setIsForbidden(false);
      setForbiddenDetail(null);
    } catch (err: any) {
      if (err?.name === "CanceledError" || err?.name === "AbortError") {
        return;
      }
      if (err?.response?.status === 403 || err?.isCachedForbidden) {
        setIsForbidden(true);
        setForbiddenDetail(extractBackendDetail(err));
      } else {
        setError(extractBackendDetail(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // Lookup maps
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Aggregate worked minutes per task from actual SoftwareTimeEntry records
  const taskWorkedMinutesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of timeEntries) {
      if (entry.activity_id && entry.duration_minutes) {
        map.set(
          entry.activity_id,
          (map.get(entry.activity_id) || 0) + entry.duration_minutes
        );
      }
    }
    return map;
  }, [timeEntries]);

  const getWorkedHoursForTask = useCallback((taskId: string): string => {
    const mins = taskWorkedMinutesMap.get(taskId) || 0;
    return mins > 0 ? `${(mins / 60).toFixed(1)}h` : "0h";
  }, [taskWorkedMinutesMap]);

  const getWorkedHoursForSprint = useCallback((sprintTasks: Activity[]): { totalMinutes: number; hoursStr: string } => {
    const totalMinutes = sprintTasks.reduce(
      (acc, t) => acc + (taskWorkedMinutesMap.get(t.id) || 0),
      0
    );
    return {
      totalMinutes,
      hoursStr: totalMinutes > 0 ? `${(totalMinutes / 60).toFixed(1)}h` : "0h",
    };
  }, [taskWorkedMinutesMap]);

  // Helpers to get sprint ID and project ID for a task
  const getSprintIdForTask = useCallback((task: Activity): string | null => {
    const link = task.related_records?.find((r) => r.module === "software_sprint");
    return link ? link.record_id : null;
  }, []);

  const getProjectIdForTask = useCallback((task: Activity): string | null => {
    const projectLink = task.related_records?.find((r) => r.module === "software_project");
    if (projectLink) return projectLink.record_id;
    const sId = getSprintIdForTask(task);
    if (sId) {
      const sp = sprints.find((s) => s.id === sId);
      if (sp) return sp.software_project_id;
    }
    return null;
  }, [getSprintIdForTask, sprints]);

  // Get unique assignees for a sprint
  const getSprintAssignees = useCallback((sprintId: string): User[] => {
    const sprintTasks = tasks.filter((t) => getSprintIdForTask(t) === sprintId);
    const userIds = Array.from(new Set(sprintTasks.map((t) => t.assigned_to).filter(Boolean))) as string[];
    return userIds.map((id) => userMap.get(id)).filter(Boolean) as User[];
  }, [tasks, getSprintIdForTask, userMap]);

  // Filter tasks based on search, active tab, and project filter
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // 1. Tab filter
      if (activeTab === "me") {
        if (!currentUserId || task.assigned_to !== currentUserId) return false;
      } else if (activeTab === "members") {
        if (selectedMemberId && task.assigned_to !== selectedMemberId) return false;
      }

      // 2. Project filter
      if (projectFilter) {
        const pId = getProjectIdForTask(task);
        if (pId !== projectFilter) return false;
      }

      // 3. Search filter
      if (taskSearch.trim()) {
        const q = taskSearch.trim().toLowerCase();
        const pId = getProjectIdForTask(task);
        const pName = pId ? (projectMap.get(pId) || "").toLowerCase() : "";
        const titleMatch = (task.title || "").toLowerCase().includes(q);
        const descMatch = (task.description || "").toLowerCase().includes(q);
        const projMatch = pName.includes(q);
        if (!titleMatch && !descMatch && !projMatch) return false;
      }

      return true;
    });
  }, [tasks, activeTab, selectedMemberId, projectFilter, taskSearch, currentUserId, getProjectIdForTask, projectMap]);

  // Relevant sprints based on project filter
  const relevantSprints = useMemo(() => {
    return sprints.filter((s) => !projectFilter || s.software_project_id === projectFilter);
  }, [sprints, projectFilter]);

  // Identify Current Sprint (Active status, or current date overlap)
  const currentSprint = useMemo(() => {
    const active = relevantSprints.find((s) => s.status === "Active");
    if (active) return active;
    const today = new Date().toISOString().slice(0, 10);
    const ongoing = relevantSprints.find(
      (s) => s.status !== "Completed" && s.status !== "Cancelled" && s.start_date <= today && s.end_date >= today
    );
    if (ongoing) return ongoing;
    return relevantSprints.find((s) => s.status !== "Completed" && s.status !== "Cancelled") || null;
  }, [relevantSprints]);

  // Identify Next Sprint (Planned sprint with earliest start date, not current)
  const nextSprint = useMemo(() => {
    const remaining = relevantSprints
      .filter((s) => s.id !== currentSprint?.id && s.status === "Planned")
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    return remaining[0] || null;
  }, [relevantSprints, currentSprint]);

  // Active or upcoming sprint IDs
  const activeOrPlannedSprintIds = useMemo(() => {
    return new Set(
      relevantSprints
        .filter((s) => s.status === "Active" || s.status === "Planned")
        .map((s) => s.id)
    );
  }, [relevantSprints]);

  // Backlog tasks: Tasks not in any active or planned sprint
  const backlogTasks = useMemo(() => {
    return filteredTasks.filter((task) => {
      const sId = getSprintIdForTask(task);
      return !sId || !activeOrPlannedSprintIds.has(sId);
    });
  }, [filteredTasks, getSprintIdForTask, activeOrPlannedSprintIds]);

  // Group filtered tasks by sprint ID
  const tasksBySprintId = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const task of filteredTasks) {
      const sId = getSprintIdForTask(task);
      if (sId) {
        const arr = map.get(sId) || [];
        arr.push(task);
        map.set(sId, arr);
      }
    }
    return map;
  }, [filteredTasks, getSprintIdForTask]);

  // Expand default sections on first load
  useEffect(() => {
    const nextSet = new Set<string>();
    if (currentSprint) nextSet.add(currentSprint.id);
    if (nextSprint) nextSet.add(nextSprint.id);
    setExpandedSectionIds(nextSet);
  }, [currentSprint?.id, nextSprint?.id]);

  const toggleSprintExpanded = (id: string) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ─── Task Actions ─── */
  const handleQuickStatusChange = async (task: Activity, newStatus: ActivityStatus) => {
    try {
      const updated = await updateActivity(task.id, { status: newStatus });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      showToast(`Task status updated to ${newStatus}.`, "success");
    } catch (err: any) {
      showToast(extractBackendDetail(err) || "Failed to update task status", "error");
    }
  };

  const handleMoveTaskToSprint = async (task: Activity, targetSprintId: string) => {
    try {
      const existingLinks: ActivityLinkInput[] = (task.related_records || [])
        .filter((r) => r.module !== "software_sprint")
        .map((r) => ({ module: r.module, record_id: r.record_id }));

      if (targetSprintId) {
        existingLinks.push({ module: "software_sprint", record_id: targetSprintId });
        const targetSprint = sprints.find((s) => s.id === targetSprintId);
        if (targetSprint && !existingLinks.some((r) => r.module === "software_project")) {
          existingLinks.push({ module: "software_project", record_id: targetSprint.software_project_id });
        }
      }

      const updated = await updateActivity(task.id, { related_records: existingLinks });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      const destName = targetSprintId
        ? sprints.find((s) => s.id === targetSprintId)?.name || "Sprint"
        : "Sprint Backlog";
      showToast(`Moved "${task.title}" to ${destName}.`, "success");
    } catch (err: any) {
      showToast(extractBackendDetail(err) || "Failed to move task", "error");
    }
  };

  /* ─── Sprint CRUD ─── */
  const handleOpenCreateSprint = () => {
    setEditingSprint(null);
    setSprintFormError(null);
    const today = new Date();
    const twoWeeksLater = new Date(today.getTime() + 14 * 86400000);

    setSprintFormData({
      software_project_id: projectFilter || projects[0]?.id || "",
      name: "",
      goal: "",
      start_date: today.toISOString().slice(0, 10),
      end_date: twoWeeksLater.toISOString().slice(0, 10),
      status: "Planned",
    });
    setIsSprintModalOpen(true);
  };

  const handleOpenEditSprint = (sprint: SoftwareSprint, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingSprint(sprint);
    setSprintFormError(null);
    setSprintFormData({
      software_project_id: sprint.software_project_id,
      name: sprint.name,
      goal: sprint.goal || "",
      start_date: sprint.start_date,
      end_date: sprint.end_date,
      status: (sprint.status as SoftwareSprintStatus) || "Planned",
    });
    setIsSprintModalOpen(true);
  };

  const handleSprintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSprintFormError(null);

    if (!sprintFormData.name.trim()) {
      setSprintFormError("Sprint name cannot be blank.");
      return;
    }
    if (!sprintFormData.software_project_id) {
      setSprintFormError("Please select a Software Project.");
      return;
    }
    if (sprintFormData.end_date < sprintFormData.start_date) {
      setSprintFormError("End date cannot precede start date.");
      return;
    }

    setSprintSubmitting(true);
    try {
      if (editingSprint) {
        const payload: SoftwareSprintUpdate = {
          name: sprintFormData.name,
          goal: sprintFormData.goal,
          start_date: sprintFormData.start_date,
          end_date: sprintFormData.end_date,
          status: sprintFormData.status,
        };
        const updated = await updateSoftwareSprint(editingSprint.id, payload);
        setSprints((prev) => prev.map((s) => (s.id === editingSprint.id ? updated : s)));
        showToast(`Sprint "${updated.name}" updated successfully.`, "success");
      } else {
        const created = await createSoftwareSprint(sprintFormData);
        setSprints((prev) => [created, ...prev]);
        setExpandedSectionIds((prev) => new Set(prev).add(created.id));
        showToast(`Sprint "${created.name}" created successfully.`, "success");
      }
      setIsSprintModalOpen(false);
    } catch (err: any) {
      setSprintFormError(extractBackendDetail(err) || err?.message || "Failed to save sprint");
    } finally {
      setSprintSubmitting(false);
    }
  };

  const handleDeleteSprintConfirm = async () => {
    if (!deletingSprint) return;
    setSprintSubmitting(true);
    try {
      await deleteSoftwareSprint(deletingSprint.id);
      setSprints((prev) => prev.filter((s) => s.id !== deletingSprint.id));
      showToast(`Sprint "${deletingSprint.name}" deleted.`, "success");
      setDeletingSprint(null);
    } catch (err: any) {
      showToast(extractBackendDetail(err) || "Failed to delete sprint", "error");
    } finally {
      setSprintSubmitting(false);
    }
  };

  /* ─── Render Task Table inside a Sprint or Backlog ─── */
  const renderTasksTable = (sectionTasks: Activity[], currentSectionSprintId?: string) => {
    if (sectionTasks.length === 0) {
      return (
        <div className="sprint-empty-tasks">
          <p style={{ margin: 0, fontWeight: 600 }}>No tasks currently in this section.</p>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.78rem" }}>
            Click <strong>Add Task</strong> above or move tasks from another section to schedule work.
          </p>
        </div>
      );
    }

    return (
      <table className="sprint-task-table">
        <thead>
          <tr>
            <th style={{ width: "160px" }}>Assignees</th>
            <th style={{ minWidth: "220px" }}>Task</th>
            <th style={{ width: "160px" }}>Project & List</th>
            <th style={{ width: "120px" }}>Labels</th>
            <th style={{ width: "80px" }}>Epic</th>
            <th style={{ width: "130px" }}>Worked / Estimated</th>
            <th style={{ width: "130px" }}>Due Date</th>
            <th style={{ width: "180px", textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sectionTasks.map((task) => {
            const assignee = task.assigned_to ? userMap.get(task.assigned_to) : null;
            const assigneeName = assignee ? assignee.full_name : "Unassigned";
            const initials = assignee ? assignee.full_name.charAt(0).toUpperCase() : "?";
            const pId = getProjectIdForTask(task);
            const projectName = pId ? projectMap.get(pId) || "Delivery Project" : "Core Platform";
            const isOverdue = isDateOverdue(task.due_date, task.status);
            const workedStr = getWorkedHoursForTask(task.id);
            const allowedStatuses = getAllowedStatuses("Task", task.status, true);

            return (
              <tr key={task.id} className="sprint-task-row">
                {/* 1. Assignees */}
                <td>
                  <div className="sprint-assignee-cell" title={`Assigned to: ${assigneeName}`}>
                    <div className="sprint-user-avatar">{initials}</div>
                    <span className="sprint-user-name">{assigneeName}</span>
                  </div>
                </td>

                {/* 2. Task (Title + Status Dropdown) */}
                <td>
                  <div className="sprint-task-title-cell">
                    <div
                      className="sprint-task-title"
                      title={task.title}
                      onClick={() => setViewingTask(task)}
                    >
                      {task.title}
                    </div>
                    <div>
                      <select
                        className={`sprint-task-status-select ${task.status.toLowerCase().replace(/\s+/g, "-")}`}
                        value={task.status}
                        onChange={(e) => void handleQuickStatusChange(task, e.target.value as ActivityStatus)}
                      >
                        {allowedStatuses.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </td>

                {/* 3. Project & List */}
                <td>
                  <span className="sprint-project-tag" title={projectName}>
                    {projectName}
                  </span>
                </td>

                {/* 4. Labels (Priority / Type) */}
                <td>
                  <span className={`sprint-prio-pill ${(task.priority || "Medium").toLowerCase()}`}>
                    {task.priority || "Medium"}
                  </span>
                </td>

                {/* 5. Epic (Unavailable in existing schema) */}
                <td>
                  <span style={{ color: "#94a3b8" }} title="Epics are not modeled in current data contract">
                    —
                  </span>
                </td>

                {/* 6. Worked / Estimated */}
                <td>
                  <div className="sprint-hours-cell">
                    <strong>{workedStr}</strong>
                    <span> / —</span>
                  </div>
                </td>

                {/* 7. Due Date */}
                <td>
                  <div className={`sprint-due-cell ${isOverdue ? "overdue" : ""}`}>
                    {formatDate(task.due_date)}
                    {isOverdue && <span style={{ marginLeft: "4px", fontSize: "0.7rem" }}>(Overdue)</span>}
                  </div>
                </td>

                {/* 8. Actions */}
                <td style={{ textAlign: "right" }}>
                  <div className="sprint-row-actions">
                    {/* Move to Sprint dropdown */}
                    <select
                      className="sprint-move-select"
                      value={currentSectionSprintId || ""}
                      onChange={(e) => void handleMoveTaskToSprint(task, e.target.value)}
                      title="Move task to another sprint or backlog"
                    >
                      <option value="" disabled>
                        Move to...
                      </option>
                      <option value="">Sprint Backlog</option>
                      {sprints
                        .filter((s) => s.status !== "Completed" && s.status !== "Cancelled")
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>

                    {/* View Button */}
                    <button
                      type="button"
                      className="sprint-icon-btn"
                      title="View Task Details"
                      onClick={() => setViewingTask(task)}
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>

                    {/* Edit Button */}
                    {permissions.update && (
                      <button
                        type="button"
                        className="sprint-icon-btn"
                        title="Edit Task"
                        onClick={() => {
                          setEditingTask(task);
                          setIsTaskModalOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}

                    {/* Delete Button */}
                    {permissions.delete && (
                      <button
                        type="button"
                        className="sprint-icon-btn danger"
                        title="Delete Task"
                        onClick={() => setDeletingTask(task)}
                      >
                        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
    );
  };

  return (
    <div className="sprint-page">
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: toast.type === "success" ? "#065f46" : "#991b1b",
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: "8px",
            fontSize: "0.85rem",
            fontWeight: 600,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            zIndex: 9999,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Top Header */}
      <div className="sprint-header">
        <div className="sprint-title-box">
          <h1>
            Sprints
            <span className="sprint-count-badge">{sprints.length} Total</span>
          </h1>
          <p>Agile sprint iterations, velocity milestones, delivery targets, and software engineering cycles.</p>
        </div>

        <div className="sprint-header-actions">
          <SoftwareViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />

          <button
            type="button"
            className="sprint-btn-secondary"
            onClick={() => {
              setEditingTask(null);
              setIsTaskModalOpen(true);
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Task
          </button>

          <button type="button" className="sprint-btn-primary" onClick={handleOpenCreateSprint}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Sprint
          </button>
        </div>
      </div>

      {/* Top Filter Bar & Tabs */}
      <div className="sprint-filter-bar">
        {/* Left: Filter Tabs */}
        <div className="sprint-tabs-group">
          <button
            type="button"
            className={`sprint-tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("all");
              setSelectedMemberId("");
            }}
          >
            All
          </button>

          <button
            type="button"
            className={`sprint-tab-btn ${activeTab === "me" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("me");
              setSelectedMemberId("");
            }}
          >
            Me
            <span className="sprint-tab-pill">
              {tasks.filter((t) => t.assigned_to === currentUserId).length}
            </span>
          </button>

          <button
            type="button"
            className={`sprint-tab-btn ${activeTab === "members" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("members");
              if (!selectedMemberId && users[0]) setSelectedMemberId(users[0].id);
            }}
          >
            Members
          </button>

          <button
            type="button"
            className={`sprint-tab-btn ${activeTab === "teams" ? "active" : ""}`}
            onClick={() => setActiveTab("teams")}
            title="Teams grouping is not part of the current CRM data contract"
          >
            Teams
            <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>(N/A)</span>
          </button>
        </div>

        {/* Member Selector if Members tab active */}
        {activeTab === "members" && (
          <select
            className="sprint-select"
            value={selectedMemberId}
            onChange={(e) => setSelectedMemberId(e.target.value)}
          >
            <option value="">All Members</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} ({u.role || "Member"})
              </option>
            ))}
          </select>
        )}

        {/* Teams Notice if Teams tab active */}
        {activeTab === "teams" && (
          <div style={{ fontSize: "0.78rem", color: "#f59e0b", padding: "4px 8px" }}>
            Teams entity is not configured in backend; displaying all team members.
          </div>
        )}

        {/* Right: Search & Project Filter */}
        <div className="sprint-controls-right">
          <div className="sprint-search-box">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="sprint-search-input"
              placeholder="Search tasks..."
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
            />
            {taskSearch && (
              <button
                type="button"
                onClick={() => setTaskSearch("")}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}
              >
                ✕
              </button>
            )}
          </div>

          <select
            className="sprint-select"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
          Loading Agile sprint iterations and tasks...
        </div>
      ) : isForbidden ? (
        <div className="sw-forbidden-card">
          <div className="sw-forbidden-icon-box">🔒</div>
          <h3>Software Sprints Access Restricted</h3>
          <p>
            This module is not enabled for your tenant industry or your user role does not have view permission.
          </p>
          {forbiddenDetail && <div className="sw-forbidden-detail">{forbiddenDetail}</div>}
          <button
            type="button"
            className="sw-btn-secondary"
            style={{ marginTop: "8px" }}
            onClick={() => void loadData(true)}
          >
            Retry Access
          </button>
        </div>
      ) : error ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
          <p style={{ marginBottom: "12px" }}>{error}</p>
          <button type="button" className="sw-btn-secondary" onClick={() => void loadData(true)}>
            Retry
          </button>
        </div>
      ) : (
        <div className="sprints-list-wrapper">
          {/* ══════════════════════════════════════════════════════════════
              VIEW MODE: GRID VIEW
              Display existing Sprint records using responsive cards
             ══════════════════════════════════════════════════════════════ */}
          {viewMode === "grid" && relevantSprints.length > 0 && (
            <div className="sprint-grid-cards">
              {relevantSprints.map((sprint, idx) => {
                const sprintTasks = tasksBySprintId.get(sprint.id) || [];
                const completedTasks = sprintTasks.filter((t) => t.status === "Completed");
                const taskPct = sprintTasks.length > 0 ? Math.round((completedTasks.length / sprintTasks.length) * 100) : 0;
                const daysRemaining = getDaysRemaining(sprint.end_date);
                const workedInfo = getWorkedHoursForSprint(sprintTasks);
                const projectName = projectMap.get(sprint.software_project_id) || "Core Platform";
                const sprintNum = getSprintNumber(sprint, idx);
                const isCurrent = sprint.id === currentSprint?.id;
                const isNext = sprint.id === nextSprint?.id;
                const isExpanded = expandedSectionIds.has(sprint.id);
                const assignees = getSprintAssignees(sprint.id);

                return (
                  <div
                    key={sprint.id}
                    className={`sprint-grid-card ${
                      isCurrent
                        ? "active-sprint-border"
                        : isNext
                        ? "planned-sprint-border"
                        : sprint.status === "Completed"
                        ? "completed-sprint-border"
                        : ""
                    }`}
                  >
                    {/* Card Header */}
                    <div className="sprint-grid-card-header">
                      <div className="sprint-grid-card-title-group">
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span className="sprint-grid-card-num">{sprintNum}</span>
                          {isCurrent && (
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#0ea5e9" }}>
                              (Current)
                            </span>
                          )}
                          {isNext && (
                            <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#8b5cf6" }}>
                              (Next)
                            </span>
                          )}
                        </div>
                        <h3 className="sprint-grid-card-name" title={sprint.name}>
                          {sprint.name}
                        </h3>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className={`sprint-status-tag ${sprint.status?.toLowerCase()}`}>
                          {sprint.status}
                        </span>

                        <div className="sprint-header-actions-inline">
                          <button
                            type="button"
                            className="sprint-icon-btn"
                            title="View Sprint Details"
                            onClick={() => setViewingSprint(sprint)}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          {permissions.update && (
                            <button
                              type="button"
                              className="sprint-icon-btn"
                              title="Edit Sprint"
                              onClick={(e) => handleOpenEditSprint(sprint, e)}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          )}
                          {permissions.delete && (
                            <button
                              type="button"
                              className="sprint-icon-btn danger"
                              title="Delete Sprint"
                              onClick={() => setDeletingSprint(sprint)}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="sprint-grid-card-body">
                      {/* Project Tag & Timeline */}
                      <div className="sprint-grid-meta-row">
                        <span className="sprint-project-tag" title={projectName}>
                          {projectName}
                        </span>
                        <span style={{ color: daysRemaining.isPast ? "#ef4444" : "#64748b", fontWeight: 600 }}>
                          {daysRemaining.label}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.78rem", color: "#64748b" }}>
                        Timeline: <strong>{formatDate(sprint.start_date)}</strong> – <strong>{formatDate(sprint.end_date)}</strong>
                      </div>

                      {/* Progress Bar Box */}
                      <div className="sprint-grid-progress-box">
                        <div className="sprint-grid-progress-header">
                          <span>Sprint Progress</span>
                          <strong>{taskPct}%</strong>
                        </div>
                        <div className="sprint-grid-progress-track">
                          <div
                            className={`sprint-grid-progress-fill ${taskPct === 100 ? "completed" : ""}`}
                            style={{ width: `${taskPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="sprint-grid-stats-grid">
                        <div className="sprint-grid-stat-cell">
                          <span className="sprint-grid-stat-label">Tasks</span>
                          <span className="sprint-grid-stat-val">
                            {completedTasks.length} / {sprintTasks.length} done
                          </span>
                        </div>
                        <div className="sprint-grid-stat-cell">
                          <span className="sprint-grid-stat-label">Time Logged</span>
                          <span className="sprint-grid-stat-val" style={{ color: "#0ea5e9" }}>
                            {workedInfo.hoursStr}
                          </span>
                        </div>
                      </div>

                      {/* Assignees */}
                      <div className="sprint-grid-assignees-row">
                        <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>
                          Team Assigned:
                        </span>
                        <div
                          className="sprint-avatar-stack"
                          title={assignees.map((u) => u.full_name).join(", ") || "No assignees"}
                        >
                          {assignees.length === 0 ? (
                            <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Unassigned</span>
                          ) : (
                            <>
                              {assignees.slice(0, 3).map((u) => (
                                <div key={u.id} className="sprint-avatar-stack-item" title={u.full_name}>
                                  {u.full_name.charAt(0).toUpperCase()}
                                </div>
                              ))}
                              {assignees.length > 3 && (
                                <div className="sprint-avatar-stack-item sprint-avatar-stack-overflow">
                                  +{assignees.length - 3}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="sprint-grid-card-footer">
                      <div style={{ fontSize: "0.74rem", color: "#64748b", maxWidth: "200px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {sprint.goal ? `Goal: ${sprint.goal}` : "No goal specified"}
                      </div>
                      <button
                        type="button"
                        className="sprint-grid-btn-expand"
                        onClick={() => toggleSprintExpanded(sprint.id)}
                      >
                        <span>{isExpanded ? "Hide Tasks" : `View Tasks (${sprintTasks.length})`}</span>
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          style={{
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>

                    {/* Expandable Task Table right inside the card if toggled */}
                    {isExpanded && (
                      <div style={{ borderTop: "1px solid #e2e8f0", background: "#f8fafc", padding: "8px 0" }}>
                        {renderTasksTable(sprintTasks, sprint.id)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              VIEW MODE: TABLE VIEW
              Display existing Sprint records in a structured table
             ══════════════════════════════════════════════════════════════ */}
          {viewMode === "table" && (
            <div className="sprint-table-view-card">
              <div style={{ overflowX: "auto" }}>
                <table className="sprint-master-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: "220px" }}>Sprint Name</th>
                      <th style={{ minWidth: "160px" }}>Project</th>
                      <th style={{ width: "130px" }}>Start Date</th>
                      <th style={{ width: "140px" }}>End Date</th>
                      <th style={{ width: "100px", textAlign: "center" }}>Total Tasks</th>
                      <th style={{ width: "110px", textAlign: "center" }}>Completed Tasks</th>
                      <th style={{ width: "160px" }}>Progress</th>
                      <th style={{ width: "110px" }}>Status</th>
                      <th style={{ width: "150px", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relevantSprints.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                          No software sprints found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      relevantSprints.map((sprint, idx) => {
                        const sprintTasks = tasksBySprintId.get(sprint.id) || [];
                        const completedTasks = sprintTasks.filter((t) => t.status === "Completed");
                        const taskPct =
                          sprintTasks.length > 0 ? Math.round((completedTasks.length / sprintTasks.length) * 100) : 0;
                        const daysInfo = getDaysRemaining(sprint.end_date);
                        const projectName = projectMap.get(sprint.software_project_id) || "Core Platform";
                        const sprintNum = getSprintNumber(sprint, idx);
                        const isExpanded = expandedSectionIds.has(sprint.id);

                        return (
                          <React.Fragment key={sprint.id}>
                            <tr className={isExpanded ? "expanded-sprint-row" : ""}>
                              {/* 1. Sprint Name & Number */}
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <button
                                    type="button"
                                    className={`sprint-chevron-btn ${isExpanded ? "open" : ""}`}
                                    onClick={() => toggleSprintExpanded(sprint.id)}
                                    title="Toggle sprint tasks"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      width="14"
                                      height="14"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                    >
                                      <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                  </button>
                                  <div>
                                    <div className="sprint-table-name">
                                      {sprint.name}
                                    </div>
                                    <div style={{ fontSize: "0.72rem", color: "#0ea5e9", fontWeight: 600 }}>
                                      {sprintNum}
                                      {sprint.id === currentSprint?.id && " • Current"}
                                      {sprint.id === nextSprint?.id && " • Next"}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 2. Project */}
                              <td>
                                <span className="sprint-project-tag" title={projectName}>
                                  {projectName}
                                </span>
                              </td>

                              {/* 3. Start Date */}
                              <td>{formatDate(sprint.start_date)}</td>

                              {/* 4. End Date */}
                              <td>
                                <div style={{ whiteSpace: "nowrap" }}>
                                  {formatDate(sprint.end_date)}
                                  <span
                                    style={{
                                      fontSize: "0.7rem",
                                      color: daysInfo.isPast ? "#ef4444" : "#64748b",
                                      marginLeft: "4px",
                                    }}
                                  >
                                    ({daysInfo.label})
                                  </span>
                                </div>
                              </td>

                              {/* 5. Total Tasks */}
                              <td style={{ textAlign: "center", fontWeight: 700 }}>{sprintTasks.length}</td>

                              {/* 6. Completed Tasks */}
                              <td style={{ textAlign: "center", fontWeight: 700, color: "#10b981" }}>
                                {completedTasks.length}
                              </td>

                              {/* 7. Progress */}
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <div
                                    style={{
                                      flex: 1,
                                      height: "6px",
                                      background: "#e2e8f0",
                                      borderRadius: "9999px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <div
                                      style={{
                                        height: "100%",
                                        width: `${taskPct}%`,
                                        background: taskPct === 100 ? "#10b981" : "#0ea5e9",
                                        borderRadius: "9999px",
                                      }}
                                    />
                                  </div>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 700, minWidth: "30px", textAlign: "right" }}>
                                    {taskPct}%
                                  </span>
                                </div>
                              </td>

                              {/* 8. Status */}
                              <td>
                                <span className={`sprint-status-tag ${sprint.status?.toLowerCase()}`}>
                                  {sprint.status}
                                </span>
                              </td>

                              {/* 9. Actions */}
                              <td style={{ textAlign: "right" }}>
                                <div className="sprint-row-actions">
                                  <button
                                    type="button"
                                    className="sprint-icon-btn"
                                    title="View Sprint Details"
                                    onClick={() => setViewingSprint(sprint)}
                                  >
                                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                  </button>
                                  {permissions.update && (
                                    <button
                                      type="button"
                                      className="sprint-icon-btn"
                                      title="Edit Sprint"
                                      onClick={(e) => handleOpenEditSprint(sprint, e)}
                                    >
                                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                      </svg>
                                    </button>
                                  )}
                                  {permissions.delete && (
                                    <button
                                      type="button"
                                      className="sprint-icon-btn danger"
                                      title="Delete Sprint"
                                      onClick={() => setDeletingSprint(sprint)}
                                    >
                                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* Collapsible Tasks Table row when row is expanded */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={9} style={{ padding: "0 0 12px 0", background: "rgba(14, 165, 233, 0.03)" }}>
                                  <div style={{ padding: "10px 16px 4px 16px" }}>
                                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0ea5e9", marginBottom: "6px" }}>
                                      Tasks in {sprint.name} ({sprintTasks.length})
                                    </div>
                                    {renderTasksTable(sprintTasks, sprint.id)}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              Sprint Backlog Section (Always accessible below Sprints)
             ══════════════════════════════════════════════════════════════ */}
          <div className="sprint-card backlog-section">
            <div
              className={`sprint-card-header ${isBacklogExpanded ? "is-open" : ""}`}
              onClick={() => setIsBacklogExpanded((prev) => !prev)}
            >
              <div className="sprint-header-left">
                <button
                  type="button"
                  className={`sprint-chevron-btn ${isBacklogExpanded ? "open" : ""}`}
                  aria-label="Toggle Sprint Backlog"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                <div className="sprint-title-group">
                  <h2 className="sprint-name">Sprint Backlog</h2>
                  <span className="sprint-count-badge" style={{ background: "rgba(100, 116, 139, 0.15)", color: "#475569" }}>
                    {backlogTasks.length} Tasks
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    Tasks awaiting assignment to upcoming sprint iterations
                  </span>
                </div>
              </div>

              <div className="sprint-header-right" onClick={(e) => e.stopPropagation()}>
                <div className="sprint-metric-pill">
                  <span>Backlog Items:</span>
                  <strong>{backlogTasks.length}</strong>
                </div>

                <button
                  type="button"
                  className="sprint-btn-secondary"
                  style={{ padding: "5px 10px", fontSize: "0.78rem" }}
                  onClick={() => {
                    setEditingTask(null);
                    setIsTaskModalOpen(true);
                  }}
                >
                  + Add to Backlog
                </button>
              </div>
            </div>

            {isBacklogExpanded && (
              <div className="sprint-card-body">{renderTasksTable(backlogTasks)}</div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Sprint Modals: Create / Edit / View / Delete
         ══════════════════════════════════════════════════════════════ */}
      {isSprintModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsSprintModalOpen(false)}>
          <div className="sw-modal-card" style={{ maxWidth: "600px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{editingSprint ? "Edit Software Sprint" : "New Software Sprint"}</h2>
              <button type="button" className="sw-btn-icon" onClick={() => setIsSprintModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSprintSubmit}>
              <div className="sw-modal-body">
                {sprintFormError && <div className="sw-error-banner">{sprintFormError}</div>}

                <div className="sw-form-group">
                  <label>Software Project *</label>
                  <select
                    className="sw-form-select"
                    required
                    value={sprintFormData.software_project_id}
                    onChange={(e) => setSprintFormData({ ...sprintFormData, software_project_id: e.target.value })}
                  >
                    <option value="">Select Project</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.project_number})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sw-form-group">
                  <label>Sprint Name *</label>
                  <input
                    type="text"
                    className="sw-form-input"
                    required
                    placeholder="e.g. Sprint 8 - Payment Gateway & Checkout"
                    value={sprintFormData.name}
                    onChange={(e) => setSprintFormData({ ...sprintFormData, name: e.target.value })}
                  />
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Start Date *</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      required
                      value={sprintFormData.start_date}
                      onChange={(e) => setSprintFormData({ ...sprintFormData, start_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>End Date *</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      required
                      value={sprintFormData.end_date}
                      onChange={(e) => setSprintFormData({ ...sprintFormData, end_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>Status</label>
                  <select
                    className="sw-form-select"
                    value={sprintFormData.status}
                    onChange={(e) =>
                      setSprintFormData({ ...sprintFormData, status: e.target.value as SoftwareSprintStatus })
                    }
                  >
                    {SOFTWARE_SPRINT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sw-form-group">
                  <label>Sprint Goal</label>
                  <textarea
                    className="sw-form-textarea"
                    placeholder="Key deliverables and focus areas for this cycle..."
                    value={sprintFormData.goal || ""}
                    onChange={(e) => setSprintFormData({ ...sprintFormData, goal: e.target.value })}
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button type="button" className="sw-btn-secondary" onClick={() => setIsSprintModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={sprintSubmitting}>
                  {sprintSubmitting ? "Saving..." : editingSprint ? "Update Sprint" : "Create Sprint"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Sprint Modal */}
      {viewingSprint && (
        <div className="sw-modal-overlay" onClick={() => setViewingSprint(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{viewingSprint.name}</h2>
              <button type="button" className="sw-btn-icon" onClick={() => setViewingSprint(null)}>
                ✕
              </button>
            </div>
            <div className="sw-modal-body">
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap" }}>
                <span className={`sw-badge ${viewingSprint.status?.toLowerCase()}`}>Status: {viewingSprint.status}</span>
                <span className="sw-badge planned">
                  Duration: {formatDate(viewingSprint.start_date)} to {formatDate(viewingSprint.end_date)}
                </span>
              </div>
              <p>
                <strong>Software Project:</strong> {projectMap.get(viewingSprint.software_project_id) || "—"}
              </p>
              {viewingSprint.goal && (
                <div style={{ marginTop: "12px" }}>
                  <strong>Sprint Goal:</strong>
                  <p style={{ marginTop: "4px", lineHeight: "1.6", color: "#64748b" }}>{viewingSprint.goal}</p>
                </div>
              )}
            </div>
            <div className="sw-modal-footer">
              <button type="button" className="sw-btn-secondary" onClick={() => setViewingSprint(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Sprint Confirm */}
      {deletingSprint && (
        <div className="sw-modal-overlay" onClick={() => setDeletingSprint(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>Confirm Deletion</h2>
              <button type="button" className="sw-btn-icon" onClick={() => setDeletingSprint(null)}>
                ✕
              </button>
            </div>
            <div className="sw-modal-body">
              <p>
                Are you sure you want to delete sprint <strong>{deletingSprint.name}</strong>?
              </p>
              <p style={{ fontSize: "0.8rem", color: "#64748b" }}>
                Tasks associated with this sprint will remain in the database and transition to the Sprint Backlog.
              </p>
            </div>
            <div className="sw-modal-footer">
              <button type="button" className="sw-btn-secondary" onClick={() => setDeletingSprint(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="sw-btn-primary"
                style={{ background: "#ef4444" }}
                onClick={handleDeleteSprintConfirm}
                disabled={sprintSubmitting}
              >
                {sprintSubmitting ? "Deleting..." : "Delete Sprint"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          Task Modals: Create/Edit / View / Delete Confirm
         ══════════════════════════════════════════════════════════════ */}
      {isTaskModalOpen && (
        <ActivityFormModal
          activity={editingTask}
          defaultType="Task"
          onClose={() => {
            setIsTaskModalOpen(false);
            setEditingTask(null);
          }}
          onSuccess={(saved) => {
            if (editingTask) {
              setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
              showToast("Task updated successfully.");
            } else {
              setTasks((prev) => [saved, ...prev]);
              showToast("Task created successfully.");
            }
            setIsTaskModalOpen(false);
            setEditingTask(null);
          }}
        />
      )}

      {viewingTask && (
        <ActivityViewModal
          activity={viewingTask}
          users={users}
          leads={leads}
          contacts={contacts}
          accounts={accounts}
          deals={deals}
          canEdit={permissions.update}
          onEdit={() => {
            setEditingTask(viewingTask);
            setViewingTask(null);
            setIsTaskModalOpen(true);
          }}
          onClose={() => setViewingTask(null)}
        />
      )}

      {deletingTask && (
        <ActivityDeleteConfirm
          activity={deletingTask}
          onClose={() => setDeletingTask(null)}
          onSuccess={() => {
            setTasks((prev) => prev.filter((t) => t.id !== deletingTask.id));
            showToast("Task deleted successfully.");
            setDeletingTask(null);
          }}
        />
      )}
    </div>
  );
}
