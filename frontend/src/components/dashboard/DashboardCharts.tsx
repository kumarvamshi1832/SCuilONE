import { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useNavigate, useParams } from "react-router-dom";
import type { DashboardSummary } from "../../types/dashboard";
import type { Account } from "../../types/account";
import { getAccounts } from "../../services/accountService";
import { useTheme } from "../../context/ThemeContext";
import "./DashboardCharts.css";

interface DashboardChartsProps {
  summary: DashboardSummary;
  accounts?: Account[];
}

const COLORS = [
  "#06B6D4", // Primary Cyan
  "#10B981", // Emerald Green
  "#F59E0B", // Amber
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#3B82F6", // Blue
  "#14B8A6", // Teal
];

// Exact colors per specification
const ACCOUNT_STATUS_COLORS: Record<string, string> = {
  Active: "#22C55E", // Green
  Inactive: "#94A3B8", // Slate
  Prospect: "#06B6D4", // Cyan
  Churned: "#EF4444", // Red
};

const FALLBACK_STATUS_COLORS = ["#8B5CF6", "#F59E0B", "#EC4899", "#3B82F6"];

export default function DashboardCharts({
  summary,
  accounts: initialAccounts,
}: DashboardChartsProps) {
  const navigate = useNavigate();
  const { industry } = useParams();
  const industryPath = industry || "real-estate";

  /* ─── Accounts State & Data Fetching ─── */
  const [fetchedAccounts, setFetchedAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(!initialAccounts);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const fetchAccountData = useCallback(async () => {
    if (initialAccounts) {
      setAccountsLoading(false);
      return;
    }
    setAccountsLoading(true);
    setAccountsError(null);
    try {
      const data = await getAccounts();
      setFetchedAccounts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Failed to load accounts for dashboard chart:", err);
      setAccountsError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Unable to load account data."
      );
    } finally {
      setAccountsLoading(false);
    }
  }, [initialAccounts]);

  useEffect(() => {
    if (!initialAccounts) {
      fetchAccountData();
      const handleUpdate = () => {
        fetchAccountData();
      };
      window.addEventListener("crm:activity-updated", handleUpdate);
      return () => {
        window.removeEventListener("crm:activity-updated", handleUpdate);
      };
    }
  }, [initialAccounts, fetchAccountData]);

  const accounts = initialAccounts || fetchedAccounts;

  /* ─── Theme detection ─── */
  let isDark = false;
  try {
    const { theme } = useTheme();
    isDark = theme === "dark";
  } catch {
    isDark =
      typeof document !== "undefined" &&
      (document.body.classList.contains("dark") ||
        Boolean(document.querySelector(".dashboard-wrapper.dark")));
  }

  // Theme-aware tokens for Recharts SVG attributes
  const textColor = isDark ? "#F8FAFC" : "#0F172A";
  const textMutedColor = isDark ? "#94A3B8" : "#64748B";
  const gridColor = isDark ? "rgba(51, 65, 85, 0.45)" : "rgba(209, 220, 232, 0.7)";
  const axisColor = isDark ? "#334155" : "#CBD5E1";
  const tickColor = isDark ? "#94A3B8" : "#64748B";
  const tooltipBg = isDark ? "#172033" : "#F5F8FC";
  const tooltipBorder = isDark ? "#334155" : "#D1DCE8";
  const tooltipText = isDark ? "#F8FAFC" : "#0F172A";

  const tooltipStyle = {
    backgroundColor: tooltipBg,
    borderColor: tooltipBorder,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 8,
    color: tooltipText,
    boxShadow: isDark
      ? "0 4px 16px rgba(0, 0, 0, 0.45)"
      : "0 4px 16px rgba(15, 23, 42, 0.08)",
    fontSize: 12,
    padding: "8px 12px",
  };

  const renderPieLabel = (entry: any) => {
    const { name, value, cx, cy, midAngle, outerRadius } = entry;
    if (!value || value <= 0) return null;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 18;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill={isDark ? "#F8FAFC" : "#0f172a"}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
      >
        {`${name}: ${value}`}
      </text>
    );
  };

  // Lead Status Data
  const leadData = summary.leadStatusBreakdown || [];
  const totalLeads = leadData.reduce((sum, item) => sum + (item.count || 0), 0);
  const activeLeadData = leadData.filter((item) => item.count > 0);

  // Deals by Stage Data
  const dealData = summary.dealStageBreakdown || [];
  const totalDeals = dealData.reduce((sum, item) => sum + (item.count || 0), 0);

  // Account Status Data calculations
  interface CanonicalStatusCounts {
    Active: number;
    Inactive: number;
    Prospect: number;
    Churned: number;
  }

  interface AccountStatusItem {
    status: string;
    count: number;
    color: string;
  }

  const statusCounts: CanonicalStatusCounts = {
    Active: 0,
    Inactive: 0,
    Prospect: 0,
    Churned: 0,
  };
  const otherStatusCounts: Record<string, number> = {};

  accounts.forEach((acc) => {
    const rawStatus = (acc?.status || "").trim();
    const lower = rawStatus.toLowerCase();
    if (lower === "active") {
      statusCounts.Active += 1;
    } else if (lower === "inactive") {
      statusCounts.Inactive += 1;
    } else if (lower === "prospect") {
      statusCounts.Prospect += 1;
    } else if (lower === "churned") {
      statusCounts.Churned += 1;
    } else if (rawStatus) {
      const label = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
      otherStatusCounts[label] = (otherStatusCounts[label] || 0) + 1;
    }
  });

  const accountStatusData: AccountStatusItem[] = [
    { status: "Active", count: statusCounts.Active, color: ACCOUNT_STATUS_COLORS.Active || "#22C55E" },
    { status: "Inactive", count: statusCounts.Inactive, color: ACCOUNT_STATUS_COLORS.Inactive || "#94A3B8" },
    { status: "Prospect", count: statusCounts.Prospect, color: ACCOUNT_STATUS_COLORS.Prospect || "#06B6D4" },
    { status: "Churned", count: statusCounts.Churned, color: ACCOUNT_STATUS_COLORS.Churned || "#EF4444" },
    ...Object.entries(otherStatusCounts).map(([status, count], idx) => ({
      status,
      count,
      color: FALLBACK_STATUS_COLORS[idx % FALLBACK_STATUS_COLORS.length] || "#8B5CF6",
    })),
  ];

  const totalAccounts = accounts.length;
  const activeAccountStatusData = accountStatusData.filter((item) => item.count > 0);

  // Task Overview Data
  const taskData = [
    { name: "Completed", value: summary.completedTasks || 0, color: "#10B981", icon: "✓" },
    { name: "Pending", value: summary.pendingTasks || 0, color: "#F59E0B", icon: "●" },
    { name: "Overdue", value: summary.overdueTasks || 0, color: "#EF4444", icon: "■" },
  ];
  const totalTasks =
    (summary.completedTasks || 0) +
    (summary.pendingTasks || 0) +
    (summary.overdueTasks || 0);
  const activeTaskData = taskData.filter((task) => task.value > 0);

  // Navigation handlers
  const openLeadsByStatus = (status: string) => {
    navigate(`/${industryPath}/leads?status=${encodeURIComponent(status)}`);
  };

  const openDealsByStage = (stage: string) => {
    navigate(`/${industryPath}/deals?stage=${encodeURIComponent(stage)}`);
  };

  const openAccountsByStatus = (status: string) => {
    navigate(`/${industryPath}/accounts?status=${encodeURIComponent(status)}`);
  };

  const openTasksByStatus = (status: string) => {
    navigate(`/${industryPath}/tasks?status=${encodeURIComponent(status.toLowerCase())}`);
  };

  const renderAccountLegend = () => {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "8px 14px",
          paddingTop: 10,
        }}
      >
        {accountStatusData.map((item) => (
          <span
            key={item.status}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: isDark ? "#cbd5e1" : "#475569",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
            onClick={() => openAccountsByStatus(item.status)}
            title={`View ${item.status} accounts`}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: item.color,
                display: "inline-block",
              }}
            />
            <span>{item.status}</span>
            <span style={{ color: isDark ? "#94A3B8" : "#64748b" }}>
              ({item.count})
            </span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="dashboard-charts">
      {/* ─── 1. Lead Status (Donut Chart) ─── */}
      <section className="dashboard-chart-card lead-status-card">
        <div className="dashboard-chart-header">
          <h3 className="dashboard-chart-title">Lead Status</h3>
        </div>

        {leadData.length === 0 || totalLeads === 0 ? (
          <p className="dashboard-chart-empty">No lead data available.</p>
        ) : (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={activeLeadData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="46%"
                  innerRadius={46}
                  outerRadius={72}
                  paddingAngle={activeLeadData.length > 1 ? 3 : 0}
                  stroke={isDark ? "#1E293B" : "#E1EAF4"}
                  strokeWidth={2}
                  label={renderPieLabel}
                  labelLine={{
                    stroke: isDark ? "#94A3B8" : "#64748B",
                    strokeWidth: 1.5,
                  }}
                >
                  {activeLeadData.map((entry, index) => (
                    <Cell
                      key={entry.status}
                      fill={COLORS[index % COLORS.length]}
                      cursor="pointer"
                      onClick={() => openLeadsByStatus(entry.status)}
                    />
                  ))}
                </Pie>

                <text
                  x="50%"
                  y="43%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textColor}
                  fontSize={22}
                  fontWeight={700}
                >
                  {totalLeads}
                </text>
                <text
                  x="50%"
                  y="53%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textMutedColor}
                  fontSize={11}
                  fontWeight={500}
                >
                  {totalLeads === 1 ? "Lead" : "Leads"}
                </text>

                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: tooltipText }}
                  formatter={(val, name) => [
                    `${val} (${Math.round(((Number(val) || 0) / Math.max(1, totalLeads)) * 100)}%)`,
                    name,
                  ]}
                />

                <Legend
                  verticalAlign="bottom"
                  align="center"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ paddingTop: 10 }}
                  formatter={(value) => {
                    const item = leadData.find((l) => l.status === value);
                    return (
                      <span
                        style={{
                          color: isDark ? "#cbd5e1" : "#475569",
                          fontSize: 12,
                          marginRight: 8,
                          fontWeight: 500,
                        }}
                      >
                        {value} {item ? `(${item.count})` : ""}
                      </span>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="dashboard-chart-hint">
          Click a slice to view leads with that status.
        </p>
      </section>

      {/* ─── 2. Deals by Stage (Bar Chart) ─── */}
      <section className="dashboard-chart-card deals-stage-card">
        <div className="dashboard-chart-header">
          <h3 className="dashboard-chart-title">Deals by Stage</h3>
        </div>

        {dealData.length === 0 || totalDeals === 0 ? (
          <p className="dashboard-chart-empty">No deal data available.</p>
        ) : (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={dealData}
                margin={{
                  top: 16,
                  right: 20,
                  left: -12,
                  bottom: dealData.length > 4 ? 24 : 12,
                }}
              >
                <CartesianGrid
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="stage"
                  tick={{ fill: tickColor, fontSize: 11, fontWeight: 500 }}
                  axisLine={{ stroke: axisColor }}
                  tickLine={{ stroke: axisColor }}
                  interval={0}
                  angle={dealData.length > 4 ? -20 : 0}
                  textAnchor={dealData.length > 4 ? "end" : "middle"}
                  height={dealData.length > 4 ? 40 : 28}
                />

                <YAxis
                  allowDecimals={false}
                  tick={{ fill: tickColor, fontSize: 11 }}
                  axisLine={{ stroke: axisColor }}
                  tickLine={false}
                />

                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: tooltipText }}
                  formatter={(val) => [`${val} deals`, "Count"]}
                  cursor={{
                    fill: isDark ? "rgba(6, 182, 212, 0.05)" : "rgba(0, 0, 0, 0.03)",
                  }}
                />

                <Bar
                  dataKey="count"
                  name="Deals"
                  fill={isDark ? "#06B6D4" : "#0891B2"}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                  cursor="pointer"
                  onClick={(_, index) => {
                    const stage = dealData[index]?.stage;
                    if (stage) {
                      openDealsByStage(stage);
                    }
                  }}
                >
                  {dealData.map((entry, index) => (
                    <Cell
                      key={`deal-${entry.stage || index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="dashboard-chart-hint">
          Click a bar to view deals at that stage.
        </p>
      </section>

      {/* ─── 3. Account Status (Donut Chart - placed immediately below Deals by Stage) ─── */}
      <section className="dashboard-chart-card account-status-card">
        <div className="dashboard-chart-header">
          <h3 className="dashboard-chart-title">Account Status</h3>
        </div>

        {accountsLoading ? (
          <div className="dashboard-chart-loading">
            <div className="dashboard-chart-skeleton-donut" />
            <p className="dashboard-chart-loading-text">Loading account data...</p>
          </div>
        ) : accountsError ? (
          <div className="dashboard-chart-error">
            <p className="dashboard-chart-error-message">{accountsError}</p>
            <button
              type="button"
              className="dashboard-chart-retry-btn"
              onClick={fetchAccountData}
            >
              Retry
            </button>
          </div>
        ) : totalAccounts === 0 || activeAccountStatusData.length === 0 ? (
          <p className="dashboard-chart-empty">No account data available.</p>
        ) : (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={activeAccountStatusData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="46%"
                  innerRadius={46}
                  outerRadius={72}
                  paddingAngle={activeAccountStatusData.length > 1 ? 3 : 0}
                  stroke={isDark ? "#1E293B" : "#E1EAF4"}
                  strokeWidth={2}
                  label={renderPieLabel}
                  labelLine={{
                    stroke: isDark ? "#94A3B8" : "#64748B",
                    strokeWidth: 1.5,
                  }}
                >
                  {activeAccountStatusData.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={entry.color}
                      cursor="pointer"
                      onClick={() => openAccountsByStatus(entry.status)}
                    />
                  ))}
                </Pie>

                <text
                  x="50%"
                  y="43%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textColor}
                  fontSize={22}
                  fontWeight={700}
                >
                  {totalAccounts}
                </text>
                <text
                  x="50%"
                  y="53%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textMutedColor}
                  fontSize={11}
                  fontWeight={500}
                >
                  {totalAccounts === 1 ? "Account" : "Accounts"}
                </text>

                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: tooltipText }}
                  formatter={(val, name) => [
                    `${val} (${Math.round(((Number(val) || 0) / Math.max(1, totalAccounts)) * 100)}%)`,
                    name,
                  ]}
                />

                <Legend
                  content={renderAccountLegend}
                  verticalAlign="bottom"
                  align="center"
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <p className="dashboard-chart-hint">
          Click a slice to view accounts with that status.
        </p>
      </section>

      {/* ─── 4. Task Overview (Donut Chart + Structured Legend) ─── */}
      <section className="dashboard-chart-card task-overview-card">
        <div className="dashboard-chart-header">
          <h3 className="dashboard-chart-title">Task Overview</h3>
        </div>

        {totalTasks === 0 ? (
          <p className="dashboard-chart-empty">No task data available.</p>
        ) : (
          <div className="dashboard-chart">
            <ResponsiveContainer width="100%" height={165}>
              <PieChart>
                <Pie
                  data={activeTaskData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={activeTaskData.length > 1 ? 4 : 0}
                  stroke={isDark ? "#1E293B" : "#E1EAF4"}
                  strokeWidth={2}
                >
                  {activeTaskData.map((task) => (
                    <Cell
                      key={task.name}
                      fill={task.color}
                      cursor="pointer"
                      onClick={() => openTasksByStatus(task.name)}
                    />
                  ))}
                </Pie>

                <text
                  x="50%"
                  y="46%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textColor}
                  fontSize={22}
                  fontWeight={700}
                >
                  {totalTasks}
                </text>
                <text
                  x="50%"
                  y="58%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={textMutedColor}
                  fontSize={11}
                  fontWeight={500}
                >
                  {totalTasks === 1 ? "Task" : "Tasks"}
                </text>

                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: tooltipText }}
                  formatter={(val, name) => [
                    `${val} (${Math.round(((Number(val) || 0) / Math.max(1, totalTasks)) * 100)}%)`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="task-overview-legend">
              {taskData.map((task) => (
                <button
                  key={task.name}
                  type="button"
                  className="task-legend-item"
                  onClick={() => openTasksByStatus(task.name)}
                  title={`View ${task.name} tasks`}
                >
                  <span className="task-legend-icon" style={{ color: task.color }}>
                    {task.icon}
                  </span>
                  <span className="task-legend-label">{task.name}</span>
                  <span
                    className="task-legend-badge"
                    style={{
                      backgroundColor: isDark ? `${task.color}25` : `${task.color}15`,
                      color: task.color,
                    }}
                  >
                    {task.value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="dashboard-chart-hint">
          Click a slice or legend item to view matching tasks.
        </p>
      </section>
    </div>
  );
}
