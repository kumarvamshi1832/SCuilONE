
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getIndustryConfig } from "../../config/industryConfig";
import { getDashboardSummary, getTenantDetails } from "../../services/dashboardService";
import type { DashboardSummary, TenantDetails } from "../../types/dashboard";
import DashboardCharts from "../../components/dashboard/DashboardCharts";
import "./IndustryDashboard.css";

export default function IndustryDashboard() {
  const { industry } = useParams();
  const config = getIndustryConfig(industry);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    Promise.all([getDashboardSummary(), getTenantDetails()])
      .then(([dashboardSummary, tenantDetails]) => {
        if (!active) return;
        setSummary(dashboardSummary);
        setTenant(tenantDetails);
      })
      .catch(() => {
        if (active) setError("Unable to load dashboard data. Please refresh and try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const metrics = summary
    ? [
        { label: config.leadLabel, value: summary.totalLeads },
        { label: "Qualified Leads", value: summary.qualifiedLeads },
        { label: config.contactLabel, value: summary.totalContacts },
        { label: config.accountLabel, value: summary.totalAccounts },
        { label: config.dealLabel, value: summary.totalDeals },
        { label: "Open Deals", value: summary.openDeals },
        {
          label: "Won Revenue",
          value: new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
          }).format(summary.wonRevenue),
        },
        { label: "Pending Tasks", value: summary.pendingTasks },
        { label: "Overdue Tasks", value: summary.overdueTasks },
      ]
    : [];

  return (
    <main className="industry-dashboard">
      <header className="industry-dashboard-header">
        <div>
          <p className="industry-dashboard-eyebrow">
            {tenant?.name || "Your Company"}
          </p>
          <h1>{config.dashboardTitle}</h1>
          <p className="industry-dashboard-subtitle">
            Overview of your company's CRM activity.
          </p>
        </div>
      </header>

      {loading && <p className="industry-dashboard-message">Loading dashboard...</p>}

      {!loading && error && (
        <p className="industry-dashboard-error" role="alert">{error}</p>
      )}

      {!loading && !error && summary && (
        <>
          <section className="industry-dashboard-metrics" aria-label="CRM metrics">
            {metrics.map((metric) => (
              <article className="industry-dashboard-metric" key={metric.label}>
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>

          <section className="industry-dashboard-chart">
            <h2>{config.pipelineLabel}</h2>
            <DashboardCharts summary={summary} />
          </section>
        </>
      )}
    </main>
  );
}
