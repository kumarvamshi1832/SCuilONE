export type SoftwareProjectStatus =
  | "Planned"
  | "Active"
  | "On Hold"
  | "Completed"
  | "Cancelled";

export type SoftwareProjectPriority =
  | "Low"
  | "Medium"
  | "High"
  | "Critical";

export interface ProjectDeliverySummary {
  total_tasks: number;
  completed_tasks: number;
  open_tasks: number;
  task_completion_percentage: number;

  total_sprints: number;
  completed_sprints: number;
  active_sprints: number;
  sprint_completion_percentage: number;

  total_milestones: number;
  completed_milestones: number;
  milestone_completion_percentage: number;
}

export interface ProjectTimeSummary {
  total_tracked_minutes: number;
  total_tracked_hours: number;
  approved_billable_minutes: number;
  approved_billable_hours: number;
  non_billable_minutes: number;
  non_billable_hours: number;
}

export interface ProjectTimeSummaryResponse extends ProjectTimeSummary {
  project_id: string;
  project_number: string;
  name: string;
}

export interface SoftwareProject {
  id: string;
  tenant_id: string;
  created_by?: string | null;
  software_contract_id: string;
  deal_id?: string | null;
  project_manager_id?: string | null;

  project_number: string;
  name: string;
  description?: string | null;
  scope_of_work?: string;
  deliverables?: string;

  status: SoftwareProjectStatus | string;
  priority: SoftwareProjectPriority | string;
  progress_percentage?: number;

  // Breakdown of tasks, sprints, and contract milestones
  total_tasks?: number;
  completed_tasks?: number;
  open_tasks?: number;
  task_completion_percentage?: number;
  total_sprints?: number;
  completed_sprints?: number;
  active_sprints?: number;
  sprint_completion_percentage?: number;
  total_milestones?: number;
  completed_milestones?: number;
  milestone_completion_percentage?: number;
  delivery_summary?: ProjectDeliverySummary;

  budget: number;
  currency: string;

  start_date?: string | null;
  target_end_date?: string | null;
  actual_end_date?: string | null;

  contract_snapshot?: any;
  notes?: string | null;

  // Project-level total time tracking summary
  total_tracked_minutes?: number;
  total_tracked_hours?: number;
  approved_billable_minutes?: number;
  approved_billable_hours?: number;
  non_billable_minutes?: number;
  non_billable_hours?: number;
  time_summary?: ProjectTimeSummary;

  created_at: string;
  updated_at: string;
}

export interface SoftwareProjectCreate {
  software_contract_id: string;
  project_number?: string | null;
  name?: string | null;
  description?: string | null;
  project_manager_id?: string | null;
  deal_id?: string | null;

  priority?: SoftwareProjectPriority;
  status?: SoftwareProjectStatus | string;
  budget?: number | null;
  currency?: string;

  start_date?: string | null;
  target_end_date?: string | null;
  actual_end_date?: string | null;
  scope_of_work?: string | null;
  deliverables?: string | null;
  notes?: string | null;
}

export interface SoftwareProjectUpdate {
  software_contract_id?: string;
  deal_id?: string | null;
  name?: string | null;
  description?: string | null;
  project_manager_id?: string | null;
  priority?: SoftwareProjectPriority;
  status?: SoftwareProjectStatus;
  budget?: number | null;
  currency?: string;

  start_date?: string | null;
  target_end_date?: string | null;
  actual_end_date?: string | null;
  scope_of_work?: string | null;
  deliverables?: string | null;
  notes?: string | null;
}

export const SOFTWARE_PROJECT_STATUSES: SoftwareProjectStatus[] = [
  "Planned",
  "Active",
  "On Hold",
  "Completed",
  "Cancelled",
];

export const SOFTWARE_PROJECT_PRIORITIES: SoftwareProjectPriority[] = [
  "Low",
  "Medium",
  "High",
  "Critical",
];
