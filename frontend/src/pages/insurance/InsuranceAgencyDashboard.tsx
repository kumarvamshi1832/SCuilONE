import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { useTheme } from "../../context/ThemeContext";
import { getAccounts } from "../../services/accountService";
import { getContacts } from "../../services/contactService";
import { getLeads } from "../../services/leadService";
import { getDeals } from "../../services/dealService";
import { getActivities } from "../../services/activityService";
import { getUsers } from "../../services/userService";
import { getMyProfile } from "../../services/profileService";

import type { Account } from "../../types/account";
import type { Contact } from "../../types/contact";
import type { Lead } from "../../types/lead";
import type { Deal } from "../../types/deal";
import type { Activity } from "../../types/activity";
import type { User } from "../../types/user";

import {
  initialInsuranceKpis,
  monthlyCollectionData,
  policiesByTypeData,
  claimsOverviewData,
  upcomingRenewalsList,
  agentPerformanceList,
  recentPolicyholdersList,
  insuranceTasksList,
  recentClaimsList,
  UpcomingRenewalItem,
  RecentPolicyholderItem,
  InsuranceTaskItem,
  RecentClaimItem,
} from "../../data/insuranceAgencyData";

import "./InsuranceAgencyDashboard.css";

const formatINR = (val: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
};

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
};


