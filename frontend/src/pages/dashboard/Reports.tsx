
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

const escapeCsv = (value: string | number) =>
  `"${String(value).replace(/"/g, '""')}"`;

export default function Reports() {
  const [report, setReport] = useState<ReportsSummary | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const exportCsv = () => {
    if (!report) return;

    const rows: (string | number)[][] = [
      ["SCuilONE CRM Reports"],
      ["Start Date", report.filters.start_date || "All time"],
      ["End Date", report.filters.end_date || "All time"],
      [],
      ["Sales Report"],
      ["Metric", "Value"],
      ["Total Deals", report.sales.total_deals],
      ["Won Deals", report.sales.won_deals],
      ["Lost Deals", report.sales.lost_deals],
      ["Open Deals", report.sales.open_deals],
      ["Won Revenue", report.sales.won_revenue],
      [],
      ["Lead Report"],
      ["Metric", "Value"],
      ["Total Leads", report.leads.total_leads],
      ["Qualified Leads", report.leads.qualified_leads],
      ["Qualified Lead Rate (%)", report.leads.conversion_rate],
      [],
      ["Lead Status", "Count"],
      ...report.leads.status_breakdown.map((item) => [
        item.status,
        item.count,
      ]),
      [],
      ["Pipeline Report"],
      ["Pipeline", "Stage", "Deals"],
      ...report.pipeline.map((item) => [
        item.pipeline_name,
        item.stage_name,
        item.count,
      ]),
      [],
      ["Task Report"],
      ["Metric", "Value"],
      ["Total Tasks", report.tasks.total_tasks],
      ["Pending Tasks", report.tasks.pending_tasks],
      ["Completed Tasks", report.tasks.completed_tasks],
      ["Overdue Tasks", report.tasks.overdue_tasks],
      [],
      ["Task Status", "Count"],
      ...report.tasks.status_breakdown.map((item) => [
        item.status,
        item.count,
      ]),
    ];

    const csv = "\uFEFF" + rows.map((row) =>
      row.map((value) => escapeCsv(value ?? "")).join(",")
    ).join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "scuilone-crm-reports.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const leadChartData = report?.leads.status_breakdown ?? [];

  const pipelineChartData = (report?.pipeline ?? []).map((item) => ({
    name: `${item.pipeline_name} - ${item.stage_name}`,
    deals: item.count,
  }));

  if (loading && !report) {
    return (
      <div className="reports-page">
        <p className="reports-message">Loading reports...</p>
      </div>
    );
  }

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h1>Reports & Analytics</h1>
          <p>Track sales performance, leads, pipelines and tasks.</p>
        </div>

        <button
          className="reports-export-button"
          onClick={exportCsv}
          disabled={!report || loading}
        >
          Export CSV
        </button>
      </div>

      <section className="reports-filter-card">
        <div className="reports-filter-heading">
          <h2>Date Range</h2>
          <span>Filter records by creation date</span>
        </div>

        <div className="reports-presets">
          <button type="button" onClick={() => setPreset("today")}>
            Today
          </button>
          <button type="button" onClick={() => setPreset("week")}>
            This Week
          </button>
          <button type="button" onClick={() => setPreset("month")}>
            This Month
          </button>
        </div>

        <div className="reports-filter-controls">
          <label>
            Start Date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              max={endDate || undefined}
            />
          </label>

          <label>
            End Date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              min={startDate || undefined}
            />
          </label>

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
      </section>

      {error && (
        <div className="reports-error" role="alert">
          {error}
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
          <section className="reports-section">
            <h2>Sales Overview</h2>
            <div className="reports-metrics-grid">
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

          <section className="reports-section">
            <h2>Lead Performance</h2>
            <div className="reports-metrics-grid">
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

          <section className="reports-charts-grid">
            <div className="reports-chart-card">
              <h3>Leads by Status</h3>
              {leadChartData.length ? (
                <div className="reports-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={leadChartData}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={95}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {leadChartData.map((item, index) => (
                          <Cell
                            key={item.status}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
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
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={pipelineChartData}
                      margin={{ top: 10, right: 12, left: -12, bottom: 65 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        angle={-35}
                        textAnchor="end"
                        interval={0}
                        height={90}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="deals"
                        name="Deals"
                        fill="#6366f1"
                        radius={[5, 5, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyChart />
              )}
            </div>
          </section>

          <section className="reports-section">
            <h2>Pipeline Breakdown</h2>
            <div className="reports-table-wrapper">
              <table className="reports-table">
                <thead>
                  <tr>
                    <th>Pipeline</th>
                    <th>Stage</th>
                    <th>Deals</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pipeline.length ? (
                    report.pipeline.map((item, index) => (
                      <tr key={`${item.pipeline_name}-${item.stage_name}-${index}`}>
                        <td>{item.pipeline_name}</td>
                        <td>{item.stage_name}</td>
                        <td>{item.count}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3}>No pipeline data for this period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="reports-section">
            <h2>Task Overview</h2>
            <div className="reports-metrics-grid">
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
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.tasks.status_breakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        name="Tasks"
                        fill="#10b981"
                        radius={[5, 5, 0, 0]}
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
