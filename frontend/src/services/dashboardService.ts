import { DashboardSummary, TenantDetails, Activity } from "../types/dashboard";
import { getLeads } from "./leadService";

export const getDashboardSummary = async (): Promise<DashboardSummary> => {
  let totalLeads = 0;
  try {
    const leads = await getLeads();
    totalLeads = leads.length;
  } catch (e) {
    // If permission denied or other error, it remains 0 or we can handle it
  }

  return {
    totalProperties: -1, // Use -1 or similar to indicate N/A in the UI
    activeListings: -1,
    totalLeads,
    openDeals: -1,
    siteVisits: -1,
    bookings: -1,
  };
};

export const getTenantDetails = async (): Promise<TenantDetails> => {
  const tenantStr = sessionStorage.getItem("tenant");
  if (tenantStr) {
    try {
      return JSON.parse(tenantStr);
    } catch (e) {}
  }
  return { id: "", name: "Unknown", industry: "real-estate" };
};

export const getRecentActivities = async (): Promise<Activity[]> => {
  return []; // No real backend API exists for activities
};
