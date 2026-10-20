import { useEffect, useState, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";

/* ─── Existing Services (real API data) ─── */
import { getAccounts } from "../../services/accountService";
import { getActivities } from "../../services/activityService";
import { getDeals } from "../../services/dealService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getMyProfile } from "../../services/profileService";

/* ─── Existing Types ─── */
import type { Account } from "../../types/account";
import type { Activity } from "../../types/activity";
import type { Deal } from "../../types/deal";
import type { User } from "../../types/user";
import type { Lead } from "../../types/lead";

/* ─── Prototype data (frontend-only — see file header for details) ─── */
import {
  protoProjects,
  type ProtoProject,
} from "../../data/softwareCompanyProtoData";

import "./SoftwareCompanyDashboard.css";

/* ─── Helpers ─── */

type LoadingState = "loading" | "loaded" | "error" | "empty";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const statusSlug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

const progressClass = (p: number) => {
  if (p >= 100) return "done";
  if (p >= 65) return "high";
  if (p >= 35) return "mid";
  return "low";
};

/* ─── Small reusable sub-components ─── */

function Spinner() {
  return (
    <div className="sw-state-box">
      <div className="sw-spinner" />
      <p>Loading…</p>
    </div>
  );
}

function EmptyState({ message = "No data available" }: { message?: string }) {
  return (
    <div className="sw-state-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9h.01M15 9h.01M9 15h6" />
      </svg>
      <p>{message}</p>
    </div>
  );
}

function ErrorState({ message = "Failed to load data", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="sw-state-box">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p>{message}</p>
      {onRetry && <button className="sw-retry-btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */

export default function SoftwareCompanyDashboard() {
  const { industry } = useParams();

  /* ─── Profile & Role ─── */
  const [profileName, setProfileName] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (stored) {
        const u = JSON.parse(stored);
        return u.full_name || u.first_name || u.name || "";
      }
    } catch {}
    return "";
  });

  const [userRole, setUserRole] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (stored) {
        const u = JSON.parse(stored);
        if (u.role) {
          return typeof u.role === "string" ? u.role : u.role.name || "Tenant Admin";
        }
      }
    } catch {}
    return "Tenant Admin";
  });

  /* ─── Date Range Filter ─── */
  const [dateRange, setDateRange] = useState<"all" | "30d" | "90d" | "year">("all");

  /* ─── API data state ─── */
  const [accounts, setAccounts]     = useState<Account[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [deals, setDeals]           = useState<Deal[]>([]);
  const [users, setUsers]           = useState<User[]>([]);
  const [leads, setLeads]           = useState<Lead[]>([]);

  /* ─── Loading states per section ─── */
  const [accountsState, setAccountsState]     = useState<LoadingState>("loading");
  const [activitiesState, setActivitiesState] = useState<LoadingState>("loading");
  const [dealsState, setDealsState]           = useState<LoadingState>("loading");
  const [usersState, setUsersState]           = useState<LoadingState>("loading");

  /* ─── Base path resolution ─── */
  const tenantStr = sessionStorage.getItem("tenant");
  let tenantIndustry = "software-company";
  if (tenantStr) {
    try {
      const t = JSON.parse(tenantStr);
      if (t?.industry) tenantIndustry = t.industry.toLowerCase().replace(/\s+/g, "-");
    } catch {}
  }
  const currentIndustry = industry || tenantIndustry || "software-company";
  const basePath = `/${currentIndustry}`;

  /* ─── Loaders ─── */

  const loadAccounts = useCallback(async () => {
    setAccountsState("loading");
    try {
      const data = await getAccounts();
      setAccounts(data);
      setAccountsState(data.length > 0 ? "loaded" : "empty");
    } catch {
      setAccountsState("error");
    }
  }, []);

  const loadActivities = useCallback(async () => {
    setActivitiesState("loading");
    try {
      const data = await getActivities();
      setActivities(data);
      setActivitiesState(data.length > 0 ? "loaded" : "empty");
    } catch {
      setActivitiesState("error");
    }
  }, []);

  const loadDeals = useCallback(async () => {
    setDealsState("loading");
    try {
      const data = await getDeals();
      setDeals(data);
      setDealsState(data.length > 0 ? "loaded" : "empty");
    } catch {
      setDealsState("error");
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setUsersState("loading");
    try {
      const data = await getUsers();
      setUsers(data);
      setUsersState(data.length > 0 ? "loaded" : "empty");
    } catch {
      setUsersState("error");
    }
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const data = await getLeads();
      setLeads(data);
    } catch {
      setLeads([]);
    }
  }, []);

  useEffect(() => {
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        const name = u.full_name || u.first_name || u.name || "";
        if (name) {
          setProfileName(name);
        }
        if (u.role) {
          const r = typeof u.role === "string" ? u.role : u.role.name || "Tenant Admin";
          setUserRole(r);
        }
      } catch {}
    }

    getMyProfile()
      .then((p) => {
        if (p?.full_name) {
          setProfileName(p.full_name);
        }
        if (p?.role) {
          setUserRole(p.role);
        }
      })
      .catch(() => {
        // Fallback already handled by sessionStorage initialization
      });

    loadAccounts();
    loadActivities();
    loadDeals();
    loadUsers();
    loadLeads();
  }, [loadAccounts, loadActivities, loadDeals, loadUsers, loadLeads]);

  /* ─── Date filter helper ─── */
  const filterByDate = useCallback((dateStr: string | null | undefined): boolean => {
    if (dateRange === "all" || !dateStr) return true;
    const dt = new Date(dateStr).getTime();
    if (isNaN(dt)) return true;
    const now = Date.now();
    const days = dateRange === "30d" ? 30 : dateRange === "90d" ? 90 : 365;
    return dt >= now - days * 86400000;
  }, [dateRange]);

  const filteredDeals = useMemo(
    () => deals.filter((d) => filterByDate(d.expected_close_date || d.created_at)),
    [deals, filterByDate]
  );

  const filteredActivities = useMemo(
    () => activities.filter((a) => filterByDate(a.due_date || a.created_at)),
    [activities, filterByDate]
  );

  /* ─── Derived KPIs (from real data) ─── */
  const activeClients   = accounts.filter((a) => a.status?.toLowerCase() === "active" || a.status?.toLowerCase() === "customer").length;
  const openTasks       = filteredActivities.filter((a) => a.status === "Pending" || a.status === "In Progress").length;
  const teamMemberCount = users.length;

  const totalRevenue = filteredDeals.reduce((sum, d) => {
    if (d.stage?.toLowerCase() === "won" || d.stage?.toLowerCase() === "closed won") {
      return sum + (d.amount ?? 0);
    }
    return sum;
  }, 0);

  /* ─── Derived chart data ─── */

  // Project status counts (from proto data)
  const projectStatusData = useMemo(() => {
    const counts: Record<string, number> = { Active: 0, Planning: 0, "On Hold": 0, Completed: 0 };
    protoProjects.forEach((p) => { counts[p.status] = (counts[p.status] || 0) + 1; });
    return [
      { name: "Active",    value: counts.Active,    fill: "#10b981" },
      { name: "Planning",  value: counts.Planning,  fill: "#3b82f6" },
      { name: "On Hold",   value: counts["On Hold"], fill: "#f59e0b" },
      { name: "Completed", value: counts.Completed, fill: "#6366f1" },
    ];
  }, []);

  // Revenue trend from filtered deals (group by month of expected_close_date or created_at)
  const revenueTrendData = useMemo(() => {
    const monthMap = new Map<string, number>();
    filteredDeals.forEach((d) => {
      if (d.stage?.toLowerCase() === "won" || d.stage?.toLowerCase() === "closed won") {
        const dateStr = d.expected_close_date || d.created_at;
        if (!dateStr) return;
        const dt = new Date(dateStr);
        if (isNaN(dt.getTime())) return;
        const key = dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        monthMap.set(key, (monthMap.get(key) || 0) + (d.amount ?? 0));
      }
    });
    return Array.from(monthMap.entries())
      .map(([month, revenue]) => ({ month, revenue }))
      .slice(-6);
  }, [filteredDeals]);

  // Team workload from filtered real activities — count by assigned_to
  const teamWorkloadData = useMemo(() => {
    const assigneeCounts = new Map<string, number>();
    filteredActivities.forEach((a) => {
      if (a.status !== "Completed" && a.status !== "Cancelled" && a.assigned_to) {
        assigneeCounts.set(a.assigned_to, (assigneeCounts.get(a.assigned_to) || 0) + 1);
      }
    });
    // Resolve user IDs to names
    return Array.from(assigneeCounts.entries()).map(([userId, tasks]) => {
      const user = users.find((u) => u.id === userId);
      return { name: user ? user.full_name.split(" ")[0] : userId.slice(0, 6), tasks };
    }).slice(0, 8);
  }, [filteredActivities, users]);

  /* ─── Recent records ─── */
  const recentClients = useMemo(
    () => [...accounts]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 5),
    [accounts]
  );

  const recentActivities = useMemo(
    () => [...filteredActivities]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 6),
    [filteredActivities]
  );

  // User ID to name resolver
  const userNameMap = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.full_name));
    return m;
  }, [users]);
  const resolveUser = (id: string | null | undefined) => {
    if (!id) return "—";
    return userNameMap.get(id) || id.slice(0, 8);
  };

  // Account ID to name resolver
  const accountNameMap = useMemo(() => {
    const m = new Map<string, string>();
    accounts.forEach((a) => m.set(a.id, a.name));
    return m;
  }, [accounts]);
  const resolveAccount = (id: string | null | undefined) => {
    if (!id) return "—";
    return accountNameMap.get(id) || id.slice(0, 8);
  };

  // Lead ID to name resolver
  const leadNameMap = useMemo(() => {
    const m = new Map<string, string>();
    leads.forEach((l) => m.set(l.id, l.full_name));
    return m;
  }, [leads]);
  const resolveLead = (id: string | null | undefined) => {
    if (!id) return "—";
    return leadNameMap.get(id) || id.slice(0, 8);
  };

  // Deal ID to name resolver
  const dealNameMap = useMemo(() => {
    const m = new Map<string, string>();
    deals.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [deals]);
  const resolveDeal = (id: string | null | undefined) => {
    if (!id) return "—";
    return dealNameMap.get(id) || id.slice(0, 8);
  };

  /* ─── Chart Tooltip Style ─── */
  const tooltipStyle = {
    backgroundColor: "var(--sw-card-bg)",
    borderColor: "var(--sw-card-border)",
    color: "var(--sw-text)",
    borderRadius: "8px",
    fontSize: "0.82rem",
  };

  const welcomeHeading = profileName?.trim()
    ? `Welcome back, ${profileName.trim()}!`
    : "Welcome back!";

  /* ═══════════════════════════ RENDER ═══════════════════════════ */

  return (
    <div className="sw-dashboard">
      {/* ─── Dashboard Header ─── */}
      <div className="sw-dashboard-header">
        <div className="sw-header-top-row">
          <div className="sw-header-title-box">
            <h1>{welcomeHeading}</h1>
            <p>Here's an overview of your projects, clients, team workload, and delivery performance.</p>
          </div>

          <div className="sw-header-actions-box">
            {/* Quick Actions */}
            <div className="sw-quick-actions">
              <Link to={`${basePath}/accounts`} className="sw-btn-action primary" id="sw-btn-new-client">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New Client</span>
              </Link>
              <Link to={`${basePath}/activities`} className="sw-btn-action secondary" id="sw-btn-new-task">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New Task</span>
              </Link>
            </div>

            {/* Date Range Selector */}
            <div className="sw-date-filter">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sw-filter-icon">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <select
                id="sw-date-filter-select"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as "all" | "30d" | "90d" | "year")}
                className="sw-date-select"
                aria-label="Filter date range"
              >
                <option value="all">All Time</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="year">This Year</option>
              </select>
            </div>

            {/* User Profile Pill */}
            <div className="sw-user-profile-pill">
              <div className="sw-user-avatar">
                {(profileName || "U").charAt(0).toUpperCase()}
              </div>
              <div className="sw-user-info">
                <span className="sw-user-name">{profileName || "User"}</span>
                <span className="sw-user-role">{userRole}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── KPI Cards ─── */}
      <div className="sw-kpi-grid">
        {/* Active Projects — proto data (no Projects API) */}
        <div className="sw-kpi-card primary">
          <div className="sw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="sw-kpi-info">
            <div className="sw-kpi-label">Active Projects <span className="sw-proto-tag">Proto</span></div>
            <div className="sw-kpi-value">{protoProjects.filter((p) => p.status === "Active").length}</div>
          </div>
        </div>

        {/* Active Clients — real Account data */}
        <div className="sw-kpi-card teal">
          <div className="sw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div className="sw-kpi-info">
            <div className="sw-kpi-label">Active Clients</div>
            <div className="sw-kpi-value">{accountsState === "loading" ? "—" : activeClients}</div>
          </div>
        </div>

        {/* Open Tasks — real Activity data */}
        <div className="sw-kpi-card emerald">
          <div className="sw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div className="sw-kpi-info">
            <div className="sw-kpi-label">Open Tasks</div>
            <div className="sw-kpi-value">{activitiesState === "loading" ? "—" : openTasks}</div>
          </div>
        </div>

        {/* Team Members — real Users data */}
        <div className="sw-kpi-card indigo">
          <div className="sw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <div className="sw-kpi-info">
            <div className="sw-kpi-label">Team Members</div>
            <div className="sw-kpi-value">{usersState === "loading" ? "—" : teamMemberCount}</div>
          </div>
        </div>

        {/* Revenue — real Deal data (date filtered) */}
        <div className="sw-kpi-card amber">
          <div className="sw-kpi-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="sw-kpi-info">
            <div className="sw-kpi-label">Revenue</div>
            <div className="sw-kpi-value">{dealsState === "loading" ? "—" : INR.format(totalRevenue)}</div>
          </div>
        </div>
      </div>

      {/* ─── Project Delivery Overview (proto) ─── */}
      <div className="sw-single-col">
        <div className="sw-card">
          <div className="sw-card-header">
            <h3>
              Project Delivery Overview
              <span className="sw-proto-tag">Proto — No Projects API</span>
            </h3>
          </div>
          <div className="sw-card-body" style={{ padding: 0 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="sw-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Deadline</th>
                    <th>Project Manager</th>
                  </tr>
                </thead>
                <tbody>
                  {protoProjects.map((proj: ProtoProject) => (
                    <tr key={proj.id}>
                      <td>{proj.name}</td>
                      <td>{proj.client}</td>
                      <td>
                        <span className={`sw-badge ${statusSlug(proj.status)}`}>
                          {proj.status}
                        </span>
                      </td>
                      <td>
                        <div className="sw-progress-bar">
                          <div className="sw-progress-track">
                            <div
                              className={`sw-progress-fill ${progressClass(proj.progress)}`}
                              style={{ width: `${proj.progress}%` }}
                            />
                          </div>
                          <span className="sw-progress-label">{proj.progress}%</span>
                        </div>
                      </td>
                      <td>{formatDate(proj.deadline)}</td>
                      <td>{proj.projectManager}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Charts Row ─── */}
      <div className="sw-charts-grid">
        {/* Project Status Pie (proto) */}
        <div className="sw-card">
          <div className="sw-card-header">
            <h3>Project Status <span className="sw-proto-tag">Proto</span></h3>
          </div>
          <div className="sw-card-body">
            <div className="sw-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={projectStatusData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {projectStatusData.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={tooltipStyle} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: "0.78rem" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Revenue Trend (real deal data) */}
        <div className="sw-card">
          <div className="sw-card-header">
            <h3>Revenue Trend</h3>
          </div>
          <div className="sw-card-body">
            <div className="sw-chart-container">
              {dealsState === "loading" ? (
                <Spinner />
              ) : revenueTrendData.length === 0 ? (
                <EmptyState message="No revenue data available for charting" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--sw-chart-grid)" vertical={false} />
                    <XAxis dataKey="month" stroke="var(--sw-text-muted)" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      stroke="var(--sw-text-muted)"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}K`}
                    />
                    <RechartsTooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: any) => [INR.format(Number(value) || 0), "Revenue"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#14b8a6"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#14b8a6" }}
                      activeDot={{ r: 6, fill: "#14b8a6" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Team Workload (derived from real activities + users) */}
        <div className="sw-card">
          <div className="sw-card-header">
            <h3>Team Workload</h3>
          </div>
          <div className="sw-card-body">
            <div className="sw-chart-container">
              {activitiesState === "loading" || usersState === "loading" ? (
                <Spinner />
              ) : teamWorkloadData.length === 0 ? (
                <EmptyState message="No workload data to display" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamWorkloadData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--sw-chart-grid)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--sw-text-muted)" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis stroke="var(--sw-text-muted)" tickLine={false} axisLine={false} fontSize={12} />
                    <RechartsTooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: any) => [Number(value) || 0, "Tasks"]}
                    />
                    <Bar dataKey="tasks" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Two-column: Recent Projects + Tasks & Activities ─── */}
      <div className="sw-two-col">
        {/* Recent Projects (proto) */}
        <div className="sw-card">
          <div className="sw-card-header">
            <h3>Recent Projects <span className="sw-proto-tag">Proto</span></h3>
          </div>
          <div className="sw-card-body" style={{ padding: 0 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="sw-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>PM</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {protoProjects.slice(0, 5).map((proj) => (
                    <tr key={proj.id}>
                      <td>{proj.name}</td>
                      <td>{proj.client}</td>
                      <td>{proj.projectManager}</td>
                      <td>
                        <span className={`sw-badge ${statusSlug(proj.status)}`}>{proj.status}</span>
                      </td>
                      <td>
                        <div className="sw-progress-bar">
                          <div className="sw-progress-track">
                            <div
                              className={`sw-progress-fill ${progressClass(proj.progress)}`}
                              style={{ width: `${proj.progress}%` }}
                            />
                          </div>
                          <span className="sw-progress-label">{proj.progress}%</span>
                        </div>
                      </td>
                      <td>{formatDate(proj.deadline)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Tasks & Activities (real data) */}
        <div className="sw-card">
          <div className="sw-card-header">
            <h3>Tasks & Activities</h3>
            <Link to={`${basePath}/activities`} className="sw-card-link" id="sw-view-all-activities">
              View All →
            </Link>
          </div>
          <div className="sw-card-body" style={{ padding: 0 }}>
            {activitiesState === "loading" ? (
              <Spinner />
            ) : activitiesState === "error" ? (
              <ErrorState onRetry={loadActivities} />
            ) : activitiesState === "empty" ? (
              <EmptyState message="No activities found" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="sw-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Type</th>
                      <th>Related To</th>
                      <th>Assigned</th>
                      <th>Due</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActivities.map((act) => {
                      // Resolve the related record name
                      let relatedTo = "—";
                      if (act.account_id) relatedTo = resolveAccount(act.account_id);
                      else if (act.lead_id) relatedTo = resolveLead(act.lead_id);
                      else if (act.deal_id) relatedTo = resolveDeal(act.deal_id);
                      else if (act.contact_id) relatedTo = `Contact ${act.contact_id.slice(0, 6)}`;

                      return (
                        <tr key={act.id}>
                          <td>{act.title}</td>
                          <td>
                            <span className={`sw-type-badge ${act.activity_type.toLowerCase()}`}>
                              {act.activity_type}
                            </span>
                          </td>
                          <td>{relatedTo}</td>
                          <td>{resolveUser(act.assigned_to)}</td>
                          <td>{formatDate(act.due_date)}</td>
                          <td>
                            <span className={`sw-badge ${statusSlug(act.status)}`}>{act.status}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Recent Clients (real data) ─── */}
      <div className="sw-single-col">
        <div className="sw-card">
          <div className="sw-card-header">
            <h3>Recent Clients</h3>
            <Link to={`${basePath}/accounts`} className="sw-card-link" id="sw-view-all-clients">
              View All →
            </Link>
          </div>
          <div className="sw-card-body" style={{ padding: 0 }}>
            {accountsState === "loading" ? (
              <Spinner />
            ) : accountsState === "error" ? (
              <ErrorState onRetry={loadAccounts} />
            ) : accountsState === "empty" ? (
              <EmptyState message="No client accounts found" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="sw-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Industry</th>
                      <th>Assigned To</th>
                      <th>Status</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentClients.map((acc) => (
                      <tr key={acc.id}>
                        <td>{acc.name}</td>
                        <td>{acc.industry || "—"}</td>
                        <td>{resolveUser(acc.assigned_to)}</td>
                        <td>
                          <span className={`sw-badge ${statusSlug(acc.status || "prospect")}`}>
                            {acc.status || "Prospect"}
                          </span>
                        </td>
                        <td>{formatDate(acc.updated_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
