import { DashboardSummary, TenantDetails, Activity } from "../types/dashboard";
import { apiClient } from "./authService";
import { calculateTaskSummary } from "../utils/taskStatus";

const DEFAULT_SUMMARY: DashboardSummary = {
  totalProperties: 0,
  activeListings: 0,
  totalLeads: 0,
  openDeals: 0,
  siteVisits: 0,
  bookings: 0,
  qualifiedLeads: 0,
  totalContacts: 0,
  totalAccounts: 0,
  totalDeals: 0,
  wonRevenue: 0,
  pendingTasks: 0,
  completedTasks: 0,
  overdueTasks: 0,
  leadStatusBreakdown: [],
  dealStageBreakdown: [],
};

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  try {
    const token = sessionStorage.getItem("access_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const [summaryRes, activitiesRes, propertiesRes, siteVisitsRes, bookingsRes] =
      await Promise.allSettled([
        apiClient.get<{
          summary?: {
            total_leads?: number;
            qualified_leads?: number;
            total_contacts?: number;
            total_accounts?: number;
            total_deals?: number;
            open_deals?: number;
            won_revenue?: number;
            pending_tasks?: number;
            completed_tasks?: number;
            overdue_tasks?: number;
          };
          lead_status_breakdown?: { status: string; count: number }[];
          deal_stage_breakdown?: { stage: string; count: number }[];
        }>("/api/v1/dashboard/summary", { headers }),
        apiClient.get<any[]>("/api/v1/activities/", { headers }),
        apiClient.get<any[]>("/api/v1/properties/?limit=100", { headers }),
        apiClient.get<any[]>("/api/v1/site-visits/", { headers }),
        apiClient.get<any[]>("/api/v1/bookings/", { headers }),
      ]);

    let totalProperties = 0;
    let activeListings = 0;
    if (
      propertiesRes.status === "fulfilled" &&
      Array.isArray(propertiesRes.value.data)
    ) {
      totalProperties = propertiesRes.value.data.length;
      activeListings = propertiesRes.value.data.filter(
        (p: any) => p.status === "Available"
      ).length;
    }

    let siteVisits = 0;
    if (
      siteVisitsRes.status === "fulfilled" &&
      Array.isArray(siteVisitsRes.value.data)
    ) {
      siteVisits = siteVisitsRes.value.data.length;
    }

    let bookings = 0;
    if (
      bookingsRes.status === "fulfilled" &&
      Array.isArray(bookingsRes.value.data)
    ) {
      bookings = bookingsRes.value.data.length;
    }

    if (summaryRes.status === "fulfilled") {
      const data = summaryRes.value.data;
      if (data && data.summary) {
        let completedTasks = Number(data.summary.completed_tasks ?? 0);
        let overdueTasks = Number(data.summary.overdue_tasks ?? 0);
        let pendingTasks = Math.max(
          0,
          Number(data.summary.pending_tasks ?? 0) - overdueTasks
        );

        // Derive accurate task metrics directly from actual activity records when available
        if (
          activitiesRes.status === "fulfilled" &&
          Array.isArray(activitiesRes.value.data)
        ) {
          const stats = calculateTaskSummary(activitiesRes.value.data);
          completedTasks = stats.completed;
          pendingTasks = stats.pending;
          overdueTasks = stats.overdue;
        }

        return {
          totalProperties,
          activeListings,
          totalLeads: Number(data.summary.total_leads ?? 0),
          openDeals: Number(data.summary.open_deals ?? 0),
          siteVisits,
          bookings,
          qualifiedLeads: Number(data.summary.qualified_leads ?? 0),
          totalContacts: Number(data.summary.total_contacts ?? 0),
          totalAccounts: Number(data.summary.total_accounts ?? 0),
          totalDeals: Number(data.summary.total_deals ?? 0),
          wonRevenue: Number(data.summary.won_revenue ?? 0),
          pendingTasks,
          completedTasks,
          overdueTasks,
          leadStatusBreakdown: Array.isArray(data.lead_status_breakdown)
            ? data.lead_status_breakdown
            : [],
          dealStageBreakdown: Array.isArray(data.deal_stage_breakdown)
            ? data.deal_stage_breakdown
            : [],
        };
      }
    }
    return {
      ...DEFAULT_SUMMARY,
      totalProperties,
      activeListings,
      siteVisits,
      bookings,
    };
  } catch (error) {
    return DEFAULT_SUMMARY;
  }
};


export const getTenantDetails = async (): Promise<TenantDetails> => {
  const tenantStr = sessionStorage.getItem("tenant");
  if (tenantStr) {
    try {
      return JSON.parse(tenantStr);
    } catch (e) {}
  }
  return { id: "", name: "Unknown", industry: "" };
};

export const getRecentActivities = async (): Promise<Activity[]> => {
  return [];
};
