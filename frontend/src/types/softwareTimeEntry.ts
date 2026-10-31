export type BillingStatus = "Unreviewed" | "Approved" | "Rejected";
export type TimeEntrySource = "manual" | "timer";

export interface SoftwareTimeEntry {
  id: string;
  tenant_id: string;
  activity_id: string;
  user_id: string;
  duration_minutes: number | null;
  work_date: string;
  notes: string | null;
  is_billable: boolean;
  billing_status: BillingStatus;
  source: TimeEntrySource;
  started_at: string | null;
  stopped_at: string | null;
  activity_title?: string;
  user_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ManualTimeEntryCreate {
  activity_id: string;
  duration_minutes: number;
  work_date?: string | null;
  notes?: string | null;
  is_billable?: boolean;
}

export interface TimerStartRequest {
  activity_id: string;
  notes?: string | null;
  is_billable?: boolean;
}

export interface SoftwareTimeEntryFilterParams {
  activity_id?: string;
  project_id?: string;
  sprint_id?: string;
  user_id?: string;
  from_date?: string;
  to_date?: string;
}

