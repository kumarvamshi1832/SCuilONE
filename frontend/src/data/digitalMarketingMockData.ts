export interface CampaignItem {
  id: string;
  name: string;
  channel: 'Google Ads' | 'Meta Ads' | 'LinkedIn Ads' | 'Email Marketing' | 'SEO Organic' | 'Twitter/X Ads';
  status: 'Active' | 'Paused' | 'Completed' | 'Draft';
  budget: number; // in INR (₹)
  spend: number;  // in INR (₹)
  leadsGenerated: number;
  conversions: number;
  costPerLead: number; // in INR (₹)
  startDate: string;
  endDate: string;
}

export interface BudgetOverview {
  totalBudget: number;
  actualSpend: number;
  remainingBudget: number;
  averageCostPerLead: number;
  currency: string;
}

/**
 * Notice: The SCuilONE backend does not currently have a dedicated 'Campaigns' or
 * 'Ad Spend' database model or external ad network API integration (e.g. Google Ads, Meta Graph API).
 * The following campaign metrics serve as a frontend benchmark/prototype until backend
 * campaign ingestion tables and ad connectors are established.
 */
export const prototypeCampaigns: CampaignItem[] = [
  {
    id: "camp-001",
    name: "Q4 SaaS Enterprise Lead Gen",
    channel: "Google Ads",
    status: "Active",
    budget: 250000,
    spend: 184500,
    leadsGenerated: 142,
    conversions: 38,
    costPerLead: 1299,
    startDate: "Oct 01, 2026",
    endDate: "Nov 15, 2026",
  },
  {
    id: "camp-002",
    name: "B2B Brand Awareness & Retargeting",
    channel: "LinkedIn Ads",
    status: "Active",
    budget: 180000,
    spend: 135200,
    leadsGenerated: 86,
    conversions: 19,
    costPerLead: 1572,
    startDate: "Oct 05, 2026",
    endDate: "Nov 30, 2026",
  },
  {
    id: "camp-003",
    name: "E-Commerce Holiday Early Bird",
    channel: "Meta Ads",
    status: "Active",
    budget: 150000,
    spend: 98400,
    leadsGenerated: 210,
    conversions: 54,
    costPerLead: 468,
    startDate: "Oct 10, 2026",
    endDate: "Nov 20, 2026",
  },
  {
    id: "camp-004",
    name: "High-Intent Organic Content Sprint",
    channel: "SEO Organic",
    status: "Active",
    budget: 90000,
    spend: 62000,
    leadsGenerated: 94,
    conversions: 27,
    costPerLead: 659,
    startDate: "Sep 15, 2026",
    endDate: "Dec 31, 2026",
  },
  {
    id: "camp-005",
    name: "Product Launch Nurture Sequence",
    channel: "Email Marketing",
    status: "Completed",
    budget: 50000,
    spend: 48500,
    leadsGenerated: 64,
    conversions: 22,
    costPerLead: 757,
    startDate: "Sep 01, 2026",
    endDate: "Oct 01, 2026",
  },
];

export const prototypeBudgetOverview: BudgetOverview = {
  totalBudget: 720000,
  actualSpend: 528600,
  remainingBudget: 191400,
  averageCostPerLead: 887,
  currency: "₹",
};
