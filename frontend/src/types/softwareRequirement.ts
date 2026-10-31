export type SoftwareType =
  | "Web Application"
  | "Mobile Application"
  | "Website"
  | "API Development"
  | "Custom Software"
  | "Enterprise Software"
  | "Integration"
  | "Maintenance"
  | "Other";

export type SoftwareRequirementStatus =
  | "New"
  | "Discovery"
  | "Estimating"
  | "Proposal"
  | "Approved"
  | "Rejected"
  | "On Hold"
  | "Converted"
  | "Closed";

export type SoftwarePriority = "Low" | "Medium" | "High" | "Critical";

export interface SoftwareRequirement {
  id: string;
  tenant_id: string;
  created_by?: string | null;
  deal_id?: string | null;
  lead_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;

  title: string;
  description: string;
  software_type: SoftwareType | string;
  platforms?: string | null;
  integrations?: string | null;

  min_budget?: number | null;
  max_budget?: number | null;
  currency: string;
  target_date?: string | null;

  priority: SoftwarePriority | string;
  status: SoftwareRequirementStatus | string;
  notes?: string | null;

  created_at: string;
  updated_at: string;
}

export interface SoftwareRequirementCreate {
  title: string;
  description: string;
  software_type: SoftwareType;

  deal_id?: string | null;
  lead_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;

  platforms?: string | null;
  integrations?: string | null;

  min_budget?: number | null;
  max_budget?: number | null;
  currency?: string;

  target_date?: string | null;
  priority?: SoftwarePriority;
  status?: SoftwareRequirementStatus;
  notes?: string | null;
}

export interface SoftwareRequirementUpdate {
  title?: string;
  description?: string;
  software_type?: SoftwareType;

  deal_id?: string | null;
  lead_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;

  platforms?: string | null;
  integrations?: string | null;

  min_budget?: number | null;
  max_budget?: number | null;
  currency?: string;

  target_date?: string | null;
  priority?: SoftwarePriority;
  status?: SoftwareRequirementStatus;
  notes?: string | null;
}

export const SOFTWARE_TYPES: SoftwareType[] = [
  "Web Application",
  "Mobile Application",
  "Website",
  "API Development",
  "Custom Software",
  "Enterprise Software",
  "Integration",
  "Maintenance",
  "Other",
];

export const SOFTWARE_REQUIREMENT_STATUSES: SoftwareRequirementStatus[] = [
  "New",
  "Discovery",
  "Estimating",
  "Proposal",
  "Approved",
  "Rejected",
  "On Hold",
  "Converted",
  "Closed",
];

export const SOFTWARE_PRIORITIES: SoftwarePriority[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];
