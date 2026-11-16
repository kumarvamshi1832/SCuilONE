import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BuildingIcon,
  CheckCircleIcon,
  CoinsIcon,
  CreditCardIcon,
  FileTextIcon,
  HeadphonesIcon,
  LayersIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  UsersIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { useTheme } from "../../context/ThemeContext";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformAnalyticsOverview,
  PlatformCustomerLookupItem,
  PlatformDashboardPayload,
  PlatformInvoiceItem,
  PlatformTenantCompany,
} from "../../types/platform";
import "./PlatformPages.css";

type BadgeVariant =
  | "accent"
  | "blue"
  | "emerald"
  | "violet"
  | "amber"
  | "alert"
  | "neutral";

interface DashboardKpiCardProps {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  icon: React.ReactNode;
  tone?:
  | "accent"
  | "blue"
  | "cobalt"
  | "cyan"
  | "emerald"
  | "violet"
  | "amber"
  | "slate"
  | "alert";
  featured?: boolean;
  motif?: "city" | "wave";
  iconShape?: "rounded" | "circle";
  statusPill?: {
    label: string;
    variant: BadgeVariant;
  };
  to?: string;
  ariaLabel?: string;
  onNavigate?: (to: string) => void;
}

function KpiCardMotif({ motif = "wave" }: { motif?: "city" | "wave" }) {
  if (motif === "city") {
    return (
      <svg
        className="platform-dash-kpi-svg city"
        viewBox="0 0 200 96"
        fill="none"
        preserveAspectRatio="xMaxYMax slice"
        aria-hidden="true"
      >
        <path
          d="M0 96V70C36 52 72 58 106 42C140 26 168 14 200 6V96H0Z"
          fill="currentColor"
          fillOpacity="0.22"
        />
        <path
          d="M0 70C36 52 72 58 106 42C140 26 168 14 200 6"
          stroke="currentColor"
          strokeOpacity="0.34"
          strokeWidth="1.2"
        />
        <g fill="currentColor" fillOpacity="0.3">
          <rect x="108" y="44" width="20" height="52" rx="2" />
          <rect x="132" y="24" width="26" height="72" rx="2" />
          <rect x="162" y="36" width="22" height="60" rx="2" />
          <rect x="138" y="32" width="4.5" height="5.5" rx="0.8" fill="#ffffff" fillOpacity="0.28" />
          <rect x="147" y="32" width="4.5" height="5.5" rx="0.8" fill="#ffffff" fillOpacity="0.28" />
          <rect x="138" y="42" width="4.5" height="5.5" rx="0.8" fill="#ffffff" fillOpacity="0.28" />
          <rect x="147" y="42" width="4.5" height="5.5" rx="0.8" fill="#ffffff" fillOpacity="0.28" />
          <rect x="138" y="52" width="4.5" height="5.5" rx="0.8" fill="#ffffff" fillOpacity="0.2" />
          <rect x="147" y="52" width="4.5" height="5.5" rx="0.8" fill="#ffffff" fillOpacity="0.2" />
          <rect x="113" y="52" width="3.5" height="4.5" rx="0.6" fill="#ffffff" fillOpacity="0.24" />
          <rect x="120" y="52" width="3.5" height="4.5" rx="0.6" fill="#ffffff" fillOpacity="0.24" />
          <rect x="113" y="61" width="3.5" height="4.5" rx="0.6" fill="#ffffff" fillOpacity="0.2" />
          <rect x="120" y="61" width="3.5" height="4.5" rx="0.6" fill="#ffffff" fillOpacity="0.2" />
          <rect x="168" y="44" width="3.5" height="4.5" rx="0.6" fill="#ffffff" fillOpacity="0.22" />
          <rect x="175" y="44" width="3.5" height="4.5" rx="0.6" fill="#ffffff" fillOpacity="0.22" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      className="platform-dash-kpi-svg wave"
      viewBox="0 0 220 96"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M8 96C50 86 84 56 124 40C160 26 190 16 220 10V96H8Z"
        fill="currentColor"
        fillOpacity="0.26"
      />
      <path
        d="M8 96C50 86 84 56 124 40C160 26 190 16 220 10"
        stroke="currentColor"
        strokeOpacity="0.34"
        strokeWidth="1.2"
      />
      <path
        d="M48 96C90 80 124 50 162 40C188 33 206 32 220 28V96H48Z"
        fill="currentColor"
        fillOpacity="0.16"
      />
    </svg>
  );
}

function DashboardKpiCard({
  label,
  value,
  sub,
  icon,
  tone = "accent",
  featured = false,
  motif = "wave",
  iconShape = "rounded",
  statusPill,
  to,
  ariaLabel,
  onNavigate,
}: DashboardKpiCardProps) {
  const isClickable = Boolean(to && onNavigate);

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!to || !onNavigate) return;
    const targetEl = e.target as HTMLElement | null;
    if (
      targetEl &&
      targetEl.closest(
        'a, button, input, select, textarea, [data-stop-card-nav="true"]'
      )
    ) {
      return;
    }
    e.stopPropagation();
    onNavigate(to);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!to || !onNavigate) return;
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onNavigate(to);
    }
  };

  return (
    <article
      className={`platform-dash-kpi-card tone-${tone} ${
        featured ? "featured" : "operational"
      }${isClickable ? " is-clickable" : ""}`}
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={isClickable ? ariaLabel || label : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
    >
      <KpiCardMotif motif={motif} />
      <div className="platform-dash-kpi-body">
        <span
          className={`platform-dash-kpi-icon ${tone} shape-${iconShape}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="platform-dash-kpi-content">
          <div className="platform-dash-kpi-top">
            <span className="platform-dash-kpi-label">{label}</span>
            {statusPill && (
              <span
                className={`platform-dash-kpi-pill variant-${statusPill.variant}`}
              >
                {statusPill.label}
              </span>
            )}
          </div>
          <div className="platform-dash-kpi-value">{value}</div>
          <div className="platform-dash-kpi-sub">{sub}</div>
        </div>
      </div>
    </article>
  );
}

interface CustomTooltipPayloadItem {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
  payload?: Record<string, any>;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
  valueFormatter?: (item: CustomTooltipPayloadItem) => string;
}

function DashboardChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="platform-dash-tooltip">
      {label && <div className="platform-dash-tooltip-label">{label}</div>}
      <div className="platform-dash-tooltip-rows">
        {payload.map((entry, idx) => {
          const formatted = valueFormatter
            ? valueFormatter(entry)
            : String(entry.value ?? 0);
          return (
            <div key={idx} className="platform-dash-tooltip-row">
              <span
                className="platform-dash-tooltip-dot"
                style={{
                  backgroundColor:
                    entry.color || entry.payload?.color || "#6366f1",
                }}
              />
              <span className="platform-dash-tooltip-name">
                {entry.name || entry.payload?.name || "Value"}
              </span>
              <span className="platform-dash-tooltip-val">{formatted}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TenantGrowthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as
    | { month?: string; fullMonth?: string; newTenants?: number; cumulative?: number }
    | undefined;
  if (!row) return null;

  return (
    <div className="platform-dash-tooltip platform-dash-growth-tooltip">
      <div className="platform-dash-tooltip-label">
        {row.fullMonth || row.month}
      </div>
      <div className="platform-dash-tooltip-rows">
        <div className="platform-dash-tooltip-row">
          <span
            className="platform-dash-tooltip-dot"
            style={{ backgroundColor: "#a855f7" }}
          />
          <span className="platform-dash-tooltip-name">Total Tenants</span>
          <span className="platform-dash-tooltip-val">
            {row.cumulative ?? 0}
          </span>
        </div>
        {typeof row.newTenants === "number" && (
          <div className="platform-dash-tooltip-row">
            <span
              className="platform-dash-tooltip-dot"
              style={{ backgroundColor: "#34d399" }}
            />
            <span className="platform-dash-tooltip-name">Added in Month</span>
            <span className="platform-dash-tooltip-val">
              +{row.newTenants}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const INDUSTRY_SERIES_COLORS: Record<string, string> = {
  registered: "#8b5cf6",
  active: "#22d3ee",
  prospects: "#10b981",
};

function IndustryChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: CustomTooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="platform-dash-tooltip platform-dash-growth-tooltip">
      {label && <div className="platform-dash-tooltip-label">{label}</div>}
      <div className="platform-dash-tooltip-rows">
        {payload.map((entry, idx) => {
          const key = String(entry.dataKey || idx);
          const dotColor =
            INDUSTRY_SERIES_COLORS[key] ||
            (entry.color && !entry.color.startsWith("url(")
              ? entry.color
              : "#8b5cf6");
          return (
            <div key={key} className="platform-dash-tooltip-row">
              <span
                className="platform-dash-tooltip-dot"
                style={{ backgroundColor: dotColor }}
              />
              <span className="platform-dash-tooltip-name">
                {entry.name || key}
              </span>
              <span className="platform-dash-tooltip-val">
                {Number(entry.value ?? 0).toLocaleString("en-IN")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseMetricNumber(raw: string | number | null | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCompactInr(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

function formatFullInr(value: number): string {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;
}

function formatTenantMonthMeta(iso: string | null | undefined): {
  key: string;
  axisLabel: string;
  fullLabel: string;
} | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  const monthIdx = dt.getMonth();
  const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  const axisLabel = dt.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
  const fullLabel = dt.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  return { key, axisLabel, fullLabel };
}

function formatMonthKey(iso: string | null | undefined): {
  key: string;
  label: string;
} | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  const monthIdx = dt.getMonth();
  const key = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
  const label = dt.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
  return { key, label };
}

function lookupStatusBadgeClass(status: string): string {
  const norm = status.toLowerCase();
  if (norm === "active") return "green";
  if (norm === "trial" || norm === "trialing") return "blue";
  if (norm === "suspended" || norm === "expired" || norm === "cancelled") {
    return "red";
  }
  return "indigo";
}

export default function PlatformDashboardPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [dashboard, setDashboard] = useState<PlatformDashboardPayload | null>(
    null
  );
  const [analytics, setAnalytics] = useState<PlatformAnalyticsOverview | null>(
    null
  );
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [tenantsList, setTenantsList] = useState<PlatformTenantCompany[]>([]);
  const [tenantsError, setTenantsError] = useState<string | null>(null);
  const [invoicesList, setInvoicesList] = useState<PlatformInvoiceItem[]>([]);

  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupItems, setLookupItems] = useState<PlatformCustomerLookupItem[]>(
    []
  );
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSearched, setLookupSearched] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canLookup = hasPlatformPermission("platform.tenants.view");
  const canViewAnalytics = hasPlatformPermission("platform.analytics.view");
  const canViewBilling = hasPlatformPermission("platform.billing.view");
  const canViewPlans = hasPlatformPermission("platform.plans.view");
  const canViewFinance = hasPlatformPermission("platform.finance.view");
  const canViewSales = hasPlatformPermission("platform.sales.view");
  const canViewTickets = hasPlatformPermission("platform.tickets.view");
  const canViewEmployees = hasPlatformPermission("platform.employees.view");
  const canViewTeams = hasPlatformPermission("platform.teams.view");
  const canViewTech = hasPlatformPermission("platform.technical.view");
  const canViewSecurity = hasPlatformPermission("platform.security.view");
  const canViewAudit = hasPlatformPermission("platform.audit.view");

  const kpiRoutes = {
    tenants: canLookup ? "/platform/tenants" : undefined,
    subscriptions: canViewBilling
      ? "/platform/billing?tab=subscriptions"
      : canViewPlans
      ? "/platform/billing?tab=plans"
      : undefined,
    revenue: canViewFinance ? "/platform/finance?tab=finance" : undefined,
    netProfit: canViewFinance ? "/platform/finance?tab=finance" : undefined,
    supportQueue: canViewTickets ? "/platform/support?tab=tickets" : undefined,
    myAssigned: canViewTickets
      ? "/platform/support?tab=tickets&view=my_tickets"
      : undefined,
    salesPipeline: canViewSales ? "/platform/finance?tab=sales" : undefined,
    workforce:
      canViewEmployees || canViewTeams ? "/platform/employees" : undefined,
    sreSecurity: canViewTech
      ? "/platform/operations"
      : canViewSecurity
      ? "/platform/operations?tab=security"
      : undefined,
    auditEvents: canViewAudit ? "/platform/operations?tab=audit" : undefined,
  };

  const handleKpiNavigate = (to: string) => {
    navigate(to);
  };

  const loadAnalytics = async () => {
    if (!canViewAnalytics) {
      setAnalyticsError(null);
      return null;
    }
    try {
      setAnalyticsError(null);
      return await platformService.getAnalyticsOverview();
    } catch (err) {
      setAnalyticsError(
        extractApiErrorMessage(err, "Unable to load industry distribution.")
      );
      return null;
    }
  };

  const loadTenants = async () => {
    if (!canLookup) {
      setTenantsError(null);
      return [] as PlatformTenantCompany[];
    }
    try {
      setTenantsError(null);
      const res = await platformService.listTenants();
      return Array.isArray(res?.items) ? res.items : [];
    } catch (err) {
      setTenantsError(
        extractApiErrorMessage(err, "Unable to load tenant growth telemetry.")
      );
      return [] as PlatformTenantCompany[];
    }
  };

  const loadInvoices = async () => {
    if (!canViewBilling) {
      return [] as PlatformInvoiceItem[];
    }
    try {
      const res = await platformService.listInvoices();
      return Array.isArray(res?.items) ? res.items : [];
    } catch {
      return [] as PlatformInvoiceItem[];
    }
  };

  const loadInitial = async () => {
    setLoading(true);
    setError(null);
    try {
      const [meDash, analyticsOverview, tenants, invoices] = await Promise.all([
        platformService.getMyDashboard(),
        loadAnalytics(),
        loadTenants(),
        loadInvoices(),
      ]);
      setDashboard(meDash);
      setAnalytics(analyticsOverview);
      setTenantsList(tenants);
      setInvoicesList(invoices);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load platform dashboard."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  const handleCustomerLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canLookup) return;
    setLookupLoading(true);
    try {
      const res = await platformService.customerLookup(lookupQuery);
      setLookupItems(res.items || []);
      setLookupSearched(true);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Customer lookup failed."));
    } finally {
      setLookupLoading(false);
    }
  };

  const kpis = dashboard?.kpis;

  // Derived real metrics (zero synthetic data)
  const kpiDerived = useMemo(() => {
    if (!kpis) {
      return {
        activeTenantRate: 0,
        inactiveTenants: 0,
        totalSubs: 0,
        activeSubRate: 0,
        trialSubRate: 0,
        expiredSubRate: 0,
        profitMarginPct: null as number | null,
        revSharePct: 0,
        expSharePct: 0,
        winRatePct: 0,
        totalIncidents: 0,
        slaClean: true,
        securityNominal: true,
      };
    }
    const activeTenantRate =
      kpis.total_companies > 0
        ? Math.round((kpis.active_companies / kpis.total_companies) * 100)
        : 0;
    const inactiveTenants = Math.max(
      0,
      kpis.total_companies - kpis.active_companies
    );
    const totalSubs =
      kpis.active_subscriptions +
      kpis.trialing_tenants +
      kpis.expired_subscriptions;
    const activeSubRate =
      totalSubs > 0
        ? Math.round((kpis.active_subscriptions / totalSubs) * 100)
        : 0;
    const trialSubRate =
      totalSubs > 0
        ? Math.round((kpis.trialing_tenants / totalSubs) * 100)
        : 0;
    const expiredSubRate =
      totalSubs > 0
        ? Math.max(0, 100 - activeSubRate - trialSubRate)
        : 0;

    const revNum = parseMetricNumber(kpis.total_revenue);
    const expNum = parseMetricNumber(kpis.total_expenses);
    const netNum = parseMetricNumber(kpis.net_profit_estimate);
    const profitMarginPct =
      revNum > 0 ? Math.round((netNum / revNum) * 100) : null;
    const revExpSum = Math.max(0, revNum) + Math.max(0, expNum);
    const revSharePct =
      revExpSum > 0 ? Math.round((Math.max(0, revNum) / revExpSum) * 100) : 0;
    const expSharePct = revExpSum > 0 ? 100 - revSharePct : 0;

    const winRatePct =
      kpis.sales_prospects > 0
        ? Math.round((kpis.sales_conversions / kpis.sales_prospects) * 100)
        : 0;

    const totalIncidents =
      kpis.active_technical_incidents + kpis.open_security_incidents;

    return {
      activeTenantRate,
      inactiveTenants,
      totalSubs,
      activeSubRate,
      trialSubRate,
      expiredSubRate,
      profitMarginPct,
      revSharePct,
      expSharePct,
      winRatePct,
      totalIncidents,
      slaClean: kpis.sla_breached_tickets === 0,
      securityNominal: totalIncidents === 0,
    };
  }, [kpis]);

  const tenantGrowthData = useMemo(() => {
    if (!tenantsList.length) return [];
    const buckets = new Map<
      string,
      { axisLabel: string; fullLabel: string; newTenants: number }
    >();
    for (const tenant of tenantsList) {
      const m = formatTenantMonthMeta(tenant.created_at);
      if (!m) continue;
      const prev = buckets.get(m.key);
      if (prev) {
        prev.newTenants += 1;
      } else {
        buckets.set(m.key, {
          axisLabel: m.axisLabel,
          fullLabel: m.fullLabel,
          newTenants: 1,
        });
      }
    }
    const sorted = Array.from(buckets.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    let runningTotal = 0;
    return sorted.map(([, entry]) => {
      runningTotal += entry.newTenants;
      return {
        month: entry.axisLabel,
        fullMonth: entry.fullLabel,
        newTenants: entry.newTenants,
        cumulative: runningTotal,
      };
    });
  }, [tenantsList]);

  const tenantGrowthSummary = useMemo(() => {
    if (tenantGrowthData.length < 2) return null;
    const prev = tenantGrowthData[tenantGrowthData.length - 2];
    const curr = tenantGrowthData[tenantGrowthData.length - 1];
    if (!prev || !curr || prev.cumulative <= 0) return null;
    const delta = curr.cumulative - prev.cumulative;
    const pct = Math.round((delta / prev.cumulative) * 100);
    return {
      pct,
      delta,
      prevMonth: prev.month,
      currMonth: curr.month,
    };
  }, [tenantGrowthData]);

  const revenueTrendData = useMemo(() => {
    if (!invoicesList.length) return [];
    const buckets = new Map<
      string,
      { label: string; collected: number; billed: number }
    >();
    for (const inv of invoicesList) {
      const m = formatMonthKey(inv.issue_date || inv.due_date);
      if (!m) continue;
      const paid = Math.max(0, parseMetricNumber(inv.paid_amount));
      const total = Math.max(0, parseMetricNumber(inv.total_amount));
      const prev = buckets.get(m.key);
      if (prev) {
        prev.collected += paid;
        prev.billed += total;
      } else {
        buckets.set(m.key, {
          label: m.label,
          collected: paid,
          billed: total,
        });
      }
    }
    const sorted = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({
        month: v.label,
        collected: Math.round(v.collected * 100) / 100,
        billed: Math.round(v.billed * 100) / 100,
      }));
    return sorted.some((r) => r.collected > 0 || r.billed > 0) ? sorted : [];
  }, [invoicesList]);

  const subscriptionChartData = useMemo(() => {
    if (!kpis) return [];
    return [
      { name: "Active", value: kpis.active_subscriptions, color: "#6366f1" },
      { name: "Trialing", value: kpis.trialing_tenants, color: "#38bdf8" },
      { name: "Expired", value: kpis.expired_subscriptions, color: "#f59e0b" },
    ];
  }, [kpis]);

  const totalSubscriptionSlices = useMemo(
    () => subscriptionChartData.reduce((acc, item) => acc + item.value, 0),
    [subscriptionChartData]
  );

  const financialChartData = useMemo(() => {
    if (!kpis) return [];
    return [
      {
        name: "Revenue",
        amount: parseMetricNumber(kpis.total_revenue),
        formatted: `₹${kpis.total_revenue}`,
        gradId: "gradRev",
        color: "#6366f1",
      },
      {
        name: "Pipeline MRR",
        amount: parseMetricNumber(kpis.pipeline_estimated_mrr),
        formatted: `₹${kpis.pipeline_estimated_mrr}`,
        gradId: "gradMrr",
        color: "#38bdf8",
      },
      {
        name: "Expenses",
        amount: parseMetricNumber(kpis.total_expenses),
        formatted: `₹${kpis.total_expenses}`,
        gradId: "gradExp",
        color: "#f59e0b",
      },
      {
        name: "Net Profit",
        amount: parseMetricNumber(kpis.net_profit_estimate),
        formatted: `₹${kpis.net_profit_estimate}`,
        gradId: "gradNet",
        color: "#10b981",
      },
    ];
  }, [kpis]);

  const hasFinancialChartData = useMemo(
    () => financialChartData.some((d) => d.amount !== 0),
    [financialChartData]
  );

  const industryChartData = useMemo(() => {
    if (!analytics?.industry_analytics?.length) return [];
    return analytics.industry_analytics
      .filter(
        (row) =>
          row.registered_companies > 0 ||
          row.active_companies > 0 ||
          row.sales_prospects > 0 ||
          row.total_tickets > 0
      )
      .map((row) => ({
        name: row.industry_name,
        registered: Number(row.registered_companies ?? 0),
        active: Number(row.active_companies ?? 0),
        prospects: Number(row.sales_prospects ?? 0),
      }));
  }, [analytics]);

  const industryChartHeight = Math.max(
    210,
    Math.min(440, industryChartData.length * 74 + 28)
  );

  // Deterministic pairing of secondary telemetry cards when real records exist
  const secondaryPairedCharts = useMemo(() => {
    const list: string[] = [];
    if (revenueTrendData.length > 0) list.push("revenueTrend");
    if (totalSubscriptionSlices > 0) list.push("subscriptionDist");
    if (hasFinancialChartData) list.push("financialComp");
    return list;
  }, [
    revenueTrendData.length,
    totalSubscriptionSlices,
    hasFinancialChartData,
  ]);

  const lastOddSecondaryChartId =
    secondaryPairedCharts.length % 2 === 1
      ? secondaryPairedCharts[secondaryPairedCharts.length - 1]
      : null;

  const hasSecondaryTelemetry =
    secondaryPairedCharts.length > 0 ||
    industryChartData.length > 0 ||
    Boolean(canViewAnalytics && (analyticsError || analytics));

  const backendTitle = (dashboard?.dashboard_title || "").trim();
  const isPlatformAdminHero =
    !backendTitle ||
    backendTitle === "Super Admin Dashboard" ||
    backendTitle === "Platform Admin Dashboard" ||
    backendTitle === "Super Admin Platform";
  const rawHeroTitle = backendTitle || "Super Admin Platform";
  const titleWords = rawHeroTitle.split(/\s+/);
  const heroTitleLead =
    titleWords.length > 1 ? `${titleWords.slice(0, -1).join(" ")} ` : "";
  const heroTitleAccent = titleWords[titleWords.length - 1] || rawHeroTitle;

  const axisTickFill = isDark ? "#94a3b8" : "#475569";
  const axisLineStroke = isDark
    ? "rgba(148, 163, 184, 0.2)"
    : "rgba(15, 23, 42, 0.14)";
  const gridStroke = isDark
    ? "rgba(148, 163, 184, 0.12)"
    : "rgba(15, 23, 42, 0.08)";
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );

  return (
    <div className="platform-page platform-dash-page">
      <section className="platform-dash-hero">
        <div className="platform-dash-hero-bar" aria-hidden="true" />
        <div className="platform-dash-hero-glow" aria-hidden="true" />
        <div className="platform-dash-hero-orb" aria-hidden="true" />

        <div className="platform-dash-hero-inner">
          <div className="platform-dash-hero-main">
            <h2 className="platform-dash-title">
              {isPlatformAdminHero ? (
                <>
                  <span className="platform-dash-title-lead">
                    Welcome Back,{" "}
                  </span>
                  <span className="platform-dash-title-accent">
                    Super Admin
                  </span>
                  <span className="platform-dash-title-lead">!</span>
                </>
              ) : (
                <>
                  {heroTitleLead && (
                    <span className="platform-dash-title-lead">
                      {heroTitleLead}
                    </span>
                  )}
                  <span className="platform-dash-title-accent">
                    {heroTitleAccent}
                  </span>
                </>
              )}
            </h2>
            <p className="platform-dash-hero-tagline">
              One Platform. Multiple Industries. Unified Control.
            </p>
            <p className="platform-dash-subtitle">
              Manage your tenants, empower teams, maintain security, and drive
              platform-wide growth from one central place.
            </p>
          </div>
        </div>
      </section>

      {error && <div className="platform-alert error">{error}</div>}

      {loading && !kpis ? (
        <div className="platform-card platform-empty platform-dash-loading">
          <div className="platform-spinner" />
          <span>Loading platform metrics...</span>
        </div>
      ) : (
        kpis && (
          <>
            <section className="platform-dash-section">
              <div className="platform-dash-section-head">
                <span
                  className="platform-dash-section-icon violet"
                  aria-hidden="true"
                >
                  <LayersIcon size={15} />
                </span>
                <h3 className="platform-dash-section-title">
                  Core Platform &amp; Revenue
                </h3>
              </div>

              <div className="platform-dash-kpi-grid primary">
                <DashboardKpiCard
                  featured
                  tone="violet"
                  motif="city"
                  label="Tenants"
                  value={kpis.total_companies}
                  sub={
                    kpiDerived.inactiveTenants > 0
                      ? `${kpis.active_companies} active • ${kpiDerived.inactiveTenants} inactive`
                      : `${kpis.active_companies} active`
                  }
                  icon={<BuildingIcon size={19} />}
                  to={kpiRoutes.tenants}
                  ariaLabel="Tenants — Open Tenant Companies"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  featured
                  tone="emerald"
                  label="Active Subscriptions"
                  value={kpis.active_subscriptions}
                  sub={`${kpis.trialing_tenants} trialing • ${kpis.expired_subscriptions} expired`}
                  icon={<CreditCardIcon size={19} />}
                  to={kpiRoutes.subscriptions}
                  ariaLabel="Active Subscriptions — Open Plans, Billing & Renewals"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  featured
                  tone="amber"
                  iconShape="circle"
                  label="Revenue & Overdue"
                  value={`₹${kpis.total_revenue}`}
                  statusPill={
                    kpis.overdue_invoices > 0
                      ? {
                        label: `${kpis.overdue_invoices} overdue`,
                        variant: "amber",
                      }
                      : undefined
                  }
                  sub={`${kpis.overdue_invoices} overdue • ${kpis.pending_payment_verifications} pending verify`}
                  icon={<CoinsIcon size={19} />}
                  to={kpiRoutes.revenue}
                  ariaLabel="Revenue & Overdue — Open Sales & Finance"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  featured
                  tone="cyan"
                  label="Net Profit Estimate"
                  value={`₹${kpis.net_profit_estimate}`}
                  sub={`₹${kpis.total_expenses} approved expenses • ${kpis.pending_expense_requests} pending`}
                  icon={<TrendingUpIcon size={19} />}
                  to={kpiRoutes.netProfit}
                  ariaLabel="Net Profit Estimate — Open Sales & Finance"
                  onNavigate={handleKpiNavigate}
                />
              </div>
            </section>

            <section className="platform-dash-section">
              <div className="platform-dash-section-head">
                <span
                  className="platform-dash-section-icon blue"
                  aria-hidden="true"
                >
                  <HeadphonesIcon size={15} />
                </span>
                <h3 className="platform-dash-section-title">
                  Operations, Support &amp; Governance
                </h3>
              </div>

              <div className="platform-dash-kpi-grid secondary">
                <DashboardKpiCard
                  tone="blue"
                  iconShape="circle"
                  label="Support Queue"
                  value={kpis.open_tickets}
                  statusPill={
                    !kpiDerived.slaClean
                      ? {
                        label: `${kpis.sla_breached_tickets} SLA breached`,
                        variant: "alert",
                      }
                      : undefined
                  }
                  sub={`${kpis.escalated_tickets} escalated • ${kpis.sla_breached_tickets} SLA breached`}
                  icon={<HeadphonesIcon size={19} />}
                  to={kpiRoutes.supportQueue}
                  ariaLabel="Support Queue — Open Support & Knowledge Base"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  tone="violet"
                  iconShape="circle"
                  label="My Assigned / Resolved"
                  value={kpis.my_assigned_tickets}
                  sub={`${kpis.resolved_tickets} total resolved`}
                  icon={<CheckCircleIcon size={19} />}
                  to={kpiRoutes.myAssigned}
                  ariaLabel="My Assigned / Resolved — Open My Support Tickets"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  tone="cyan"
                  label="Sales & Pipeline MRR"
                  value={`₹${kpis.pipeline_estimated_mrr}`}
                  sub={`${kpis.sales_prospects} prospects • ${kpis.sales_conversions} won`}
                  icon={<TrendingUpIcon size={19} />}
                  to={kpiRoutes.salesPipeline}
                  ariaLabel="Sales & Pipeline MRR — Open Sales & Finance"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  tone="cobalt"
                  label="Platform Workforce"
                  value={kpis.platform_employees}
                  sub="Central & Industry Staff"
                  icon={<UsersIcon size={19} />}
                  to={kpiRoutes.workforce}
                  ariaLabel="Platform Workforce — Open Employees & Industry Teams"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  tone={kpiDerived.securityNominal ? "amber" : "alert"}
                  iconShape="circle"
                  label="SRE & Security"
                  value={kpiDerived.totalIncidents}
                  statusPill={
                    !kpiDerived.securityNominal &&
                      kpis.open_security_incidents > 0
                      ? {
                        label: `${kpis.open_security_incidents} security`,
                        variant: "alert",
                      }
                      : undefined
                  }
                  sub={`${kpis.active_technical_incidents} tech • ${kpis.failed_login_attempts} failed logins`}
                  icon={
                    kpiDerived.securityNominal ? (
                      <ShieldCheckIcon size={19} />
                    ) : (
                      <ShieldAlertIcon size={19} />
                    )
                  }
                  to={kpiRoutes.sreSecurity}
                  ariaLabel="SRE & Security — Open Technical, Security & Audit"
                  onNavigate={handleKpiNavigate}
                />
                <DashboardKpiCard
                  tone="violet"
                  label="Audit Events"
                  value={kpis.total_audit_events}
                  statusPill={
                    kpis.failed_payments > 0
                      ? {
                        label: `${kpis.failed_payments} failed txns`,
                        variant: "amber",
                      }
                      : undefined
                  }
                  sub={`${kpis.pending_refunds} refunds • ${kpis.failed_payments} failed txns`}
                  icon={<FileTextIcon size={19} />}
                  to={kpiRoutes.auditEvents}
                  ariaLabel="Audit Events — Open Audit & SLA Compliance"
                  onNavigate={handleKpiNavigate}
                />
              </div>
            </section>
          </>
        )
      )}

      <section
        className={`platform-dash-bottom-grid ${canLookup ? "two-col" : "single-col"
          }`}
      >
        <div className="platform-card platform-dash-growth-card">
          <div className="platform-dash-bottom-head">
            <div className="platform-dash-bottom-title-wrap">
              <span
                className="platform-dash-section-icon violet"
                aria-hidden="true"
              >
                <BuildingIcon size={15} />
              </span>
              <h3 className="platform-dash-bottom-title">Tenant Growth</h3>
            </div>
            {(tenantGrowthData.length > 0 || tenantGrowthSummary) && (
              <div className="platform-dash-growth-badges">
                {tenantGrowthSummary && (
                  <span
                    className="platform-dash-growth-badge"
                    title={`+${tenantGrowthSummary.delta} new in ${tenantGrowthSummary.currMonth} vs ${tenantGrowthSummary.prevMonth}`}
                  >
                    <TrendingUpIcon size={12} />
                    <span>
                      {tenantGrowthSummary.pct >= 0 ? "+" : ""}
                      {tenantGrowthSummary.pct}%
                    </span>
                  </span>
                )}
                {tenantGrowthData.length > 0 && (
                  <span className="platform-dash-chart-pill platform-dash-growth-total">
                    {tenantsList.length} total
                  </span>
                )}
              </div>
            )}
          </div>

          {loading && tenantsList.length === 0 && !tenantsError ? (
            <div className="platform-dash-growth-state">
              <div className="platform-spinner" />
              <span>Loading tenant growth...</span>
            </div>
          ) : tenantsError && tenantsList.length === 0 ? (
            <div className="platform-dash-growth-state error">
              <span>{tenantsError}</span>
              <button
                type="button"
                className="platform-btn platform-dash-growth-retry"
                onClick={loadInitial}
              >
                Retry
              </button>
            </div>
          ) : tenantGrowthData.length > 0 ? (
            <div className="platform-dash-growth-chart">
              <ResponsiveContainer width="100%" height={198}>
                <AreaChart
                  data={tenantGrowthData}
                  margin={{ top: 10, right: 12, left: -4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="tenantGrowthLineGrad"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop
                        offset="0%"
                        stopColor={isDark ? "#818cf8" : "#6366f1"}
                      />
                      <stop
                        offset="55%"
                        stopColor={isDark ? "#a855f7" : "#7c3aed"}
                      />
                      <stop
                        offset="100%"
                        stopColor={isDark ? "#d8b4fe" : "#9333ea"}
                      />
                    </linearGradient>
                    <linearGradient
                      id="tenantCumGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="#a855f7"
                        stopOpacity={isDark ? 0.36 : 0.24}
                      />
                      <stop
                        offset="65%"
                        stopColor="#7c3aed"
                        stopOpacity={isDark ? 0.12 : 0.08}
                      />
                      <stop
                        offset="100%"
                        stopColor="#4f46e5"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 4"
                    stroke={gridStroke}
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    interval="preserveStartEnd"
                    minTickGap={22}
                    padding={
                      tenantGrowthData.length === 1
                        ? { left: 28, right: 28 }
                        : { left: 10, right: 10 }
                    }
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                    tickMargin={6}
                    axisLine={{ stroke: axisLineStroke }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickCount={4}
                    domain={[
                      0,
                      (dataMax: number) =>
                        Math.max(
                          2,
                          dataMax + Math.max(1, Math.ceil(dataMax * 0.18))
                        ),
                    ]}
                    tick={{ fill: axisTickFill, fontSize: 11 }}
                    tickMargin={6}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip
                    cursor={{
                      stroke: isDark
                        ? "rgba(192, 132, 252, 0.36)"
                        : "rgba(109, 40, 217, 0.24)",
                      strokeWidth: 1,
                      strokeDasharray: "3 3",
                    }}
                    content={<TenantGrowthTooltip />}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative"
                    name="Total Tenants"
                    stroke="url(#tenantGrowthLineGrad)"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    fill="url(#tenantCumGrad)"
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={450}
                    animationEasing="ease-out"
                    dot={{
                      r: 3.25,
                      fill: isDark ? "#0d1630" : "#ffffff",
                      stroke: isDark ? "#c084fc" : "#7c3aed",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 5,
                      fill: "#ffffff",
                      stroke: isDark ? "#c084fc" : "#6d28d9",
                      strokeWidth: 2.25,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="platform-dash-growth-empty">
              No monthly tenant growth history recorded yet.
            </div>
          )}
        </div>

        {canLookup && (
          <div
            id="tenant-lookup"
            className="platform-card platform-dash-lookup-card"
          >
            <div className="platform-dash-lookup-head">
              <div className="platform-dash-lookup-title-row">
                <span className="platform-dash-lookup-icon" aria-hidden="true">
                  <SearchIcon size={18} />
                </span>
                <div>
                  <h3 className="platform-dash-bottom-title">
                    Quick Customer Tenant Lookup
                  </h3>
                  <p className="platform-dash-lookup-desc">
                    Search tenant organizations by company name to inspect plan,
                    subscription state, and open support load.
                  </p>
                </div>
              </div>
              {lookupSearched && (
                <span className="platform-dash-chart-pill">
                  {lookupItems.length} result
                  {lookupItems.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <form
              onSubmit={handleCustomerLookup}
              className="platform-dash-lookup-form"
            >
              <div className="platform-dash-search-wrap">
                <span className="platform-dash-search-icon" aria-hidden="true">
                  <SearchIcon size={15} />
                </span>
                <input
                  className="platform-input platform-dash-search-input"
                  placeholder="Search company name..."
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                />
                {lookupQuery && (
                  <button
                    type="button"
                    className="platform-dash-search-clear"
                    aria-label="Clear search query"
                    onClick={() => {
                      setLookupQuery("");
                      setLookupItems([]);
                      setLookupSearched(false);
                    }}
                  >
                    <XIcon size={14} />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="platform-btn primary platform-dash-lookup-btn"
                disabled={lookupLoading}
              >
                <SearchIcon size={15} />
                <span>{lookupLoading ? "Searching..." : "Lookup"}</span>
              </button>
            </form>

            {lookupItems.length > 0 ? (
              <div className="platform-table-wrap platform-dash-lookup-table">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Industry</th>
                      <th>Status</th>
                      <th>Plan</th>
                      <th>Sub Status</th>
                      <th>Open Tickets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lookupItems.map((item) => (
                      <tr key={item.tenant_id}>
                        <td>
                          <strong>{item.company_name}</strong>
                        </td>
                        <td>{item.industry}</td>
                        <td>
                          <span
                            className={`platform-badge ${lookupStatusBadgeClass(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td>
                          <span className="platform-badge">
                            {item.subscription_plan}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`platform-badge ${lookupStatusBadgeClass(
                              item.subscription_status
                            )}`}
                          >
                            {item.subscription_status}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`platform-badge ${item.open_tickets_count > 0 ? "yellow" : "green"
                              }`}
                          >
                            {item.open_tickets_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              lookupSearched &&
              !lookupLoading && (
                <div className="platform-dash-lookup-empty">
                  No matching tenant organizations found.
                </div>
              )
            )}
          </div>
        )}
      </section>

      {kpis && hasSecondaryTelemetry && (
        <section className="platform-dash-section platform-dash-telemetry-sec">
          <div className="platform-dash-section-head">
            <span
              className="platform-dash-section-icon blue"
              aria-hidden="true"
            >
              <TrendingUpIcon size={15} />
            </span>
            <h3 className="platform-dash-section-title">
              Platform Analytics &amp; Distribution
            </h3>
          </div>

          <div className="platform-dash-charts-grid">

            {revenueTrendData.length > 0 && (
              <div
                className={`platform-dash-chart-card ${lastOddSecondaryChartId === "revenueTrend"
                  ? "platform-dash-chart-wide"
                  : ""
                  }`}
              >
                <div className="platform-dash-chart-head">
                  <div>
                    <h4 className="platform-dash-chart-title">
                      Monthly Revenue &amp; Invoiced Volume
                    </h4>
                    <p className="platform-dash-chart-sub">
                      Collected vs billed invoice amounts across issued
                      months
                    </p>
                  </div>
                  <div className="platform-dash-chart-legend-inline">
                    <span className="platform-dash-inline-key">
                      <span
                        className="platform-dash-legend-dot"
                        style={{ backgroundColor: "#10b981" }}
                      />
                      Collected
                    </span>
                    <span className="platform-dash-inline-key">
                      <span
                        className="platform-dash-legend-dot"
                        style={{ backgroundColor: "#6366f1" }}
                      />
                      Billed
                    </span>
                    <span className="platform-dash-chart-pill">
                      INR (₹)
                    </span>
                  </div>
                </div>

                <div className="platform-dash-bar-box">
                  <ResponsiveContainer width="100%" height={235}>
                    <BarChart
                      data={revenueTrendData}
                      margin={{ top: 10, right: 14, left: 0, bottom: 2 }}
                    >
                      <defs>
                        <linearGradient
                          id="revCollectedGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                        <linearGradient
                          id="revBilledGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#818cf8" />
                          <stop offset="100%" stopColor="#4f46e5" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridStroke}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: axisTickFill, fontSize: 11.5 }}
                        axisLine={{ stroke: axisLineStroke }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatCompactInr}
                        tick={{ fill: axisTickFill, fontSize: 11.5 }}
                        axisLine={false}
                        tickLine={false}
                        width={60}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                        content={
                          <DashboardChartTooltip
                            valueFormatter={(item) =>
                              formatFullInr(Number(item.value ?? 0))
                            }
                          />
                        }
                      />
                      <Bar
                        dataKey="billed"
                        name="Billed Total"
                        fill="url(#revBilledGrad)"
                        radius={[7, 7, 0, 0]}
                        maxBarSize={32}
                      />
                      <Bar
                        dataKey="collected"
                        name="Collected Revenue"
                        fill="url(#revCollectedGrad)"
                        radius={[7, 7, 0, 0]}
                        maxBarSize={32}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {totalSubscriptionSlices > 0 && (
              <div
                className={`platform-dash-chart-card ${lastOddSecondaryChartId === "subscriptionDist"
                  ? "platform-dash-chart-wide"
                  : ""
                  }`}
              >
                <div className="platform-dash-chart-head">
                  <div>
                    <h4 className="platform-dash-chart-title">
                      Subscription Distribution
                    </h4>
                    <p className="platform-dash-chart-sub">
                      Active, trialing, and expired tenant billing states
                    </p>
                  </div>
                  <span className="platform-dash-chart-pill">
                    {totalSubscriptionSlices} total
                  </span>
                </div>

                <div className="platform-dash-donut-layout">
                  <div className="platform-dash-donut-box">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={subscriptionChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={84}
                          paddingAngle={3}
                          stroke="none"
                        >
                          {subscriptionChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<DashboardChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="platform-dash-donut-center">
                      <span className="platform-dash-donut-pct">
                        {kpiDerived.activeSubRate}%
                      </span>
                      <span className="platform-dash-donut-caption">
                        Active share
                      </span>
                    </div>
                  </div>

                  <div className="platform-dash-legend-list">
                    {subscriptionChartData.map((item) => {
                      const share =
                        totalSubscriptionSlices > 0
                          ? Math.round(
                            (item.value / totalSubscriptionSlices) * 100
                          )
                          : 0;
                      return (
                        <div
                          key={item.name}
                          className="platform-dash-legend-row"
                        >
                          <div className="platform-dash-legend-meta">
                            <span
                              className="platform-dash-legend-dot"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="platform-dash-legend-name">
                              {item.name}
                            </span>
                            <span className="platform-dash-legend-val">
                              {item.value}{" "}
                              <small className="platform-dash-legend-pct">
                                ({share}%)
                              </small>
                            </span>
                          </div>
                          <div className="platform-dash-legend-track">
                            <div
                              className="platform-dash-legend-fill"
                              style={{
                                width: `${share}%`,
                                backgroundColor: item.color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {hasFinancialChartData && (
              <div
                className={`platform-dash-chart-card ${lastOddSecondaryChartId === "financialComp"
                  ? "platform-dash-chart-wide"
                  : ""
                  }`}
              >
                <div className="platform-dash-chart-head">
                  <div>
                    <h4 className="platform-dash-chart-title">
                      Revenue, Pipeline &amp; Net Composition
                    </h4>
                    <p className="platform-dash-chart-sub">
                      Live INR comparison across billing, pipeline MRR,
                      and expenses
                    </p>
                  </div>
                  <span className="platform-dash-chart-pill">INR (₹)</span>
                </div>

                <div className="platform-dash-bar-box">
                  <ResponsiveContainer width="100%" height={225}>
                    <BarChart
                      data={financialChartData}
                      margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="gradRev"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#818cf8" />
                          <stop offset="100%" stopColor="#4f46e5" />
                        </linearGradient>
                        <linearGradient
                          id="gradMrr"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="100%" stopColor="#0284c7" />
                        </linearGradient>
                        <linearGradient
                          id="gradExp"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#fbbf24" />
                          <stop offset="100%" stopColor="#d97706" />
                        </linearGradient>
                        <linearGradient
                          id="gradNet"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#059669" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridStroke}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: axisTickFill, fontSize: 12 }}
                        axisLine={{ stroke: axisLineStroke }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatCompactInr}
                        tick={{ fill: axisTickFill, fontSize: 11.5 }}
                        axisLine={false}
                        tickLine={false}
                        width={62}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                        content={
                          <DashboardChartTooltip
                            valueFormatter={(item) =>
                              item.payload?.formatted ??
                              formatFullInr(Number(item.value ?? 0))
                            }
                          />
                        }
                      />
                      <Bar
                        dataKey="amount"
                        name="Amount"
                        radius={[8, 8, 0, 0]}
                        maxBarSize={48}
                      >
                        {financialChartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={`url(#${entry.gradId})`}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {canViewAnalytics &&
              (industryChartData.length > 0 ||
                analyticsError ||
                analytics ||
                loading) && (
                <div className="platform-dash-chart-card platform-dash-chart-wide platform-dash-industry-card">
                  <div className="platform-dash-chart-head">
                    <div>
                      <h4 className="platform-dash-chart-title">
                        Tenants &amp; Prospects by Industry Vertical
                      </h4>
                      <p className="platform-dash-chart-sub">
                        Live multi-industry breakdown from platform analytics
                      </p>
                    </div>
                    <div className="platform-dash-chart-legend-inline">
                      <span className="platform-dash-inline-key">
                        <span
                          className="platform-dash-legend-dot"
                          style={{ backgroundColor: "#8b5cf6" }}
                        />
                        Registered
                      </span>
                      <span className="platform-dash-inline-key">
                        <span
                          className="platform-dash-legend-dot"
                          style={{ backgroundColor: "#22d3ee" }}
                        />
                        Active
                      </span>
                      <span className="platform-dash-inline-key">
                        <span
                          className="platform-dash-legend-dot"
                          style={{ backgroundColor: "#10b981" }}
                        />
                        Prospects
                      </span>
                      {industryChartData.length > 0 && (
                        <span className="platform-dash-chart-pill">
                          {industryChartData.length} industries
                        </span>
                      )}
                    </div>
                  </div>

                  {loading && !analytics && !analyticsError ? (
                    <div className="platform-dash-growth-state">
                      <div className="platform-spinner" />
                      <span>Loading industry distribution...</span>
                    </div>
                  ) : analyticsError && !analytics ? (
                    <div className="platform-dash-growth-state error">
                      <span>{analyticsError}</span>
                      <button
                        type="button"
                        className="platform-btn platform-dash-growth-retry"
                        onClick={loadInitial}
                      >
                        Retry
                      </button>
                    </div>
                  ) : industryChartData.length > 0 ? (
                    <div className="platform-dash-bar-box platform-dash-industry-box">
                      <ResponsiveContainer
                        width="100%"
                        height={industryChartHeight}
                      >
                        <BarChart
                          layout="vertical"
                          data={industryChartData}
                          barGap={4}
                          barCategoryGap="24%"
                          margin={{ top: 6, right: 34, left: 6, bottom: 2 }}
                        >
                          <defs>
                            <linearGradient
                              id="indRegGrad"
                              x1="0"
                              y1="0"
                              x2="1"
                              y2="0"
                            >
                              <stop offset="0%" stopColor="#7c3aed" />
                              <stop offset="100%" stopColor="#a78bfa" />
                            </linearGradient>
                            <linearGradient
                              id="indActGrad"
                              x1="0"
                              y1="0"
                              x2="1"
                              y2="0"
                            >
                              <stop offset="0%" stopColor="#0891b2" />
                              <stop offset="100%" stopColor="#22d3ee" />
                            </linearGradient>
                            <linearGradient
                              id="indProsGrad"
                              x1="0"
                              y1="0"
                              x2="1"
                              y2="0"
                            >
                              <stop offset="0%" stopColor="#059669" />
                              <stop offset="100%" stopColor="#34d399" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 4"
                            stroke={gridStroke}
                            horizontal={false}
                          />
                          <XAxis
                            type="number"
                            allowDecimals={false}
                            domain={[
                              0,
                              (dataMax: number) =>
                                Math.max(
                                  2,
                                  dataMax +
                                  Math.max(1, Math.ceil(dataMax * 0.16))
                                ),
                            ]}
                            tick={{ fill: axisTickFill, fontSize: 11.5 }}
                            tickMargin={6}
                            axisLine={{ stroke: axisLineStroke }}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={154}
                            tick={{
                              fill: isDark ? "#e2e8f0" : "#334155",
                              fontSize: 12.5,
                              fontWeight: 600,
                            }}
                            tickMargin={8}
                            axisLine={{ stroke: axisLineStroke }}
                            tickLine={false}
                          />
                          <Tooltip
                            cursor={{
                              fill: isDark
                                ? "rgba(139, 92, 246, 0.1)"
                                : "rgba(99, 102, 241, 0.08)",
                              radius: 8,
                            }}
                            content={<IndustryChartTooltip />}
                          />
                          <Bar
                            dataKey="registered"
                            name="Registered"
                            fill="url(#indRegGrad)"
                            radius={[0, 6, 6, 0]}
                            barSize={12}
                            isAnimationActive={!prefersReducedMotion}
                            animationDuration={450}
                          >
                            <LabelList
                              dataKey="registered"
                              position="right"
                              offset={8}
                              formatter={(val: unknown) =>
                                String(Number(val ?? 0))
                              }
                              fill={isDark ? "#dce5f5" : "#334155"}
                              fontSize={11.5}
                              fontWeight={600}
                            />
                          </Bar>
                          <Bar
                            dataKey="active"
                            name="Active"
                            fill="url(#indActGrad)"
                            radius={[0, 6, 6, 0]}
                            barSize={12}
                            isAnimationActive={!prefersReducedMotion}
                            animationDuration={450}
                          >
                            <LabelList
                              dataKey="active"
                              position="right"
                              offset={8}
                              formatter={(val: unknown) =>
                                String(Number(val ?? 0))
                              }
                              fill={isDark ? "#dce5f5" : "#334155"}
                              fontSize={11.5}
                              fontWeight={600}
                            />
                          </Bar>
                          <Bar
                            dataKey="prospects"
                            name="Prospects"
                            fill="url(#indProsGrad)"
                            radius={[0, 6, 6, 0]}
                            barSize={12}
                            isAnimationActive={!prefersReducedMotion}
                            animationDuration={450}
                          >
                            <LabelList
                              dataKey="prospects"
                              position="right"
                              offset={8}
                              formatter={(val: unknown) =>
                                String(Number(val ?? 0))
                              }
                              fill={isDark ? "#dce5f5" : "#334155"}
                              fontSize={11.5}
                              fontWeight={600}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="platform-dash-chart-empty">
                      No industry tenant or prospect distribution recorded yet.
                    </div>
                  )}
                </div>
              )}
          </div>
        </section>
      )}
    </div>
  );
}
