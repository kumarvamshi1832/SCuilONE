import { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell
} from "recharts";

import { getAccounts } from "../../services/accountService";
import { getLeads } from "../../services/leadService";
import { getDeals } from "../../services/dealService";
import { getActivities } from "../../services/activityService";
import { getUsers } from "../../services/userService";

import type { Account } from "../../types/account";
import type { Lead } from "../../types/lead";
import type { Deal } from "../../types/deal";
import type { Activity } from "../../types/activity";
import type { User } from "../../types/user";

import { prototypeCampaigns, prototypeBudgetOverview } from "../../data/digitalMarketingMockData";
import { useTheme } from "../../context/ThemeContext";
import LeadFormModal from "../../components/leads/LeadFormModal";
import { formatDateTime } from "../../utils/dateFormatter";
import heroImg from "../../assets/marketing_hero.jpg";
import "./DigitalMarketingAgencyDashboard.css";

const CHANNEL_COLORS: Record<string, string> = {
  "Google Ads": "#3b82f6",
  "Website": "#0d9488",
  "Social Media": "#8b5cf6",
  "Meta Ads": "#059669",
  "Email Campaign": "#ec4899",
  "Email Marketing": "#ec4899",
  "LinkedIn Ads": "#0284c7",
  "Referral": "#f59e0b",
  "Organic Search": "#10b981",
  "SEO Organic": "#10b981",
  "Phone Inquiry": "#6366f1",
  "Walk-in": "#64748b",
  "Other": "#94a3b8",
};

