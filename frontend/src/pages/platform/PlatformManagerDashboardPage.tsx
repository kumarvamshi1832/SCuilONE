import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
  Flag,
  LifeBuoy,
  Network,
  RefreshCw,
  Search,
  TriangleAlert,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import AnimatedCountUp from "../../components/common/AnimatedCountUp";
import {
  getStoredPlatformUser,
  hasPlatformPermission,
} from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformAnalyticsOverview,
  PlatformEmployee,
  PlatformIndustryTeam,
  PlatformSupportTicket,
} from "../../types/platform";
import { getCurrentPlatformRole } from "../../utils/platformManager";
import { resolvePlatformRoleLabel } from "../../utils/platformRoleDisplay";
import "./PlatformPages.css";
import "./PlatformManagerDashboard.css";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CLOSED_STATUSES = new Set(["Resolved", "Closed"]);
const STATUS_ORDER = ["Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"];
const STATUS_COLORS: Record<string, string> = {
  Open: "#6366f1",
  "In Progress": "#06b6d4",
  "Waiting on Customer": "#f59e0b",
  Resolved: "#10b981",
  Closed: "#64748b",
};

const isOpen = (t: PlatformSupportTicket) => !CLOSED_STATUSES.has(t.status);
const isUnassigned = (t: PlatformSupportTicket) =>
  isOpen(t) && !t.assigned_employee_user_id && !t.assigned_to;

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function priorityBadge(priority: string): string {
  const p = priority.toLowerCase();
  if (p === "critical" || p === "urgent") return "red";
  if (p === "high") return "yellow";
  if (p === "medium") return "blue";
  return "indigo";
}

function availabilityBadge(value: string): string {
  if (value === "Available") return "green";
  if (value === "Busy") return "yellow";
  if (value === "Offline") return "red";
  return "indigo";
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
  return (parts[0]?.[0] ?? "").toUpperCase();
}

type SectionState<T> = { data: T | null; error: string | null };
const emptySection = <T,>(): SectionState<T> => ({ data: null, error: null });

interface KpiCardProps {
  label: string;
  value: number | string;
  sub: string;
  tone: "violet" | "blue" | "cyan" | "emerald" | "amber" | "rose";
  icon: React.ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}

