import { useEffect, useState } from "react";
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
import { getReportsSummary } from "../../services/reportService";
import type { ReportsSummary } from "../../types/report";
import type { ReportFilters } from "../../services/reportService";
import { useTheme } from "../../context/ThemeContext";
import { ExportFormatMenu } from "../../components/common/import-export/ExportFormatMenu";
import { MODULE_CONFIGS } from "../../config/importExportConfig";
import { getLeadStatusLabel } from "../../utils/leadStatus";
import "./Reports.css";

const CHART_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#f97316",
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-IN").format(value);

export default function Reports() {
  const [report, setReport] = useState<ReportsSummary | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  useEffect(() => {
    let cancelled = false;

    const loadReport = async () => {
      setLoading(true);
      setError("");

      try {
        const data = await getReportsSummary(appliedFilters);
        if (!cancelled) {
          setReport(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : "Unable to load reports.";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [appliedFilters]);

  const applyFilters = () => {
    if (startDate && endDate && startDate > endDate) {
      setError("Start date must be before or equal to end date.");
      return;
    }

    const filters: ReportFilters = {};
    if (startDate) filters.start_date = startDate;
    if (endDate) filters.end_date = endDate;

    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    setStartDate("");
    setEndDate("");
    setAppliedFilters({});
    setError("");
  };

  const setPreset = (preset: "today" | "week" | "month") => {
    const today = new Date();
    const toDateString = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const start = new Date(today);

    if (preset === "week") {
      const day = (today.getDay() + 6) % 7;
      start.setDate(today.getDate() - day);
    } else if (preset === "month") {
      start.setDate(1);
    }

    const from = toDateString(start);
    const to = toDateString(today);

    setStartDate(from);
    setEndDate(to);

    const filters: ReportFilters = {
      start_date: from,
      end_date: to,
    };

    setAppliedFilters(filters);
  };

  const leadChartData = report?.leads.status_breakdown ?? [];
  const activeLeadChartData = leadChartData.filter((item) => item.count > 0);

  const pipelineChartData = (report?.pipeline ?? []).map((item) => ({
    name: `${item.pipeline_name} - ${item.stage_name}`,
    deals: item.count,
  }));

  if (loading && !report) {
    return (
      <div className="reports-page">
        <div className="reports-loading-card">
          <p className="reports-message">Loading reports & analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-page">
      {/* ─── Header ─── */}
      <div className="reports-header">
        <div>
          <h1>Reports & Analytics</h1>
          <p>Track sales performance, leads, pipelines and tasks.</p>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <ExportFormatMenu
            config={MODULE_CONFIGS.reports!}
            records={
              report
                ? [
                    { metric: "Deals & Sales", label: "Total Deals", value: report.sales.total_deals, percentage: "" },
                    { metric: "Deals & Sales", label: "Won Deals", value: report.sales.won_deals, percentage: "" },
                    { metric: "Deals & Sales", label: "Lost Deals", value: report.sales.lost_deals, percentage: "" },
                    { metric: "Deals & Sales", label: "Open Deals", value: report.sales.open_deals, percentage: "" },
                    { metric: "Deals & Sales", label: "Won Revenue", value: report.sales.won_revenue, percentage: "" },
                    { metric: "Leads", label: "Total Leads", value: report.leads.total_leads, percentage: "" },
                    { metric: "Leads", label: "Qualified Leads", value: report.leads.qualified_leads, percentage: `${report.leads.conversion_rate}%` },
                    ...report.leads.status_breakdown.map((s) => ({ metric: "Lead Status", label: getLeadStatusLabel(s.status), value: s.count, percentage: "" })),
                    { metric: "Tasks", label: "Total Tasks", value: report.tasks.total_tasks, percentage: "" },
                    { metric: "Tasks", label: "Pending Tasks", value: report.tasks.pending_tasks, percentage: "" },
                    { metric: "Tasks", label: "Completed Tasks", value: report.tasks.completed_tasks, percentage: "" },
                    { metric: "Tasks", label: "Overdue Tasks", value: report.tasks.overdue_tasks, percentage: "" },
                    ...report.tasks.status_breakdown.map((t) => ({ metric: "Task Status", label: t.status, value: t.count, percentage: "" })),
                  ]
                : []
            }
            disabled={!report || loading}
          />
        </div>
      </div>

      {/* ─── Compact Date Filter Card ─── */}
      <section className="reports-filter-card">
        <div className="reports-filter-top">
          <div className="reports-filter-heading">
            <h2>Date Range</h2>
            <span>Filter records by creation date</span>
          </div>

          <div className="reports-presets">
            <button
              type="button"
              className="reports-preset-btn"
              onClick={() => setPreset("today")}
            >
              Today
            </button>
            <button
              type="button"
              className="reports-preset-btn"
              onClick={() => setPreset("week")}
            >
              This Week
            </button>
            <button
              type="button"
              className="reports-preset-btn"
              onClick={() => setPreset("month")}
            >
              This Month
            </button>
          </div>
        </div>

        <div className="reports-filter-controls">
          <label className="reports-filter-label">
            <span>Start Date</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              max={endDate || undefined}
            />
          </label>

          <label className="reports-filter-label">
            <span>End Date</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              min={startDate || undefined}
            />
          </label>

          <div className="reports-filter-actions">
            <button
              type="button"
              className="reports-apply-button"
              onClick={applyFilters}
            >
              Apply Filters
            </button>

            <button
              type="button"
              className="reports-clear-button"
              onClick={clearFilters}
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="reports-error" role="alert">
          <span>{error}</span>
          {report && (
            <button type="button" onClick={() => setError("")}>
              Dismiss
            </button>
          )}
        </div>
      )}

      {loading && report && (
        <p className="reports-refreshing">Updating report...</p>
      )}

      {report && (
        <>
          {/* ─── 1. Sales Overview (5-Card Grid) ─── */}
          <section className="reports-section">
            <h2 className="reports-section-title">Sales Overview</h2>
            <div className="reports-metrics-grid reports-sales-grid">
              <MetricCard
                title="Total Deals"
                value={formatNumber(report.sales.total_deals)}
                description="Deals in selected period"
              />
              <MetricCard
                title="Won Deals"
                value={formatNumber(report.sales.won_deals)}
                description="Successfully closed"
                tone="success"
              />
              <MetricCard
                title="Lost Deals"
                value={formatNumber(report.sales.lost_deals)}
                description="Closed unsuccessfully"
                tone="danger"
              />
              <MetricCard
                title="Open Deals"
                value={formatNumber(report.sales.open_deals)}
                description="Still in progress"
                tone="info"
              />
              <MetricCard
                title="Won Revenue"
                value={formatCurrency(report.sales.won_revenue)}
                description="Revenue from won deals"
                tone="success"
              />
            </div>
          </section>

          {/* ─── 2. Lead Performance (3-Card Grid) ─── */}
          <section className="reports-section">
            <h2 className="reports-section-title">Lead Performance</h2>
            <div className="reports-metrics-grid reports-leads-grid">
              <MetricCard
                title="Total Leads"
                value={formatNumber(report.leads.total_leads)}
                description="Leads created in selected period"
              />
              <MetricCard
                title="Qualified Leads"
                value={formatNumber(report.leads.qualified_leads)}
                description="Currently qualified"
                tone="success"
              />
              <MetricCard
                title="Qualified Lead Rate"
                value={`${report.leads.conversion_rate.toFixed(2)}%`}
                description="Qualified leads ÷ total leads"
                tone="info"
              />
            </div>
          </section>

          {/* ─── 3. Lead & Deals Charts (2-Column Grid) ─── */}
          <section className="reports-charts-grid">
            <div className="reports-chart-card">
              <h3>Leads by Status</h3>
              {leadChartData.length ? (
                <div className="reports-chart">
                  <ResponsiveContainer width="100%" height={290}>
                    <PieChart>
                      <Pie
                        data={activeLeadChartData}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="46%"
                        innerRadius={46}
                        outerRadius={76}
                        paddingAngle={activeLeadChartData.length > 1 ? 3 : 0}
                        stroke={isDark ? "#1f1f1f" : "#ffffff"}
                        strokeWidth={2}
                        label={(entry: any) =>
                          renderPieLabel({ ...entry, name: getLeadStatusLabel(entry?.name) })
                        }
                        labelLine={{
                          stroke: isDark ? "#94a3b8" : "#64748b",
                          strokeWidth: 1.5,
                        }}
                      >
                        {activeLeadChartData.map((item, index) => (
                          <Cell
                            key={item.status}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: tooltipText }}
                        formatter={(val, name) => [val, getLeadStatusLabel(String(name))]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ paddingTop: 8 }}
                        formatter={(value) => (
                          <span
                            style={{
                              color: textMutedColor,
                              fontSize: 12,
                              marginRight: 8,
                              fontWeight: 500,
                            }}
                          >
                            {getLeadStatusLabel(String(value))}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart />
              )}
            </div>

            <div className="reports-chart-card">
              <h3>Deals by Pipeline Stage</h3>
              {pipelineChartData.length ? (
                <div className="reports-chart reports-pipeline-chart">
                  <ResponsiveContainer width="100%" height={290}>
                    <BarChart
                      data={pipelineChartData}
                      margin={{
                        top: 16,
                        right: 16,
                        left: -12,
                        bottom: pipelineChartData.length > 3 ? 48 : 20,
                      }}
                    >
                      <CartesianGrid
                        stroke={gridColor}
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        angle={pipelineChartData.length > 3 ? -25 : 0}
                        textAnchor={pipelineChartData.length > 3 ? "end" : "middle"}
                        interval={0}
                        height={pipelineChartData.length > 3 ? 56 : 28}
                        tick={{ fill: tickColor, fontSize: 11, fontWeight: 500 }}
                        axisLine={{ stroke: axisColor }}
                        tickLine={{ stroke: axisColor }}
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
                        cursor={{
                          fill: isDark
                            ? "rgba(255, 255, 255, 0.04)"
                            : "rgba(0, 0, 0, 0.04)",
                        }}
                      />
                      <Bar
                        dataKey="deals"
                        name="Deals"
                        fill="#6366f1"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart />
              )}
            </div>
          </section>

          {/* ─── 4. Pipeline Table ─── */}
          <section className="reports-section">
            <h2 className="reports-section-title">Pipeline Breakdown</h2>
            <div className="reports-table-wrapper">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th className="th-pipeline-name">Pipeline</th>
                    <th className="th-pipeline-stage">Stage</th>
                    <th className="th-pipeline-deals">Deals</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pipeline.length ? (
                    report.pipeline.map((item, index) => (
                      <tr key={`${item.pipeline_name}-${item.stage_name}-${index}`}>
                        <td className="td-pipeline-name">{item.pipeline_name}</td>
                        <td className="td-pipeline-stage">{item.stage_name}</td>
                        <td className="td-pipeline-deals">{item.count}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-center py-4 text-muted">
                        No pipeline data for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ─── 5. Task Overview (4-Card Grid + Controlled Chart) ─── */}
          <section className="reports-section">
            <h2 className="reports-section-title">Task Overview</h2>
            <div className="reports-metrics-grid reports-tasks-grid">
              <MetricCard
                title="Total Tasks"
                value={formatNumber(report.tasks.total_tasks)}
                description="Tasks created in selected period"
              />
              <MetricCard
                title="Pending Tasks"
                value={formatNumber(report.tasks.pending_tasks)}
                description="Not completed or cancelled"
                tone="info"
              />
              <MetricCard
                title="Completed Tasks"
                value={formatNumber(report.tasks.completed_tasks)}
                description="Successfully completed"
                tone="success"
              />
              <MetricCard
                title="Overdue Tasks"
                value={formatNumber(report.tasks.overdue_tasks)}
                description="Past due and not completed"
                tone="danger"
              />
            </div>

            <div className="reports-chart-card reports-task-chart-card">
              <h3>Tasks by Status</h3>
              {report.tasks.status_breakdown.length ? (
                <div className="reports-chart reports-task-chart">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={report.tasks.status_breakdown}
                      margin={{ top: 16, right: 16, left: -12, bottom: 16 }}
                    >
                      <CartesianGrid
                        stroke={gridColor}
                        strokeDasharray="3 3"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="status"
                        tick={{ fill: tickColor, fontSize: 11, fontWeight: 500 }}
                        axisLine={{ stroke: axisColor }}
                        tickLine={{ stroke: axisColor }}
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
                        cursor={{
                          fill: isDark
                            ? "rgba(255, 255, 255, 0.04)"
                            : "rgba(0, 0, 0, 0.04)",
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Tasks"
                        fill="#10b981"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={56}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart />
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  tone = "default",
}: {
  title: string;
  value: string;
  description: string;
  tone?: "default" | "success" | "danger" | "info";
}) {
  return (
    <article className={`reports-metric-card reports-tone-${tone}`}>
      <p className="reports-metric-title">{title}</p>
      <p className="reports-metric-value">{value}</p>
      <p className="reports-metric-description">{description}</p>
    </article>
  );
}

function EmptyChart() {
  return <div className="reports-chart-empty">No data available</div>;
}
