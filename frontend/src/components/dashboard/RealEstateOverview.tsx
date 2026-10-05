import { DashboardSummary } from "../../types/dashboard";

interface KpiCardProps {
  title: string;
  value: number | string;
  icon: JSX.Element;
  trend?: string;
  colorClass?: string;
}

function KpiCard({ title, value, icon, trend, colorClass = "blue" }: KpiCardProps) {
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

export default function RealEstateOverview({ summary }: RealEstateOverviewProps) {
  if (!summary) return <div>Loading...</div>;

  const kpis = [
    {
      title: "Total Properties",
      value: summary.totalProperties === -1 ? "-" : summary.totalProperties,
      colorClass: "blue",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
    },
    {
      title: "Active Listings",
      value: summary.activeListings === -1 ? "-" : summary.activeListings,
      colorClass: "green",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
    },
    {
      title: "Total Leads",
      value: summary.totalLeads === -1 ? "-" : summary.totalLeads,
      colorClass: "orange",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
    },
    {
      title: "Open Deals",
      value: summary.openDeals === -1 ? "-" : summary.openDeals,
      colorClass: "purple",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
    },
    {
      title: "Site Visits",
      value: summary.siteVisits === -1 ? "-" : summary.siteVisits,
      colorClass: "teal",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
    },
    {
      title: "Bookings",
      value: summary.bookings === -1 ? "-" : summary.bookings,
      colorClass: "red",
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
    }
  ];

  return (
    <div className="kpi-grid">
      {kpis.map((kpi, idx) => (
        <KpiCard key={idx} {...kpi} />
      ))}
    </div>
  );
}
