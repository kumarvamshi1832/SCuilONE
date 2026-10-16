export interface Account {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  industry: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
  status: string;
  source: string | null;
  assigned_to: string | null;
  lead_id?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountCreate {
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  status?: string;
  source?: string | null;
  assigned_to?: string | null;
  lead_id?: string | null;
  notes?: string | null;
}

export interface AccountUpdate {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  industry?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  status?: string | null;
  source?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}

export interface AccountLeadSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  status: string;
}

export interface AccountContactSummary {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
}

export interface AccountDealSummary {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  lead_id: string | null;
  contact_id: string | null;
}

export interface AccountDetails extends Account {
  leads: AccountLeadSummary[];
  contacts: AccountContactSummary[];
  deals: AccountDealSummary[];
  total_deals: number;
  won_deals: number;
  total_revenue: number;
}
