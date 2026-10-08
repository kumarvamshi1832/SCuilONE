export interface Deal {
  id: string;
  tenant_id: string;
  name: string;
  lead_id: string | null;
  contact_id: string | null;
  account_id: string | null;
  assigned_to: string | null;
  amount: number | null;
  stage: string;
  expected_close_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealCreate {
  name: string;
  lead_id?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  assigned_to?: string | null;
  amount?: number | null;
  stage?: string | null;
  expected_close_date?: string | null;
  description?: string | null;
}

export interface DealUpdate {
  name?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  assigned_to?: string | null;
  amount?: number | null;
  stage?: string | null;
  expected_close_date?: string | null;
  description?: string | null;
}
