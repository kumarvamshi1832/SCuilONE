
export interface DashboardSummary {
  totalProperties: number;
  activeListings: number;
  totalLeads: number;
  openDeals: number;
  siteVisits: number;
  bookings: number;

  qualifiedLeads: number;
  totalContacts: number;
  totalAccounts: number;
  totalDeals: number;
  wonRevenue: number;
  pendingTasks: number;
  completedTasks: number;
  overdueTasks: number;

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
