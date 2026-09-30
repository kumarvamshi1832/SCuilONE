import { DashboardSummary, TenantDetails, Activity } from "../types/dashboard";

export const mockTenant: TenantDetails = {
  id: "tenant-1",
  name: "GreenLeaf Real Estate",
  industry: "real_estate",
};

export const mockDashboardSummary: DashboardSummary = {
  totalProperties: 120,
  activeListings: 84,
  totalLeads: 245,
  openDeals: 32,
  siteVisits: 18,
  bookings: 12,
};

export const mockActivities: Activity[] = [
  { id: "1", description: "New property listed in Downtown", timestamp: "2 hours ago" },
  { id: "2", description: "Site visit completed by Sneha Reddy", timestamp: "4 hours ago" },
  { id: "3", description: "Deal closed for Unit 402", timestamp: "1 day ago" },
];
