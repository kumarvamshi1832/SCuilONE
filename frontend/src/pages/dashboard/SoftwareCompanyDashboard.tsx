import { useEffect, useState, useMemo, useCallback } from "react";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
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
import {
  clearSoftwareForbidden,
  extractBackendDetail,
} from "../../services/softwareRequestManager";

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

/* ─── Safe Array Extraction Helper ─── */
function safeExtractList<T = any>(val: any): T[] {
  if (Array.isArray(val)) return val;
  if (!val || typeof val !== "object") return [];
  if (Array.isArray(val.data)) return val.data;
  if (Array.isArray(val.items)) return val.items;
  if (Array.isArray(val.results)) return val.results;
  if (Array.isArray(val.records)) return val.records;
  if (Array.isArray(val.projects)) return val.projects;
  if (Array.isArray(val.requirements)) return val.requirements;
  if (Array.isArray(val.estimates)) return val.estimates;
  if (Array.isArray(val.contracts)) return val.contracts;
  if (Array.isArray(val.sprints)) return val.sprints;
  if (Array.isArray(val.accounts)) return val.accounts;
  if (Array.isArray(val.deals)) return val.deals;
  if (Array.isArray(val.activities)) return val.activities;
  return [];
}

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
  const location = useLocation();
  const navigate = useNavigate();
  const currentIndustry = industry || "software-company";
  const basePath = `/${currentIndustry}`;

  /* ─── Interactive Chart Navigation Handlers ─── */
  const handleNavigateProjects = useCallback((status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    navigate(`${basePath}/software-projects${query}`, {
      state: status ? { status } : undefined,
    });
  }, [navigate, basePath]);

  const handleNavigateRequirements = useCallback((status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    navigate(`${basePath}/software-requirements${query}`, {
      state: status ? { status } : undefined,
    });
  }, [navigate, basePath]);

  const handleNavigateEstimates = useCallback((status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    navigate(`${basePath}/software-estimates${query}`, {
      state: status ? { status } : undefined,
    });
  }, [navigate, basePath]);

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

  /* ─── Domain Record States ─── */
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [requirements, setRequirements] = useState<SoftwareRequirement[]>([]);
  const [estimates, setEstimates] = useState<SoftwareEstimate[]>([]);
  const [contracts, setContracts] = useState<SoftwareContract[]>([]);
  const [sprints, setSprints] = useState<SoftwareSprint[]>([]);

  // Granular Loading States
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [requirementsLoading, setRequirementsLoading] = useState(true);
  const [estimatesLoading, setEstimatesLoading] = useState(true);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [sprintsLoading, setSprintsLoading] = useState(true);
  const [sharedLoading, setSharedLoading] = useState(true);


  // 403 Forbidden Access Restricted States
  const [projectsForbidden, setProjectsForbidden] = useState<string | null>(null);
  const [requirementsForbidden, setRequirementsForbidden] = useState<string | null>(null);
  const [estimatesForbidden, setEstimatesForbidden] = useState<string | null>(null);
  const [contractsForbidden, setContractsForbidden] = useState<string | null>(null);
  const [sprintsForbidden, setSprintsForbidden] = useState<string | null>(null);

  // Error States (status code + message)
  const [projectsError, setProjectsError] = useState<{ status?: number; message: string } | null>(null);
  const [requirementsError, setRequirementsError] = useState<{ status?: number; message: string } | null>(null);
  const [estimatesError, setEstimatesError] = useState<{ status?: number; message: string } | null>(null);
  const [contractsError, setContractsError] = useState<{ status?: number; message: string } | null>(null);
  const [sprintsError, setSprintsError] = useState<{ status?: number; message: string } | null>(null);

  // Shared CRM entities
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const [apiError, setApiError] = useState<string | null>(null);

  /* ─── Real Dynamic API Data Loader ─── */
  const loadAllData = useCallback(async (forceRetry = true) => {

    setApiError(null);
    setProjectsLoading(true);
    setRequirementsLoading(true);
    setEstimatesLoading(true);
    setContractsLoading(true);
    setSprintsLoading(true);
    setSharedLoading(true);

    if (forceRetry) {
      clearSoftwareForbidden();
      setProjectsForbidden(null);
      setRequirementsForbidden(null);
      setEstimatesForbidden(null);
      setContractsForbidden(null);
      setSprintsForbidden(null);
      setProjectsError(null);
      setRequirementsError(null);
      setEstimatesError(null);
      setContractsError(null);
      setSprintsError(null);
    }

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
        getMyProfile().catch(() => null),
        getSoftwareProjects(undefined, { forceRetry }),
        getSoftwareRequirements(undefined, { forceRetry }),
        getSoftwareEstimates(undefined, { forceRetry }),
        getSoftwareContracts(undefined, { forceRetry }),
        getSoftwareSprints(undefined, { forceRetry }),
        getAccounts().catch(() => []),
        getDeals().catch(() => []),
        getActivities().catch(() => []),
      ]);

      // Profile Greeting
      if (profRes.status === "fulfilled" && profRes.value) {
        const p = profRes.value as any;
        const name = p.full_name || p.first_name || p.name;
        if (name && name !== "User") {
          setProfileName(name);
        }
      }

      const forbiddenModules: string[] = [];
      const errorModules: string[] = [];

      // 1. Software Projects
      setProjectsLoading(false);
      if (projRes.status === "fulfilled") {
        const list = safeExtractList<SoftwareProject>(projRes.value);
        setProjects(list);
        setProjectsForbidden(null);
        setProjectsError(null);
      } else {
        const err = projRes.reason;
        const status = err?.response?.status;
        const detail = extractBackendDetail(err) || "Failed to load software projects";
        if (status === 403 || err?.isCachedForbidden) {
          setProjectsForbidden(detail);
          setProjectsError({ status: 403, message: detail });
          forbiddenModules.push("Projects");
        } else if (status === 404) {
          setProjectsError({ status: 404, message: detail });
          errorModules.push("Projects (404)");
        } else {
          setProjectsError({ status: status || 500, message: detail });
          errorModules.push("Projects");
        }
      }

      // 2. Software Requirements
      setRequirementsLoading(false);
      if (reqRes.status === "fulfilled") {
        const list = safeExtractList<SoftwareRequirement>(reqRes.value);
        setRequirements(list);
        setRequirementsForbidden(null);
        setRequirementsError(null);
      } else {
        const err = reqRes.reason;
        const status = err?.response?.status;
        const detail = extractBackendDetail(err) || "Failed to load software requirements";
        if (status === 403 || err?.isCachedForbidden) {
          setRequirementsForbidden(detail);
          setRequirementsError({ status: 403, message: detail });
          forbiddenModules.push("Requirements");
        } else if (status === 404) {
          setRequirementsError({ status: 404, message: detail });
          errorModules.push("Requirements (404)");
        } else {
          setRequirementsError({ status: status || 500, message: detail });
          errorModules.push("Requirements");
        }
      }

      // 3. Software Estimates
      setEstimatesLoading(false);
      if (estRes.status === "fulfilled") {
        const list = safeExtractList<SoftwareEstimate>(estRes.value);
        setEstimates(list);
        setEstimatesForbidden(null);
        setEstimatesError(null);
      } else {
        const err = estRes.reason;
        const status = err?.response?.status;
        const detail = extractBackendDetail(err) || "Failed to load software estimates";
        if (status === 403 || err?.isCachedForbidden) {
          setEstimatesForbidden(detail);
          setEstimatesError({ status: 403, message: detail });
          forbiddenModules.push("Estimates");
        } else if (status === 404) {
          setEstimatesError({ status: 404, message: detail });
          errorModules.push("Estimates (404)");
        } else {
          setEstimatesError({ status: status || 500, message: detail });
          errorModules.push("Estimates");
        }
      }

      // 4. Software Contracts
      setContractsLoading(false);
      if (contRes.status === "fulfilled") {
        const list = safeExtractList<SoftwareContract>(contRes.value);
        setContracts(list);
        setContractsForbidden(null);
        setContractsError(null);
      } else {
        const err = contRes.reason;
        const status = err?.response?.status;
        const detail = extractBackendDetail(err) || "Failed to load software contracts";
        if (status === 403 || err?.isCachedForbidden) {
          setContractsForbidden(detail);
          setContractsError({ status: 403, message: detail });
          forbiddenModules.push("Contracts");
        } else if (status === 404) {
          setContractsError({ status: 404, message: detail });
          errorModules.push("Contracts (404)");
        } else {
          setContractsError({ status: status || 500, message: detail });
          errorModules.push("Contracts");
        }
      }

      // 5. Software Sprints
      setSprintsLoading(false);
      if (sprRes.status === "fulfilled") {
        const list = safeExtractList<SoftwareSprint>(sprRes.value);
        setSprints(list);
        setSprintsForbidden(null);
        setSprintsError(null);
      } else {
        const err = sprRes.reason;
        const status = err?.response?.status;
        const detail = extractBackendDetail(err) || "Failed to load software sprints";
        if (status === 403 || err?.isCachedForbidden) {
          setSprintsForbidden(detail);
          setSprintsError({ status: 403, message: detail });
          forbiddenModules.push("Sprints");
        } else if (status === 404) {
          setSprintsError({ status: 404, message: detail });
          errorModules.push("Sprints (404)");
        } else {
          setSprintsError({ status: status || 500, message: detail });
          errorModules.push("Sprints");
        }
      }

      // 6. Shared CRM entities
      setSharedLoading(false);
      if (accRes.status === "fulfilled") {
        setAccounts(safeExtractList<Account>(accRes.value));
      }
      if (dealRes.status === "fulfilled") {
        setDeals(safeExtractList<Deal>(dealRes.value));
      }
      if (actRes.status === "fulfilled") {
        setActivities(safeExtractList<Activity>(actRes.value));
      }

      if (forbiddenModules.length > 0) {
        setApiError(
          `Notice: Software module access is restricted for your tenant or role (${forbiddenModules.join(", ")}). Other CRM features remain fully functional.`
        );
      } else if (errorModules.length > 0) {
        setApiError(
          `Notice: Could not load data for ${errorModules.join(", ")}. Click 'Retry All' to fetch fresh records.`
        );
      } else {
        setApiError(null);
      }
    } catch (err: any) {
      setApiError(err?.message || "Failed to load dashboard data");
    } finally {

      setProjectsLoading(false);
      setRequirementsLoading(false);
      setEstimatesLoading(false);
      setContractsLoading(false);
      setSprintsLoading(false);
      setSharedLoading(false);
    }
  }, []);

  /* ─── Mount & Navigation Effect ─── */
  useEffect(() => {
    void loadAllData(true);
  }, [loadAllData, location.key]);

  /* ─── Listen for Real-Time Mutations in Other Modules ─── */
  useEffect(() => {
    const handleDataChanged = () => {
      void loadAllData(true);
    };
    window.addEventListener("scuilone:software_data_changed", handleDataChanged);
    return () => {
      window.removeEventListener("scuilone:software_data_changed", handleDataChanged);
    };
  }, [loadAllData]);

  /* ─── Window Focus Listener (e.g. after tab switch) ─── */
  useEffect(() => {
    const handleFocus = () => {
      void loadAllData(false);
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadAllData]);

  /* ─── Individual Section Retries ─── */
  const retryProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    clearSoftwareForbidden("software_projects");
    try {
      const data = await getSoftwareProjects(undefined, { forceRetry: true });
      const list = safeExtractList<SoftwareProject>(data);
      setProjects(list);
      setProjectsForbidden(null);
      setProjectsError(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = extractBackendDetail(err) || "Failed to load software projects";
      if (status === 403 || err?.isCachedForbidden) {
        setProjectsForbidden(detail);
        setProjectsError({ status: 403, message: detail });
      } else {
        setProjectsError({ status: status || 500, message: detail });
      }
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const retryRequirements = useCallback(async () => {
    setRequirementsLoading(true);
    setRequirementsError(null);
    clearSoftwareForbidden("software_requirements");
    try {
      const data = await getSoftwareRequirements(undefined, { forceRetry: true });
      const list = safeExtractList<SoftwareRequirement>(data);
      setRequirements(list);
      setRequirementsForbidden(null);
      setRequirementsError(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = extractBackendDetail(err) || "Failed to load software requirements";
      if (status === 403 || err?.isCachedForbidden) {
        setRequirementsForbidden(detail);
        setRequirementsError({ status: 403, message: detail });
      } else {
        setRequirementsError({ status: status || 500, message: detail });
      }
    } finally {
      setRequirementsLoading(false);
    }
  }, []);

  const retryEstimates = useCallback(async () => {
    setEstimatesLoading(true);
    setEstimatesError(null);
    clearSoftwareForbidden("software_estimates");
    try {
      const data = await getSoftwareEstimates(undefined, { forceRetry: true });
      const list = safeExtractList<SoftwareEstimate>(data);
      setEstimates(list);
      setEstimatesForbidden(null);
      setEstimatesError(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = extractBackendDetail(err) || "Failed to load software estimates";
      if (status === 403 || err?.isCachedForbidden) {
        setEstimatesForbidden(detail);
        setEstimatesError({ status: 403, message: detail });
      } else {
        setEstimatesError({ status: status || 500, message: detail });
      }
    } finally {
      setEstimatesLoading(false);
    }
  }, []);

  const retryContracts = useCallback(async () => {
    setContractsLoading(true);
    setContractsError(null);
    clearSoftwareForbidden("software_contracts");
    try {
      const data = await getSoftwareContracts(undefined, { forceRetry: true });
      const list = safeExtractList<SoftwareContract>(data);
      setContracts(list);
      setContractsForbidden(null);
      setContractsError(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = extractBackendDetail(err) || "Failed to load software contracts";
      if (status === 403 || err?.isCachedForbidden) {
        setContractsForbidden(detail);
        setContractsError({ status: 403, message: detail });
      } else {
        setContractsError({ status: status || 500, message: detail });
      }
    } finally {
      setContractsLoading(false);
    }
  }, []);

  const retrySprints = useCallback(async () => {
    setSprintsLoading(true);
    setSprintsError(null);
    clearSoftwareForbidden("software_sprints");
    try {
      const data = await getSoftwareSprints(undefined, { forceRetry: true });
      const list = safeExtractList<SoftwareSprint>(data);
      setSprints(list);
      setSprintsForbidden(null);
      setSprintsError(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = extractBackendDetail(err) || "Failed to load software sprints";
      if (status === 403 || err?.isCachedForbidden) {
        setSprintsForbidden(detail);
        setSprintsError({ status: 403, message: detail });
      } else {
        setSprintsError({ status: status || 500, message: detail });
      }
    } finally {
      setSprintsLoading(false);
    }
  }, []);

  /* ─── Metric Calculations Derived Strictly from Actual Saved Records ─── */
  const totalProjectsCount = projects.length;
  const activeProjectsCount = projects.filter((p) => {
    const s = String(p.status || "").trim().toLowerCase();
    return s === "active" || s === "in progress";
  }).length;
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
      const raw = (p.status || "Planned").trim();
      const matched = Object.keys(counts).find(
        (k) => k.toLowerCase() === raw.toLowerCase()
      ) || "Planned";
      counts[matched] = (counts[matched] ?? 0) + 1;
    });

    const total = projects.length;
    const colorMap: Record<string, string> = {
      Active: "#00b4d8",
      Planned: "#f43f5e",
      "On Hold": "#eab308",
      Completed: "#10b981",
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
      "On Hold": 0,
      Rejected: 0,
      Converted: 0,
      Closed: 0,
    };
    requirements.forEach((r) => {
      const raw = (r.status || "New").trim();
      const matched = Object.keys(counts).find(
        (k) => k.toLowerCase() === raw.toLowerCase()
      );
      if (matched) {
        counts[matched] = (counts[matched] ?? 0) + 1;
      } else {
        counts["New"] = (counts["New"] ?? 0) + 1;
      }
    });

    const total = requirements.length;
    const colorMap: Record<string, string> = {
      New: "#3b82f6",
      Discovery: "#06b6d4",
      Estimating: "#eab308",
      Proposal: "#6366f1",
      Approved: "#10b981",
      "On Hold": "#f59e0b",
      Rejected: "#ef4444",
      Converted: "#14b8a6",
      Closed: "#64748b",
    };

    const coreKeys = ["New", "Discovery", "Estimating", "Proposal", "Approved"];
    const otherActiveKeys = ["On Hold", "Rejected", "Converted", "Closed"].filter(
      (k) => (counts[k] ?? 0) > 0
    );
    const displayedKeys = [...coreKeys, ...otherActiveKeys];

    return displayedKeys.map((name) => {
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
      Withdrawn: 0,
    };
    estimates.forEach((e) => {
      const raw = (e.status || "Draft").trim();
      const matched = Object.keys(counts).find(
        (k) => k.toLowerCase() === raw.toLowerCase()
      );
      if (matched) {
        counts[matched] = (counts[matched] ?? 0) + 1;
      } else {
        counts["Draft"] = (counts["Draft"] ?? 0) + 1;
      }
    });

    const total = estimates.length;
    const colorMap: Record<string, string> = {
      Draft: "#3b82f6",
      Sent: "#10b981",
      Accepted: "#f59e0b",
      Rejected: "#a855f7",
      Expired: "#ef4444",
      Withdrawn: "#64748b",
    };

    const statusKeys =
      (counts.Withdrawn ?? 0) > 0
        ? ["Draft", "Sent", "Accepted", "Rejected", "Expired", "Withdrawn"]
        : ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

    return statusKeys.map((name) => {
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

  /* ─── Client / Requirement Resolvers ─── */
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
      if (cont?.deal_id && dealMap.has(cont.deal_id)) {
        return dealMap.get(cont.deal_id) || "—";
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

  /* ─── Robust KPI Value Renderer ─── */
  const renderKpiValue = (
    loadingState: boolean,
    forbiddenState: string | null,
    errorState: { status?: number; message: string } | null,
    value: number
  ) => {
    if (loadingState) {
      return <span className="sw-kpi-loading">...</span>;
    }
    if (forbiddenState) {
      return (
        <span className="sw-kpi-restricted" title={forbiddenState}>
          🔒 Restricted
        </span>
      );
    }
    if (errorState) {
      return (
        <span className="sw-kpi-error" title={errorState.message}>
          ⚠️ {errorState.status ? `Error (${errorState.status})` : "Error"}
        </span>
      );
    }
    return value;
  };

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
        <div
          className="sw-header-actions"
          style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}
        >
          <button
            type="button"
            className="sw-date-filter-btn"
            style={{ fontWeight: 600, cursor: "pointer" }}
            onClick={() => void loadAllData(true)}
            title="Refresh all software data from server"
          >
            🔄 Refresh
          </button>
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
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="sw-chevron-icon"
            >
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
            onClick={() => void loadAllData(true)}
          >
            Retry All
          </button>
        </div>
      )}

      {/* ─── Row 1: Software Delivery KPI Cards ─── */}
      <div className="sw-kpi-grid">
        {/* Total Projects */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-blue-tint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#00b4d8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {renderKpiValue(projectsLoading, projectsForbidden, projectsError, totalProjectsCount)}
            </div>
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {renderKpiValue(projectsLoading, projectsForbidden, projectsError, activeProjectsCount)}
            </div>
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a855f7"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {renderKpiValue(
                requirementsLoading,
                requirementsForbidden,
                requirementsError,
                requirementsCount
              )}
            </div>
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
            <div className="sw-kpi-value">
              {renderKpiValue(estimatesLoading, estimatesForbidden, estimatesError, estimatesCount)}
            </div>
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {renderKpiValue(contractsLoading, contractsForbidden, contractsError, contractsCount)}
            </div>
            {(contractsForbidden || contractsError) && (
              <button
                type="button"
                className="sw-btn-retry-inline"
                style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                onClick={retryContracts}
                title="Retry loading contracts"
              >
                Retry
              </button>
            )}
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {renderKpiValue(sprintsLoading, sprintsForbidden, sprintsError, sprintsCount)}
            </div>
            {(sprintsForbidden || sprintsError) && (
              <button
                type="button"
                className="sw-btn-retry-inline"
                style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                onClick={retrySprints}
                title="Retry loading sprints"
              >
                Retry
              </button>
            )}
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {sharedLoading ? "..." : activeClientsCount}
            </div>
          </div>
          <div className="sw-kpi-label">Active Clients</div>
          <Link to={`${basePath}/accounts`} className="sw-kpi-link">
            View Clients &gt;
          </Link>
        </div>

        {/* Open Opportunities */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-cyan-tint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {sharedLoading ? "..." : openDealsCount}
            </div>
          </div>
          <div className="sw-kpi-label">Open Opportunities</div>
          <Link to={`${basePath}/deals`} className="sw-kpi-link">
            Pipeline &gt;
          </Link>
        </div>

        {/* Won Revenue */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-emerald-tint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value" style={{ fontSize: "1.35rem" }}>
              {sharedLoading ? "..." : wonRevenueTotal}
            </div>
          </div>
          <div className="sw-kpi-label">Won Deal Revenue</div>
          <Link to={`${basePath}/deals`} className="sw-kpi-link">
            View Deals &gt;
          </Link>
        </div>

        {/* Pending Activities */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-amber-tint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {sharedLoading ? "..." : pendingActivitiesCount}
            </div>
          </div>
          <div className="sw-kpi-label">Pending Activities</div>
          <Link to={`${basePath}/activities`} className="sw-kpi-link">
            View Schedule &gt;
          </Link>
        </div>

        {/* Completed Tasks */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-purple-tint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#8b5cf6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {sharedLoading ? "..." : completedActivitiesCount}
            </div>
          </div>
          <div className="sw-kpi-label">Completed Tasks</div>
          <Link to={`${basePath}/activities`} className="sw-kpi-link">
            Review Work &gt;
          </Link>
        </div>

        {/* Overdue Tasks */}
        <div className="sw-kpi-card">
          <div className="sw-kpi-card-header">
            <div className="sw-kpi-icon-box bg-rose-tint">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="sw-kpi-value-row">
            <div className="sw-kpi-value">
              {sharedLoading ? "..." : overdueActivitiesCount}
            </div>
          </div>
          <div className="sw-kpi-label">Overdue Tasks</div>
          <Link to={`${basePath}/activities`} className="sw-kpi-link">
            Resolve Overdue &gt;
          </Link>
        </div>
      </div>

      {/* ─── Row 3: Live Analytical Donut Charts ─── */}
      <div className="sw-charts-grid">
        {/* Chart 1: Projects by Status */}
        <div className="sw-chart-card">
          <div className="sw-chart-card-header">
            <h2 className="sw-chart-title">Projects by Status</h2>
            <button
              type="button"
              className="sw-select-filter is-interactive"
              onClick={() => handleNavigateProjects()}
              title="View All Projects"
              aria-label="View All Projects"
            >
              <span>All Projects &rarr;</span>
            </button>
          </div>
          {projectsForbidden ? (
            <div className="sw-restricted-state">
              <span className="sw-restricted-icon">🔒</span>
              <h3 className="sw-restricted-title">Projects Access Restricted</h3>
              <p className="sw-restricted-detail">{projectsForbidden}</p>
              <button
                type="button"
                className="sw-btn-retry-inline"
                onClick={retryProjects}
              >
                Retry Projects
              </button>
            </div>
          ) : projectsError ? (
            <div className="sw-restricted-state">
              <span className="sw-restricted-icon">⚠️</span>
              <h3 className="sw-restricted-title">
                {projectsError.status === 404
                  ? "Projects Endpoint Unavailable (404)"
                  : "Failed to Load Projects"}
              </h3>
              <p className="sw-restricted-detail">{projectsError.message}</p>
              <button
                type="button"
                className="sw-btn-retry-inline"
                onClick={retryProjects}
              >
                Retry Projects
              </button>
            </div>
          ) : (
            <div className="sw-donut-container">
              <div className="sw-donut-wrapper">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const entry = payload[0]?.payload;
                          if (!entry || !entry.name) return null;
                          return (
                            <div className="sw-chart-custom-tooltip">
                              <div className="sw-tooltip-header">
                                <span className="sw-tooltip-dot" style={{ backgroundColor: entry.color }} />
                                <span className="sw-tooltip-title">{entry.name}</span>
                              </div>
                              <div className="sw-tooltip-count">
                                {entry.count} Projects
                              </div>
                              <div className="sw-tooltip-hint">Click to view {entry.name} Projects &rarr;</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
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
                      cursor={totalProjectsCount > 0 ? "pointer" : "default"}
                      onClick={(data) => {
                        if (totalProjectsCount > 0 && data && data.name) {
                          handleNavigateProjects(data.name);
                        }
                      }}
                    >
                      {totalProjectsCount > 0 ? (
                        projectStatusData
                          .filter((d) => d.count > 0)
                          .map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={entry.color}
                              cursor="pointer"
                              style={{ cursor: "pointer", outline: "none", transition: "opacity 0.15s ease" }}
                              onClick={() => handleNavigateProjects(entry.name)}
                            />
                          ))
                      ) : (
                        <Cell fill={emptyPlaceholderColor} />
                      )}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="sw-donut-center-label is-interactive"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigateProjects()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleNavigateProjects();
                    }
                  }}
                  title="View All Projects"
                  aria-label={`View All Projects (${totalProjectsCount} total)`}
                >
                  <div className="sw-donut-center-num">
                    {projectsLoading ? "..." : totalProjectsCount}
                  </div>
                  <div className="sw-donut-center-text">Projects</div>
                </div>
              </div>
              <div className="sw-donut-legend">
                {projectStatusData.map((item) => (
                  <div
                    key={item.name}
                    className="sw-legend-item is-interactive"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNavigateProjects(item.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNavigateProjects(item.name);
                      }
                    }}
                    title={`View ${item.name} Projects`}
                    aria-label={`Filter by ${item.name} Projects (${item.count} items)`}
                  >
                    <div className="sw-legend-left">
                      <span className="sw-legend-dot" style={{ backgroundColor: item.color }} />
                      <span className="sw-legend-name">{item.name}</span>
                    </div>
                    <div className="sw-legend-right">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: Requirements by Status */}
        <div className="sw-chart-card">
          <div className="sw-chart-card-header">
            <h2 className="sw-chart-title">Requirements by Status</h2>
            <button
              type="button"
              className="sw-select-filter is-interactive"
              onClick={() => handleNavigateRequirements()}
              title="View All Requirements"
              aria-label="View All Requirements"
            >
              <span>All Requirements &rarr;</span>
            </button>
          </div>
          {requirementsForbidden ? (
            <div className="sw-restricted-state">
              <span className="sw-restricted-icon">🔒</span>
              <h3 className="sw-restricted-title">Requirements Access Restricted</h3>
              <p className="sw-restricted-detail">{requirementsForbidden}</p>
              <button
                type="button"
                className="sw-btn-retry-inline"
                onClick={retryRequirements}
              >
                Retry Requirements
              </button>
            </div>
          ) : requirementsError ? (
            <div className="sw-restricted-state">
              <span className="sw-restricted-icon">⚠️</span>
              <h3 className="sw-restricted-title">
                {requirementsError.status === 404
                  ? "Requirements Endpoint Unavailable (404)"
                  : "Failed to Load Requirements"}
              </h3>
              <p className="sw-restricted-detail">{requirementsError.message}</p>
              <button
                type="button"
                className="sw-btn-retry-inline"
                onClick={retryRequirements}
              >
                Retry Requirements
              </button>
            </div>
          ) : (
            <div className="sw-donut-container">
              <div className="sw-donut-wrapper">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const entry = payload[0]?.payload;
                          if (!entry || !entry.name) return null;
                          return (
                            <div className="sw-chart-custom-tooltip">
                              <div className="sw-tooltip-header">
                                <span className="sw-tooltip-dot" style={{ backgroundColor: entry.color }} />
                                <span className="sw-tooltip-title">{entry.name}</span>
                              </div>
                              <div className="sw-tooltip-count">
                                {entry.count} Requirements
                              </div>
                              <div className="sw-tooltip-hint">Click to view {entry.name} Requirements &rarr;</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
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
                      cursor={requirementsCount > 0 ? "pointer" : "default"}
                      onClick={(data) => {
                        if (requirementsCount > 0 && data && data.name) {
                          handleNavigateRequirements(data.name);
                        }
                      }}
                    >
                      {requirementsCount > 0 ? (
                        requirementsStatusData
                          .filter((d) => d.count > 0)
                          .map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={entry.color}
                              cursor="pointer"
                              style={{ cursor: "pointer", outline: "none", transition: "opacity 0.15s ease" }}
                              onClick={() => handleNavigateRequirements(entry.name)}
                            />
                          ))
                      ) : (
                        <Cell fill={emptyPlaceholderColor} />
                      )}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="sw-donut-center-label is-interactive"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigateRequirements()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleNavigateRequirements();
                    }
                  }}
                  title="View All Requirements"
                  aria-label={`View All Requirements (${requirementsCount} total)`}
                >
                  <div className="sw-donut-center-num">
                    {requirementsLoading ? "..." : requirementsCount}
                  </div>
                  <div className="sw-donut-center-text">Requirements</div>
                </div>
              </div>
              <div className="sw-donut-legend">
                {requirementsStatusData.map((item) => (
                  <div
                    key={item.name}
                    className="sw-legend-item is-interactive"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNavigateRequirements(item.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNavigateRequirements(item.name);
                      }
                    }}
                    title={`View ${item.name} Requirements`}
                    aria-label={`Filter by ${item.name} Requirements (${item.count} items)`}
                  >
                    <div className="sw-legend-left">
                      <span className="sw-legend-dot" style={{ backgroundColor: item.color }} />
                      <span className="sw-legend-name">{item.name}</span>
                    </div>
                    <div className="sw-legend-right">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 3: Estimates by Status */}
        <div className="sw-chart-card">
          <div className="sw-chart-card-header">
            <h2 className="sw-chart-title">Estimates by Status</h2>
            <button
              type="button"
              className="sw-select-filter is-interactive"
              onClick={() => handleNavigateEstimates()}
              title="View All Estimates"
              aria-label="View All Estimates"
            >
              <span>All Estimates &rarr;</span>
            </button>
          </div>
          {estimatesForbidden ? (
            <div className="sw-restricted-state">
              <span className="sw-restricted-icon">🔒</span>
              <h3 className="sw-restricted-title">Estimates Access Restricted</h3>
              <p className="sw-restricted-detail">{estimatesForbidden}</p>
              <button
                type="button"
                className="sw-btn-retry-inline"
                onClick={retryEstimates}
              >
                Retry Estimates
              </button>
            </div>
          ) : estimatesError ? (
            <div className="sw-restricted-state">
              <span className="sw-restricted-icon">⚠️</span>
              <h3 className="sw-restricted-title">
                {estimatesError.status === 404
                  ? "Estimates Endpoint Unavailable (404)"
                  : "Failed to Load Estimates"}
              </h3>
              <p className="sw-restricted-detail">{estimatesError.message}</p>
              <button
                type="button"
                className="sw-btn-retry-inline"
                onClick={retryEstimates}
              >
                Retry Estimates
              </button>
            </div>
          ) : (
            <div className="sw-donut-container">
              <div className="sw-donut-wrapper">
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const entry = payload[0]?.payload;
                          if (!entry || !entry.name) return null;
                          return (
                            <div className="sw-chart-custom-tooltip">
                              <div className="sw-tooltip-header">
                                <span className="sw-tooltip-dot" style={{ backgroundColor: entry.color }} />
                                <span className="sw-tooltip-title">{entry.name}</span>
                              </div>
                              <div className="sw-tooltip-count">
                                {entry.count} Estimates
                              </div>
                              <div className="sw-tooltip-hint">Click to view {entry.name} Estimates &rarr;</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
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
                      cursor={estimatesCount > 0 ? "pointer" : "default"}
                      onClick={(data) => {
                        if (estimatesCount > 0 && data && data.name) {
                          handleNavigateEstimates(data.name);
                        }
                      }}
                    >
                      {estimatesCount > 0 ? (
                        estimatesStatusData
                          .filter((d) => d.count > 0)
                          .map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={entry.color}
                              cursor="pointer"
                              style={{ cursor: "pointer", outline: "none", transition: "opacity 0.15s ease" }}
                              onClick={() => handleNavigateEstimates(entry.name)}
                            />
                          ))
                      ) : (
                        <Cell fill={emptyPlaceholderColor} />
                      )}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div
                  className="sw-donut-center-label is-interactive"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleNavigateEstimates()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleNavigateEstimates();
                    }
                  }}
                  title="View All Estimates"
                  aria-label={`View All Estimates (${estimatesCount} total)`}
                >
                  <div className="sw-donut-center-num">
                    {estimatesLoading ? "..." : estimatesCount}
                  </div>
                  <div className="sw-donut-center-text">Estimates</div>
                </div>
              </div>
              <div className="sw-donut-legend">
                {estimatesStatusData.map((item) => (
                  <div
                    key={item.name}
                    className="sw-legend-item is-interactive"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleNavigateEstimates(item.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNavigateEstimates(item.name);
                      }
                    }}
                    title={`View ${item.name} Estimates`}
                    aria-label={`Filter by ${item.name} Estimates (${item.count} items)`}
                  >
                    <div className="sw-legend-left">
                      <span className="sw-legend-dot" style={{ backgroundColor: item.color }} />
                      <span className="sw-legend-name">{item.name}</span>
                    </div>
                    <div className="sw-legend-right">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                {projectsForbidden ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="sw-table-restricted-notice">
                        <span>🔒 {projectsForbidden}</span>
                        <button
                          type="button"
                          className="sw-btn-retry-inline"
                          onClick={retryProjects}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : projectsError ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="sw-table-restricted-notice">
                        <span style={{ color: "#ef4444" }}>⚠️ {projectsError.message}</span>
                        <button
                          type="button"
                          className="sw-btn-retry-inline"
                          onClick={retryProjects}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : projectsLoading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "20px" }}>
                      Loading projects...
                    </td>
                  </tr>
                ) : (
                  recentProjects.map((p, idx) => {
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
                  })
                )}
                {!projectsForbidden && !projectsError && !projectsLoading && recentProjects.length === 0 && (
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
                {requirementsForbidden ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="sw-table-restricted-notice">
                        <span>🔒 {requirementsForbidden}</span>
                        <button
                          type="button"
                          className="sw-btn-retry-inline"
                          onClick={retryRequirements}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : requirementsError ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="sw-table-restricted-notice">
                        <span style={{ color: "#ef4444" }}>⚠️ {requirementsError.message}</span>
                        <button
                          type="button"
                          className="sw-btn-retry-inline"
                          onClick={retryRequirements}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : requirementsLoading ? (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", padding: "20px" }}>
                      Loading requirements...
                    </td>
                  </tr>
                ) : (
                  recentRequirements.map((r) => {
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
                  })
                )}
                {!requirementsForbidden && !requirementsError && !requirementsLoading && recentRequirements.length === 0 && (
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
                {estimatesForbidden ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="sw-table-restricted-notice">
                        <span>🔒 {estimatesForbidden}</span>
                        <button
                          type="button"
                          className="sw-btn-retry-inline"
                          onClick={retryEstimates}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : estimatesError ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="sw-table-restricted-notice">
                        <span style={{ color: "#ef4444" }}>⚠️ {estimatesError.message}</span>
                        <button
                          type="button"
                          className="sw-btn-retry-inline"
                          onClick={retryEstimates}
                        >
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : estimatesLoading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "20px" }}>
                      Loading estimates...
                    </td>
                  </tr>
                ) : (
                  recentEstimates.map((e) => {
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
                  })
                )}
                {!estimatesForbidden && !estimatesError && !estimatesLoading && recentEstimates.length === 0 && (
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
