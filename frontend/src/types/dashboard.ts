

export interface DashboardSummary {
  totalProperties: number;
  activeListings: number;
  totalLeads: number;
  openDeals: number;
  siteVisits: number;
  bookings: number;
}

export interface TenantDetails {
  id: string;
  name: string;
  industry: string;
}

export interface Activity {
  id: string;
  description: string;
  timestamp: string;
}
