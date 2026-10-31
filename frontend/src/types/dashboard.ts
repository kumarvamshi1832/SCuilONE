export interface DashboardSummary {
  totalProperties: number | null;
  activeListings: number | null;
  totalLeads: number | null;
  openDeals: number | null;
  siteVisits: number | null;
  bookings: number | null;

  qualifiedLeads: number | null;
  totalContacts: number | null;
  totalAccounts: number | null;
  totalDeals: number | null;
  wonRevenue: number | null;
  pendingTasks: number | null;
  completedTasks: number | null;
  overdueTasks: number | null;

  leadStatusBreakdown: {
    status: string;
    count: number;
  }[];

  dealStageBreakdown: {
    stage: string;
    count: number;
  }[];
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
