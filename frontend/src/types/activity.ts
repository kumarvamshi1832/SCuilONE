export type ActivityType = "Task" | "Call" | "Meeting";
export type ActivityStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";
export type ActivityPriority = "Low" | "Medium" | "High";

export interface Activity {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  activity_type: ActivityType;
  status: ActivityStatus;
  priority: ActivityPriority;
  due_date: string | null;
  assigned_to: string | null;
  lead_id: string | null;
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityCreate {
  title: string;
  description?: string | null;
  activity_type: ActivityType;
  status?: ActivityStatus;
  priority?: ActivityPriority;
  due_date?: string | null;
  assigned_to?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  deal_id?: string | null;
}

export interface ActivityUpdate {
  title?: string | null;
  description?: string | null;
  activity_type?: ActivityType | null;
  status?: ActivityStatus | null;
  priority?: ActivityPriority | null;
  due_date?: string | null;
  assigned_to?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  deal_id?: string | null;
}
