export type ActivityType = "Task" | "Call" | "Meeting";
export type ActivityStatus = "Pending" | "In Progress" | "Completed" | "Cancelled";
export type ActivityPriority = "Low" | "Medium" | "High";

export type ActivityLinkModule =
  | "property"
  | "building"
  | "real_estate_project"
  | "buyer_requirement"
  | "property_match"
  | "site_visit"
  | "booking"
  | "software_project"
  | "software_sprint";

export interface ActivityLinkInput {
  module: ActivityLinkModule;
  record_id: string;
}

export interface ActivityLinkResponse {
  id: string;
  module: ActivityLinkModule;
  record_id: string;
  created_at: string;
}

export interface ActivityRelatedModule {
  module: ActivityLinkModule;
  label: string;
}

export interface ActivityRelatedModulesResponse {
  industry: string;
  related_modules: ActivityRelatedModule[];
}

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
  related_records: ActivityLinkResponse[];
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
  related_records?: ActivityLinkInput[];
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
  related_records?: ActivityLinkInput[];
}
