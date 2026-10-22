
import { DashboardSummary } from "../../types/dashboard";

interface KpiCardProps {
  title: string;
  value: number | string;
  icon: JSX.Element;
  trend?: string;
  colorClass?: string;
}

function KpiCard({
  title,
  value,
  icon,
  trend,
  colorClass = "blue",
}: KpiCardProps) {
  return (
    <div className={`kpi-card ${colorClass}`}>
      <div className="kpi-icon-wrapper">{icon}</div>
      <div className="kpi-info">
        <h4 className="kpi-title">{title}</h4>
        <div className="kpi-value">{value}</div>
        {trend && <div className="kpi-trend">{trend}</div>}
      </div>
    </div>
  );
}

interface RealEstateOverviewProps {
  summary: DashboardSummary | null;
}

const icon = (content: JSX.Element) => content;

export default function RealEstateOverview({
  summary,
}: RealEstateOverviewProps) {
  if (!summary) return <div>Loading dashboard...</div>;

  const kpis = [
    {
      title: "Total Properties",
      value: summary.totalProperties === -1 ? "-" : summary.totalProperties,
      colorClass: "blue",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      ),
    },
    {
      title: "Active Listings",
      value: summary.activeListings === -1 ? "-" : summary.activeListings,
      colorClass: "green",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      title: "Total Leads",
      value: summary.totalLeads,
      colorClass: "orange",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      title: "Open Deals",
      value: summary.openDeals,
      colorClass: "purple",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      title: "Site Visits",
      value: summary.siteVisits === -1 ? "-" : summary.siteVisits,
      colorClass: "teal",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      title: "Bookings",
      value: summary.bookings === -1 ? "-" : summary.bookings,
      colorClass: "red",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      title: "Qualified Leads",
      value: summary.qualifiedLeads,
      colorClass: "green",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      ),
    },
    {
      title: "Total Contacts",
      value: summary.totalContacts,
      colorClass: "teal",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      ),
    },
    {
      title: "Total Accounts",
      value: summary.totalAccounts,
      colorClass: "blue",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1" />
        </svg>
      ),
    },
    {
      title: "Total Deals",
      value: summary.totalDeals,
      colorClass: "purple",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="7" width="18" height="14" rx="2" />
          <path d="M8 7V4h8v3M3 12h18" />
        </svg>
      ),
    },
    {
      title: "Won Revenue",
      value: summary.wonRevenue.toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
      colorClass: "green",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      title: "Pending Tasks",
      value: summary.pendingTasks,
      colorClass: "orange",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
    },
    {
      title: "Completed Tasks",
      value: summary.completedTasks,
      colorClass: "teal",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m5 12 4 4L19 6" />
        </svg>
      ),
    },
    {
      title: "Overdue Tasks",
      value: summary.overdueTasks,
      colorClass: "red",
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      ),
    },
  ];

  return (
    <div className="kpi-grid">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.title} {...kpi} />
      ))}
    </div>
  );
}
