
import type {
  DashboardSummary,
  TenantDetails,
  Activity,
} from "../types/dashboard";
import { apiClient } from "./authService";

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  const response = await apiClient.get("/api/v1/dashboard/summary");
  const data = response.data;

  return {
    totalProperties: -1,
    activeListings: -1,
    totalLeads: data.summary.total_leads,
    openDeals: data.summary.open_deals,
    siteVisits: -1,
    bookings: -1,
    qualifiedLeads: data.summary.qualified_leads,
    totalContacts: data.summary.total_contacts,
    totalAccounts: data.summary.total_accounts,
    totalDeals: data.summary.total_deals,
    wonRevenue: data.summary.won_revenue,
    pendingTasks: data.summary.pending_tasks,
    completedTasks: data.summary.completed_tasks,
    overdueTasks: data.summary.overdue_tasks,
    leadStatusBreakdown: data.lead_status_breakdown,
    dealStageBreakdown: data.deal_stage_breakdown,
  };
};

export const getTenantDetails = async (): Promise<TenantDetails> => {
  const tenantStr = sessionStorage.getItem("tenant");

  if (tenantStr) {
    try {
      return JSON.parse(tenantStr);
    } catch {
      // Fall back to the default tenant details.
    }
  }

  return { id: "", name: "Unknown", industry: "real-estate" };
};

export const getRecentActivities = async (): Promise<Activity[]> => {
  return [];
};
