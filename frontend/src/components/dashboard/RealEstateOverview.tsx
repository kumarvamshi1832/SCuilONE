import { useNavigate, useParams } from "react-router-dom";
import { DashboardSummary } from "../../types/dashboard";
import { normalizeIndustry } from "../../utils/industryUtils";

interface PrimaryKpiCardProps {
  title: string;
  value: number | string;
  icon: JSX.Element;
  colorClass?: string;
  actionText?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

function PrimaryKpiCard({
  title,
  value,
  icon,
  colorClass = "blue",
  actionText,
  onClick,
  ariaLabel,
}: PrimaryKpiCardProps) {
  return (
    <div
      className={`kpi-card primary-kpi-card ${colorClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel || `Navigate to ${title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="kpi-card-top">
        <div className="kpi-icon-wrapper">{icon}</div>
        <div className="kpi-info">
          <span className="kpi-title">{title}</span>
          <div className="kpi-value">{value}</div>
        </div>
      </div>
      {actionText && (
        <div className="kpi-card-footer">
          <span className="kpi-action-link">
            {actionText}
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </div>
      )}
    </div>
  );
}

interface SecondaryKpiCardProps {
  title: string;
  value: number | string;
  icon: JSX.Element;
  colorClass?: string;
  onClick?: () => void;
  ariaLabel?: string;
  isRevenue?: boolean;
}

function SecondaryKpiCard({
  title,
  value,
  icon,
  colorClass = "blue",
  onClick,
  ariaLabel,
  isRevenue,
}: SecondaryKpiCardProps) {
  const isRev = isRevenue || title.toLowerCase().includes("revenue");
  return (
    <div
      className={`kpi-card secondary-kpi-card ${colorClass} ${isRev ? "kpi-card-revenue" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel || `Navigate to ${title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <div className="kpi-icon-wrapper mini">{icon}</div>
      <div className="kpi-info">
        <span className="kpi-title" title={title}>{title}</span>
        <div
          className={`kpi-value ${isRev ? "kpi-value-revenue" : ""}`}
          title={typeof value === "string" ? value : String(value)}
        >
          {value}
        </div>
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
  const navigate = useNavigate();
  const { industry } = useParams();

  const getBasePath = () => {
    if (industry) return `/${normalizeIndustry(industry)}`;
    const tenantStr = sessionStorage.getItem("tenant");
    if (tenantStr) {
      try {
        const t = JSON.parse(tenantStr);
        if (t?.industry) return `/${normalizeIndustry(t.industry)}`;
      } catch (e) {}
    }
    return "/real-estate";
  };

  const basePath = getBasePath();

  if (!summary) {
    return (
      <div className="kpi-section">
        <div className="kpi-row kpi-row-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={`skel-1-${i}`} className="kpi-card primary-kpi-card skeleton">
              <div className="kpi-icon-wrapper skeleton-icon" />
              <div className="kpi-info">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line skeleton-value" />
              </div>
            </div>
          ))}
        </div>
        <div className="kpi-row kpi-row-7">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={`skel-2-${i}`} className={`kpi-card secondary-kpi-card skeleton ${i === 4 ? "kpi-card-revenue" : ""}`}>
              <div className="kpi-icon-wrapper mini skeleton-icon" />
              <div className="kpi-info">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line skeleton-value" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Row 1: Six Primary KPI Cards
  const primaryKpis = [
    {
      title: "Total Properties",
      value: summary.totalProperties === -1 ? "-" : summary.totalProperties,
      colorClass: "blue",
      actionText: "View Properties",
      onClick: () => navigate(`${basePath}/properties`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      title: "Active Listings",
      value: summary.activeListings === -1 ? "-" : summary.activeListings,
      colorClass: "green",
      actionText: "View Listings",
      onClick: () => navigate(`${basePath}/properties?status=Available`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      title: "Total Leads",
      value: summary.totalLeads ?? 0,
      colorClass: "orange",
      actionText: "View Leads",
      onClick: () => navigate(`${basePath}/leads`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      title: "Site Visits",
      value: summary.siteVisits === -1 ? "-" : (summary.siteVisits ?? 0),
      colorClass: "teal",
      actionText: "View Visits",
      onClick: () => navigate(`${basePath}/site-visits`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      ),
    },
    {
      title: "Bookings",
      value: summary.bookings === -1 ? "-" : (summary.bookings ?? 0),
      colorClass: "red",
      actionText: "View Bookings",
      onClick: () => navigate(`${basePath}/bookings`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      title: "Open Deals",
      value: summary.openDeals ?? 0,
      colorClass: "purple",
      actionText: "View Deals",
      onClick: () => navigate(`${basePath}/deals`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v12M15 9.5H9.5a2.5 2.5 0 0 0 0 5h5" />
        </svg>
      ),
    },
  ];

  // Row 2: Seven Secondary Compact KPI Cards
  const secondaryKpis = [
    {
      title: "Qualified Leads",
      value: summary.qualifiedLeads ?? 0,
      colorClass: "green",
      onClick: () => navigate(`${basePath}/leads?status=Qualified`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      ),
    },
    {
      title: "Total Contacts",
      value: summary.totalContacts ?? 0,
      colorClass: "teal",
      onClick: () => navigate(`${basePath}/contacts`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
        </svg>
      ),
    },
    {
      title: "Total Accounts",
      value: summary.totalAccounts ?? 0,
      colorClass: "blue",
      onClick: () => navigate(`${basePath}/accounts`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1" />
        </svg>
      ),
    },
    {
      title: "Won Revenue",
      value: (summary.wonRevenue ?? 0).toLocaleString("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
      colorClass: "green",
      isRevenue: true,
      onClick: () => navigate(`${basePath}/deals`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12M6 8h12M6 13h5a4 4 0 0 0 4-4 4 4 0 0 0-4-4H6M11 13l6 8" />
        </svg>
      ),
    },
    {
      title: "Pending Tasks",
      value: summary.pendingTasks ?? 0,
      colorClass: "orange",
      onClick: () => navigate(`${basePath}/tasks?status=pending`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      title: "Completed Tasks",
      value: summary.completedTasks ?? 0,
      colorClass: "teal",
      onClick: () => navigate(`${basePath}/tasks?status=completed`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      title: "Overdue Tasks",
      value: summary.overdueTasks ?? 0,
      colorClass: "red",
      onClick: () => navigate(`${basePath}/tasks?status=overdue`),
      icon: icon(
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
  ];

  return (
    <div className="kpi-section">
      {/* Row 1: Six Primary KPI Cards */}
      <div className="kpi-row kpi-row-6">
        {primaryKpis.map((kpi) => (
          <PrimaryKpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* Row 2: Seven Secondary Compact KPI Cards */}
      <div className="kpi-row kpi-row-7">
        {secondaryKpis.map((kpi) => (
          <SecondaryKpiCard key={kpi.title} {...kpi} />
        ))}
      </div>
    </div>
  );
}
