import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  getTimeEntries,
  createManualTimeEntry,
  startTimer,
  stopTimer,
  approveTimeEntryBilling,
} from "../../services/softwareTimeEntryService";
import { getActivities } from "../../services/activityService";
import { getSoftwareProjects } from "../../services/softwareProjectService";
import { getSoftwareSprints } from "../../services/softwareSprintService";
import { getUsers } from "../../services/userService";
import { getSoftwarePermissions } from "../../utils/softwarePermissions";
import {
  isEntryBillable,
  normalizeBillingStatus,
  isEntryActiveTimer,
  isEntryCompleted,
  getTimeEntryActionEligibility,
} from "../../utils/softwareTimeTrackingUtils";

import type {
  SoftwareTimeEntry,
  ManualTimeEntryCreate,
  TimerStartRequest,
} from "../../types/softwareTimeEntry";
import type { Activity } from "../../types/activity";
import type { SoftwareProject } from "../../types/softwareProject";
import type { SoftwareSprint } from "../../types/softwareSprint";
import type { User } from "../../types/user";

import "./SoftwareModules.css";
import SoftwareViewToggle, { SoftwareViewMode } from "./SoftwareViewToggle";
import "./SoftwareTimeTracking.css";

/**
 * Safely parse a server datetime string (which may be a naive UTC string from Python datetime.utcnow())
 * ensuring it is evaluated strictly in UTC rather than the browser's local timezone.
 *
 * This eliminates the classic "+05:30" offset bug where a timer starting at 00:00:00 would display
 * "05:30:22" in India or other timezones.
 */
export function parseServerUtcTimestamp(timestampStr: string | null | undefined): number {
  if (!timestampStr) return Date.now();
  let str = String(timestampStr).trim();
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  // Convert standard space-separated datetimes to ISO "T"
  if (str.includes(" ") && !str.includes("T")) {
    str = str.replace(" ", "T");
  }
  // If the ISO string lacks a timezone specifier ('Z', '+HH:MM', '-HH:MM'), append 'Z'
  const hasTimezone = /[zZ]$|[+-]\d{2}(?::?\d{2})?$/.test(str);
  if (!hasTimezone) {
    str = str + "Z";
  }
  const parsed = new Date(str).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
}

/**
 * Format elapsed seconds into HH:MM:SS format
 * e.g. 0 -> 00:00:00, 75 -> 00:01:15, 3661 -> 01:01:01
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = safeSec % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Format total minutes into human-readable representation
 * e.g. 90 -> "1h 30m", 45 -> "45m"
 */
function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes < 0) return "0m";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

/**
 * Format an entry duration for the table display:
 * Shows exact seconds (e.g. 12m 35s) if start and stop timestamps are present,
 * or fall back to standard minutes format.
 */
export function formatEntryDuration(
  durationMinutes: number | null | undefined,
  startedAt?: string | null,
  stoppedAt?: string | null
): string {
  if (startedAt && stoppedAt) {
    const startMs = parseServerUtcTimestamp(startedAt);
    const stopMs = parseServerUtcTimestamp(stoppedAt);
    const totalSecs = Math.max(0, Math.floor((stopMs - startMs) / 1000));
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }
  return formatMinutes(durationMinutes);
}

