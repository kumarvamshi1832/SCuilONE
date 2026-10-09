/* ─── Lead Types ─── */

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Converted" | "Lost";

export type LeadSource =
  | "Website"
  | "Referral"
  | "Social Media"
  | "Walk-in"
  | "Phone Inquiry"
  | "Email Campaign"
  | "Property Portal"
  | "Other";

export interface Lead {
  id: string;
  tenant_id: string;
  account_id?: string | null;
  full_name: string;
  email?: string;
  phone?: string;
  source?: string;
  status: string;
  assigned_to?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLeadRequest {
  full_name: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  account_id?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}

export interface UpdateLeadRequest {
  full_name?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  account_id?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}
