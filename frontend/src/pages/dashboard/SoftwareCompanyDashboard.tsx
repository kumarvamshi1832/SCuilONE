import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { useTheme } from "../../context/ThemeContext";

/* ─── Real Dynamic API Services ─── */
import { getSoftwareProjects } from "../../services/softwareProjectService";
import { getSoftwareRequirements } from "../../services/softwareRequirementService";
import { getSoftwareEstimates } from "../../services/softwareEstimateService";
import { getSoftwareContracts } from "../../services/softwareContractService";
import { getSoftwareSprints } from "../../services/softwareSprintService";
import { getAccounts } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
import { getActivities } from "../../services/activityService";
import { getMyProfile } from "../../services/profileService";

/* ─── Domain Types ─── */
import type { SoftwareProject } from "../../types/softwareProject";
import type { SoftwareRequirement } from "../../types/softwareRequirement";
import type { SoftwareEstimate } from "../../types/softwareEstimate";
import type { SoftwareContract } from "../../types/softwareContract";
import type { SoftwareSprint } from "../../types/softwareSprint";
import type { Account } from "../../types/account";
import type { Deal } from "../../types/deal";
import type { Activity } from "../../types/activity";

import "./SoftwareCompanyDashboard.css";

/* ─── Format Helpers ─── */
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const formatCurrencyINR = (val: number): string => {
  return INR.format(val);
};

const formatDateShort = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
};

