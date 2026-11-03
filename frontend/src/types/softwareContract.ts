export type MilestoneBillingMode = "Sequential" | "Parallel";

export type SoftwareContractStatus =
  | "Draft"
  | "Sent"
  | "Under Review"
  | "Signed"
  | "Active"
  | "Completed"
  | "Terminated"
  | "Expired";

export interface SoftwareContractMilestone {
  id: string;
  tenant_id: string;
  contract_id: string;
  invoice_id?: string | null;
  sequence: number;
  name: string;
  percentage: number;
  amount: number;
  trigger_description?: string | null;
  status: "Pending" | "Ready" | "Invoiced" | "Paid" | string;
  created_at: string;
  updated_at: string;
}

export interface SoftwareContractMilestoneCreate {
  sequence?: number;
  name: string;
  percentage: number;
  trigger_description?: string | null;
}

export interface SoftwareContractMilestoneReadyRequest {
  notes?: string | null;
}

export interface SoftwareContractMilestoneInvoiceRequest {
  invoice_number?: string | null;
  due_date?: string | null;
  notes?: string | null;
}

export interface SoftwareContract {
  id: string;
  tenant_id: string;
  created_by?: string | null;
  software_estimate_id: string;
  deal_id?: string | null;
  lead_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;

  contract_number: string;
  title: string;
  description?: string | null;

  currency: string;
  billing_type: "Fixed Price" | "Time & Material";
  hourly_rate: number | null;
  contract_value: number;

  issue_date: string;
  start_date?: string | null;
  end_date?: string | null;
  signed_date?: string | null;

  status: SoftwareContractStatus | string;

  scope_of_work: string;
  deliverables: string;
  exclusions?: string | null;
  assumptions?: string | null;
  acceptance_criteria?: string | null;
  payment_terms?: string | null;
  milestone_billing_mode?: "Sequential" | "Parallel";
  payment_milestones?: SoftwareContractMilestone[];
  terms_and_conditions?: string | null;

  estimate_snapshot?: any;
  notes?: string | null;

  created_at: string;
  updated_at: string;
}

export interface SoftwareContractCreate {
  software_estimate_id: string;
  deal_id?: string | null;
  lead_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  contract_number?: string | null;
  title?: string | null;
  description?: string | null;
  assigned_to?: string | null;

  currency?: string;
  contract_value?: number;

  issue_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  signed_date?: string | null;

  status?: SoftwareContractStatus | string;
  service_level_agreement?: string;

  scope_of_work: string;
  deliverables: string;
  exclusions?: string | null;
  assumptions?: string | null;
  acceptance_criteria?: string | null;
  payment_terms?: string | null;
  milestone_billing_mode?: "Sequential" | "Parallel";
  payment_milestones?: SoftwareContractMilestoneCreate[];
  terms_and_conditions?: string | null;
  notes?: string | null;
}

export interface SoftwareContractUpdate {
  contract_number?: string | null;
  title?: string | null;
  description?: string | null;
  assigned_to?: string | null;
  deal_id?: string | null;
  account_id?: string | null;

  contract_value?: number;
  currency?: string;
  service_level_agreement?: string;

  issue_date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  signed_date?: string | null;

  status?: SoftwareContractStatus;

  scope_of_work?: string | null;
  deliverables?: string | null;
  exclusions?: string | null;
  assumptions?: string | null;
  acceptance_criteria?: string | null;
  payment_terms?: string | null;
  milestone_billing_mode?: "Sequential" | "Parallel";
  terms_and_conditions?: string | null;
  notes?: string | null;
}

export const SOFTWARE_CONTRACT_STATUSES: SoftwareContractStatus[] = [
  "Draft",
  "Sent",
  "Under Review",
  "Signed",
  "Active",
  "Completed",
  "Terminated",
  "Expired",
];
