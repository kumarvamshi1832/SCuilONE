import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getTimeEntries,
  createManualTimeEntry,
  startTimer,
  stopTimer,
  approveTimeEntryBilling,
} from "../../services/softwareTimeEntryService";
import { getActivities } from "../../services/activityService";
import { getSoftwareProjects } from "../../services/softwareProjectService";
import { getUsers } from "../../services/userService";

import type {
  SoftwareTimeEntry,
  ManualTimeEntryCreate,
  TimerStartRequest,
} from "../../types/softwareTimeEntry";
import type { Activity } from "../../types/activity";
import type { SoftwareProject } from "../../types/softwareProject";
import type { User } from "../../types/user";

import "./SoftwareModules.css";

function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes < 0) return "0m";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

function formatDurationSeconds(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function SoftwareTimeTracking() {
  const [entries, setEntries] = useState<SoftwareTimeEntry[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [billingStatusFilter, setBillingStatusFilter] = useState<string>("");
  const [billableFilter, setBillableFilter] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Running timer live elapsed seconds
  const [activeTimerSeconds, setActiveTimerSeconds] = useState(0);

  // Quick Timer Bar form state
  const [timerTaskId, setTimerTaskId] = useState("");
  const [timerNotes, setTimerNotes] = useState("");
  const [timerIsBillable, setTimerIsBillable] = useState(true);
  const [timerStarting, setTimerStarting] = useState(false);
  const [timerStopping, setTimerStopping] = useState(false);

  // Manual entry modal
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

  // Action status message
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Load all references and entries
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entriesData, actsData, projsData, usersData] = await Promise.all([
        getTimeEntries(),
        getActivities().catch(() => []),
        getSoftwareProjects().catch(() => []),
        getUsers().catch(() => []),
      ]);

      setEntries(entriesData);
      setActivities(actsData);
      setProjects(projsData);
      setUsers(usersData);

      // Pre-select first task in timer if empty
      const taskActs = actsData.filter((a) => (a.activity_type || "").toLowerCase() === "task" || true);
      if (taskActs.length > 0 && taskActs[0] && !timerTaskId) {
        setTimerTaskId(taskActs[0].id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load time entries");
    } finally {
      setLoading(false);
    }
  }, [timerTaskId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Lookup maps
  const activityMap = useMemo(() => new Map(activities.map((a) => [a.id, a.title])), [activities]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);

  // Active running timer entry (if any)
  const runningEntry = useMemo(() => {
    return entries.find((e) => !e.stopped_at);
  }, [entries]);

  // Live timer tick
  useEffect(() => {
    if (!runningEntry) {
      setActiveTimerSeconds(0);
      return;
    }

    const calcElapsed = () => {
      const startMs = runningEntry.started_at ? new Date(runningEntry.started_at).getTime() : Date.now();
      const nowMs = Date.now();
      const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      setActiveTimerSeconds(diffSec);
    };

    calcElapsed();
    const interval = setInterval(calcElapsed, 1000);
    return () => clearInterval(interval);
  }, [runningEntry]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (billingStatusFilter && item.billing_status !== billingStatusFilter) return false;
      if (billableFilter !== "") {
        const wantBillable = billableFilter === "true";
        if (item.is_billable !== wantBillable) return false;
      }
      if (fromDate && item.work_date < fromDate) return false;
      if (toDate && item.work_date > toDate) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const actTitle = (activityMap.get(item.activity_id) || item.activity_title || "").toLowerCase();
        const userName = (userMap.get(item.user_id) || item.user_name || "").toLowerCase();
        const notes = (item.notes || "").toLowerCase();
        if (!actTitle.includes(q) && !userName.includes(q) && !notes.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [entries, billingStatusFilter, billableFilter, fromDate, toDate, searchTerm, activityMap, userMap]);

  // KPI Calculations
  const stats = useMemo(() => {
    let totalMins = 0;
    let billableMins = 0;
    let nonBillableMins = 0;
    let unreviewedCount = 0;

    entries.forEach((e) => {
      const dur = e.duration_minutes || 0;
      totalMins += dur;
      if (e.is_billable) {
        billableMins += dur;
        if (e.billing_status === "Unreviewed") {
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

  // Handle Start Timer
  const handleStartTimer = async () => {
    if (!timerTaskId) {
      setActionMessage({ text: "Please select a task to track time against.", type: "error" });
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
      setEntries((prev) => [newEntry, ...prev.filter((e) => e.id !== newEntry.id)]);
      setActionMessage({ text: "Timer started successfully!", type: "success" });
      setTimerNotes("");
    } catch (err: any) {
      setActionMessage({
        text: err?.response?.data?.detail || err?.message || "Failed to start timer",
        type: "error",
      });
    } finally {
      setTimerStarting(false);
    }
  };

  // Handle Stop Timer
  const handleStopTimer = async () => {
    if (!runningEntry) return;
    setTimerStopping(true);
    setActionMessage(null);
    try {
      const stopped = await stopTimer(runningEntry.id);
      setEntries((prev) => prev.map((e) => (e.id === stopped.id ? stopped : e)));
      setActionMessage({
        text: `Timer stopped. Logged ${formatMinutes(stopped.duration_minutes || 0)}.`,
        type: "success",
      });
    } catch (err: any) {
      setActionMessage({
        text: err?.response?.data?.detail || err?.message || "Failed to stop timer",
        type: "error",
      });
    } finally {
      setTimerStopping(false);
    }
  };

  // Handle Approve Billing
  const handleApproveBilling = async (entryId: string) => {
    try {
      const updated = await approveTimeEntryBilling(entryId);
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setActionMessage({ text: "Time entry billing approved.", type: "success" });
    } catch (err: any) {
      setActionMessage({
        text: err?.response?.data?.detail || err?.message || "Failed to approve billing",
        type: "error",
      });
    }
  };

  // Handle Manual Log Submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    const totalMinutes = Number(manualForm.hours) * 60 + Number(manualForm.minutes);
    if (totalMinutes <= 0) {
      setManualError("Duration must be greater than 0 minutes.");
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
        text: `Manual time entry of ${formatMinutes(created.duration_minutes || 0)} saved.`,
        type: "success",
      });
      // Reset form
      setManualForm({
        activity_id: activities[0]?.id || "",
        hours: 1,
        minutes: 0,
        work_date: new Date().toISOString().slice(0, 10),
        notes: "",
        is_billable: true,
      });
    } catch (err: any) {
      setManualError(err?.response?.data?.detail || err?.message || "Failed to create manual entry");
    } finally {
      setManualSubmitting(false);
    }
  };

  return (
    <div className="sw-module-page">
      {/* Page Header */}
      <div className="sw-module-header">
        <div className="sw-module-title-box">
          <h1>
            Software Time Tracking
            <span className="sw-count-badge">{entries.length} Entries</span>
          </h1>
          <p>Real-time engineering timers, manual work logs, billable status, and client contract approvals.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="sw-btn-primary"
            onClick={() => {
              setManualError(null);
              const firstActivity = activities[0];
              if (firstActivity && !manualForm.activity_id) {
                setManualForm((prev) => ({ ...prev, activity_id: firstActivity.id }));
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
            marginBottom: "18px",
            padding: "12px 18px",
            borderRadius: "8px",
            fontSize: "0.88rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: actionMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${actionMessage.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            color: actionMessage.type === "success" ? "#10b981" : "#ef4444",
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

      {/* Live Timer Card */}
      <div
        className="sw-table-card"
        style={{
          padding: "20px 24px",
          marginBottom: "24px",
          background: runningEntry ? "rgba(14, 165, 233, 0.08)" : undefined,
          border: runningEntry ? "1px solid rgba(14, 165, 233, 0.4)" : undefined,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: runningEntry ? "#10b981" : "#94a3b8",
                  display: "inline-block",
                  boxShadow: runningEntry ? "0 0 8px #10b981" : undefined,
                }}
              />
              {runningEntry ? "Timer Active" : "Start Live Work Timer"}
            </h3>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
              {runningEntry
                ? `Tracking: ${activityMap.get(runningEntry.activity_id) || runningEntry.activity_title || "Task"} (${runningEntry.is_billable ? "Billable" : "Non-billable"})`
                : "Select an engineering task and start timing your development or testing session."}
            </p>
          </div>

          {runningEntry ? (
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "1.6rem",
                  fontWeight: 700,
                  color: "#0ea5e9",
                  background: "rgba(14, 165, 233, 0.12)",
                  padding: "6px 16px",
                  borderRadius: "8px",
                  letterSpacing: "0.06em",
                }}
              >
                {formatDurationSeconds(activeTimerSeconds)}
              </div>
              <button
                className="sw-btn-primary"
                style={{ background: "#ef4444" }}
                onClick={handleStopTimer}
                disabled={timerStopping}
              >
                {timerStopping ? "Stopping..." : "Stop Timer"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", width: "100%", maxWidth: "700px" }}>
              <select
                className="sw-filter-select"
                style={{ flex: "1 1 200px" }}
                value={timerTaskId}
                onChange={(e) => setTimerTaskId(e.target.value)}
              >
                <option value="">Select Task...</option>
                {activities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.title}
                  </option>
                ))}
              </select>

              <input
                type="text"
                className="sw-search-input"
                style={{ flex: "1 1 200px", paddingLeft: "12px" }}
                placeholder="What are you working on?"
                value={timerNotes}
                onChange={(e) => setTimerNotes(e.target.value)}
              />

              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.82rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={timerIsBillable}
                  onChange={(e) => setTimerIsBillable(e.target.checked)}
                />
                Billable
              </label>

              <button
                className="sw-btn-primary"
                onClick={handleStartTimer}
                disabled={timerStarting || !timerTaskId}
              >
                {timerStarting ? "Starting..." : "Start Timer"}
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
            placeholder="Search by task title, user, or notes..."
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
            <button className="sw-btn-secondary" onClick={loadData}>Retry</button>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            No time entries found matching your criteria. Start the live timer or log manual time.
          </div>
        ) : (
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
                const isRunning = !entry.stopped_at;
                const canApprove =
                  entry.is_billable &&
                  entry.billing_status === "Unreviewed" &&
                  !isRunning;

                return (
                  <tr key={entry.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{entry.work_date}</div>
                      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                        {entry.started_at
                          ? new Date(entry.started_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: "#0ea5e9" }}>
                        {activityMap.get(entry.activity_id) || entry.activity_title || "Development Task"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                        ID: {entry.activity_id.slice(0, 8)}...
                      </div>
                    </td>

                    <td>{userMap.get(entry.user_id) || entry.user_name || "Engineer"}</td>

                    <td>
                      <span className={`sw-badge ${entry.source === "timer" ? "proposal" : "discovery"}`}>
                        {entry.source === "timer" ? "Timer" : "Manual"}
                      </span>
                    </td>

                    <td style={{ fontWeight: 700 }}>
                      {isRunning ? (
                        <span style={{ color: "#10b981", animation: "pulse 1.5s infinite" }}>
                          Running ({formatMinutes(Math.floor(activeTimerSeconds / 60))})
                        </span>
                      ) : (
                        formatMinutes(entry.duration_minutes || 0)
                      )}
                    </td>

                    <td>
                      <span className={`sw-badge ${entry.is_billable ? "active" : "on-hold"}`}>
                        {entry.is_billable ? "Billable" : "Non-billable"}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`sw-badge ${
                          entry.billing_status === "Approved"
                            ? "accepted"
                            : entry.billing_status === "Rejected"
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
                      <div className="sw-row-actions" style={{ justifyContent: "flex-end" }}>
                        {canApprove && (
                          <button
                            className="sw-btn-secondary"
                            style={{ padding: "4px 10px", fontSize: "0.75rem", borderColor: "#10b981", color: "#10b981" }}
                            title="Approve for Contract Invoicing"
                            onClick={() => handleApproveBilling(entry.id)}
                          >
                            ✓ Approve
                          </button>
                        )}
                        {isRunning && (
                          <button
                            className="sw-btn-primary"
                            style={{ padding: "4px 10px", fontSize: "0.75rem", background: "#ef4444" }}
                            onClick={handleStopTimer}
                            disabled={timerStopping}
                          >
                            Stop
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Time Entry Modal */}
      {isManualModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsManualModalOpen(false)}>
          <div className="sw-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>Log Manual Work Time</h2>
              <button className="sw-btn-icon" onClick={() => setIsManualModalOpen(false)}>✕</button>
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
                    {activities.map((act) => (
                      <option key={act.id} value={act.id}>
                        {act.title}
                      </option>
                    ))}
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
    </div>
  );
}
