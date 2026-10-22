
export interface ReportDateFilters {
  start_date: string | null;
  end_date: string | null;
}

export interface SalesReport {
  total_deals: number;
  won_deals: number;
  lost_deals: number;
  open_deals: number;
  won_revenue: number;
}

export interface LeadStatusCount {
  status: string;
  count: number;
}

export interface LeadsReport {
  total_leads: number;
  qualified_leads: number;
  conversion_rate: number;
  status_breakdown: LeadStatusCount[];
}

export interface PipelineStageReport {
  pipeline_name: string;
  stage_name: string;
  count: number;
}

export interface TaskStatusCount {
  status: string;
  count: number;
}

export interface TasksReport {
  total_tasks: number;
  pending_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  status_breakdown: TaskStatusCount[];
}

export interface ReportsSummary {
  filters: ReportDateFilters;
  sales: SalesReport;
  leads: LeadsReport;
  pipeline: PipelineStageReport[];
  tasks: TasksReport;
}
