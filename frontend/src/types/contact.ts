export interface Contact {
  id: string;
  tenant_id: string;
  account_id?: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  address: string | null;
  source: string | null;
  assigned_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactCreate {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  address?: string | null;
  source?: string | null;
  account_id?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}

export interface ContactUpdate {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  address?: string | null;
  source?: string | null;
  account_id?: string | null;
  assigned_to?: string | null;
  notes?: string | null;
}
