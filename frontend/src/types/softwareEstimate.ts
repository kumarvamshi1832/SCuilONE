export type SoftwareEstimateStatus =
  | "Draft"
  | "Sent"
  | "Accepted"
  | "Rejected"
  | "Expired"
  | "Withdrawn";

export interface SoftwareEstimateItem {
  id: string;
  tenant_id?: string;
  estimate_id?: string;
  item_name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_subtotal?: number;
  line_discount?: number;
  line_tax?: number;
  line_total?: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface SoftwareEstimateItemCreate {
  item_name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  tax_percent?: number;
  sort_order?: number;
}

export interface SoftwareEstimate {
  id: string;
  tenant_id: string;
  created_by?: string | null;
  software_requirement_id: string;
  parent_estimate_id?: string | null;
  revision_number?: number;
  deal_id?: string | null;
  lead_id?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;

  estimate_number: string;
  title: string;
  description?: string | null;

  currency: string;
  issue_date: string;
  expiry_date?: string | null;

  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;

  status: SoftwareEstimateStatus | string;
  terms_and_conditions?: string | null;
  notes?: string | null;

  created_at: string;
  updated_at: string;

  items: SoftwareEstimateItem[];
}

export interface SoftwareEstimateCreate {
  software_requirement_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  estimate_number?: string | null;
  deal_id?: string | null;
  account_id?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;

  currency?: string;
  issue_date?: string;
  expiry_date?: string | null;

  status?: SoftwareEstimateStatus;
  discount_amount?: number;

  terms_and_conditions?: string | null;
  notes?: string | null;

  items: SoftwareEstimateItemCreate[];
}

export interface SoftwareEstimateUpdate {
  title?: string;
  description?: string | null;
  assigned_to?: string | null;

  currency?: string;
  issue_date?: string | null;
  expiry_date?: string | null;

  status?: SoftwareEstimateStatus;
  discount_amount?: number;

  terms_and_conditions?: string | null;
  notes?: string | null;

  items?: SoftwareEstimateItemCreate[];
}

export const SOFTWARE_ESTIMATE_STATUSES: SoftwareEstimateStatus[] = [
  "Draft",
  "Sent",
  "Accepted",
  "Rejected",
  "Expired",
  "Withdrawn",
];