export default function SoftwareCompanyDashboard() {
  const { industry } = useParams();
  const currentIndustry = industry || "software-company";
  const basePath = `/${currentIndustry}`;

  /* ─── User Profile Greeting ─── */
  const [profileName, setProfileName] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (stored) {
        const u = JSON.parse(stored);
        const name = u.full_name || u.first_name || u.name;
        if (name && name !== "User") return name;
      }
    } catch {}
    return "";
  });

  /* ─── Fully Dynamic Business State (Zero Mock/Proto Data) ─── */
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [requirements, setRequirements] = useState<SoftwareRequirement[]>([]);
  const [estimates, setEstimates] = useState<SoftwareEstimate[]>([]);
  const [contracts, setContracts] = useState<SoftwareContract[]>([]);
  const [sprints, setSprints] = useState<SoftwareSprint[]>([]);

  // Shared CRM entities
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  /* ─── Real Dynamic API Data Loader ─── */
  const loadAllData = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [
        profRes,
        projRes,
        reqRes,
        estRes,
        contRes,
        sprRes,
        accRes,
        dealRes,
        actRes,
      ] = await Promise.allSettled([
        getMyProfile(),
        getSoftwareProjects(),
        getSoftwareRequirements(),
        getSoftwareEstimates(),
        getSoftwareContracts(),
        getSoftwareSprints(),
        getAccounts(),
        getDeals(),
        getActivities(),
      ]);

      // Profile
      if (profRes.status === "fulfilled" && profRes.value) {
        const p = profRes.value;
        const name = p.full_name || (p as any).first_name;
        if (name && name !== "User") {
          setProfileName(name);
        }
      }

      // Software entities
      if (projRes.status === "fulfilled" && Array.isArray(projRes.value)) {
        setProjects(projRes.value);
      }
      if (reqRes.status === "fulfilled" && Array.isArray(reqRes.value)) {
        setRequirements(reqRes.value);
      }
      if (estRes.status === "fulfilled" && Array.isArray(estRes.value)) {
        setEstimates(estRes.value);
      }
      if (contRes.status === "fulfilled" && Array.isArray(contRes.value)) {
        setContracts(contRes.value);
      }
      if (sprRes.status === "fulfilled" && Array.isArray(sprRes.value)) {
        setSprints(sprRes.value);
      }

      // Shared CRM entities
      if (accRes.status === "fulfilled" && Array.isArray(accRes.value)) {
        setAccounts(accRes.value);
      }
      if (dealRes.status === "fulfilled" && Array.isArray(dealRes.value)) {
        setDeals(dealRes.value);
      }
      if (actRes.status === "fulfilled" && Array.isArray(actRes.value)) {
        setActivities(actRes.value);
      }

      // Report any rejected critical software services
      const rejectedServices: string[] = [];
      if (projRes.status === "rejected") rejectedServices.push("Projects");
      if (reqRes.status === "rejected") rejectedServices.push("Requirements");
      if (estRes.status === "rejected") rejectedServices.push("Estimates");
      if (contRes.status === "rejected") rejectedServices.push("Contracts");
      if (sprRes.status === "rejected") rejectedServices.push("Sprints");

      if (rejectedServices.length > 0) {
        setApiError(
          `Notice: Could not load latest records for: ${rejectedServices.join(", ")}. Displaying available data.`
        );
      }
    } catch (err: any) {
      setApiError(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  /* ─── Metric Calculations Derived Strictly from Actual API Responses ─── */
  const totalProjectsCount = projects.length;
  const activeProjectsCount = projects.filter((p) => p.status === "Active").length;
  const requirementsCount = requirements.length;
  const estimatesCount = estimates.length;
  const contractsCount = contracts.length;
  const sprintsCount = sprints.length;

  const activeClientsCount = accounts.filter(
    (a) => !a.status || a.status.toLowerCase() === "active"
  ).length;

  const openDealsCount = deals.filter((d) => {
    const s = String(d.stage || "").toLowerCase();
    return !s.includes("won") && !s.includes("lost");
  }).length;

  const wonRevenueNumber = useMemo(() => {
    return deals
      .filter((d) => String(d.stage || "").toLowerCase().includes("won"))
      .reduce((acc, d) => acc + (Number(d.amount) || 0), 0);
  }, [deals]);

  const wonRevenueTotal = formatCurrencyINR(wonRevenueNumber);

  const pendingActivitiesCount = activities.filter((a) => {
    const st = String(a.status || "").toLowerCase();
    return st === "pending" || st === "in progress" || st === "scheduled";
  }).length;

  const completedActivitiesCount = activities.filter((a) => {
    return String(a.status || "").toLowerCase() === "completed";
  }).length;

  const overdueActivitiesCount = activities.filter((a) => {
    const isCompleted = String(a.status || "").toLowerCase() === "completed";
    return !isCompleted && a.due_date && new Date(a.due_date) < new Date();
  }).length;

  /* ─── Donut Chart Distributions (Calculated Strictly from Live Data) ─── */
  const projectStatusData = useMemo(() => {
    const counts: Record<string, number> = {
      Active: 0,
      Planned: 0,
      "On Hold": 0,
      Completed: 0,
      Cancelled: 0,
    };
    projects.forEach((p) => {
      const st = p.status || "Planned";
      if (st in counts) {
        counts[st] = (counts[st] ?? 0) + 1;
      }
    });

    const total = projects.length;
    const colorMap: Record<string, string> = {
      Active: "#00b4d8",
      Planned: "#10b981",
      "On Hold": "#f59e0b",
      Completed: "#a855f7",
      Cancelled: "#ef4444",
    };

    return ["Active", "Planned", "On Hold", "Completed", "Cancelled"].map((name) => {
      const count = counts[name] ?? 0;
      return {
        name,
        count,
        color: colorMap[name] || "#64748b",
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : "0.0",
      };
    });
  }, [projects]);

  const requirementsStatusData = useMemo(() => {
    const counts: Record<string, number> = {
      New: 0,
      Discovery: 0,
      Estimating: 0,
      Proposal: 0,
      Approved: 0,
      Others: 0,
    };
    requirements.forEach((r) => {
      const st = r.status || "New";
      if (st in counts && st !== "Others") {
        counts[st] = (counts[st] ?? 0) + 1;
      } else {
        counts["Others"] = (counts["Others"] ?? 0) + 1;
      }
    });

    const total = requirements.length;
    const colorMap: Record<string, string> = {
      New: "#3b82f6",
      Discovery: "#06b6d4",
      Estimating: "#eab308",
      Proposal: "#6366f1",
      Approved: "#10b981",
      Others: "#64748b",
    };

    const statusKeys =
      (counts.Others ?? 0) > 0
        ? ["New", "Discovery", "Estimating", "Proposal", "Approved", "Others"]
        : ["New", "Discovery", "Estimating", "Proposal", "Approved"];

    return statusKeys.map((name) => {
      const count = counts[name] ?? 0;
      return {
        name,
        count,
        color: colorMap[name] || "#64748b",
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : "0.0",
      };
    });
  }, [requirements]);

  const estimatesStatusData = useMemo(() => {
    const counts: Record<string, number> = {
      Draft: 0,
      Sent: 0,
      Accepted: 0,
      Rejected: 0,
      Expired: 0,
    };
    estimates.forEach((e) => {
      const st = e.status || "Draft";
      if (st in counts) {
        counts[st] = (counts[st] ?? 0) + 1;
      }
    });

    const total = estimates.length;
    const colorMap: Record<string, string> = {
      Draft: "#3b82f6",
      Sent: "#10b981",
      Accepted: "#f59e0b",
      Rejected: "#a855f7",
      Expired: "#ef4444",
    };

    return ["Draft", "Sent", "Accepted", "Rejected", "Expired"].map((name) => {
      const count = counts[name] ?? 0;
      return {
        name,
        count,
        color: colorMap[name] || "#06b6d4",
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : "0.0",
      };
    });
  }, [estimates]);

  /* ─── Recent Items (Real Database Records Only) ─── */
  const recentProjects = useMemo(() => {
    return projects.slice(0, 5);
  }, [projects]);

  const recentRequirements = useMemo(() => {
    return requirements.slice(0, 5);
  }, [requirements]);

  const recentEstimates = useMemo(() => {
    return estimates.slice(0, 5);
  }, [estimates]);

  /* ─── Client / Requirement Resolvers (Zero Fabricated Names) ─── */
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const dealMap = useMemo(() => new Map(deals.map((d) => [d.id, d.name])), [deals]);
  const contractMap = useMemo(() => new Map(contracts.map((c) => [c.id, c])), [contracts]);
  const reqMap = useMemo(() => new Map(requirements.map((r) => [r.id, r.title])), [requirements]);

  const getClientNameForProject = (p: SoftwareProject) => {
    if (p.notes && p.notes.includes("Client: ")) {
      return p.notes.replace("Client: ", "");
    }
    if (p.software_contract_id && contractMap.has(p.software_contract_id)) {
      const cont = contractMap.get(p.software_contract_id);
      if (cont?.account_id && accountMap.has(cont.account_id)) {
        return accountMap.get(cont.account_id) || "—";
      }
    }
    if (p.deal_id && dealMap.has(p.deal_id)) {
      return dealMap.get(p.deal_id) || "—";
    }
    return "Direct / Internal";
  };

  const getClientNameForRequirement = (r: SoftwareRequirement) => {
    if (r.notes && r.notes.includes("Client: ")) {
      return r.notes.replace("Client: ", "");
    }
    if (r.account_id && accountMap.has(r.account_id)) return accountMap.get(r.account_id) || "—";
    if (r.deal_id && dealMap.has(r.deal_id)) return dealMap.get(r.deal_id) || "—";
    return "Direct / Internal";
  };

  const getRequirementTitleForEstimate = (est: SoftwareEstimate) => {
    if (est.software_requirement_id && reqMap.has(est.software_requirement_id)) {
      return reqMap.get(est.software_requirement_id) || est.title || "—";
    }
    return est.title || "—";
  };

  const currentDateStr = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const { theme } = useTheme();
  const isDark = theme === "dark";

  const projectDotColors = ["#00b4d8", "#f43f5e", "#eab308", "#10b981", "#ef4444"];

  // Empty placeholder ring data for zero datasets (theme-aware)
  const emptyPlaceholderColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0";
  const emptyPlaceholderRing = useMemo(
    () => [{ name: "No Data", count: 1, color: emptyPlaceholderColor }],
    [emptyPlaceholderColor]
  );

  return (
    <div className={`sw-dashboard-container ${theme}`}>
      {/* ─── Top Header ─── */}
      <div className="sw-dashboard-header">
        <div className="sw-header-title-box">
          <h1 className="sw-welcome-title">
            {profileName ? `Welcome back, ${profileName}!` : "Welcome back!"}
          </h1>
          <p className="sw-welcome-subtitle">Here's an overview of your software business.</p>
        </div>
        <div className="sw-header-actions" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <Link
            to={`${basePath}/software-time-tracking`}
            className="sw-date-filter-btn"
            style={{ textDecoration: "none", color: "inherit", fontWeight: 600 }}
          >
            ⏱ Time Tracking
          </Link>
          <Link
            to={`${basePath}/software-invoices`}
            className="sw-date-filter-btn"
            style={{ textDecoration: "none", color: "inherit", fontWeight: 600 }}
          >
            💳 Invoices & Billing
          </Link>
          <Link
            to={`${basePath}/software-delivery-reports`}
            className="sw-date-filter-btn"
            style={{ textDecoration: "none", color: "inherit", fontWeight: 600 }}
          >
            📊 Delivery Reports
          </Link>
          <button type="button" className="sw-date-filter-btn" title="Current session date">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="sw-btn-icon"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{currentDateStr}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="sw-chevron-icon">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── API Notification / Error Banner ─── */}
      {apiError && (
        <div className="sw-alert-banner sw-alert-warning">
          <span>{apiError}</span>
          <button
            type="button"
            className="sw-date-filter-btn"
            style={{ padding: "4px 10px", fontSize: "0.76rem" }}
            onClick={() => void loadAllData()}
          >
            Retry
          </button>
        </div>
      )}

      {/* ─── Row 1: Software Delivery KPI Cards ─── */}
      <div className="sw-kpi-grid">
        {/* Total Projects */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-blue-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#00b4d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : totalProjectsCount}</div>
          </div>
          <div className="sw-kpi-label">Total Projects</div>
          <Link to={`${basePath}/software-projects`} className="sw-kpi-link">
            View Projects &gt;
          </Link>
        </div>

        {/* Active Projects */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-green-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : activeProjectsCount}</div>
          </div>
          <div className="sw-kpi-label">Active Projects</div>
          <Link to={`${basePath}/software-projects`} className="sw-kpi-link">
            View Projects &gt;
          </Link>
        </div>

        {/* Requirements */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-purple-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : requirementsCount}</div>
          </div>
          <div className="sw-kpi-label">Requirements</div>
          <Link to={`${basePath}/software-requirements`} className="sw-kpi-link">
            View Requirements &gt;
          </Link>
        </div>

        {/* Estimates */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-indigo-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <line x1="8" y1="6" x2="16" y2="6" />
                <line x1="16" y1="14" x2="16" y2="18" />
                <path d="M16 10h.01" />
                <path d="M12 10h.01" />
                <path d="M8 10h.01" />
                <path d="M12 14h.01" />
                <path d="M8 14h.01" />
                <path d="M12 18h.01" />
                <path d="M8 18h.01" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : estimatesCount}</div>
          </div>
          <div className="sw-kpi-label">Estimates</div>
          <Link to={`${basePath}/software-estimates`} className="sw-kpi-link">
            View Estimates &gt;
          </Link>
        </div>

        {/* Contracts */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-red-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : contractsCount}</div>
          </div>
          <div className="sw-kpi-label">Contracts</div>
          <Link to={`${basePath}/software-contracts`} className="sw-kpi-link">
            View Contracts &gt;
          </Link>
        </div>

        {/* Sprints */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-teal-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : sprintsCount}</div>
          </div>
          <div className="sw-kpi-label">Sprints</div>
          <Link to={`${basePath}/software-sprints`} className="sw-kpi-link">
            View Sprints &gt;
          </Link>
        </div>
      </div>

      {/* ─── Row 2: Sales & CRM KPI Cards ─── */}
      <div className="sw-kpi-grid">
        {/* Active Clients */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-blue-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : activeClientsCount}</div>
          </div>
          <div className="sw-kpi-label">Active Clients</div>
        </div>

        {/* Open Deals */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-purple-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 2.5 5 2.5 5 5a2.5 2.5 0 0 1-5 0" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : openDealsCount}</div>
          </div>
          <div className="sw-kpi-label">Open Deals</div>
        </div>

        {/* Won Revenue */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-emerald-tint">
              <span className="sw-currency-symbol">₹</span>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value sw-revenue-value">{loading ? "..." : wonRevenueTotal}</div>
          </div>
          <div className="sw-kpi-label">Won Revenue</div>
        </div>

        {/* Pending Activities */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-amber-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : pendingActivitiesCount}</div>
          </div>
          <div className="sw-kpi-label">Pending Activities</div>
        </div>

        {/* Completed Activities */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-green-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : completedActivitiesCount}</div>
          </div>
          <div className="sw-kpi-label">Completed Activities</div>
        </div>

        {/* Overdue Activities */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-red-tint">
              <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">{loading ? "..." : overdueActivitiesCount}</div>
          </div>
          <div className="sw-kpi-label">Overdue Activities</div>
        </div>
      </div>

      {/* ─── Middle Section: 3 Donut Charts ─── */}
      <div className="sw-charts-grid">
        {/* Chart 1: Software Project Status */}
        <div className="sw-chart-card">
          <div className="sw-chart-card-header">
            <h2 className="sw-chart-title">Software Project Status</h2>
            <div className="sw-select-filter">
              <span>All Projects</span>
            </div>
          </div>
          <div className="sw-donut-container">
            <div className="sw-donut-wrapper">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={
                      totalProjectsCount > 0
                        ? projectStatusData.filter((d) => d.count > 0)
                        : emptyPlaceholderRing
                    }
                    dataKey="count"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={totalProjectsCount > 0 ? 3 : 0}
                    stroke="none"
                  >
                    {totalProjectsCount > 0 ? (
                      projectStatusData
                        .filter((d) => d.count > 0)
                        .map((entry) => <Cell key={entry.name} fill={entry.color} />)
                    ) : (
                      <Cell fill={emptyPlaceholderColor} />
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="sw-donut-center-label">
                <div className="sw-donut-center-num">{totalProjectsCount}</div>
                <div className="sw-donut-center-text">Projects</div>
              </div>
            </div>
            <div className="sw-donut-legend">
              {projectStatusData.map((item) => (
                <div key={item.name} className="sw-legend-item">
                  <div className="sw-legend-left">
                    <span className="sw-legend-dot" style={{ backgroundColor: item.color }} />
                    <span className="sw-legend-name">{item.name}</span>
                  </div>
                  <div className="sw-legend-right">
                    {item.count} ({item.pct}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 2: Requirements by Status */}
        <div className="sw-chart-card">
          <div className="sw-chart-card-header">
            <h2 className="sw-chart-title">Requirements by Status</h2>
            <div className="sw-select-filter">
              <span>All Requirements</span>
            </div>
          </div>
          <div className="sw-donut-container">
            <div className="sw-donut-wrapper">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={
                      requirementsCount > 0
                        ? requirementsStatusData.filter((d) => d.count > 0)
                        : emptyPlaceholderRing
                    }
                    dataKey="count"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={requirementsCount > 0 ? 3 : 0}
                    stroke="none"
                  >
                    {requirementsCount > 0 ? (
                      requirementsStatusData
                        .filter((d) => d.count > 0)
                        .map((entry) => <Cell key={entry.name} fill={entry.color} />)
                    ) : (
                      <Cell fill={emptyPlaceholderColor} />
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="sw-donut-center-label">
                <div className="sw-donut-center-num">{requirementsCount}</div>
                <div className="sw-donut-center-text">Requirements</div>
              </div>
            </div>
            <div className="sw-donut-legend">
              {requirementsStatusData.map((item) => (
                <div key={item.name} className="sw-legend-item">
                  <div className="sw-legend-left">
                    <span className="sw-legend-dot" style={{ backgroundColor: item.color }} />
                    <span className="sw-legend-name">{item.name}</span>
                  </div>
                  <div className="sw-legend-right">
                    {item.count} ({item.pct}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 3: Estimates by Status */}
        <div className="sw-chart-card">
          <div className="sw-chart-card-header">
            <h2 className="sw-chart-title">Estimates by Status</h2>
            <div className="sw-select-filter">
              <span>All Estimates</span>
            </div>
          </div>
          <div className="sw-donut-container">
            <div className="sw-donut-wrapper">
              <ResponsiveContainer width="100%" height={170}>
                <PieChart>
                  <Pie
                    data={
                      estimatesCount > 0
                        ? estimatesStatusData.filter((d) => d.count > 0)
                        : emptyPlaceholderRing
                    }
                    dataKey="count"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={estimatesCount > 0 ? 3 : 0}
                    stroke="none"
                  >
                    {estimatesCount > 0 ? (
                      estimatesStatusData
                        .filter((d) => d.count > 0)
                        .map((entry) => <Cell key={entry.name} fill={entry.color} />)
                    ) : (
                      <Cell fill={emptyPlaceholderColor} />
                    )}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="sw-donut-center-label">
                <div className="sw-donut-center-num">{estimatesCount}</div>
                <div className="sw-donut-center-text">Estimates</div>
              </div>
            </div>
            <div className="sw-donut-legend">
              {estimatesStatusData.map((item) => (
                <div key={item.name} className="sw-legend-item">
                  <div className="sw-legend-left">
                    <span className="sw-legend-dot" style={{ backgroundColor: item.color }} />
                    <span className="sw-legend-name">{item.name}</span>
                  </div>
                  <div className="sw-legend-right">
                    {item.count} ({item.pct}%)
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Bottom Section: 3 Compact Tables (Live Data Only) ─── */}
      <div className="sw-tables-grid">
        {/* Table 1: Recent Software Projects */}
        <div className="sw-table-card">
          <div className="sw-table-card-header">
            <h2 className="sw-table-card-title">Recent Software Projects</h2>
            <Link to={`${basePath}/software-projects`} className="sw-view-all-link">
              View All
            </Link>
          </div>
          <div className="sw-table-responsive">
            <table className="sw-compact-table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Start Date</th>
                </tr>
              </thead>
              <tbody>
                {recentProjects.map((p, idx) => {
                  const dotColor = projectDotColors[idx % projectDotColors.length];
                  const st = p.status || "Planned";
                  const badgeClass =
                    st === "Active"
                      ? "pill-active"
                      : st === "Planned"
                      ? "pill-planned"
                      : st === "On Hold"
                      ? "pill-hold"
                      : st === "Completed"
                      ? "pill-completed"
                      : "pill-cancelled";

                  return (
                    <tr key={p.id}>
                      <td className="sw-cell-title">
                        <span className="sw-project-dot" style={{ backgroundColor: dotColor }} />
                        <span className="sw-title-text" title={p.name}>
                          {p.name}
                        </span>
                      </td>
                      <td className="sw-cell-client">{getClientNameForProject(p)}</td>
                      <td>
                        <span className={`sw-status-pill ${badgeClass}`}>{st}</span>
                      </td>
                      <td className="sw-cell-date">{formatDateShort(p.start_date)}</td>
                    </tr>
                  );
                })}
                {recentProjects.length === 0 && (
                  <tr>
                    <td colSpan={4} className="sw-empty-cell">
                      No software projects found.
                      <Link to={`${basePath}/software-projects`}>Create a Project</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Recent Requirements */}
        <div className="sw-table-card">
          <div className="sw-table-card-header">
            <h2 className="sw-table-card-title">Recent Requirements</h2>
            <Link to={`${basePath}/software-requirements`} className="sw-view-all-link">
              View All
            </Link>
          </div>
          <div className="sw-table-responsive">
            <table className="sw-compact-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Client</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentRequirements.map((r) => {
                  const st = r.status || "New";
                  const badgeClass =
                    st === "Discovery"
                      ? "pill-discovery"
                      : st === "Estimating"
                      ? "pill-estimating"
                      : st === "New"
                      ? "pill-new"
                      : st === "Proposal"
                      ? "pill-proposal"
                      : st === "Approved"
                      ? "pill-approved"
                      : "pill-default";

                  return (
                    <tr key={r.id}>
                      <td className="sw-cell-title">
                        <span className="sw-title-text" title={r.title}>
                          {r.title}
                        </span>
                      </td>
                      <td className="sw-cell-client">{getClientNameForRequirement(r)}</td>
                      <td>
                        <span className={`sw-status-pill ${badgeClass}`}>{st}</span>
                      </td>
                    </tr>
                  );
                })}
                {recentRequirements.length === 0 && (
                  <tr>
                    <td colSpan={3} className="sw-empty-cell">
                      No software requirements found.
                      <Link to={`${basePath}/software-requirements`}>Create a Requirement</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 3: Recent Estimates */}
        <div className="sw-table-card">
          <div className="sw-table-card-header">
            <h2 className="sw-table-card-title">Recent Estimates</h2>
            <Link to={`${basePath}/software-estimates`} className="sw-view-all-link">
              View All
            </Link>
          </div>
          <div className="sw-table-responsive">
            <table className="sw-compact-table">
              <thead>
                <tr>
                  <th>Estimate No</th>
                  <th>Requirement</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentEstimates.map((e) => {
                  const st = e.status || "Draft";
                  const badgeClass =
                    st === "Sent"
                      ? "pill-sent"
                      : st === "Draft"
                      ? "pill-draft"
                      : st === "Accepted"
                      ? "pill-accepted"
                      : st === "Rejected"
                      ? "pill-rejected"
                      : "pill-expired";

                  return (
                    <tr key={e.id}>
                      <td className="sw-cell-code">{e.estimate_number || e.id.slice(0, 12)}</td>
                      <td className="sw-cell-title">
                        <span className="sw-title-text" title={e.title}>
                          {getRequirementTitleForEstimate(e)}
                        </span>
                      </td>
                      <td className="sw-cell-amount">
                        {formatCurrencyINR(Number(e.total_amount) || Number(e.subtotal) || 0)}
                      </td>
                      <td>
                        <span className={`sw-status-pill ${badgeClass}`}>{st}</span>
                      </td>
                    </tr>
                  );
                })}
                {recentEstimates.length === 0 && (
                  <tr>
                    <td colSpan={4} className="sw-empty-cell">
                      No software estimates found.
                      <Link to={`${basePath}/software-estimates`}>Create an Estimate</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