export default function SoftwareTimeTracking() {
  const perms = useMemo(() => getSoftwarePermissions(), []);

  // Retrieve current logged in user ID to accurately map team vs personal active timers
  const currentUserId = useMemo(() => {
    try {
      const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (userStr) {
        const u = JSON.parse(userStr);
        return u.id || u.user_id || null;
      }
    } catch {}
    return null;
  }, []);

  const [entries, setEntries] = useState<SoftwareTimeEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sprints, setSprints] = useState<SoftwareSprint[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [viewMode, setViewMode] = useState<SoftwareViewMode>(
    () => (localStorage.getItem("software_time_tracking_view_mode") as SoftwareViewMode) || "grid"
  );

  const handleViewModeChange = (mode: SoftwareViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem("software_time_tracking_view_mode", mode);
    } catch {
      // ignore
    }
  };
  const [billingStatusFilter, setBillingStatusFilter] = useState<string>("");
  const [billableFilter, setBillableFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Live Timer state
  const [activeTimerSeconds, setActiveTimerSeconds] = useState(0);

  // Quick Live Timer Bar inputs
  const [timerSelectedProjectId, setTimerSelectedProjectId] = useState<string>("");
  const [timerTaskId, setTimerTaskId] = useState("");
  const [timerNotes, setTimerNotes] = useState("");
  const [timerIsBillable, setTimerIsBillable] = useState(true);
  const [timerStarting, setTimerStarting] = useState(false);
  const [timerStopping, setTimerStopping] = useState(false);

  // Manual Time Log Modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState<{
    activity_id: string;
    hours: number;
    minutes: number;
    work_date: string;
    notes: string;
    is_billable: boolean;
  }>({
    activity_id: "",
    hours: 1,
    minutes: 0,
    work_date: new Date().toISOString().slice(0, 10),
    notes: "",
    is_billable: true,
  });

  // Action status banner
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Three-dot Action Menu Dropdown State
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [activeActionEntry, setActiveActionEntry] = useState<SoftwareTimeEntry | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const actionsRef = useRef<HTMLDivElement | null>(null);

  // Billing Approval Confirmation Modal State
  const [approvingEntry, setApprovingEntry] = useState<SoftwareTimeEntry | null>(null);
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // View Time Entry Modal State
  const [viewingEntry, setViewingEntry] = useState<SoftwareTimeEntry | null>(null);

  // Load all references and entries from authoritative backend APIs
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const [entriesData, actsData, projsData, usersData, sprintsData] = await Promise.all([
        getTimeEntries(),
        getActivities().catch(() => []),
        getSoftwareProjects().catch(() => []),
        getUsers().catch(() => []),
        getSoftwareSprints().catch(() => []),
      ]);

      const validEntries = Array.isArray(entriesData) ? entriesData : [];
      setEntries(validEntries);
      setActivities(Array.isArray(actsData) ? actsData : []);
      setProjects(Array.isArray(projsData) ? projsData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
      setSprints(Array.isArray(sprintsData) ? sprintsData : []);

      // If timer task is unselected, pre-select first task if available
      if (actsData.length > 0 && !timerTaskId) {
        const firstTask = actsData.find((a) => (a.activity_type || "").toLowerCase() === "task") || actsData[0];
        if (firstTask) setTimerTaskId(firstTask.id);
      }
    } catch (err: any) {
      if (!isSilent) {
        setError(err?.message || "Failed to load time entries from server");
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [timerTaskId]);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    const handleSoftwareDataChanged = (e: any) => {
      const moduleKey = e?.detail?.moduleKey;
      if (!moduleKey || moduleKey === "software_time_entries") {
        void loadData(true);
      }
    };
    window.addEventListener("scuilone:software_data_changed", handleSoftwareDataChanged);
    return () => {
      window.removeEventListener("scuilone:software_data_changed", handleSoftwareDataChanged);
    };
  }, [loadData]);

  // Lookup maps
  const activityMap = useMemo(() => new Map(activities.map((a) => [a.id, a.title])), [activities]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  // Sprint to Software Project map
  const sprintProjectMap = useMemo(
    () => new Map(sprints.map((s) => [s.id, s.software_project_id])),
    [sprints]
  );

  // Activity to Software Project map (extracted from related_records, supporting both direct project links and sprint-associated tasks)
  const activityProjectMap = useMemo(() => {
    const map = new Map<string, string>();
    activities.forEach((act) => {
      if (act.related_records && Array.isArray(act.related_records)) {
        const directLink = act.related_records.find((r) => r.module === "software_project");
        if (directLink && directLink.record_id) {
          map.set(act.id, directLink.record_id);
          return;
        }
        const sprintLink = act.related_records.find((r) => r.module === "software_sprint");
        if (sprintLink && sprintLink.record_id && sprintProjectMap.has(sprintLink.record_id)) {
          map.set(act.id, sprintProjectMap.get(sprintLink.record_id)!);
        }
      }
    });
    return map;
  }, [activities, sprintProjectMap]);

  // Active running timer entry (Authoritative state from backend database records)
  // An active timer is any record where source === 'timer' and stopped_at is null
  const runningEntry = useMemo(() => {
    return (
      entries.find(
        (e) =>
          isEntryActiveTimer(e) &&
          (!currentUserId || String(e.user_id).toLowerCase() === String(currentUserId).toLowerCase())
      ) ||
      entries.find((e) => isEntryActiveTimer(e)) ||
      null
    );
  }, [entries, currentUserId]);

  // Live real-time timer ticking derived from start timestamp
  useEffect(() => {
    if (!runningEntry || !runningEntry.started_at) {
      setActiveTimerSeconds(0);
      return;
    }

    const startMs = parseServerUtcTimestamp(runningEntry.started_at);

    const updateTimer = () => {
      const nowMs = Date.now();
      const elapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      setActiveTimerSeconds(elapsed);
    };

    // Calculate immediately on mount/update so it displays the correct second from t=0
    updateTimer();

    // High precision 500ms interval ensures accurate real-time second rollovers without drift
    const intervalId = window.setInterval(updateTimer, 500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [runningEntry?.id, runningEntry?.started_at]);

  // Close actions dropdown on outside click, escape, scroll or resize
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setOpenActionId(null);
        setActiveActionEntry(null);
        setDropdownPos(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenActionId(null);
        setActiveActionEntry(null);
        setDropdownPos(null);
      }
    };
    const handleScrollOrResize = () => {
      setOpenActionId(null);
      setActiveActionEntry(null);
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

  // Toggle three-dot actions menu with boundary & clipping protection
  const toggleActions = (entry: SoftwareTimeEntry) => {
    if (openActionId === entry.id) {
      setOpenActionId(null);
      setActiveActionEntry(null);
      setDropdownPos(null);
      return;
    }
    const btn = triggerRefs.current[entry.id];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const menuWidth = 225;
      const menuHeight = 260;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUp = spaceBelow < menuHeight + 12 && spaceAbove > menuHeight;

      let left = rect.right - menuWidth;
      if (left < 10) {
        left = Math.max(10, rect.left);
      }
      if (left + menuWidth > window.innerWidth - 10) {
        left = Math.max(10, window.innerWidth - menuWidth - 10);
      }

      setDropdownPos({
        top: openUp ? undefined : Math.round(rect.bottom + 6),
        bottom: openUp ? Math.round(window.innerHeight - rect.top + 6) : undefined,
        left: Math.round(left),
        openUp,
      });
    }
    setOpenActionId(entry.id);
    setActiveActionEntry(entry);
  };

  // Filtered tasks for timer start bar based on optional project selector
  const availableTimerTasks = useMemo(() => {
    return activities.filter((act) => {
      if ((act.activity_type || "").toLowerCase() !== "task" && act.activity_type) {
        // Prefer tasks, but allow other activity types if user logs time on them
      }
      if (timerSelectedProjectId) {
        const pId = activityProjectMap.get(act.id);
        return pId === timerSelectedProjectId;
      }
      return true;
    });
  }, [activities, timerSelectedProjectId, activityProjectMap]);

  // Filtered table entries
  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      const status = normalizeBillingStatus(item.billing_status);
      const billable = isEntryBillable(item);

      if (billingStatusFilter && status !== billingStatusFilter) return false;
      if (billableFilter !== "") {
        const wantBillable = billableFilter === "true";
        if (billable !== wantBillable) return false;
      }
      if (fromDate && item.work_date < fromDate) return false;
      if (toDate && item.work_date > toDate) return false;

      if (projectFilter) {
        const pId = activityProjectMap.get(item.activity_id);
        if (pId !== projectFilter) return false;
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const actTitle = (activityMap.get(item.activity_id) || item.activity_title || "").toLowerCase();
        const userName = (userMap.get(item.user_id) || item.user_name || "").toLowerCase();
        const pId = activityProjectMap.get(item.activity_id);
        const projName = pId ? (projectMap.get(pId) || "").toLowerCase() : "";
        const notes = (item.notes || "").toLowerCase();

        if (!actTitle.includes(q) && !userName.includes(q) && !projName.includes(q) && !notes.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [
    entries,
    billingStatusFilter,
    billableFilter,
    fromDate,
    toDate,
    projectFilter,
    searchTerm,
    activityProjectMap,
    activityMap,
    userMap,
    projectMap,
  ]);

  // KPI Calculations derived from authoritative backend entries
  const stats = useMemo(() => {
    let totalMins = 0;
    let billableMins = 0;
    let nonBillableMins = 0;
    let unreviewedCount = 0;

    entries.forEach((e) => {
      // Completed duration in minutes
      const dur = e.duration_minutes || 0;
      totalMins += dur;

      const billable = isEntryBillable(e);
      const status = normalizeBillingStatus(e.billing_status);
      const isCompleted = isEntryCompleted(e);

      if (billable) {
        billableMins += dur;
        if (status === "Unreviewed" && isCompleted) {
          unreviewedCount++;
        }
      } else {
        nonBillableMins += dur;
      }
    });

    return {
      totalHours: (totalMins / 60).toFixed(1),
      billableHours: (billableMins / 60).toFixed(1),
      nonBillableHours: (nonBillableMins / 60).toFixed(1),
      unreviewedCount,
    };
  }, [entries]);

  // Handle Start Live Timer
  const handleStartTimer = async () => {
    if (timerStarting || runningEntry) return;

    if (!timerTaskId) {
      setActionMessage({ text: "Please select an engineering task to start the live timer.", type: "error" });
      return;
    }

    setTimerStarting(true);
    setActionMessage(null);

    try {
      const payload: TimerStartRequest = {
        activity_id: timerTaskId,
        notes: timerNotes.trim() || undefined,
        is_billable: timerIsBillable,
      };

      const newEntry = await startTimer(payload);

      // Confirm success: store new entry in state and start timer from 0 seconds
      setEntries((prev) => [newEntry, ...prev.filter((e) => e.id !== newEntry.id)]);
      setActiveTimerSeconds(0);
      setTimerNotes("");

      const taskName = activityMap.get(newEntry.activity_id) || "Task";
      setActionMessage({
        text: `Live timer started for "${taskName}". Counting in real time.`,
        type: "success",
      });
    } catch (err: any) {
      setActionMessage({
        text: err?.response?.data?.detail || err?.message || "Failed to start live timer",
        type: "error",
      });
    } finally {
      setTimerStarting(false);
    }
  };

  // Handle Stop Live Timer
  const handleStopTimer = async (targetEntryId?: string | React.MouseEvent) => {
    const idToStop = (typeof targetEntryId === "string" ? targetEntryId : undefined) || runningEntry?.id;
    if (!idToStop || timerStopping) return;

    setTimerStopping(true);
    setActionMessage(null);

    try {
      const stopped = await stopTimer(idToStop);

      // Update entries with backend calculated duration
      setEntries((prev) => prev.map((e) => (e.id === stopped.id ? stopped : e)));
      setActiveTimerSeconds(0);

      const loggedFormatted = formatEntryDuration(
        stopped.duration_minutes,
        stopped.started_at,
        stopped.stopped_at
      );

      setActionMessage({
        text: `Live timer stopped. Logged ${loggedFormatted} (${stopped.duration_minutes || 1} min billed).`,
        type: "success",
      });

      // Background synchronization
      void loadData(true);
    } catch (err: any) {
      setActionMessage({
        text: err?.response?.data?.detail || err?.message || "Failed to stop live timer",
        type: "error",
      });
    } finally {
      setTimerStopping(false);
    }
  };

  // Open Approve Billing Confirmation Dialog
  const handleOpenApproveConfirmation = (entry: SoftwareTimeEntry) => {
    setApprovalError(null);
    setApprovingEntry(entry);
    setOpenActionId(null);
    setActiveActionEntry(null);
    setDropdownPos(null);
  };

  // Submit Confirmed Approve Billing
  const handleConfirmApproveBilling = async () => {
    if (!approvingEntry || isSubmittingApproval) return;

    setIsSubmittingApproval(true);
    setApprovalError(null);

    try {
      const updated = await approveTimeEntryBilling(approvingEntry.id);
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      if (activeActionEntry && activeActionEntry.id === updated.id) {
        setActiveActionEntry(updated);
      }
      setActionMessage({
        text: "Time entry approved for client contract invoicing.",
        type: "success",
      });
      setApprovingEntry(null);
      void loadData(true);
    } catch (err: any) {
      const errorDetail = err?.response?.data?.detail || err?.message || "Failed to approve billing";
      setApprovalError(errorDetail);
      setActionMessage({
        text: errorDetail,
        type: "error",
      });
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  // Handle Manual Log Submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    const totalMinutes = Number(manualForm.hours) * 60 + Number(manualForm.minutes);
    if (totalMinutes <= 0) {
      setManualError("Total duration must be greater than 0 minutes.");
      return;
    }
    if (!manualForm.activity_id) {
      setManualError("Please select a task / activity.");
      return;
    }

    setManualSubmitting(true);
    try {
      const payload: ManualTimeEntryCreate = {
        activity_id: manualForm.activity_id,
        duration_minutes: totalMinutes,
        work_date: manualForm.work_date,
        notes: manualForm.notes.trim() || undefined,
        is_billable: manualForm.is_billable,
      };

      const created = await createManualTimeEntry(payload);
      setEntries((prev) => [created, ...prev]);
      setIsManualModalOpen(false);
      setActionMessage({
        text: `Manual time log of ${formatMinutes(created.duration_minutes || 0)} recorded successfully.`,
        type: "success",
      });

      // Reset form defaults
      setManualForm({
        activity_id: activities[0]?.id || "",
        hours: 1,
        minutes: 0,
        work_date: new Date().toISOString().slice(0, 10),
        notes: "",
        is_billable: true,
      });
    } catch (err: any) {
      setManualError(err?.response?.data?.detail || err?.message || "Failed to record manual time entry");
    } finally {
      setManualSubmitting(false);
    }
  };

  // Running entry details
  const runningTaskTitle = runningEntry
    ? activityMap.get(runningEntry.activity_id) || runningEntry.activity_title || "Engineering Task"
    : null;
  const runningProjectId = runningEntry ? activityProjectMap.get(runningEntry.activity_id) : null;
  const runningProjectName = runningProjectId ? projectMap.get(runningProjectId) : null;

  return (
    <div className="sw-module-page">
      {/* Header */}
      <div className="sw-module-header">
        <div className="sw-module-title-box">
          <h1>
            Software Time Tracking
            <span className="sw-count-badge">{entries.length} Entries</span>
          </h1>
          <p>Real-time engineering timers, manual work logs, billable status, and client contract approvals.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <SoftwareViewToggle viewMode={viewMode} onViewModeChange={handleViewModeChange} />
          <button
            className="sw-btn-primary"
            onClick={() => {
              setManualError(null);
              const firstTask = activities.find((a) => (a.activity_type || "").toLowerCase() === "task") || activities[0];
              if (firstTask && !manualForm.activity_id) {
                setManualForm((prev) => ({ ...prev, activity_id: firstTask.id }));
              }
              setIsManualModalOpen(true);
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Log Manual Time
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          style={{
            position: "sticky",
            top: "12px",
            zIndex: 1000,
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
            marginBottom: "18px",
            padding: "12px 18px",
            borderRadius: "8px",
            fontSize: "0.88rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background:
              actionMessage.type === "success"
                ? "rgba(16, 185, 129, 0.15)"
                : actionMessage.type === "info"
                ? "rgba(14, 165, 233, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${
              actionMessage.type === "success"
                ? "rgba(16, 185, 129, 0.3)"
                : actionMessage.type === "info"
                ? "rgba(14, 165, 233, 0.3)"
                : "rgba(239, 68, 68, 0.3)"
            }`,
            color:
              actionMessage.type === "success"
                ? "#10b981"
                : actionMessage.type === "info"
                ? "#0284c7"
                : "#ef4444",
          }}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
            Total Logged
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#0ea5e9", marginTop: "4px" }}>
            {stats.totalHours} hrs
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>All logged work records</div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
            Billable Hours
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#10b981", marginTop: "4px" }}>
            {stats.billableHours} hrs
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Client billable work</div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
            Non-Billable Hours
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f59e0b", marginTop: "4px" }}>
            {stats.nonBillableHours} hrs
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Internal / Non-contract work</div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
            Unreviewed Entries
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#818cf8", marginTop: "4px" }}>
            {stats.unreviewedCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Awaiting billing review</div>
        </div>
      </div>

      {/* ─── REAL-TIME WORK TIMER CARD ─── */}
      <div className={`sw-timer-card ${runningEntry ? "is-active" : ""}`}>
        <div className="sw-timer-header">
          <div>
            <h3 className="sw-timer-status-title">
              <span className={`sw-timer-dot ${runningEntry ? "active" : ""}`} />
              {runningEntry ? "Live Timer Active" : "Start Live Work Timer"}
            </h3>
            {runningEntry ? (
              <div className="sw-active-timer-details">
                <span style={{ fontWeight: 600, color: "inherit" }}>{runningTaskTitle}</span>
                {runningProjectName && (
                  <span className="sw-timer-badge project">📁 {runningProjectName}</span>
                )}
                <span className={`sw-timer-badge ${runningEntry.is_billable ? "billable" : "non-billable"}`}>
                  {runningEntry.is_billable ? "✓ Billable" : "○ Non-Billable"}
                </span>
                {runningEntry.notes && (
                  <span style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "0.82rem" }}>
                    "{runningEntry.notes}"
                  </span>
                )}
              </div>
            ) : (
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                Select a project task, configure billable mode, and start tracking your real-time work session.
              </p>
            )}
          </div>

          {/* Clock & Action Area */}
          {runningEntry ? (
            <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <div className="sw-digital-timer" title="Elapsed Time (HH:MM:SS)">
                {formatDurationSeconds(activeTimerSeconds)}
              </div>
              <button
                className="sw-timer-btn-stop"
                onClick={handleStopTimer}
                disabled={timerStopping}
                title="Stop timer and record worked time"
              >
                {timerStopping ? (
                  <>
                    <span className="sw-spinner" /> Stopping...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop Timer
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="sw-timer-start-bar">
              {/* Optional Project Filter for Tasks */}
              {projects.length > 0 && (
                <select
                  className="sw-timer-select"
                  style={{ maxWidth: "180px" }}
                  value={timerSelectedProjectId}
                  onChange={(e) => {
                    const pId = e.target.value;
                    setTimerSelectedProjectId(pId);
                    // If current task doesn't belong to newly selected project, pre-select first task of that project
                    if (pId) {
                      const matchTask = activities.find((a) => activityProjectMap.get(a.id) === pId);
                      if (matchTask) setTimerTaskId(matchTask.id);
                    }
                  }}
                  title="Filter tasks by project"
                >
                  <option value="">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Task Selector */}
              <select
                className="sw-timer-select"
                value={timerTaskId}
                onChange={(e) => setTimerTaskId(e.target.value)}
                disabled={timerStarting}
              >
                <option value="">Select Task...</option>
                {availableTimerTasks.map((act) => {
                  const pId = activityProjectMap.get(act.id);
                  const pName = pId ? projectMap.get(pId) : null;
                  return (
                    <option key={act.id} value={act.id}>
                      {pName ? `[${pName}] ` : ""}{act.title}
                    </option>
                  );
                })}
              </select>

              {/* Notes input */}
              <input
                type="text"
                className="sw-timer-input"
                placeholder="What are you working on?"
                value={timerNotes}
                onChange={(e) => setTimerNotes(e.target.value)}
                disabled={timerStarting}
              />

              {/* Billable toggle */}
              <label className="sw-timer-checkbox-label">
                <input
                  type="checkbox"
                  checked={timerIsBillable}
                  onChange={(e) => setTimerIsBillable(e.target.checked)}
                  disabled={timerStarting}
                />
                Billable
              </label>

              {/* Start Button */}
              <button
                className="sw-timer-btn-start"
                onClick={handleStartTimer}
                disabled={timerStarting || !timerTaskId}
                title="Start Live Work Timer"
              >
                {timerStarting ? (
                  <>
                    <span className="sw-spinner" /> Starting...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Start Timer
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="sw-filter-bar">
        <div className="sw-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="sw-search-input"
            placeholder="Search by task, user, project, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="sw-filter-select"
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

        <select
          className="sw-filter-select"
          value={billingStatusFilter}
          onChange={(e) => setBillingStatusFilter(e.target.value)}
        >
          <option value="">All Billing Statuses</option>
          <option value="Unreviewed">Unreviewed</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>

        <select
          className="sw-filter-select"
          value={billableFilter}
          onChange={(e) => setBillableFilter(e.target.value)}
        >
          <option value="">All Billing Types</option>
          <option value="true">Billable Only</option>
          <option value="false">Non-Billable Only</option>
        </select>

        <input
          type="date"
          className="sw-filter-select"
          title="From Work Date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />

        <input
          type="date"
          className="sw-filter-select"
          title="To Work Date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      {/* Table Card */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading time tracking records...
          </div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
            <p>{error}</p>
            <button className="sw-btn-secondary" onClick={() => void loadData(false)}>
              Retry
            </button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            No time entries found matching your criteria. Start the live timer or log manual work time.
          </div>
        ) : viewMode === "table" ? (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Work Date</th>
                <th>Task / Activity</th>
                <th>Logged By</th>
                <th>Source</th>
                <th>Duration</th>
                <th>Billable</th>
                <th>Billing Status</th>
                <th>Notes</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const isActive = isEntryActiveTimer(entry);
                const pId = activityProjectMap.get(entry.activity_id);
                const projName = pId ? projectMap.get(pId) : null;
                const billable = isEntryBillable(entry);
                const status = normalizeBillingStatus(entry.billing_status);
                const eligibility = getTimeEntryActionEligibility(
                  entry,
                  currentUserId,
                  true
                );

                return (
                  <tr key={entry.id} className={isActive ? "sw-running-row" : ""}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{entry.work_date}</div>
                      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {entry.started_at
                          ? new Date(parseServerUtcTimestamp(entry.started_at)).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: "#0ea5e9" }}>
                        {activityMap.get(entry.activity_id) || entry.activity_title || "Development Task"}
                      </div>
                      {projName && (
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                          📁 {projName}
                        </div>
                      )}
                    </td>

                    <td>{userMap.get(entry.user_id) || entry.user_name || "Engineer"}</td>

                    <td>
                      <span className={`sw-badge ${entry.source === "timer" ? "proposal" : "discovery"}`}>
                        {entry.source === "timer" ? "Timer" : "Manual"}
                      </span>
                    </td>

                    <td style={{ fontWeight: 700 }}>
                      {isActive ? (
                        <span className="sw-running-duration">
                          <span className="dot" />
                          Running ({formatDurationSeconds(activeTimerSeconds)})
                        </span>
                      ) : (
                        <span>
                          {formatEntryDuration(entry.duration_minutes, entry.started_at, entry.stopped_at)}
                        </span>
                      )}
                    </td>

                    <td>
                      <span className={`sw-badge ${billable ? "active" : "on-hold"}`}>
                        {billable ? "Billable" : "Non-billable"}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`sw-badge ${
                          status === "Approved"
                            ? "accepted"
                            : status === "Rejected"
                            ? "rejected"
                            : "under-review"
                        }`}
                      >
                        {entry.billing_status}
                      </span>
                    </td>

                    <td style={{ maxWidth: "220px", fontSize: "0.8rem", color: "#94a3b8" }}>
                      {entry.notes || "—"}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div className="sw-row-actions" style={{ justifyContent: "flex-end", alignItems: "center", gap: "8px" }}>
                        {isActive && eligibility.canStopTimer && (
                          <button
                            className="sw-btn-primary"
                            style={{ padding: "4px 10px", fontSize: "0.75rem", background: "#ef4444" }}
                            onClick={() => void handleStopTimer(entry.id)}
                            disabled={timerStopping}
                            title="Stop Active Timer"
                          >
                            {timerStopping ? "Stopping..." : "Stop"}
                          </button>
                        )}
                        <button
                          type="button"
                          className={`sw-action-menu-btn ${openActionId === entry.id ? "active" : ""}`}
                          ref={(el) => (triggerRefs.current[entry.id] = el)}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleActions(entry);
                          }}
                          aria-label={`Actions for entry ${entry.id.slice(0, 8)}`}
                          aria-haspopup="true"
                          aria-expanded={openActionId === entry.id}
                          title="Actions Menu"
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="1.5"></circle>
                            <circle cx="12" cy="5" r="1.5"></circle>
                            <circle cx="12" cy="19" r="1.5"></circle>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="sw-grid-cards" style={{ padding: "16px" }}>
            {filteredEntries.map((entry) => {
              const isActive = isEntryActiveTimer(entry);
              const pId = activityProjectMap.get(entry.activity_id);
              const projName = pId ? projectMap.get(pId) : null;
              const billable = isEntryBillable(entry);
              const status = normalizeBillingStatus(entry.billing_status);
              const eligibility = getTimeEntryActionEligibility(
                entry,
                currentUserId,
                true
              );

              return (
                <div key={entry.id} className="sw-grid-card">
                  <div className="sw-grid-card-header">
                    <div className="sw-grid-card-title-group">
                      <h3 className="sw-grid-card-title" title={activityMap.get(entry.activity_id) || entry.activity_title || "Development Task"}>
                        {activityMap.get(entry.activity_id) || entry.activity_title || "Development Task"}
                      </h3>
                      {projName && (
                        <div className="sw-grid-card-subtitle">
                          <span>📁 {projName}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <span
                        className={`sw-badge ${
                          status === "Approved"
                            ? "accepted"
                            : status === "Rejected"
                            ? "rejected"
                            : "under-review"
                        }`}
                      >
                        {entry.billing_status}
                      </span>
                      <span className={`sw-badge ${entry.source === "timer" ? "proposal" : "discovery"}`} style={{ fontSize: "0.65rem", padding: "1px 5px" }}>
                        {entry.source === "timer" ? "Timer" : "Manual"}
                      </span>
                    </div>
                  </div>

                  <div className="sw-grid-card-body">
                    <div className="sw-grid-fields-grid">
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Logged By</span>
                        <span className="sw-grid-field-val">
                          {userMap.get(entry.user_id) || entry.user_name || "Engineer"}
                        </span>
                      </div>
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Work Date</span>
                        <span className="sw-grid-field-val">{entry.work_date}</span>
                      </div>
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Billing Type</span>
                        <span className="sw-grid-field-val">
                          <span className={`sw-badge ${billable ? "active" : "on-hold"}`}>
                            {billable ? "Billable" : "Non-billable"}
                          </span>
                        </span>
                      </div>
                      <div className="sw-grid-field">
                        <span className="sw-grid-field-label">Timer State</span>
                        <span className="sw-grid-field-val">
                          {isActive ? (
                            <span style={{ color: "#ef4444", fontWeight: 700 }}>● Active</span>
                          ) : (
                            <span style={{ color: "#10b981", fontWeight: 600 }}>Completed</span>
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="sw-grid-progress-box" style={{ background: isActive ? "rgba(239, 68, 68, 0.05)" : undefined, borderColor: isActive ? "rgba(239, 68, 68, 0.2)" : undefined }}>
                      <div className="sw-grid-progress-header">
                        <span>Duration</span>
                        {isActive ? (
                          <span className="sw-running-duration">
                            <span className="dot" />
                            Running ({formatDurationSeconds(activeTimerSeconds)})
                          </span>
                        ) : (
                          <strong style={{ fontSize: "0.95rem", color: "#0ea5e9" }}>
                            {formatEntryDuration(entry.duration_minutes, entry.started_at, entry.stopped_at)}
                          </strong>
                        )}
                      </div>
                    </div>

                    {entry.notes && (
                      <div
                        style={{
                          fontSize: "0.76rem",
                          color: "#64748b",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                        title={entry.notes}
                      >
                        "{entry.notes}"
                      </div>
                    )}
                  </div>

                  <div className="sw-grid-card-footer">
                    <div>
                      {isActive && eligibility.canStopTimer && (
                        <button
                          className="sw-btn-primary"
                          style={{ padding: "4px 10px", fontSize: "0.75rem", background: "#ef4444" }}
                          onClick={() => void handleStopTimer(entry.id)}
                          disabled={timerStopping}
                          title="Stop Active Timer"
                        >
                          {timerStopping ? "Stopping..." : "Stop Timer"}
                        </button>
                      )}
                    </div>
                    <div className="sw-row-actions">
                      <button
                        type="button"
                        className={`sw-action-menu-btn ${openActionId === entry.id ? "active" : ""}`}
                        ref={(el) => (triggerRefs.current[entry.id] = el)}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleActions(entry);
                        }}
                        aria-label={`Actions for entry ${entry.id.slice(0, 8)}`}
                        aria-haspopup="true"
                        aria-expanded={openActionId === entry.id}
                        title="Actions Menu"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="1.5"></circle>
                          <circle cx="12" cy="5" r="1.5"></circle>
                          <circle cx="12" cy="19" r="1.5"></circle>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Time Entry Modal */}
      {isManualModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsManualModalOpen(false)}>
          <div className="sw-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>Log Manual Work Time</h2>
              <button className="sw-btn-icon" onClick={() => setIsManualModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleManualSubmit}>
              <div className="sw-modal-body">
                {manualError && <div className="sw-error-banner">{manualError}</div>}

                <div className="sw-form-group">
                  <label>Task / Activity *</label>
                  <select
                    className="sw-form-select"
                    required
                    value={manualForm.activity_id}
                    onChange={(e) => setManualForm({ ...manualForm, activity_id: e.target.value })}
                  >
                    <option value="">Select Task...</option>
                    {activities.map((act) => {
                      const pId = activityProjectMap.get(act.id);
                      const pName = pId ? projectMap.get(pId) : null;
                      return (
                        <option key={act.id} value={act.id}>
                          {pName ? `[${pName}] ` : ""}{act.title}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Duration (Hours)</label>
                    <input
                      type="number"
                      className="sw-form-input"
                      min="0"
                      max="24"
                      value={manualForm.hours}
                      onChange={(e) => setManualForm({ ...manualForm, hours: Math.max(0, parseInt(e.target.value) || 0) })}
                    />
                  </div>
                  <div className="sw-form-group">
                    <label>Duration (Minutes)</label>
                    <input
                      type="number"
                      className="sw-form-input"
                      min="0"
                      max="59"
                      value={manualForm.minutes}
                      onChange={(e) => setManualForm({ ...manualForm, minutes: Math.max(0, parseInt(e.target.value) || 0) })}
                    />
                  </div>
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Work Date *</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      required
                      value={manualForm.work_date}
                      onChange={(e) => setManualForm({ ...manualForm, work_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group" style={{ justifyContent: "center" }}>
                    <label style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", marginTop: "24px" }}>
                      <input
                        type="checkbox"
                        checked={manualForm.is_billable}
                        onChange={(e) => setManualForm({ ...manualForm, is_billable: e.target.checked })}
                      />
                      <span>Mark as Billable to Client</span>
                    </label>
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>Notes / Work Summary</label>
                  <textarea
                    className="sw-form-textarea"
                    placeholder="Describe implementation details, commits, or bug fixes..."
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button type="button" className="sw-btn-secondary" onClick={() => setIsManualModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={manualSubmitting}>
                  {manualSubmitting ? "Saving..." : "Save Time Log"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Three-Dot Actions Dropdown */}
      {openActionId && dropdownPos && (
        <div
          ref={actionsRef}
          className="sw-action-dropdown"
          style={{
            position: "fixed",
            top: dropdownPos.top !== undefined ? `${dropdownPos.top}px` : undefined,
            bottom: dropdownPos.bottom !== undefined ? `${dropdownPos.bottom}px` : undefined,
            left: `${dropdownPos.left}px`,
            zIndex: 9999,
          }}
        >
          {(() => {
            const activeEntry =
              (activeActionEntry && activeActionEntry.id === openActionId ? activeActionEntry : null) ||
              filteredEntries.find((e) => String(e.id) === String(openActionId)) ||
              entries.find((e) => String(e.id) === String(openActionId));
            if (!activeEntry) return null;

            const eligibility = getTimeEntryActionEligibility(
              activeEntry,
              currentUserId,
              true
            );
            const currentStatus = eligibility.billingStatus;

            return (
              <>
                {/* 1. View Time Entry */}
                {eligibility.canView && (
                  <button
                    type="button"
                    className="sw-action-dropdown-item"
                    onClick={() => {
                      setViewingEntry(activeEntry);
                      setOpenActionId(null);
                      setActiveActionEntry(null);
                      setDropdownPos(null);
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    <span>View Time Entry</span>
                  </button>
                )}

                {/* 2. Stop Live Timer (if active and owned by authenticated user) */}
                {eligibility.canStopTimer && (
                  <button
                    type="button"
                    className="sw-action-dropdown-item stop-item"
                    onClick={() => {
                      setOpenActionId(null);
                      setActiveActionEntry(null);
                      setDropdownPos(null);
                      void handleStopTimer(activeEntry.id);
                    }}
                    disabled={timerStopping}
                    title="Stop this live timer"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    <span>{timerStopping ? "Stopping..." : "Stop Live Timer"}</span>
                  </button>
                )}

                <div className="sw-action-dropdown-divider" />

                {/* Billing Status Section */}
                <div className="sw-dropdown-section-header">
                  <span>Billing Status</span>
                </div>

                <div className="sw-dropdown-status-list">
                  {/* Status 1: Unreviewed — Amber */}
                  <div
                    className={`sw-dropdown-status-row ${currentStatus === "Unreviewed" ? "is-current" : "is-disabled"}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (currentStatus === "Unreviewed") {
                        setActionMessage({ text: "Time entry is already Unreviewed.", type: "info" });
                      } else {
                        setActionMessage({
                          text: "Modifying or reversing an existing billing status is not supported by the backend.",
                          type: "error",
                        });
                      }
                      setOpenActionId(null);
                      setActiveActionEntry(null);
                      setDropdownPos(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (currentStatus === "Unreviewed") {
                          setActionMessage({ text: "Time entry is already Unreviewed.", type: "info" });
                        } else {
                          setActionMessage({
                            text: "Modifying or reversing an existing billing status is not supported by the backend.",
                            type: "error",
                          });
                        }
                        setOpenActionId(null);
                        setActiveActionEntry(null);
                        setDropdownPos(null);
                      }
                    }}
                    title={currentStatus === "Unreviewed" ? "Current billing status: Unreviewed" : "Cannot reset to Unreviewed"}
                  >
                    <span className="sw-status-pill unreviewed">
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#f59e0b",
                          display: "inline-block",
                        }}
                      />
                      Unreviewed
                    </span>
                    {currentStatus === "Unreviewed" && (
                      <span className="sw-status-indicator current-tag">✓ Current</span>
                    )}
                  </div>

                  {/* Status 2: Approved — Green */}
                  <div
                    className={`sw-dropdown-status-row ${
                      currentStatus === "Approved"
                        ? "is-current"
                        : currentStatus === "Unreviewed" && eligibility.isBillable && !isEntryActiveTimer(activeEntry)
                        ? "is-clickable"
                        : "is-disabled"
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (currentStatus === "Approved") {
                        setActionMessage({ text: "Time entry is already Approved for client invoicing.", type: "info" });
                        setOpenActionId(null);
                        setActiveActionEntry(null);
                        setDropdownPos(null);
                        return;
                      }

                      if (!eligibility.isBillable) {
                        setActionMessage({
                          text: "Cannot approve billing: Only billable time entries can be approved for client contract invoicing. This entry is Non-Billable.",
                          type: "error",
                        });
                        setOpenActionId(null);
                        setActiveActionEntry(null);
                        setDropdownPos(null);
                        return;
                      }

                      if (isEntryActiveTimer(activeEntry)) {
                        setActionMessage({
                          text: "Cannot approve billing: Active timer must be stopped before billing approval.",
                          type: "error",
                        });
                        setOpenActionId(null);
                        setActiveActionEntry(null);
                        setDropdownPos(null);
                        return;
                      }

                      if (currentStatus === "Rejected") {
                        setActionMessage({
                          text: "Cannot approve billing: Rejected time entries cannot be approved without a review workflow.",
                          type: "error",
                        });
                        setOpenActionId(null);
                        setActiveActionEntry(null);
                        setDropdownPos(null);
                        return;
                      }

                      // Billable, Unreviewed, completed -> open confirmation dialog
                      handleOpenApproveConfirmation(activeEntry);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (currentStatus === "Unreviewed" && eligibility.canApproveBilling) {
                          handleOpenApproveConfirmation(activeEntry);
                        }
                      }
                    }}
                    title={
                      currentStatus === "Approved"
                        ? "Current billing status: Approved"
                        : !eligibility.isBillable
                        ? "Non-billable entries cannot be approved for invoicing"
                        : isEntryActiveTimer(activeEntry)
                        ? "Stop active timer before approving billing"
                        : "Click to approve this billable time entry"
                    }
                  >
                    <span
                      className="sw-status-pill approved"
                      style={{
                        opacity:
                          currentStatus === "Approved" || (currentStatus === "Unreviewed" && eligibility.isBillable && !isEntryActiveTimer(activeEntry))
                            ? 1
                            : 0.5,
                      }}
                    >
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#10b981",
                          display: "inline-block",
                        }}
                      />
                      Approved
                    </span>
                    {currentStatus === "Approved" && (
                      <span className="sw-status-indicator current-tag">✓ Current</span>
                    )}
                    {currentStatus === "Unreviewed" && eligibility.isBillable && !isEntryActiveTimer(activeEntry) && (
                      <span className="sw-status-indicator action-hint">Approve →</span>
                    )}
                    {currentStatus === "Unreviewed" && !eligibility.isBillable && (
                      <span className="sw-status-indicator" style={{ fontSize: "0.7rem", color: "#94a3b8" }}>🔒 Non-Billable</span>
                    )}
                    {currentStatus === "Unreviewed" && eligibility.isBillable && isEntryActiveTimer(activeEntry) && (
                      <span className="sw-status-indicator" style={{ fontSize: "0.7rem", color: "#f59e0b" }}>⏱ Timer Running</span>
                    )}
                  </div>

                  {/* Status 3: Rejected — Red (Status indicator only) */}
                  <div
                    className={`sw-dropdown-status-row ${currentStatus === "Rejected" ? "is-current" : "is-disabled"}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (currentStatus === "Rejected") {
                        setActionMessage({ text: "Time entry is already in Rejected status.", type: "info" });
                      } else {
                        setActionMessage({
                          text: "Rejecting billing status is not supported by the backend API. Status is an indicator only.",
                          type: "info",
                        });
                      }
                      setOpenActionId(null);
                      setActiveActionEntry(null);
                      setDropdownPos(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (currentStatus === "Rejected") {
                          setActionMessage({ text: "Time entry is already in Rejected status.", type: "info" });
                        } else {
                          setActionMessage({
                            text: "Rejecting billing status is not supported by the backend API. Status is an indicator only.",
                            type: "info",
                          });
                        }
                        setOpenActionId(null);
                        setActiveActionEntry(null);
                        setDropdownPos(null);
                      }
                    }}
                    title={
                      currentStatus === "Rejected"
                        ? "Current billing status: Rejected"
                        : "Rejecting billing status is not supported by the backend API"
                    }
                  >
                    <span
                      className="sw-status-pill rejected"
                      style={{ opacity: currentStatus === "Rejected" ? 1 : 0.5 }}
                    >
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#ef4444",
                          display: "inline-block",
                        }}
                      />
                      Rejected
                    </span>
                    {currentStatus === "Rejected" && (
                      <span className="sw-status-indicator current-tag">✓ Current</span>
                    )}
                    {currentStatus !== "Rejected" && (
                      <span className="sw-status-indicator" style={{ fontSize: "0.68rem", color: "#94a3b8" }}>Indicator Only</span>
                    )}
                  </div>
                </div>

                {/* Status Guidance Card */}
                {!eligibility.isBillable ? (
                  <div className="sw-dropdown-helper-note warning">
                    <span>🔒 <strong>Non-Billable:</strong> Internal hours cannot be approved for client invoicing.</span>
                  </div>
                ) : isEntryActiveTimer(activeEntry) ? (
                  <div className="sw-dropdown-helper-note info">
                    <span>⏱ <strong>Timer Running:</strong> Stop the timer before approving billing.</span>
                  </div>
                ) : currentStatus === "Unreviewed" ? (
                  <div className="sw-dropdown-helper-note success">
                    <span>✓ <strong>Billable:</strong> Ready for billing approval and invoicing.</span>
                  </div>
                ) : null}

                {/* Dedicated Action Button: Approve Billing (when eligible) */}
                {eligibility.canApproveBilling && (
                  <>
                    <div className="sw-action-dropdown-divider" />
                    <button
                      type="button"
                      className="sw-action-dropdown-item approve-item"
                      onClick={() => {
                        handleOpenApproveConfirmation(activeEntry);
                      }}
                      title="Approve billing for this entry"
                    >
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Approve Billing for Invoicing</span>
                    </button>
                  </>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Approve Billing Confirmation Modal Dialog */}
      {approvingEntry && (
        <div
          className="sw-modal-overlay"
          onClick={() => {
            if (!isSubmittingApproval) {
              setApprovingEntry(null);
              setApprovalError(null);
            }
          }}
        >
          <div
            className="sw-modal-card"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>
                Confirm Billing Approval
                <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#64748b", marginLeft: "10px" }}>
                  #{approvingEntry.id.slice(0, 8)}
                </span>
              </h2>
              <button
                type="button"
                className="sw-btn-icon"
                disabled={isSubmittingApproval}
                onClick={() => {
                  setApprovingEntry(null);
                  setApprovalError(null);
                }}
              >
                ✕
              </button>
            </div>

            <div className="sw-modal-body">
              {approvalError && <div className="sw-error-banner">{approvalError}</div>}

              <p style={{ margin: "0 0 16px", color: "inherit", fontSize: "0.92rem", lineHeight: 1.5 }}>
                Are you sure you want to approve this billable time entry for client contract invoicing?
              </p>

              <div className="sw-detail-grid" style={{ marginBottom: "14px" }}>
                <div className="sw-detail-field">
                  <label>Task / Activity</label>
                  <p style={{ fontWeight: 600, color: "#0ea5e9" }}>
                    {activityMap.get(approvingEntry.activity_id) || approvingEntry.activity_title || "Development Task"}
                  </p>
                </div>

                <div className="sw-detail-field">
                  <label>Duration</label>
                  <p style={{ fontWeight: 700, color: "#10b981" }}>
                    {formatEntryDuration(
                      approvingEntry.duration_minutes,
                      approvingEntry.started_at,
                      approvingEntry.stopped_at
                    )}
                  </p>
                </div>

                <div className="sw-detail-field">
                  <label>Work Date</label>
                  <p>{approvingEntry.work_date}</p>
                </div>

                <div className="sw-detail-field">
                  <label>Logged By</label>
                  <p>{userMap.get(approvingEntry.user_id) || approvingEntry.user_name || "Engineer"}</p>
                </div>
              </div>

              {approvingEntry.notes && (
                <div style={{ marginTop: "10px" }}>
                  <label style={{ fontSize: "0.76rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
                    Notes
                  </label>
                  <div className="sw-notes-box" style={{ fontSize: "0.84rem", padding: "8px 12px" }}>
                    {approvingEntry.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="sw-modal-footer">
              <button
                type="button"
                className="sw-btn-secondary"
                disabled={isSubmittingApproval}
                onClick={() => {
                  setApprovingEntry(null);
                  setApprovalError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sw-btn-primary"
                style={{ background: "#10b981", borderColor: "#10b981" }}
                disabled={isSubmittingApproval}
                onClick={handleConfirmApproveBilling}
              >
                {isSubmittingApproval ? "Approving..." : "Approve Billing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Time Entry Details Modal */}
      {viewingEntry && (
        <div className="sw-modal-overlay" onClick={() => setViewingEntry(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "640px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>
                Time Entry Details
                <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#64748b", marginLeft: "10px" }}>
                  #{viewingEntry.id.slice(0, 8)}
                </span>
              </h2>
              <button className="sw-btn-icon" onClick={() => setViewingEntry(null)}>
                ✕
              </button>
            </div>
            <div className="sw-modal-body">
              {/* Badges Bar */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap", alignItems: "center" }}>
                <span className={`sw-badge ${viewingEntry.source === "timer" ? "proposal" : "discovery"}`}>
                  Source: {viewingEntry.source === "timer" ? "Live Timer" : "Manual Log"}
                </span>
                <span className={`sw-badge ${isEntryBillable(viewingEntry) ? "active" : "on-hold"}`}>
                  {isEntryBillable(viewingEntry) ? "✓ Billable" : "○ Non-Billable"}
                </span>
                <span
                  className={`sw-badge ${
                    normalizeBillingStatus(viewingEntry.billing_status) === "Approved"
                      ? "accepted"
                      : normalizeBillingStatus(viewingEntry.billing_status) === "Rejected"
                      ? "rejected"
                      : "under-review"
                  }`}
                >
                  Billing: {viewingEntry.billing_status}
                </span>
              </div>

              {/* Detail Grid */}
              <div className="sw-detail-grid">
                <div className="sw-detail-field">
                  <label>Work Date</label>
                  <p>{viewingEntry.work_date}</p>
                </div>

                <div className="sw-detail-field">
                  <label>Duration</label>
                  <p style={{ fontWeight: 700, color: "#0ea5e9" }}>
                    {isEntryActiveTimer(viewingEntry) ? (
                      <span className="sw-running-duration">
                        <span className="dot" />
                        Running ({formatDurationSeconds(activeTimerSeconds)})
                      </span>
                    ) : (
                      formatEntryDuration(
                        viewingEntry.duration_minutes,
                        viewingEntry.started_at,
                        viewingEntry.stopped_at
                      )
                    )}
                  </p>
                </div>

                <div className="sw-detail-field">
                  <label>Task / Activity</label>
                  <p style={{ color: "#0ea5e9", fontWeight: 600 }}>
                    {activityMap.get(viewingEntry.activity_id) || viewingEntry.activity_title || "Development Task"}
                  </p>
                </div>

                <div className="sw-detail-field">
                  <label>Software Project</label>
                  <p>
                    {(() => {
                      const pId = activityProjectMap.get(viewingEntry.activity_id);
                      return pId ? projectMap.get(pId) || "—" : "—";
                    })()}
                  </p>
                </div>

                <div className="sw-detail-field">
                  <label>Logged By</label>
                  <p>{userMap.get(viewingEntry.user_id) || viewingEntry.user_name || "Engineer"}</p>
                </div>

                <div className="sw-detail-field">
                  <label>Billed Time Units</label>
                  <p>{viewingEntry.duration_minutes ? `${viewingEntry.duration_minutes} min` : "In progress"}</p>
                </div>

                {viewingEntry.started_at && (
                  <div className="sw-detail-field">
                    <label>Started At</label>
                    <p>
                      {new Date(parseServerUtcTimestamp(viewingEntry.started_at)).toLocaleString([], {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </p>
                  </div>
                )}

                {viewingEntry.stopped_at && (
                  <div className="sw-detail-field">
                    <label>Stopped At</label>
                    <p>
                      {new Date(parseServerUtcTimestamp(viewingEntry.stopped_at)).toLocaleString([], {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </p>
                  </div>
                )}

                <div className="sw-detail-field">
                  <label>Record Created</label>
                  <p>
                    {new Date(parseServerUtcTimestamp(viewingEntry.created_at)).toLocaleString([], {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: "0.76rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Work Notes & Details
                </label>
                <div className="sw-notes-box">
                  {viewingEntry.notes || "No notes provided for this time log."}
                </div>
              </div>
            </div>

            <div className="sw-modal-footer">
              <button
                type="button"
                className="sw-btn-secondary"
                onClick={() => setViewingEntry(null)}
              >
                Close
              </button>
              {isEntryActiveTimer(viewingEntry) && (() => {
                const isOwner = !currentUserId || String(viewingEntry.user_id).toLowerCase() === String(currentUserId).toLowerCase();
                return (
                  <button
                    type="button"
                    className="sw-btn-primary"
                    style={{ background: "#ef4444", borderColor: "#ef4444" }}
                    onClick={async () => {
                      const entryId = viewingEntry.id;
                      setViewingEntry(null);
                      await handleStopTimer(entryId);
                    }}
                    disabled={timerStopping || !isOwner}
                    title={!isOwner ? "You can only stop your own live timer" : "Stop this live timer"}
                  >
                    {timerStopping ? "Stopping..." : "Stop Live Timer"}
                  </button>
                );
              })()}
              {getTimeEntryActionEligibility(
                viewingEntry,
                currentUserId,
                perms.canUpdateContracts || perms.hasPermission("software_contract.update")
              ).canApproveBilling && (
                <button
                  type="button"
                  className="sw-btn-primary"
                  style={{ background: "#10b981", borderColor: "#10b981" }}
                  onClick={() => {
                    const toApprove = viewingEntry;
                    setViewingEntry(null);
                    handleOpenApproveConfirmation(toApprove);
                  }}
                >
                  ✓ Approve for Invoicing
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
