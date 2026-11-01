export interface BaseTimeTotals {
  total_minutes: number;
  total_hours: number;
  billable_minutes: number;
  billable_hours: number;
  non_billable_minutes: number;
  non_billable_hours: number;
  entry_count: number;
  total_logged_hours?: number;
}

export interface ProjectTimeSummary extends BaseTimeTotals {
  project_id: string;
}

export interface ProjectTaskReportItem {
  activity_id: string;
  task_title?: string;
  title?: string;
  status: string;
  total_minutes: number;
  total_hours: number;
  total_logged_hours?: number;
  billable_minutes: number;
  entry_count: number;
}

export interface ProjectTasksReport {
  project_id: string;
  tasks: ProjectTaskReportItem[];
}

export interface SprintTimeSummary extends BaseTimeTotals {
  sprint_id: string;
  sprint_name?: string;
  total_logged_hours?: number;
}

export interface TeamMemberTimeItem {
  user_id: string;
  user_name?: string;
  full_name?: string;
  total_minutes: number;
  total_hours: number;
  total_logged_hours?: number;
  billable_minutes: number;
  entry_count: number;
}

export interface TeamTimeSummary {
  project_id: string | null;
  team?: TeamMemberTimeItem[];
  team_members?: TeamMemberTimeItem[];
}

export interface BillingTimeSummary extends BaseTimeTotals {
  project_id: string | null;
  approved_hours?: number;
  unreviewed_hours?: number;
  rejected_hours?: number;
}

export interface DeliveryReportFilterParams {
  from_date?: string;
  to_date?: string;
  project_id?: string;
}