function KpiCard({ label, value, sub, tone, icon, onClick, actionLabel }: KpiCardProps) {
  const body = (
    <>
      <span className={`pmd-kpi-icon tone-${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span className="pmd-kpi-label">{label}</span>
      <span className="pmd-kpi-value">
        <AnimatedCountUp value={value} />
      </span>
      <span className="pmd-kpi-sub">{sub}</span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={`pmd-kpi tone-${tone} is-link`}
      onClick={onClick}
      aria-label={actionLabel ? `${label}: ${actionLabel}` : label}
    >
      {body}
      <ArrowUpRight className="pmd-kpi-go" size={15} aria-hidden="true" />
    </button>
  ) : (
    <div className={`pmd-kpi tone-${tone}`}>{body}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function PlatformManagerDashboardPage() {
  const navigate = useNavigate();

  // Real permissions from the verified session (read-only checks; nothing is granted here).
  const can = {
    employees: hasPlatformPermission("platform.employees.view"),
    teams: hasPlatformPermission("platform.teams.view"),
    tickets: hasPlatformPermission("platform.tickets.view"),
    manageTickets: hasPlatformPermission("platform.tickets.manage"),
    assign: hasPlatformPermission("platform.tickets.assign"),
    escalate: hasPlatformPermission("platform.tickets.escalate"),
    kb: hasPlatformPermission("platform.kb.view"),
    analytics: hasPlatformPermission("platform.analytics.view"),
    tenants: hasPlatformPermission("platform.tenants.view"),
  };

  const [sessionUser, setSessionUser] = useState<any>(() => getStoredPlatformUser());
  const [tickets, setTickets] = useState<SectionState<PlatformSupportTicket[]>>(emptySection);
  const [employees, setEmployees] = useState<SectionState<PlatformEmployee[]>>(emptySection);
  const [teams, setTeams] = useState<SectionState<PlatformIndustryTeam[]>>(emptySection);
  const [kbTotal, setKbTotal] = useState<SectionState<number>>(emptySection);
  const [analytics, setAnalytics] = useState<SectionState<PlatformAnalyticsOverview>>(emptySection);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [attentionFilter, setAttentionFilter] = useState<"escalated" | "sla" | "unassigned">(
    "escalated"
  );
  const [rosterSearch, setRosterSearch] = useState("");
  const [rosterAvailability, setRosterAvailability] = useState("");
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const wrap = async <T,>(
      allowed: boolean,
      fetcher: () => Promise<T>,
      fallback: string
    ): Promise<SectionState<T>> => {
      if (!allowed) return emptySection<T>();
      try {
        return { data: await fetcher(), error: null };
      } catch (err) {
        return { data: null, error: extractApiErrorMessage(err, fallback) };
      }
    };

    const [t, e, tm, kb, an] = await Promise.all([
      wrap(can.tickets, async () => (await platformService.listSupportTickets()).items || [], "Unable to load support tickets."),
      wrap(can.employees, async () => (await platformService.listEmployees()).items || [], "Unable to load employees."),
      wrap(can.teams, async () => (await platformService.listIndustryTeams()).items || [], "Unable to load industry teams."),
      wrap(can.kb, async () => (await platformService.listKnowledgeBase()).total ?? 0, "Unable to load knowledge base."),
      wrap(can.analytics, () => platformService.getAnalyticsOverview(), "Unable to load analytics."),
    ]);
    setTickets(t);
    setEmployees(e);
    setTeams(tm);
    setKbTotal(kb);
    setAnalytics(an);
    setLastUpdated(new Date());
    setLoading(false);
    // Permission flags are stable for the session; reloads are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Display name follows profile edits made elsewhere in the app.
  useEffect(() => {
    const sync = () => setSessionUser(getStoredPlatformUser());
    window.addEventListener("platform-profile-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("platform-profile-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const roleLabel = resolvePlatformRoleLabel(getCurrentPlatformRole());
  const displayName = String(sessionUser?.full_name || sessionUser?.name || "").trim();
  const avatarUrl = String(
    sessionUser?.avatar_url || sessionUser?.photo_url || sessionUser?.profile_image || ""
  ).trim();
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [avatarUrl]);
  const myUserId = String(sessionUser?.user_id || sessionUser?.id || "");

  /* ---------- derived, permission-scoped metrics ---------- */

  const ticketList = tickets.data;
  const ticketStats = useMemo(() => {
    const list = ticketList || [];
    return {
      open: list.filter(isOpen).length,
      resolved: list.filter((t) => CLOSED_STATUSES.has(t.status)).length,
      escalated: list.filter((t) => isOpen(t) && t.is_escalated).length,
      sla: list.filter((t) => isOpen(t) && t.sla_breached).length,
      unassigned: list.filter(isUnassigned).length,
      mine: list.filter(
        (t) =>
          isOpen(t) &&
          Boolean(myUserId) &&
          (t.assigned_employee_user_id === myUserId || t.assigned_to === myUserId)
      ).length,
    };
  }, [ticketList, myUserId]);

  const statusSlices = useMemo(() => {
    const list = ticketList || [];
    return STATUS_ORDER.map((status) => ({
      name: status,
      value: list.filter((t) => t.status === status).length,
      color: STATUS_COLORS[status] ?? "#64748b",
    })).filter((s) => s.value > 0);
  }, [ticketList]);

  const attentionItems = useMemo(() => {
    const list = (ticketList || []).filter(isOpen);
    const picked =
      attentionFilter === "escalated"
        ? list.filter((t) => t.is_escalated)
        : attentionFilter === "sla"
        ? list.filter((t) => t.sla_breached)
        : list.filter(isUnassigned);
    return picked.slice(0, 6);
  }, [ticketList, attentionFilter]);

  const recentActivity = useMemo(
    () =>
      [...(ticketList || [])]
        .sort(
          (a, b) =>
            new Date(b.updated_at || b.created_at || 0).getTime() -
            new Date(a.updated_at || a.created_at || 0).getTime()
        )
        .slice(0, 6),
    [ticketList]
  );

  const employeeList = employees.data;
  const availability = useMemo(() => {
    const list = employeeList || [];
    const count = (v: string) => list.filter((e) => e.availability_status === v).length;
    return {
      total: list.length,
      active: list.filter((e) => e.status === "Active").length,
      available: count("Available"),
      busy: count("Busy"),
      offline: count("Offline"),
      leave: count("On Leave"),
    };
  }, [employeeList]);

  const rosterRows = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return (employeeList || [])
      .filter((e) => !rosterAvailability || e.availability_status === rosterAvailability)
      .filter(
        (e) =>
          !q ||
          [e.full_name, e.email, e.role, e.industry_team_name, e.industry_key]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
      );
  }, [employeeList, rosterSearch, rosterAvailability]);

  const teamList = teams.data;
  const teamTotals = useMemo(() => {
    const list = teamList || [];
    return {
      count: list.length,
      vacancies: list.reduce((n, t) => n + (t.vacancies_count || 0), 0),
      workload: list.reduce((n, t) => n + (t.open_tickets_workload || 0), 0),
    };
  }, [teamList]);

  const go = (to: string) => () => navigate(to);
  const sectionErrors = [tickets.error, employees.error, teams.error, kbTotal.error, analytics.error].filter(
    (e): e is string => Boolean(e)
  );

  const attentionTabs: { key: "escalated" | "sla" | "unassigned"; label: string; count: number; show: boolean }[] = [
    { key: "escalated", label: "Escalated", count: ticketStats.escalated, show: true },
    { key: "sla", label: "SLA breached", count: ticketStats.sla, show: true },
    { key: "unassigned", label: "Unassigned", count: ticketStats.unassigned, show: true },
  ];
  const attentionRoute =
    attentionFilter === "escalated"
      ? "/platform/support?tab=tickets&view=escalated"
      : attentionFilter === "sla"
      ? "/platform/support?tab=tickets&view=sla_breached"
      : "/platform/support?tab=tickets&view=new_open";

  const hasAnyKpi =
    can.tickets || can.employees || can.teams || can.kb || can.analytics;

  return (
    <div className="platform-page pmd-page">
      {/* ------------------------------ Header ------------------------------ */}
      <section className="platform-dash-hero pmd-hero">
        <div className="platform-dash-hero-bar" aria-hidden="true" />
        <div className="platform-dash-hero-glow" aria-hidden="true" />
        <div className="platform-dash-hero-orb" aria-hidden="true" />
        <div className="platform-dash-hero-inner pmd-hero-inner">
          <div className="platform-dash-hero-main">
            <h2 className="platform-dash-title">
              {roleLabel ? (
                <>
                  <span className="platform-dash-title-lead">Welcome Back, </span>
                  <span className="platform-dash-title-accent">{roleLabel}</span>
                  <span className="platform-dash-title-lead">!</span>
                </>
              ) : (
                <span className="platform-dash-title-accent">Welcome Back!</span>
              )}
            </h2>
            <p className="platform-dash-subtitle">
              Manage platform operations, coordinate teams, and monitor your assigned
              responsibilities.
            </p>
          </div>
          <div className="pmd-hero-side">
            <div className="pmd-identity">
              <span className="pmd-avatar" aria-hidden="true">
                {avatarUrl && !avatarFailed ? (
                  <img src={avatarUrl} alt="" onError={() => setAvatarFailed(true)} />
                ) : (
                  <span>{initialsOf(displayName) || <UserRound size={18} />}</span>
                )}
              </span>
              <span className="pmd-identity-text">
                <strong>{displayName || "Platform account"}</strong>
                {roleLabel && <small>{roleLabel}</small>}
              </span>
            </div>
            <button
              type="button"
              className="platform-btn pmd-refresh"
              onClick={() => void loadAll()}
              disabled={loading}
              aria-label="Refresh dashboard"
            >
              <RefreshCw size={15} className={loading ? "pmd-spin" : undefined} />
              <span>{loading ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>
        </div>
      </section>

      {sectionErrors.length > 0 && (
        <div className="platform-alert error" role="alert">
          <span>
            <CircleAlert size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {sectionErrors.join(" ")}
          </span>
        </div>
      )}

      {/* ------------------------------- KPIs ------------------------------- */}
      {loading && !lastUpdated ? (
        <div className="platform-card platform-empty" aria-busy="true">
          <div className="platform-spinner" />
        </div>
      ) : (
        <>
          {hasAnyKpi && (
            <section className="pmd-kpi-grid" aria-label="Key metrics">
              {can.tickets && tickets.data && (
                <>
                  <KpiCard
                    label="Open tickets"
                    value={ticketStats.open}
                    sub={`${ticketStats.resolved} resolved`}
                    tone="violet"
                    icon={<LifeBuoy size={18} />}
                    onClick={go("/platform/support?tab=tickets&view=new_open")}
                    actionLabel="open the support queue"
                  />
                  <KpiCard
                    label="My assigned"
                    value={ticketStats.mine}
                    sub="Assigned to you"
                    tone="blue"
                    icon={<UserCheck size={18} />}
                    onClick={go("/platform/support?tab=tickets&view=my_tickets")}
                    actionLabel="view your tickets"
                  />
                  <KpiCard
                    label="Escalated"
                    value={ticketStats.escalated}
                    sub="Open escalations"
                    tone="amber"
                    icon={<Flag size={18} />}
                    onClick={go("/platform/support?tab=tickets&view=escalated")}
                    actionLabel="view escalations"
                  />
                  <KpiCard
                    label="SLA breached"
                    value={ticketStats.sla}
                    sub={`${ticketStats.unassigned} unassigned`}
                    tone="rose"
                    icon={<TriangleAlert size={18} />}
                    onClick={go("/platform/support?tab=tickets&view=sla_breached")}
                    actionLabel="view SLA breaches"
                  />
                </>
              )}
              {can.employees && employees.data && (
                <KpiCard
                  label="Platform employees"
                  value={availability.total}
                  sub={`${availability.available} available now`}
                  tone="cyan"
                  icon={<Users size={18} />}
                  onClick={go("/platform/employees")}
                  actionLabel="open employees"
                />
              )}
              {can.teams && teams.data && (
                <KpiCard
                  label="Industry teams"
                  value={teamTotals.count}
                  sub={`${teamTotals.vacancies} vacancies · ${teamTotals.workload} open workload`}
                  tone="emerald"
                  icon={<Network size={18} />}
                  onClick={go("/platform/employees")}
                  actionLabel="open industry teams"
                />
              )}
              {can.analytics && analytics.data && (
                <KpiCard
                  label="SLA compliance"
                  value={`${analytics.data.totals.sla_compliance_pct}%`}
                  sub={`${analytics.data.totals.active_companies} active of ${analytics.data.totals.registered_companies} tenants (aggregate)`}
                  tone="emerald"
                  icon={<CheckCircle2 size={18} />}
                  onClick={go("/platform/analytics")}
                  actionLabel="open analytics"
                />
              )}
              {can.kb && kbTotal.data !== null && (
                <KpiCard
                  label="Knowledge articles"
                  value={kbTotal.data}
                  sub="Available troubleshooting guides"
                  tone="blue"
                  icon={<BookOpen size={18} />}
                  onClick={go("/platform/support?tab=kb")}
                  actionLabel="open knowledge base"
                />
              )}
            </section>
          )}

          <div className="pmd-grid">
            {/* --------------------------- Support overview --------------------------- */}
            {can.tickets && tickets.data && (
              <section className="platform-card pmd-card">
                <header className="pmd-card-head">
                  <div>
                    <h3>Support overview</h3>
                    <p>Ticket workload within your authorized scope.</p>
                  </div>
                  <button type="button" className="platform-btn sm" onClick={go("/platform/support?tab=tickets")}>
                    Open queue <ArrowUpRight size={13} />
                  </button>
                </header>
                {tickets.data.length === 0 ? (
                  <p className="pmd-empty">No support tickets in your scope.</p>
                ) : (
                  <div className="pmd-support">
                    <div className="pmd-donut" role="img" aria-label="Tickets by status">
                      <ResponsiveContainer width="100%" height={190}>
                        <PieChart>
                          <Pie
                            data={statusSlices}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={80}
                            paddingAngle={2}
                            stroke="none"
                          >
                            {statusSlices.map((s) => (
                              <Cell key={s.name} fill={s.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="pmd-donut-center">
                        <strong>{tickets.data.length}</strong>
                        <span>tickets</span>
                      </div>
                    </div>
                    <ul className="pmd-legend">
                      {statusSlices.map((s) => (
                        <li key={s.name}>
                          <span className="pmd-dot" style={{ background: s.color }} />
                          <span>{s.name}</span>
                          <strong>{s.value}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* --------------------------- Needs attention --------------------------- */}
            {can.tickets && tickets.data && (
              <section className="platform-card pmd-card">
                <header className="pmd-card-head">
                  <div>
                    <h3>Needs attention</h3>
                    <p>Open tickets that may need assignment or escalation handling.</p>
                  </div>
                </header>
                <div className="pmd-chips" role="tablist" aria-label="Attention filters">
                  {attentionTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={attentionFilter === tab.key}
                      className={`pmd-chip${attentionFilter === tab.key ? " active" : ""}`}
                      onClick={() => setAttentionFilter(tab.key)}
                    >
                      {tab.label} <b>{tab.count}</b>
                    </button>
                  ))}
                </div>
                {attentionItems.length === 0 ? (
                  <p className="pmd-empty">
                    <CheckCircle2 size={16} /> Nothing in this category right now.
                  </p>
                ) : (
                  <ul className="pmd-list">
                    {attentionItems.map((t) => (
                      <li key={t.id}>
                        <div className="pmd-list-main">
                          <strong>{t.ticket_number ? `${t.ticket_number} · ` : ""}{t.subject}</strong>
                          <small>
                            {t.company_name || "Unknown tenant"} · {t.assigned_employee_name || "Unassigned"}
                          </small>
                        </div>
                        <span className={`platform-badge ${priorityBadge(t.priority)}`}>{t.priority}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="pmd-card-foot">
                  <button
                    type="button"
                    className="platform-btn sm primary"
                    onClick={go(attentionRoute)}
                  >
                    {attentionFilter === "unassigned" && can.assign
                      ? "Assign in support queue"
                      : attentionFilter === "escalated" && can.escalate
                      ? "Review escalations"
                      : "View in support queue"}
                  </button>
                </div>
              </section>
            )}

            {/* ---------------------------- Teams overview ---------------------------- */}
            {can.teams && teams.data && (
              <section className="platform-card pmd-card pmd-span-2">
                <header className="pmd-card-head">
                  <div>
                    <h3>Industry teams</h3>
                    <p>Staffing and open workload per industry team.</p>
                  </div>
                  <button type="button" className="platform-btn sm" onClick={go("/platform/employees")}>
                    Manage <ArrowUpRight size={13} />
                  </button>
                </header>
                {teams.data.length === 0 ? (
                  <p className="pmd-empty">No industry teams are available.</p>
                ) : (
                  <div className="platform-table-wrap">
                    <table className="platform-table">
                      <thead>
                        <tr>
                          <th>Team</th>
                          <th>Members</th>
                          <th>Vacancies</th>
                          <th>Open workload</th>
                          <th>SLA targets</th>
                        </tr>
                      </thead>
                      <tbody>
                        {teams.data.map((team) => (
                          <tr key={team.id}>
                            <td>
                              <strong>{team.name}</strong>
                              <div className="pmd-sub">{team.industry_key}</div>
                            </td>
                            <td>
                              {team.active_members_count}/{team.max_members}
                            </td>
                            <td>
                              <span className={`platform-badge ${team.vacancies_count > 0 ? "yellow" : "green"}`}>
                                {team.vacancies_count}
                              </span>
                            </td>
                            <td>{team.open_tickets_workload}</td>
                            <td className="pmd-sub">
                              {team.sla_response_minutes}m response · {team.sla_resolution_hours}h resolve
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* ------------------------- Employee roster ------------------------- */}
            {can.employees && employees.data && (
              <section className="platform-card pmd-card pmd-span-2">
                <header className="pmd-card-head">
                  <div>
                    <h3>Employee roster</h3>
                    <p>
                      {availability.active} active · {availability.available} available ·{" "}
                      {availability.busy} busy · {availability.leave} on leave · {availability.offline} offline
                    </p>
                  </div>
                  <button type="button" className="platform-btn sm" onClick={go("/platform/employees")}>
                    View all <ArrowUpRight size={13} />
                  </button>
                </header>
                <div className="pmd-filters">
                  <label className="pmd-search">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      className="platform-input"
                      placeholder="Search name, email, role or team"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      aria-label="Search employees"
                    />
                  </label>
                  <select
                    className="platform-select"
                    value={rosterAvailability}
                    onChange={(e) => setRosterAvailability(e.target.value)}
                    aria-label="Filter by availability"
                  >
                    <option value="">All availability</option>
                    <option value="Available">Available</option>
                    <option value="Busy">Busy</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Offline">Offline</option>
                  </select>
                </div>
                {rosterRows.length === 0 ? (
                  <p className="pmd-empty">No employees match your filters.</p>
                ) : (
                  <div className="platform-table-wrap">
                    <table className="platform-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Role</th>
                          <th>Team</th>
                          <th>Availability</th>
                          <th>Ticket load</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rosterRows.slice(0, 8).map((emp) => (
                          <tr key={emp.user_id}>
                            <td>
                              <strong>{emp.full_name}</strong>
                              <div className="pmd-sub">{emp.email}</div>
                            </td>
                            <td>{emp.role}</td>
                            <td>{emp.industry_team_name || emp.industry_key || "—"}</td>
                            <td>
                              <span className={`platform-badge ${availabilityBadge(emp.availability_status)}`}>
                                {emp.availability_status}
                              </span>
                            </td>
                            <td>
                              {emp.active_ticket_load ?? emp.current_ticket_load ?? 0}/{emp.max_ticket_load}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rosterRows.length > 8 && (
                      <p className="pmd-more">
                        Showing 8 of {rosterRows.length}. <button type="button" onClick={go("/platform/employees")}>View all employees</button>
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* ------------------------ Aggregate analytics ------------------------ */}
            {can.analytics && analytics.data && analytics.data.industry_analytics.length > 0 && (
              <section className="platform-card pmd-card pmd-span-2">
                <header className="pmd-card-head">
                  <div>
                    <h3>Industry performance</h3>
                    <p>Aggregate figures only, as provided by the analytics service.</p>
                  </div>
                  <button type="button" className="platform-btn sm" onClick={go("/platform/analytics")}>
                    Reports <ArrowUpRight size={13} />
                  </button>
                </header>
                <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Industry</th>
                        <th>Tenants (active)</th>
                        <th>Tickets open / resolved</th>
                        <th>SLA compliance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.data.industry_analytics.map((row) => (
                        <tr key={row.industry_key}>
                          <td><strong>{row.industry_name}</strong></td>
                          <td>{row.registered_companies} ({row.active_companies})</td>
                          <td>{row.open_tickets} / {row.resolved_tickets}</td>
                          <td>
                            <span
                              className={`platform-badge ${
                                row.sla_compliance_pct >= 90 ? "green" : row.sla_compliance_pct >= 75 ? "yellow" : "red"
                              }`}
                            >
                              {row.sla_compliance_pct}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* --------------------------- Recent activity --------------------------- */}
            {can.tickets && tickets.data && (
              <section className="platform-card pmd-card pmd-span-2">
                <header className="pmd-card-head">
                  <div>
                    <h3>Recent support activity</h3>
                    <p>Latest ticket updates in your scope. Select an entry for details.</p>
                  </div>
                  {lastUpdated && (
                    <span className="pmd-stamp">
                      <Clock size={13} /> Updated {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </header>
                {recentActivity.length === 0 ? (
                  <p className="pmd-empty">No recent activity.</p>
                ) : (
                  <ul className="pmd-list pmd-activity">
                    {recentActivity.map((t) => {
                      const expanded = expandedTicket === t.id;
                      return (
                        <li key={t.id} className={expanded ? "is-open" : undefined}>
                          <button
                            type="button"
                            className="pmd-activity-row"
                            aria-expanded={expanded}
                            onClick={() => setExpandedTicket(expanded ? null : t.id)}
                          >
                            <Activity size={15} aria-hidden="true" />
                            <span className="pmd-list-main">
                              <strong>{t.ticket_number ? `${t.ticket_number} · ` : ""}{t.subject}</strong>
                              <small>{t.company_name || "Unknown tenant"} · {timeAgo(t.updated_at || t.created_at)}</small>
                            </span>
                            <span className="platform-badge indigo">{t.status}</span>
                            <ChevronDown size={15} className="pmd-chevron" aria-hidden="true" />
                          </button>
                          {expanded && (
                            <dl className="pmd-details">
                              <div><dt>Priority</dt><dd>{t.priority}</dd></div>
                              <div><dt>Issue type</dt><dd>{t.issue_type || "—"}</dd></div>
                              <div><dt>Queue</dt><dd>{t.routing_queue || "—"}</dd></div>
                              <div><dt>Assigned to</dt><dd>{t.assigned_employee_name || "Unassigned"}</dd></div>
                              <div><dt>SLA due</dt><dd>{t.sla_due_at ? new Date(t.sla_due_at).toLocaleString() : "—"}</dd></div>
                              <div>
                                <dt>Flags</dt>
                                <dd>
                                  {[t.is_escalated && "Escalated", t.sla_breached && "SLA breached"].filter(Boolean).join(", ") || "None"}
                                </dd>
                              </div>
                              {t.escalation_reason && (
                                <div className="pmd-wide"><dt>Escalation reason</dt><dd>{t.escalation_reason}</dd></div>
                              )}
                              {t.description && (
                                <div className="pmd-wide"><dt>Description</dt><dd>{t.description}</dd></div>
                              )}
                            </dl>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
