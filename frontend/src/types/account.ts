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
