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
import { useTheme } from "../../context/ThemeContext";
import "./DashboardCharts.css";

interface DashboardChartsProps {
  summary: DashboardSummary;
}

const COLORS = [
  "#4F8EF7",
  "#22C55E",
  "#F59E0B",
  "#A78BFA",
  "#F87171",
  "#2DD4BF",
  "#FB923C",
];

export default function DashboardCharts({
  summary,
}: DashboardChartsProps) {
  const navigate = useNavigate();
  const { industry } = useParams();
  const industryPath = industry || "real-estate";

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
  const textColor = isDark ? "#f8fafc" : "#1e293b";
  const textMutedColor = isDark ? "#e2e8f0" : "#64748b";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9";
  const axisColor = isDark ? "#475569" : "#e2e8f0";
  const tickColor = isDark ? "#e2e8f0" : "#64748b";
  const tooltipBg = isDark ? "#1e293b" : "#ffffff";
  const tooltipBorder = isDark ? "#475569" : "#e2e8f0";
  const tooltipText = isDark ? "#ffffff" : "#0f172a";

  const tooltipStyle = {
    backgroundColor: tooltipBg,
    borderColor: tooltipBorder,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 8,
    color: tooltipText,
    boxShadow: isDark
      ? "0 4px 16px rgba(0, 0, 0, 0.45)"
      : "0 4px 16px rgba(0, 0, 0, 0.08)",
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
        fill={isDark ? "#f8fafc" : "#1e293b"}
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={600}
      >
        {`${name}: ${value}`}
      </text>
    );
  };

  const leadData = summary.leadStatusBreakdown || [];
  const totalLeads = leadData.reduce((sum, item) => sum + (item.count || 0), 0);
  const activeLeadData = leadData.filter((item) => item.count > 0);

  const dealData = summary.dealStageBreakdown || [];
  const totalDeals = dealData.reduce((sum, item) => sum + (item.count || 0), 0);

  const taskData = [
    { name: "Completed", value: summary.completedTasks || 0, color: "#22C55E", icon: "✓" },
    { name: "Pending", value: summary.pendingTasks || 0, color: "#F59E0B", icon: "●" },
    { name: "Overdue", value: summary.overdueTasks || 0, color: "#F87171", icon: "■" },
  ];
  const totalTasks =
    (summary.completedTasks || 0) +
    (summary.pendingTasks || 0) +
    (summary.overdueTasks || 0);
  const activeTaskData = taskData.filter((task) => task.value > 0);

  const openLeadsByStatus = (status: string) => {
    navigate(`/${industryPath}/leads?status=${encodeURIComponent(status)}`);
  };

  const openDealsByStage = (stage: string) => {
    navigate(`/${industryPath}/deals?stage=${encodeURIComponent(stage)}`);
  };

  const openTasksByStatus = (status: string) => {
    navigate(`/${industryPath}/tasks?status=${encodeURIComponent(status.toLowerCase())}`);
  };

  return (
    <div className="dashboard-charts">
      {/* ─── 1. Lead Status (Donut Chart) ─── */}
      <section className="dashboard-chart-card">
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
                  stroke={isDark ? "#1f1f1f" : "#ffffff"}
                  strokeWidth={2}
                  label={renderPieLabel}
                  labelLine={{
                    stroke: isDark ? "#94a3b8" : "#64748b",
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
      <section className="dashboard-chart-card">
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
                    fill: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)",
                  }}
                />

                <Bar
                  dataKey="count"
                  name="Deals"
                  fill="#4F8EF7"
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

      {/* ─── 3. Task Overview (Donut Chart + Structured Legend) ─── */}
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
                  stroke={isDark ? "#1f1f1f" : "#ffffff"}
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