export default function InsuranceAgencyDashboard() {
  const { theme } = useTheme();

  // Multi-source reactive dark mode detector to guarantee synchronization
  const [effectiveTheme, setEffectiveTheme] = useState<string>(() => {
    if (typeof document !== "undefined") {
      const isBodyDark =
        document.body.classList.contains("dark") ||
        document.body.className.includes("dark");
      const isHtmlDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.className.includes("dark");
      const isWrapperDark = !!document.querySelector(".dashboard-wrapper.dark");
      if (theme === "dark" || isBodyDark || isHtmlDark || isWrapperDark)
        return "dark";
    }
    return theme || "light";
  });

  useEffect(() => {
    const checkDark = () => {
      const isBodyDark =
        document.body.classList.contains("dark") ||
        document.body.className.includes("dark");
      const isHtmlDark =
        document.documentElement.classList.contains("dark") ||
        document.documentElement.className.includes("dark");
      const isWrapperDark = !!document.querySelector(".dashboard-wrapper.dark");
      const currentDark =
        theme === "dark" || isBodyDark || isHtmlDark || isWrapperDark;
      setEffectiveTheme(currentDark ? "dark" : "light");
    };

    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [theme]);

  const isDark = effectiveTheme === "dark";

  // Authenticated user display name
  const [userName, setUserName] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (stored) {
        const parsed = JSON.parse(stored);
        const name =
          parsed.first_name ||
          parsed.full_name ||
          parsed.name ||
          "";
        if (name && typeof name === "string" && !name.includes("@")) {
          return name.trim();
        }
      }
    } catch {}
    return "";
  });

  useEffect(() => {
    let isMounted = true;
    getMyProfile()
      .then((profile) => {
        if (isMounted && profile?.full_name && typeof profile.full_name === "string") {
          const cleanName = profile.full_name.trim();
          if (cleanName && !cleanName.includes("@")) {
            setUserName(cleanName);
          }
        }
      })
      .catch(() => {
        // Fallback gracefully
      });

    const handleProfileUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ full_name?: string }>;
      if (customEvent.detail?.full_name && typeof customEvent.detail.full_name === "string") {
        const cleanName = customEvent.detail.full_name.trim();
        if (cleanName && !cleanName.includes("@")) {
          setUserName(cleanName);
        }
      }
    };

    window.addEventListener("user-profile-updated", handleProfileUpdate as EventListener);
    return () => {
      isMounted = false;
      window.removeEventListener("user-profile-updated", handleProfileUpdate as EventListener);
    };
  }, []);

  const displayName = useMemo(() => {
    if (!userName) return "";
    const first = userName.split(" ")[0]?.trim();
    return first || userName;
  }, [userName]);

  // Data Source Mode: "preview" (matches design reference screenshot) | "live" (shows real CRM database records)
  const [dataMode] = useState<"preview" | "live">("preview");

  // Filter States
  const [trendRange, setTrendRange] = useState("This Year");
  const [claimsRange, setClaimsRange] = useState("This Month");
  const [agentRange, setAgentRange] = useState("This Month");

  // Real CRM Data States
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch real CRM data from all available services
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, contRes, leadRes, dealRes, actRes, userRes] =
        await Promise.allSettled([
          getAccounts(),
          getContacts(),
          getLeads(),
          getDeals(),
          getActivities(),
          getUsers(),
        ]);

      if (accRes.status === "fulfilled") setAccounts(accRes.value || []);
      if (contRes.status === "fulfilled") setContacts(contRes.value || []);
      if (leadRes.status === "fulfilled") setLeads(leadRes.value || []);
      if (dealRes.status === "fulfilled") setDeals(dealRes.value || []);
      if (actRes.status === "fulfilled") setActivities(actRes.value || []);
      if (userRes.status === "fulfilled") setUsers(userRes.value || []);
    } catch {
      // Keep prototype data if API is unseeded or network is unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lookup maps for clean name resolution (avoiding raw UUIDs)
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      map.set(u.id, u.full_name);
    });
    return map;
  }, [users]);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    accounts.forEach((a) => {
      map.set(a.id, a.name);
    });
    return map;
  }, [accounts]);

  const contactMap = useMemo(() => {
    const map = new Map<string, string>();
    contacts.forEach((c) => {
      map.set(c.id, c.full_name);
    });
    return map;
  }, [contacts]);

  const dealMap = useMemo(() => {
    const map = new Map<string, string>();
    deals.forEach((d) => {
      map.set(d.id, d.name);
    });
    return map;
  }, [deals]);

  // Derived KPIs based on current mode
  const kpis = useMemo(() => {
    if (dataMode === "preview") {
      return initialInsuranceKpis;
    }

    // Live mode calculations based on real CRM records
    const totalClientsCount =
      accounts.length > 0
        ? accounts.length
        : contacts.length > 0
          ? contacts.length
          : 0;

    const activePoliciesCount = deals.filter(
      (d) => d.stage?.toLowerCase() !== "lost"
    ).length;

    const leadsCount = leads.filter(
      (l) =>
        l.status?.toLowerCase() !== "converted" &&
        l.status?.toLowerCase() !== "lost"
    ).length;

    const openClaimsCount = 0; // Claims table is not yet in the backend schema

    const upcomingRenewalsCount = deals.filter(
      (d) => d.stage?.toLowerCase() !== "lost"
    ).length;

    const totalRevenue = deals
      .filter((d) => d.stage?.toLowerCase() === "closed won")
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    return {
      totalPolicyholders: totalClientsCount,
      policyholdersTrend:
        totalClientsCount > 0 ? "↑ Live CRM data" : "0 records",
      activePolicies: activePoliciesCount,
      activePoliciesTrend:
        activePoliciesCount > 0 ? "↑ Active deals" : "0 records",
      pendingQuotes: leadsCount,
      quotesTrend: leadsCount > 0 ? "Pending action" : "0 records",
      openClaims: openClaimsCount,
      claimsTrend: "API pending",
      upcomingRenewals: upcomingRenewalsCount,
      renewalsTrend: "Approaching close",
      premiumCollected: totalRevenue,
      premiumTrend: totalRevenue > 0 ? "Closed-won revenue" : "₹0 collected",
    };
  }, [dataMode, accounts, contacts, deals, leads]);

  // Total counts for Donut Charts
  const totalPoliciesCount = useMemo(() => {
    return policiesByTypeData.reduce((acc, curr) => acc + curr.count, 0);
  }, []);

  const totalClaimsCount = useMemo(() => {
    return claimsOverviewData.reduce((acc, curr) => acc + curr.count, 0);
  }, []);

  // Display Lists based on Data Mode
  const displayedPolicyholders: RecentPolicyholderItem[] = useMemo(() => {
    if (dataMode === "preview") {
      return recentPolicyholdersList;
    }
    if (accounts.length === 0 && contacts.length === 0) {
      return [];
    }

    if (accounts.length > 0) {
      return accounts.slice(0, 5).map((acc) => {
        const agentName =
          (acc.assigned_to && userMap.get(acc.assigned_to)) || "Unassigned";
        const initials = acc.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "CL";
        const agentInitials = agentName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "UN";

        return {
          id: acc.id,
          name: acc.name,
          initials,
          email: acc.email || "—",
          phone: acc.phone || "—",
          insuranceInterest: acc.industry || "General Insurance",
          assignedAgent: agentName,
          agentInitials,
          createdAt: formatDate(acc.created_at),
        };
      });
    }

    return contacts.slice(0, 5).map((c) => {
      const agentName =
        (c.assigned_to && userMap.get(c.assigned_to)) || "Unassigned";
      const initials = c.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "CN";
      const agentInitials = agentName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "UN";

      return {
        id: c.id,
        name: c.full_name,
        initials,
        email: c.email || "—",
        phone: c.phone || "—",
        insuranceInterest: c.company || "Individual Policyholder",
        assignedAgent: agentName,
        agentInitials,
        createdAt: formatDate(c.created_at),
      };
    });
  }, [dataMode, accounts, contacts, userMap]);

  const displayedTasks: InsuranceTaskItem[] = useMemo(() => {
    if (dataMode === "preview") {
      return insuranceTasksList;
    }
    if (activities.length === 0) {
      return [];
    }
    return activities.slice(0, 5).map((act) => {
      let related = "Policy Follow-up";
      if (act.account_id && accountMap.has(act.account_id)) {
        related = accountMap.get(act.account_id)!;
      } else if (act.contact_id && contactMap.has(act.contact_id)) {
        related = contactMap.get(act.contact_id)!;
      } else if (act.deal_id && dealMap.has(act.deal_id)) {
        related = dealMap.get(act.deal_id)!;
      }

      const typeMap: Record<string, "Call" | "Email" | "Claim" | "Document" | "Meeting"> = {
        Call: "Call",
        Meeting: "Meeting",
        Task: "Document",
      };

      return {
        id: act.id,
        title: act.title,
        type: typeMap[act.activity_type] || "Document",
        relatedTo: related,
        dueDate: formatDate(act.due_date),
        status: (act.status as any) || "Pending",
      };
    });
  }, [dataMode, activities, accountMap, contactMap, dealMap]);

  const displayedAgents = useMemo(() => {
    if (dataMode === "preview") {
      return agentPerformanceList;
    }
    if (users.length === 0) {
      return [];
    }
    return users.slice(0, 5).map((u) => {
      const sold = deals.filter(
        (d) => d.assigned_to === u.id && d.stage?.toLowerCase() === "closed won"
      ).length;
      const premium = deals
        .filter(
          (d) =>
            d.assigned_to === u.id && d.stage?.toLowerCase() === "closed won"
        )
        .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
      const renewals = deals.filter(
        (d) => d.assigned_to === u.id && d.stage?.toLowerCase() !== "lost"
      ).length;
      const openTasks = activities.filter(
        (a) =>
          a.assigned_to === u.id && a.status?.toLowerCase() !== "completed"
      ).length;
      const initials =
        u.full_name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "AG";

      return {
        id: u.id,
        name: u.full_name,
        initials,
        policiesSold: sold,
        premium,
        renewals,
        openTasks,
      };
    });
  }, [dataMode, users, deals, activities]);

  const displayedRenewals: UpcomingRenewalItem[] = useMemo(() => {
    if (dataMode === "preview") {
      return upcomingRenewalsList;
    }
    if (deals.length === 0) {
      return [];
    }
    return deals.slice(0, 5).map((d) => {
      const agentName =
        (d.assigned_to && userMap.get(d.assigned_to)) || "Assigned Agent";
      const agentInitials =
        agentName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) || "AG";

      const holderName =
        (d.account_id && accountMap.get(d.account_id)) ||
        (d.contact_id && contactMap.get(d.contact_id)) ||
        d.name;

      return {
        id: d.id,
        policyNumber: `POL-${d.id.slice(0, 6).toUpperCase()}`,
        policyholder: holderName,
        insuranceType: d.name.toLowerCase().includes("motor")
          ? "Motor Insurance"
          : d.name.toLowerCase().includes("life")
            ? "Life Insurance"
            : "Health Insurance",
        renewalDate: formatDate(d.expected_close_date || d.created_at),
        premiumAmount: Number(d.amount) || 25000,
        assignedAgent: agentName,
        agentInitials,
        status: (d.stage?.toLowerCase() === "closed won"
          ? "Active"
          : "Due Soon") as any,
      };
    });
  }, [dataMode, deals, userMap, accountMap, contactMap]);

  return (
    <div className={`ia-dashboard ${isDark ? "dark" : ""}`}>
      {/* 1. Header & Welcome Banner */}
      <div className="ia-header-bar">
        <div className="ia-header-left">
          <h1 className="ia-title">
            {displayName ? (
              <>
                Welcome back, <span className="ia-title-teal">{displayName}</span>!
              </>
            ) : (
              <>
                Welcome <span className="ia-title-teal">back</span>!
              </>
            )}
          </h1>
          <p className="ia-subtitle">
            Here's an overview of your insurance agency's performance and activities.
          </p>
        </div>
      </div>

      {/* 2. KPI Summary Cards Grid (6 Columns) */}
      <div className="ia-kpi-grid">
        {/* Card 1: Total Policyholders */}
        <div className="ia-kpi-card">
          <div className="ia-kpi-card-header">
            <div className="ia-kpi-icon-box teal">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
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
            {dataMode === "preview" && (
              <span className="ia-card-mini-tag">Preview</span>
            )}
          </div>
          <div className="ia-kpi-title">Total Policyholders</div>
          <div className="ia-kpi-value">
            {loading ? "..." : kpis.totalPolicyholders.toLocaleString()}
          </div>
        </div>

        {/* Card 2: Active Policies */}
        <div className="ia-kpi-card">
          <div className="ia-kpi-card-header">
            <div className="ia-kpi-icon-box emerald">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
            </div>
            {dataMode === "preview" && (
              <span className="ia-card-mini-tag">Preview</span>
            )}
          </div>
          <div className="ia-kpi-title">Active Policies</div>
          <div className="ia-kpi-value">
            {loading ? "..." : kpis.activePolicies.toLocaleString()}
          </div>
        </div>

        {/* Card 3: Pending Quotes */}
        <div className="ia-kpi-card">
          <div className="ia-kpi-card-header">
            <div className="ia-kpi-icon-box purple">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
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
            {dataMode === "preview" && (
              <span className="ia-card-mini-tag">Preview</span>
            )}
          </div>
          <div className="ia-kpi-title">Pending Quotes</div>
          <div className="ia-kpi-value">
            {loading ? "..." : kpis.pendingQuotes.toLocaleString()}
          </div>
        </div>

        {/* Card 4: Open Claims */}
        <div className="ia-kpi-card">
          <div className="ia-kpi-card-header">
            <div className="ia-kpi-icon-box red">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            {dataMode === "preview" && (
              <span className="ia-card-mini-tag">Preview</span>
            )}
          </div>
          <div className="ia-kpi-title">Open Claims</div>
          <div className="ia-kpi-value">
            {loading ? "..." : kpis.openClaims.toLocaleString()}
          </div>
        </div>

        {/* Card 5: Upcoming Renewals */}
        <div className="ia-kpi-card">
          <div className="ia-kpi-card-header">
            <div className="ia-kpi-icon-box amber">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
              </svg>
            </div>
            {dataMode === "preview" && (
              <span className="ia-card-mini-tag">Preview</span>
            )}
          </div>
          <div className="ia-kpi-title">Upcoming Renewals</div>
          <div className="ia-kpi-value">
            {loading ? "..." : kpis.upcomingRenewals.toLocaleString()}
          </div>
        </div>

        {/* Card 6: Premium Collected (Indian Rupee) */}
        <div className="ia-kpi-card">
          <div className="ia-kpi-card-header">
            <div className="ia-kpi-icon-box emerald">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4 4 0 0 0 0-8" />
              </svg>
            </div>
            {dataMode === "preview" && (
              <span className="ia-card-mini-tag">Preview</span>
            )}
          </div>
          <div className="ia-kpi-title">Premium Collected</div>
          <div className="ia-kpi-value" style={{ fontSize: "1.45rem" }}>
            {loading ? "..." : formatINR(kpis.premiumCollected)}
          </div>
        </div>
      </div>

      {/* 3. Row 2: Analytics & Charts (3 Columns) */}
      <div className="ia-charts-grid">
        {/* Card 1: Premium Collection Trend (Bar + Line) */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon emerald">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 20V10M12 20V4M6 20v-6" />
                </svg>
              </div>
              <h3 className="ia-card-title">Premium Collection Trend</h3>
            </div>
            <select
              className="ia-card-select"
              value={trendRange}
              onChange={(e) => setTrendRange(e.target.value)}
              aria-label="Filter collection trend period"
            >
              <option value="This Year">This Year</option>
              <option value="Last Year">Last Year</option>
              <option value="Last 6 Months">Last 6 Months</option>
            </select>
          </div>

          <div className="ia-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={monthlyCollectionData}
                margin={{ top: 12, right: 10, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? "rgba(255, 255, 255, 0.08)" : "#E2E8F0"}
                />
                <XAxis
                  dataKey="month"
                  stroke={isDark ? "#94A3B8" : "#64748B"}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tick={{ fill: isDark ? "#CBD5E1" : "#64748B" }}
                />
                <YAxis
                  stroke={isDark ? "#94A3B8" : "#64748B"}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  tickFormatter={(val) => `₹${Math.round(val / 100000)}L`}
                  tick={{ fill: isDark ? "#CBD5E1" : "#64748B" }}
                />
                <RechartsTooltip
                  formatter={(val: any) => [formatINR(Number(val) || 0), ""]}
                  contentStyle={{
                    backgroundColor: isDark ? "#0C262B" : "#FFFFFF",
                    borderColor: isDark ? "#163E44" : "#DCE7E3",
                    color: isDark ? "#F1F7F6" : "#102A43",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                    fontSize: "0.8rem",
                  }}
                />
                <Bar
                  dataKey="premiumCollected"
                  name="Premium Collected"
                  fill="#0D9488"
                  radius={[4, 4, 0, 0]}
                  barSize={18}
                />
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  dot={{ fill: "#F59E0B", r: 3.5, strokeWidth: 1 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "24px",
              marginTop: "8px",
              fontSize: "0.775rem",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: isDark ? "#A3C5BD" : "#526779",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#0D9488",
                }}
              />
              Premium Collected
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: isDark ? "#A3C5BD" : "#526779",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#F59E0B",
                }}
              />
              Target
            </span>
          </div>
        </div>

        {/* Card 2: Policies by Insurance Type (Donut) */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon teal">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h3 className="ia-card-title">Policies by Insurance Type</h3>
            </div>
            {dataMode === "preview" && (
              <span className="ia-card-mini-tag">Preview</span>
            )}
          </div>

          <div className="ia-donut-wrapper">
            <div className="ia-donut-chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={policiesByTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {policiesByTypeData.map((entry, index) => (
                      <Cell key={`type-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(val: any, name: any) => [
                      `${val} policies`,
                      String(name),
                    ]}
                    contentStyle={{
                      backgroundColor: isDark ? "#0C262B" : "#FFFFFF",
                      borderColor: isDark ? "#163E44" : "#DCE7E3",
                      color: isDark ? "#F1F7F6" : "#102A43",
                      borderRadius: "8px",
                      fontSize: "0.8rem",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="ia-donut-center-label">
                <div className="ia-donut-center-value">{totalPoliciesCount}</div>
                <div className="ia-donut-center-sub">Policies</div>
              </div>
            </div>

            <div className="ia-donut-legend">
              {policiesByTypeData.map((item) => (
                <div key={item.name} className="ia-donut-legend-item">
                  <div className="ia-donut-legend-left">
                    <span
                      className="ia-donut-legend-dot"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="ia-donut-legend-name">{item.name}</span>
                  </div>
                  <span className="ia-donut-legend-value">
                    {item.percentage}% ({item.count})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Claims Overview (Donut) */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon amber">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <h3 className="ia-card-title">Claims Overview</h3>
            </div>
            <select
              className="ia-card-select"
              value={claimsRange}
              onChange={(e) => setClaimsRange(e.target.value)}
              aria-label="Filter claims overview period"
            >
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="This Quarter">This Quarter</option>
            </select>
          </div>

          <div className="ia-donut-wrapper">
            <div className="ia-donut-chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={claimsOverviewData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="count"
                  >
                    {claimsOverviewData.map((entry, index) => (
                      <Cell key={`claim-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(val: any, name: any) => [
                      `${val} claims`,
                      String(name),
                    ]}
                    contentStyle={{
                      backgroundColor: isDark ? "#0C262B" : "#FFFFFF",
                      borderColor: isDark ? "#163E44" : "#DCE7E3",
                      color: isDark ? "#F1F7F6" : "#102A43",
                      borderRadius: "8px",
                      fontSize: "0.8rem",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="ia-donut-center-label">
                <div className="ia-donut-center-value">{totalClaimsCount}</div>
                <div className="ia-donut-center-sub">Claims</div>
              </div>
            </div>

            <div className="ia-donut-legend">
              {claimsOverviewData.map((item) => (
                <div key={item.status} className="ia-donut-legend-item">
                  <div className="ia-donut-legend-left">
                    <span
                      className="ia-donut-legend-dot"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="ia-donut-legend-name">{item.status}</span>
                  </div>
                  <span className="ia-donut-legend-value">
                    {item.count} ({item.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Row 3: Upcoming Policy Renewals & Agent Performance (2 Columns) */}
      <div className="ia-row-2col">
        {/* Card 1: Upcoming Policy Renewals */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon emerald">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3 className="ia-card-title">Upcoming Policy Renewals</h3>
              {dataMode === "preview" && (
                <span className="ia-card-mini-tag">Reference Sample</span>
              )}
            </div>
            <Link
              to="/insurance-agency/renewals"
              className="ia-view-all-link"
            >
              View All →
            </Link>
          </div>

          <div className="ia-table-container">
            {displayedRenewals.length === 0 ? (
              <div className="ia-empty-state">
                <p>No upcoming renewals found in current tenant database.</p>
              </div>
            ) : (
              <table className="ia-table">
                <thead>
                  <tr>
                    <th>Policy Number</th>
                    <th>Policyholder</th>
                    <th>Insurance Type</th>
                    <th>Renewal Date</th>
                    <th>Premium Amount</th>
                    <th>Assigned Agent</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRenewals.map((item: UpcomingRenewalItem) => (
                    <tr key={item.id}>
                      <td>
                        <span className="ia-table-primary-text">
                          {item.policyNumber}
                        </span>
                      </td>
                      <td>{item.policyholder}</td>
                      <td>{item.insuranceType}</td>
                      <td>{item.renewalDate}</td>
                      <td className="ia-table-num">
                        {formatINR(item.premiumAmount)}
                      </td>
                      <td>
                        <div className="ia-agent-cell">
                          <span className="ia-avatar blue">
                            {item.agentInitials}
                          </span>
                          <span>{item.assignedAgent}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`ia-badge ${item.status
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Card 2: Agent Performance */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon teal">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <h3 className="ia-card-title">Agent Performance</h3>
              {dataMode === "preview" && (
                <span className="ia-card-mini-tag">Reference Sample</span>
              )}
            </div>
            <select
              className="ia-card-select"
              value={agentRange}
              onChange={(e) => setAgentRange(e.target.value)}
              aria-label="Filter agent performance period"
            >
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="This Year">This Year</option>
            </select>
          </div>

          <div className="ia-table-container">
            {displayedAgents.length === 0 ? (
              <div className="ia-empty-state">
                <p>No agent activity records found in current tenant.</p>
              </div>
            ) : (
              <table className="ia-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Policies Sold</th>
                    <th>Premium (₹)</th>
                    <th>Renewals</th>
                    <th>Open Tasks</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedAgents.map((agent) => (
                    <tr key={agent.id}>
                      <td>
                        <div className="ia-agent-cell">
                          <span className="ia-avatar teal">{agent.initials}</span>
                          <span className="ia-table-primary-text">
                            {agent.name}
                          </span>
                        </div>
                      </td>
                      <td className="ia-table-num">{agent.policiesSold}</td>
                      <td className="ia-table-num">{formatINR(agent.premium)}</td>
                      <td className="ia-table-num">{agent.renewals}</td>
                      <td className="ia-table-num">{agent.openTasks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 5. Row 4: Bottom 3 Columns */}
      <div className="ia-row-3col">
        {/* Card 1: Recent Policyholders */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon emerald">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="ia-card-title">Recent Policyholders</h3>
              {dataMode === "preview" && (
                <span className="ia-card-mini-tag">Reference Sample</span>
              )}
            </div>
            <Link
              to="/insurance-agency/clients"
              className="ia-view-all-link"
            >
              View All →
            </Link>
          </div>

          <div className="ia-table-container">
            {displayedPolicyholders.length === 0 ? (
              <div className="ia-empty-state">
                <p>No policyholders or client accounts created yet.</p>
              </div>
            ) : (
              <table className="ia-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Insurance Interest</th>
                    <th>Assigned Agent</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedPolicyholders.map((ph: RecentPolicyholderItem) => (
                    <tr key={ph.id}>
                      <td>
                        <div className="ia-agent-cell">
                          <span className="ia-avatar purple">{ph.initials}</span>
                          <span className="ia-table-primary-text">{ph.name}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: "0.775rem" }}>{ph.email}</td>
                      <td style={{ fontSize: "0.775rem" }}>{ph.phone}</td>
                      <td>{ph.insuranceInterest}</td>
                      <td>
                        <div className="ia-agent-cell">
                          <span className="ia-avatar amber">
                            {ph.agentInitials}
                          </span>
                          <span>{ph.assignedAgent}</span>
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{ph.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Card 2: Tasks & Follow-ups */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon teal">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
              </div>
              <h3 className="ia-card-title">Tasks & Follow-ups</h3>
              {dataMode === "preview" && (
                <span className="ia-card-mini-tag">Reference Sample</span>
              )}
            </div>
            <Link
              to="/insurance-agency/tasks"
              className="ia-view-all-link"
            >
              View All →
            </Link>
          </div>

          <div className="ia-table-container">
            {displayedTasks.length === 0 ? (
              <div className="ia-empty-state">
                <p>No active tasks or follow-ups found in current tenant.</p>
              </div>
            ) : (
              <table className="ia-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Related To</th>
                    <th>Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTasks.map((task: InsuranceTaskItem) => (
                    <tr key={task.id}>
                      <td>
                        <span className="ia-table-primary-text">
                          {task.title}
                        </span>
                      </td>
                      <td>
                        <div
                          className={`ia-task-type-badge ${task.type.toLowerCase()}`}
                          title={task.type}
                        >
                          {task.type === "Call" && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                            </svg>
                          )}
                          {task.type === "Email" && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                          )}
                          {task.type === "Claim" && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          )}
                          {task.type === "Document" && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                          )}
                          {task.type === "Meeting" && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                              <circle cx="9" cy="7" r="4" />
                            </svg>
                          )}
                        </div>
                      </td>
                      <td>{task.relatedTo}</td>
                      <td>{task.dueDate}</td>
                      <td>
                        <span
                          className={`ia-badge ${task.status
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {task.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Card 3: Recent Claims */}
        <div className="ia-card">
          <div className="ia-card-header">
            <div className="ia-card-title-group">
              <div className="ia-card-title-icon purple">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3 className="ia-card-title">Recent Claims</h3>
              <span
                className="ia-card-mini-tag ia-tag-notice"
                title="Claims backend database schema is not yet implemented. Prototype records displayed for UI preview."
              >
                Prototype Data
              </span>
            </div>
            <Link
              to="/insurance-agency/claims"
              className="ia-view-all-link"
            >
              View All →
            </Link>
          </div>

          <div className="ia-table-container">
            <table className="ia-table">
              <thead>
                <tr>
                  <th>Claim #</th>
                  <th>Policyholder</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentClaimsList.map((claim: RecentClaimItem) => (
                  <tr key={claim.id}>
                    <td>
                      <span className="ia-table-primary-text">
                        {claim.claimNumber}
                      </span>
                    </td>
                    <td>{claim.policyholder}</td>
                    <td>{claim.type}</td>
                    <td className="ia-table-num">{formatINR(claim.amount)}</td>
                    <td>
                      <span
                        className={`ia-badge ${claim.status
                          .toLowerCase()
                          .replace(/\s+/g, "-")}`}
                      >
                        {claim.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