export default function DigitalMarketingAgencyDashboard() {
  const navigate = useNavigate();
  const { theme } = useTheme();

  // Multi-source reactive dark mode detector to guarantee synchronization
  const [effectiveTheme, setEffectiveTheme] = useState<string>(() => {
    if (typeof document !== "undefined") {
      const isBodyDark = document.body.classList.contains("dark") || document.body.className.includes("dark");
      const isHtmlDark = document.documentElement.classList.contains("dark") || document.documentElement.className.includes("dark");
      const isWrapperDark = !!document.querySelector(".dashboard-wrapper.dark");
      if (theme === "dark" || isBodyDark || isHtmlDark || isWrapperDark) return "dark";
    }
    return theme || "light";
  });

  useEffect(() => {
    const checkDark = () => {
      const isBodyDark = document.body.classList.contains("dark") || document.body.className.includes("dark");
      const isHtmlDark = document.documentElement.classList.contains("dark") || document.documentElement.className.includes("dark");
      const isWrapperDark = !!document.querySelector(".dashboard-wrapper.dark");
      const currentDark = theme === "dark" || isBodyDark || isHtmlDark || isWrapperDark;
      setEffectiveTheme(currentDark ? "dark" : "light");
    };

    checkDark();

    const observer = new MutationObserver(checkDark);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, [theme]);

  const isDark = effectiveTheme === "dark";

  // Authentication & Tenant details
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  // Real CRM Data States
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Loading & Error States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [dateRange, setDateRange] = useState<string>("30d");
  const [campaignChannelFilter, setCampaignChannelFilter] = useState<string>("ALL");
  const [isLeadModalOpen, setIsLeadModalOpen] = useState(false);

  // Load Session User
  useEffect(() => {
    const storedUser = sessionStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser({
          name: parsed.first_name || parsed.full_name || parsed.name || "Agency Lead",
          role: parsed.role || "Tenant Admin"
        });
      } catch (e) {
        setUser({ name: "Agency Lead", role: "Tenant Admin" });
      }
    } else {
      setUser({ name: "Agency Lead", role: "Tenant Admin" });
    }
  }, []);

  // Fetch all real CRM data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accRes, leadRes, dealRes, actRes, userRes] = await Promise.allSettled([
        getAccounts(),
        getLeads(),
        getDeals(),
        getActivities(),
        getUsers(),
      ]);

      if (accRes.status === "fulfilled") setAccounts(accRes.value || []);
      if (leadRes.status === "fulfilled") setLeads(leadRes.value || []);
      if (dealRes.status === "fulfilled") setDeals(dealRes.value || []);
      if (actRes.status === "fulfilled") setActivities(actRes.value || []);
      if (userRes.status === "fulfilled") setUsers(userRes.value || []);
    } catch (err) {
      setError("Failed to load some dashboard metrics. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Lookup Maps
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => {
      map.set(u.id, u.full_name || u.email || "Unassigned");
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

  // Date Filter Logic for Real Data
  const filteredLeads = useMemo(() => {
    if (dateRange === "all") return leads;
    const now = new Date();
    const daysMap: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 };
    const days = daysMap[dateRange] || 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    return leads.filter((l) => {
      if (!l.created_at) return true;
      return new Date(l.created_at) >= cutoff;
    });
  }, [leads, dateRange]);

  // Calculated Real KPIs
  const totalClients = useMemo(() => {
    return accounts.filter((a) => (a.status || "").toLowerCase() === "active").length || accounts.length;
  }, [accounts]);

  const totalMarketingLeads = filteredLeads.length;

  const convertedLeadsCount = useMemo(() => {
    return filteredLeads.filter((l) => (l.status || "").toLowerCase() === "converted").length;
  }, [filteredLeads]);

  const conversionRate = useMemo(() => {
    if (totalMarketingLeads === 0) return 0;
    return ((convertedLeadsCount / totalMarketingLeads) * 100).toFixed(1);
  }, [totalMarketingLeads, convertedLeadsCount]);

  // Revenue in Indian Rupees (₹)
  const totalRevenueINR = useMemo(() => {
    const wonDeals = deals.filter((d) => (d.stage || "").toLowerCase().includes("won"));
    const sum = wonDeals.reduce((acc, d) => acc + (d.amount || 0), 0);
    // If won deals amount is 0, also consider total pipeline amount for visibility
    if (sum > 0) return sum;
    const pipelineSum = deals.reduce((acc, d) => acc + (d.amount || 0), 0);
    return pipelineSum;
  }, [deals]);

  const formatINR = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Channel Performance from REAL Lead Sources
  const channelData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredLeads.forEach((l) => {
      const src = l.source || "Other";
      counts[src] = (counts[src] || 0) + 1;
    });

    const data = Object.entries(counts).map(([name, value]) => ({
      name,
      value,
      fill: CHANNEL_COLORS[name] || "#94a3b8",
    }));

    // If no real leads yet, show benchmark channels for initial visualization with 0 counts
    if (data.length === 0) {
      return [
        { name: "Google Ads", value: 0, fill: "#3b82f6" },
        { name: "Social Media", value: 0, fill: "#8b5cf6" },
        { name: "Website", value: 0, fill: "#0d9488" },
        { name: "Referral", value: 0, fill: "#f59e0b" },
      ];
    }
    return data;
  }, [filteredLeads]);

  // Lead Conversion Funnel from REAL Lead Statuses
  const funnelData = useMemo(() => {
    const stageCounts = {
      New: 0,
      Contacted: 0,
      Qualified: 0,
      Converted: 0,
      Lost: 0,
    };

    filteredLeads.forEach((l) => {
      const s = (l.status || "New").toLowerCase();
      if (s === "new") stageCounts.New++;
      else if (s === "contacted") stageCounts.Contacted++;
      else if (s === "qualified") stageCounts.Qualified++;
      else if (s === "converted") stageCounts.Converted++;
      else if (s === "lost") stageCounts.Lost++;
      else stageCounts.New++;
    });

    const max = Math.max(totalMarketingLeads, 1);

    return [
      { name: "New Inquiries", stage: "New", count: stageCounts.New, color: "#3b82f6", pct: Math.round((stageCounts.New / max) * 100) },
      { name: "Contacted", stage: "Contacted", count: stageCounts.Contacted, color: "#f59e0b", pct: Math.round((stageCounts.Contacted / max) * 100) },
      { name: "Qualified", stage: "Qualified", count: stageCounts.Qualified, color: "#8b5cf6", pct: Math.round((stageCounts.Qualified / max) * 100) },
      { name: "Converted Clients", stage: "Converted", count: stageCounts.Converted, color: "#10b981", pct: Math.round((stageCounts.Converted / max) * 100) },
      { name: "Lost / Disqualified", stage: "Lost", count: stageCounts.Lost, color: "#ef4444", pct: Math.round((stageCounts.Lost / max) * 100) },
    ];
  }, [filteredLeads, totalMarketingLeads]);

  // Filtered Prototype Campaigns
  const filteredCampaigns = useMemo(() => {
    if (campaignChannelFilter === "ALL") return prototypeCampaigns;
    return prototypeCampaigns.filter((c) => c.channel === campaignChannelFilter);
  }, [campaignChannelFilter]);

  // Team Workload Summary
  const teamWorkload = useMemo(() => {
    return users.slice(0, 6).map((u) => {
      const assignedLeadCount = leads.filter((l) => l.assigned_to === u.id).length;
      const assignedTaskCount = activities.filter((a) => a.assigned_to === u.id).length;
      return {
        id: u.id,
        name: u.full_name || u.email,
        role: u.role || "Marketer",
        leadCount: assignedLeadCount,
        taskCount: assignedTaskCount,
      };
    });
  }, [users, leads, activities]);

  return (
    <div className={`dma-dashboard ${isDark ? "dark" : ""}`}>
      {/* Top Header & Controls */}
      <div className="dma-top-bar">
        <div className="dma-title-group">
          <h1>Digital Marketing Agency Dashboard</h1>
          <p>Manage clients, campaigns, leads, and marketing performance.</p>
        </div>

        <div className="dma-controls-group">
          <select
            className="dma-date-select"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            aria-label="Filter data by time period"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">This Quarter (90 Days)</option>
            <option value="365d">Year to Date (365 Days)</option>
            <option value="all">All Time</option>
          </select>

          <button
            className="dma-btn-action dma-btn-primary"
            onClick={() => setIsLeadModalOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Lead
          </button>

          <button
            className="dma-btn-action dma-btn-secondary"
            onClick={() => navigate("/digital-marketing-agency/clients")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            New Client
          </button>

          <button
            className="dma-btn-action dma-btn-secondary"
            onClick={fetchData}
            title="Refresh dashboard data"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M23 4v6h-6M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.25)", padding: "12px 18px", borderRadius: "10px", marginBottom: "20px", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {/* Visual Showcase Banner */}
      <div className="dma-banner">
        <div className="dma-banner-content">
          <div className="dma-badge-pill">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Agency Command Center
          </div>
          <h2>Welcome back, {user?.name}! 🚀</h2>
          <p>
            Real-time multi-channel digital performance, pipeline conversion rates, and client management.
          </p>
          <div className="dma-banner-metrics">
            <div className="dma-banner-stat">
              <span className="dma-banner-stat-value">{totalClients}</span>
              <span className="dma-banner-stat-label">Active Clients</span>
            </div>
            <div className="dma-banner-stat">
              <span className="dma-banner-stat-value">{totalMarketingLeads}</span>
              <span className="dma-banner-stat-label">Inbound Leads</span>
            </div>
            <div className="dma-banner-stat">
              <span className="dma-banner-stat-value">{conversionRate}%</span>
              <span className="dma-banner-stat-label">Conversion Rate</span>
            </div>
            <div className="dma-banner-stat">
              <span className="dma-banner-stat-value">{formatINR(totalRevenueINR)}</span>
              <span className="dma-banner-stat-label">Pipeline Value</span>
            </div>
          </div>
        </div>
        <div className="dma-banner-img">
          <img src={heroImg} alt="Digital Marketing Operations Hub" />
        </div>
      </div>

      {/* 5 KPI Summary Cards (Section 7) */}
      <div className="dma-kpi-grid">
        {/* Card 1 — Total Clients */}
        <div className="dma-kpi-card teal">
          <div className="dma-kpi-header">
            <span className="dma-kpi-title">Total Clients</span>
            <div className="dma-kpi-icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
          </div>
          <div className="dma-kpi-value">{loading ? "..." : totalClients}</div>
          <div className="dma-kpi-subtext">
            <span>Verified Client Accounts</span>
          </div>
        </div>

        {/* Card 2 — Active Campaigns */}
        <div className="dma-kpi-card violet">
          <div className="dma-kpi-header">
            <span className="dma-kpi-title">Active Campaigns</span>
            <div className="dma-kpi-icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
          </div>
          <div className="dma-kpi-value">
            {prototypeCampaigns.filter((c) => c.status === "Active").length}
          </div>
          <div className="dma-kpi-subtext">
            <span className="dma-kpi-tag-prototype">Integration Pending</span>
            <span>Google/Meta Ads</span>
          </div>
        </div>

        {/* Card 3 — Total Leads */}
        <div className="dma-kpi-card blue">
          <div className="dma-kpi-header">
            <span className="dma-kpi-title">Total Leads</span>
            <div className="dma-kpi-icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </div>
          <div className="dma-kpi-value">{loading ? "..." : totalMarketingLeads}</div>
          <div className="dma-kpi-subtext">
            <span>Inbound Tenant Leads</span>
          </div>
        </div>

        {/* Card 4 — Conversions */}
        <div className="dma-kpi-card emerald">
          <div className="dma-kpi-header">
            <span className="dma-kpi-title">Conversions</span>
            <div className="dma-kpi-icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
          </div>
          <div className="dma-kpi-value">{loading ? "..." : `${convertedLeadsCount}`}</div>
          <div className="dma-kpi-subtext">
            <span>{conversionRate}% conversion rate</span>
          </div>
        </div>

        {/* Card 5 — Marketing Revenue (in INR ₹) */}
        <div className="dma-kpi-card amber">
          <div className="dma-kpi-header">
            <span className="dma-kpi-title">Marketing Revenue</span>
            <div className="dma-kpi-icon-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
          </div>
          <div className="dma-kpi-value" style={{ fontSize: "1.45rem" }}>
            {loading ? "..." : formatINR(totalRevenueINR)}
          </div>
          <div className="dma-kpi-subtext">
            <span>{deals.length} deals in pipeline</span>
          </div>
        </div>
      </div>

      {/* Row 1: Campaign Performance & Marketing Budget Overview */}
      <div className="dma-grid-2col">
        {/* Campaign Performance Panel (Section 8) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Campaign Performance
                <span className="dma-tag-prototype">Frontend Prototype</span>
              </h3>
              <div className="dma-card-subtitle">
                Live ad platform ingestion requires Google Ads / Meta Marketing API connector
              </div>
            </div>

            <div style={{ display: "flex", gap: "6px" }}>
              <select
                className="dma-date-select"
                style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                value={campaignChannelFilter}
                onChange={(e) => setCampaignChannelFilter(e.target.value)}
              >
                <option value="ALL">All Channels</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="LinkedIn Ads">LinkedIn Ads</option>
                <option value="SEO Organic">SEO Organic</option>
                <option value="Email Marketing">Email Marketing</option>
              </select>
            </div>
          </div>

          <div className="dma-table-container">
            <table className="dma-table">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Budget</th>
                  <th>Spend</th>
                  <th>Leads</th>
                  <th>Conv.</th>
                  <th>CPL</th>
                </tr>
              </thead>
              <tbody>
                {filteredCampaigns.map((camp) => (
                  <tr key={camp.id}>
                    <td>
                      <div className="dma-table-primary-text">{camp.name}</div>
                      <span className="dma-table-secondary-text">
                        {camp.startDate} - {camp.endDate}
                      </span>
                    </td>
                    <td>
                      <span className="dma-channel-tag">{camp.channel}</span>
                    </td>
                    <td>
                      <span className={`dma-badge dma-badge-${camp.status.toLowerCase()}`}>
                        {camp.status}
                      </span>
                    </td>
                    <td className="dma-table-num-cell">{formatINR(camp.budget)}</td>
                    <td className="dma-table-num-cell bold">{formatINR(camp.spend)}</td>
                    <td className="dma-table-leads-cell">{camp.leadsGenerated}</td>
                    <td className="dma-table-conv-cell">{camp.conversions}</td>
                    <td className="dma-table-cpl-cell">{formatINR(camp.costPerLead)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Marketing Budget Overview (Section 11) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Marketing Budget Overview
                <span className="dma-tag-prototype">Demo Model</span>
              </h3>
              <div className="dma-card-subtitle">
                Total ad budget vs actual expenditures across active accounts
              </div>
            </div>
          </div>

          <div className="dma-budget-grid">
            <div className="dma-budget-card">
              <div className="dma-budget-label">Total Budget</div>
              <div className="dma-budget-value total">
                {formatINR(prototypeBudgetOverview.totalBudget)}
              </div>
            </div>

            <div className="dma-budget-card">
              <div className="dma-budget-label">Actual Spend</div>
              <div className="dma-budget-value spend">
                {formatINR(prototypeBudgetOverview.actualSpend)}
              </div>
            </div>

            <div className="dma-budget-card">
              <div className="dma-budget-label">Remaining</div>
              <div className="dma-budget-value remaining">
                {formatINR(prototypeBudgetOverview.remainingBudget)}
              </div>
            </div>

            <div className="dma-budget-card">
              <div className="dma-budget-label">Avg Cost / Lead</div>
              <div className="dma-budget-value cpl">
                {formatINR(prototypeBudgetOverview.averageCostPerLead)}
              </div>
            </div>
          </div>

          <div className="dma-budget-progress-section">
            <div className="dma-budget-progress-header">
              <span className="dma-budget-progress-title">Budget Utilization</span>
              <span className="dma-budget-progress-pct">
                {Math.round((prototypeBudgetOverview.actualSpend / prototypeBudgetOverview.totalBudget) * 100)}%
              </span>
            </div>
            <div className="dma-budget-track">
              <div
                className="dma-budget-fill"
                style={{
                  width: `${Math.round((prototypeBudgetOverview.actualSpend / prototypeBudgetOverview.totalBudget) * 100)}%`,
                }}
              />
            </div>
            <p className="dma-budget-helper-text">
              ⓘ To connect live agency ad budgets with automatic spend sync, configure the Google Ads &amp; Meta Ads connector in Settings.
            </p>
          </div>
        </div>
      </div>

      {/* Row 2: Marketing Channel Performance & Lead Conversion Funnel */}
      <div className="dma-grid-2col">
        {/* Channel Performance (Section 9 - REAL Data from Leads API) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Channel Performance
                <span className="dma-tag-real">Live Lead Data</span>
              </h3>
              <div className="dma-card-subtitle">
                Lead distribution across inbound acquisition sources
              </div>
            </div>
          </div>

          {channelData.length === 0 || channelData.every((c) => c.value === 0) ? (
            <div className="dma-empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 20V10M18 20V4M6 20v-4" />
              </svg>
              <h4>No Lead Source Data</h4>
              <p>Add marketing leads with sources like Google Ads, Social Media, or Website to see channel insights.</p>
              <button
                className="dma-btn-action dma-btn-primary"
                style={{ marginTop: "12px" }}
                onClick={() => setIsLeadModalOpen(true)}
              >
                Add First Lead
              </button>
            </div>
          ) : (
            <div className="dma-chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelData} margin={{ top: 15, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? "rgba(255, 255, 255, 0.08)" : "#e2e8f0"}
                  />
                  <XAxis
                    dataKey="name"
                    stroke={isDark ? "#94a3b8" : "#64748b"}
                    tick={{ fill: isDark ? "#cbd5e1" : "#64748b", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={isDark ? "#94a3b8" : "#64748b"}
                    tick={{ fill: isDark ? "#cbd5e1" : "#64748b", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: isDark ? "#1e293b" : "#ffffff",
                      borderColor: isDark ? "#475569" : "#e2e8f0",
                      color: isDark ? "#f8fafc" : "#0f172a",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }}
                    cursor={{ fill: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)" }}
                  />
                  <Bar dataKey="value" name="Leads" radius={[4, 4, 0, 0]} barSize={28}>
                    {channelData.map((entry, idx) => (
                      <Cell key={`cell-${idx}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Lead Conversion Funnel (Section 10 - REAL Data from Leads API) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Lead Conversion Funnel
                <span className="dma-tag-real">Live Pipeline</span>
              </h3>
              <div className="dma-card-subtitle">
                Progression of inbound marketing leads through agency stages
              </div>
            </div>
          </div>

          <div className="dma-funnel-list">
            {funnelData.map((stage) => (
              <div key={stage.stage} className="dma-funnel-stage">
                <div className="dma-funnel-header">
                  <span className="dma-funnel-name">
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: stage.color }}></span>
                    {stage.name}
                  </span>
                  <span className="dma-funnel-stats">
                    {stage.count} leads ({stage.pct}%)
                  </span>
                </div>
                <div className="dma-funnel-bar-track">
                  <div
                    className="dma-funnel-bar-fill"
                    style={{ width: `${Math.max(stage.pct, 4)}%`, backgroundColor: stage.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Recent Marketing Leads & Recent Clients */}
      <div className="dma-grid-2col">
        {/* Recent Marketing Leads Table (Section 12 - REAL Data) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Recent Marketing Leads
                <span className="dma-tag-real">Live Leads</span>
              </h3>
              <div className="dma-card-subtitle">Latest inbound prospects across client campaigns</div>
            </div>
            <Link to="/digital-marketing-agency/leads" className="dma-view-all-link">
              View All ({leads.length})
            </Link>
          </div>

          {leads.length === 0 ? (
            <div className="dma-empty-state">
              <p>No leads found for this agency tenant.</p>
              <button
                className="dma-btn-action dma-btn-primary"
                style={{ marginTop: "10px" }}
                onClick={() => setIsLeadModalOpen(true)}
              >
                Create Lead
              </button>
            </div>
          ) : (
            <div className="dma-table-container">
              <table className="dma-table">
                <thead>
                  <tr>
                    <th>Lead Name</th>
                    <th>Company</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Assigned To</th>
                    <th>Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 6).map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <div className="dma-table-primary-text">{lead.full_name}</div>
                        <span className="dma-table-secondary-text">{lead.email || "No email"}</span>
                      </td>
                      <td>
                        <span className="dma-table-primary-text">{lead.account_id ? accountMap.get(lead.account_id) || "Client Account" : "Direct"}</span>
                      </td>
                      <td>
                        <span className="dma-channel-tag">{lead.source || "Website"}</span>
                      </td>
                      <td>
                        <span className={`dma-lead-status dma-status-${(lead.status || "new").toLowerCase()}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td><span className="dma-table-primary-text">{lead.assigned_to ? userMap.get(lead.assigned_to) || "Unassigned" : "Unassigned"}</span></td>
                      <td className="dma-table-secondary-text">
                        {lead.created_at ? formatDateTime(lead.created_at) : "N/A"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Client Accounts (Section 13 - REAL Data) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Recent Clients
                <span className="dma-tag-real">Live Accounts</span>
              </h3>
              <div className="dma-card-subtitle">Active business accounts under marketing management</div>
            </div>
            <Link to="/digital-marketing-agency/clients" className="dma-view-all-link">
              View All ({accounts.length})
            </Link>
          </div>

          {accounts.length === 0 ? (
            <div className="dma-empty-state">
              <p>No client accounts registered yet.</p>
              <button
                className="dma-btn-action dma-btn-secondary"
                style={{ marginTop: "10px" }}
                onClick={() => navigate("/digital-marketing-agency/clients")}
              >
                Add Client Account
              </button>
            </div>
          ) : (
            <div className="dma-table-container">
              <table className="dma-table">
                <thead>
                  <tr>
                    <th>Client/Account Name</th>
                    <th>Industry</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.slice(0, 6).map((acc) => (
                    <tr key={acc.id}>
                      <td>
                        <div className="dma-table-primary-text">{acc.name}</div>
                        <span className="dma-table-secondary-text">
                          {acc.website || acc.email || "No website"}
                        </span>
                      </td>
                      <td><span className="dma-table-primary-text">{acc.industry || "General"}</span></td>
                      <td><span className="dma-table-primary-text">{acc.assigned_to ? userMap.get(acc.assigned_to) || "Team" : "Unassigned"}</span></td>
                      <td>
                        <span className={`dma-badge dma-badge-${(acc.status || "active").toLowerCase() === "active" ? "active" : "paused"}`}>
                          {acc.status || "Active"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Tasks & Marketing Activities & Team Performance */}
      <div className="dma-grid-2col">
        {/* Tasks & Activities (Section 14 - REAL Data) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Tasks & Activities
                <span className="dma-tag-real">Live Activities</span>
              </h3>
              <div className="dma-card-subtitle">
                Campaign reviews, client calls, reporting tasks, and creative deliverables
              </div>
            </div>
            <Link to="/digital-marketing-agency/activities" className="dma-view-all-link">
              View All ({activities.length})
            </Link>
          </div>

          {activities.length === 0 ? (
            <div className="dma-empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              <h4>No Activities Scheduled</h4>
              <p>Create tasks for campaign review meetings, client follow-up calls, or monthly marketing reports.</p>
            </div>
          ) : (
            <div className="dma-table-container">
              <table className="dma-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Related Client or Lead</th>
                    <th>Due Date</th>
                    <th>Assigned To</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.slice(0, 5).map((act) => (
                    <tr key={act.id}>
                      <td>
                        <div className="dma-table-primary-text">{act.title}</div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                          <span className="dma-channel-tag">{act.activity_type}</span>
                          {act.description && (
                            <span className="dma-table-secondary-text" style={{ marginTop: 0 }}>
                              {act.description.substring(0, 30)}
                              {act.description.length > 30 ? "..." : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="dma-table-primary-text">
                          {act.account_id
                            ? accountMap.get(act.account_id) || "Client"
                            : act.lead_id
                            ? "Lead"
                            : "General"}
                        </span>
                      </td>
                      <td className="dma-table-secondary-text">
                        {act.due_date ? formatDateTime(act.due_date) : "Open"}
                      </td>
                      <td><span className="dma-table-primary-text">{act.assigned_to ? userMap.get(act.assigned_to) || "Team" : "Unassigned"}</span></td>
                      <td>
                        <span className={`dma-badge dma-badge-${act.status.toLowerCase() === "completed" ? "completed" : "active"}`}>
                          {act.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Team Performance & Workload (Section 15 - REAL Data) */}
        <div className="dma-card">
          <div className="dma-card-header">
            <div>
              <h3>
                Team Marketing Workload
                <span className="dma-tag-real">Live Team</span>
              </h3>
              <div className="dma-card-subtitle">
                Lead assignment volume and pending tasks by marketing specialist
              </div>
            </div>
            <Link to="/digital-marketing-agency/users" className="dma-view-all-link">
              Manage Team ({users.length})
            </Link>
          </div>

          {users.length === 0 ? (
            <div className="dma-empty-state">
              <p>No team members found for this agency.</p>
            </div>
          ) : (
            <div className="dma-team-grid">
              {teamWorkload.map((member) => (
                <div key={member.id} className="dma-team-card">
                  <div className="dma-avatar">
                    {(member.name || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="dma-team-info">
                    <div className="dma-team-name">{member.name}</div>
                    <div className="dma-team-meta">
                      <span>{member.role}</span>
                      <div className="dma-team-stats-pill">
                        {member.leadCount} leads • {member.taskCount} tasks
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Reusable LeadFormModal for creating real marketing leads */}
      {isLeadModalOpen && (
        <LeadFormModal
          onClose={() => setIsLeadModalOpen(false)}
          onSuccess={() => {
            setIsLeadModalOpen(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}
