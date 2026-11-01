import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getProjectTimeSummary,
  getProjectTasksReport,
  getSprintTimeSummary,
  getTeamTimeSummary,
  getBillingTimeSummary,
} from "../../services/softwareDeliveryReportService";
import { getSoftwareProjects } from "../../services/softwareProjectService";
import { getSoftwareSprints } from "../../services/softwareSprintService";

import type {
  ProjectTimeSummary,
  ProjectTasksReport,
  SprintTimeSummary,
  TeamTimeSummary,
  BillingTimeSummary,
} from "../../types/softwareDeliveryReport";
import type { SoftwareProject } from "../../types/softwareProject";
import type { SoftwareSprint } from "../../types/softwareSprint";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import "./SoftwareModules.css";

const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#818cf8", "#ec4899", "#14b8a6"];

export default function SoftwareDeliveryReports() {
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [sprints, setSprints] = useState<SoftwareSprint[]>([]);

  // Selected filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  // Report state
  const [projectSummary, setProjectSummary] = useState<ProjectTimeSummary | null>(null);
  const [taskReport, setTaskReport] = useState<ProjectTasksReport | null>(null);
  const [sprintSummary, setSprintSummary] = useState<SprintTimeSummary | null>(null);
  const [teamSummary, setTeamSummary] = useState<TeamTimeSummary | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingTimeSummary | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "sprints" | "team">("overview");

  // Initial load of projects and reference lists
  const loadInitialData = useCallback(async () => {
    try {
      const [projs, sprts] = await Promise.all([
        getSoftwareProjects().catch(() => []),
        getSoftwareSprints().catch(() => []),
      ]);

      setProjects(projs);
      setSprints(sprts);

      if (projs.length > 0 && projs[0] && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load projects list");
    }
  }, [selectedProjectId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Load report data whenever filters change
  const loadReports = useCallback(async () => {
    if (!selectedProjectId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      };

      const [projSum, tasks, teamSum, billSum] = await Promise.all([
        getProjectTimeSummary(selectedProjectId, params).catch(() => null),
        getProjectTasksReport(selectedProjectId).catch(() => null),
        getTeamTimeSummary({ ...params, project_id: selectedProjectId }).catch(() => null),
        getBillingTimeSummary({ ...params, project_id: selectedProjectId }).catch(() => null),
      ]);

      setProjectSummary(projSum);
      setTaskReport(tasks);
      setTeamSummary(teamSum);
      setBillingSummary(billSum);

      // Sprint summary if sprint is selected
      if (selectedSprintId) {
        const sprtSum = await getSprintTimeSummary(selectedSprintId).catch(() => null);
        setSprintSummary(sprtSum);
      } else {
        setSprintSummary(null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load delivery report metrics");
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId, selectedSprintId, fromDate, toDate]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  // Filter sprints for selected project
  const projectSprints = useMemo(() => {
    if (!selectedProjectId) return sprints;
    return sprints.filter((s) => s.software_project_id === selectedProjectId);
  }, [sprints, selectedProjectId]);

  const activeProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId);
  }, [projects, selectedProjectId]);

  // Chart data formatting
  const billingPieData = useMemo(() => {
    if (!billingSummary) return [];
    const approved = billingSummary.approved_hours || 0;
    const unreviewed = billingSummary.unreviewed_hours || 0;
    const nonBillable = billingSummary.non_billable_hours || 0;
    const rejected = billingSummary.rejected_hours || 0;

    return [
      { name: "Approved Billable", value: approved, color: "#10b981" },
      { name: "Unreviewed Billable", value: unreviewed, color: "#0ea5e9" },
      { name: "Non-Billable Internal", value: nonBillable, color: "#f59e0b" },
      { name: "Rejected", value: rejected, color: "#ef4444" },
    ].filter((item) => item.value > 0);
  }, [billingSummary]);

  const teamList = useMemo(() => {
    if (!teamSummary) return [];
    return teamSummary.team || teamSummary.team_members || [];
  }, [teamSummary]);

  const teamBarData = useMemo(() => {
    return teamList.map((m) => ({
      name: m.full_name || m.user_name || `User ${m.user_id.slice(0, 6)}`,
      "Billable Hours": Number(m.billable_minutes ? (m.billable_minutes / 60).toFixed(1) : 0),
      "Total Hours": Number((m.total_hours || m.total_logged_hours || 0).toFixed(1)),
    }));
  }, [teamList]);

  return (
    <div className="sw-module-page">
      {/* Header */}
      <div className="sw-module-header">
        <div className="sw-module-title-box">
          <h1>
            Software Delivery Reports
            {activeProject && <span className="sw-count-badge">{activeProject.name}</span>}
          </h1>
          <p>Time analytics, task breakdowns, sprint velocity summaries, and billable resource allocation.</p>
        </div>
        <button className="sw-btn-secondary" onClick={loadReports} disabled={loading}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh Reports
        </button>
      </div>

      {error && (
        <div className="sw-error-banner" style={{ marginBottom: "16px" }}>
          {error}
        </div>
      )}

      {/* Global Filter Toolbar */}
      <div className="sw-filter-bar">
        <div className="sw-form-group" style={{ minWidth: "220px", flex: "1 1 220px" }}>
          <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>PROJECT *</label>
          <select
            className="sw-filter-select"
            style={{ width: "100%" }}
            value={selectedProjectId}
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setSelectedSprintId("");
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number ? `[${p.project_number}] ` : ""}{p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sw-form-group" style={{ minWidth: "180px", flex: "1 1 180px" }}>
          <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>SPRINT (OPTIONAL)</label>
          <select
            className="sw-filter-select"
            style={{ width: "100%" }}
            value={selectedSprintId}
            onChange={(e) => setSelectedSprintId(e.target.value)}
          >
            <option value="">All Project Sprints</option>
            {projectSprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.status})
              </option>
            ))}
          </select>
        </div>

        <div className="sw-form-group" style={{ minWidth: "140px" }}>
          <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>FROM DATE</label>
          <input
            type="date"
            className="sw-filter-select"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="sw-form-group" style={{ minWidth: "140px" }}>
          <label style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 600 }}>TO DATE</label>
          <input
            type="date"
            className="sw-filter-select"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      {/* KPI Cards */}
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
            Total Logged Hours
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#0ea5e9", marginTop: "4px" }}>
            {projectSummary ? (projectSummary.total_hours || projectSummary.total_logged_hours || 0).toFixed(1) : "0.0"} hrs
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            {projectSummary?.entry_count || 0} time entries
          </div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
            Billable Hours
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#10b981", marginTop: "4px" }}>
            {projectSummary ? projectSummary.billable_hours.toFixed(1) : "0.0"} hrs
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            {billingSummary && billingSummary.total_hours > 0
              ? `${((billingSummary.billable_hours / billingSummary.total_hours) * 100).toFixed(0)}% billable ratio`
              : "—"}
          </div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
            Internal / Non-Billable
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#f59e0b", marginTop: "4px" }}>
            {projectSummary ? projectSummary.non_billable_hours.toFixed(1) : "0.0"} hrs
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Research & dev overhead</div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>
            Active Tasks Tracked
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: 700, color: "#818cf8", marginTop: "4px" }}>
            {taskReport?.tasks.length || 0}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>Across project iterations</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px" }}>
        <button
          className={activeTab === "overview" ? "sw-btn-primary" : "sw-btn-secondary"}
          onClick={() => setActiveTab("overview")}
        >
          Delivery Overview & Billing
        </button>
        <button
          className={activeTab === "tasks" ? "sw-btn-primary" : "sw-btn-secondary"}
          onClick={() => setActiveTab("tasks")}
        >
          Task Breakdown ({taskReport?.tasks.length || 0})
        </button>
        <button
          className={activeTab === "team" ? "sw-btn-primary" : "sw-btn-secondary"}
          onClick={() => setActiveTab("team")}
        >
          Team Allocation ({teamList.length})
        </button>
        {selectedSprintId && (
          <button
            className={activeTab === "sprints" ? "sw-btn-primary" : "sw-btn-secondary"}
            onClick={() => setActiveTab("sprints")}
          >
            Sprint Detail
          </button>
        )}
      </div>

      {/* Tab 1: Overview & Billing */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
          <div className="sw-table-card" style={{ padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.05rem" }}>Billing Time Distribution</h3>
            {billingPieData.length > 0 ? (
              <div style={{ height: "260px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={billingPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }: any) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                    >
                      {billingPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `${value} hrs`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
                No hours recorded for this project time window yet.
              </div>
            )}
          </div>

          <div className="sw-table-card" style={{ padding: "20px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "1.05rem" }}>Audit & Review Summary</h3>
            {billingSummary ? (
              <table className="sw-data-table" style={{ marginTop: "10px" }}>
                <tbody>
                  <tr>
                    <td>Total Logged Hours</td>
                    <td style={{ fontWeight: 700, color: "#0ea5e9" }}>{billingSummary.total_hours.toFixed(1)} hrs</td>
                  </tr>
                  <tr>
                    <td>Billable Hours</td>
                    <td style={{ fontWeight: 700, color: "#10b981" }}>{billingSummary.billable_hours.toFixed(1)} hrs</td>
                  </tr>
                  <tr>
                    <td>Internal Non-Billable</td>
                    <td style={{ fontWeight: 700, color: "#f59e0b" }}>{billingSummary.non_billable_hours.toFixed(1)} hrs</td>
                  </tr>
                  <tr>
                    <td>Total Project Entries</td>
                    <td style={{ fontWeight: 700 }}>{billingSummary.entry_count}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8" }}>
                No billing metrics available.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Task Breakdown */}
      {activeTab === "tasks" && (
        <div className="sw-table-card">
          {!taskReport || taskReport.tasks.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
              No tasks with logged time found for this project.
            </div>
          ) : (
            <table className="sw-data-table">
              <thead>
                <tr>
                  <th>Task Title / ID</th>
                  <th>Total Hours</th>
                  <th>Billable Hours</th>
                  <th>Entries Logged</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {taskReport.tasks.map((task) => (
                  <tr key={task.activity_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{task.task_title || task.title || "Task"}</div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>ID: {task.activity_id}</div>
                    </td>
                    <td style={{ fontWeight: 700, color: "#0ea5e9" }}>
                      {(task.total_hours || task.total_logged_hours || 0).toFixed(1)} hrs
                    </td>
                    <td style={{ fontWeight: 600, color: "#10b981" }}>
                      {(task.billable_minutes / 60).toFixed(1)} hrs
                    </td>
                    <td>{task.entry_count}</td>
                    <td>
                      <span className="sw-badge discovery">{task.status || "In Progress"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Team Allocation */}
      {activeTab === "team" && (
        <div>
          {teamBarData.length > 0 && (
            <div className="sw-table-card" style={{ padding: "20px", marginBottom: "20px" }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: "1.05rem" }}>Engineer Time Distribution (Hours)</h3>
              <div style={{ height: "260px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamBarData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Total Hours" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Billable Hours" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="sw-table-card">
            {teamList.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                No team time records recorded for this filter.
              </div>
            ) : (
              <table className="sw-data-table">
                <thead>
                  <tr>
                    <th>Team Member</th>
                    <th>Total Logged Hours</th>
                    <th>Billable Hours</th>
                    <th>Entries Count</th>
                    <th>Team Share</th>
                  </tr>
                </thead>
                <tbody>
                  {teamList.map((member) => {
                    const totalHours = teamList.reduce((acc, curr) => acc + (curr.total_hours || 0), 0) || 1;
                    const memberHours = member.total_hours || member.total_logged_hours || 0;
                    const share = ((memberHours / totalHours) * 100).toFixed(1);
                    return (
                      <tr key={member.user_id}>
                        <td style={{ fontWeight: 600 }}>{member.full_name || member.user_name || member.user_id}</td>
                        <td style={{ fontWeight: 700, color: "#0ea5e9" }}>{memberHours.toFixed(1)} hrs</td>
                        <td style={{ fontWeight: 600, color: "#10b981" }}>{(member.billable_minutes / 60).toFixed(1)} hrs</td>
                        <td>{member.entry_count}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div style={{ flex: 1, background: "rgba(255,255,255,0.1)", borderRadius: "4px", height: "6px", maxWidth: "100px" }}>
                              <div style={{ width: `${share}%`, background: "#0ea5e9", height: "100%", borderRadius: "4px" }} />
                            </div>
                            <span style={{ fontSize: "0.76rem" }}>{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Sprint Detail */}
      {activeTab === "sprints" && selectedSprintId && (
        <div className="sw-table-card" style={{ padding: "24px" }}>
          <h3 style={{ margin: "0 0 16px 0", fontSize: "1.1rem" }}>
            Sprint Summary: {sprintSummary?.sprint_name || selectedSprintId}
          </h3>
          {sprintSummary ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px" }}>
              <div style={{ padding: "16px", background: "rgba(14, 165, 233, 0.08)", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>TOTAL SPRINT HOURS</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#0ea5e9", marginTop: "4px" }}>
                  {(sprintSummary.total_hours || sprintSummary.total_logged_hours || 0).toFixed(1)} hrs
                </div>
              </div>
              <div style={{ padding: "16px", background: "rgba(16, 185, 129, 0.08)", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>BILLABLE SPRINT HOURS</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#10b981", marginTop: "4px" }}>
                  {(sprintSummary.billable_minutes / 60).toFixed(1)} hrs
                </div>
              </div>
              <div style={{ padding: "16px", background: "rgba(245, 158, 11, 0.08)", borderRadius: "8px" }}>
                <div style={{ fontSize: "0.75rem", color: "#64748b" }}>LOGGED ENTRIES</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "#f59e0b", marginTop: "4px" }}>
                  {sprintSummary.entry_count}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ color: "#94a3b8" }}>No logged time for this sprint yet.</div>
          )}
        </div>
      )}
    </div>
  );
}
