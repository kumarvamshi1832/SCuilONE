export type SoftwareSprintStatus =
  | "Planned"
  | "Active"
  | "Completed"
  | "Cancelled";

export interface SoftwareSprint {
  id: string;
  tenant_id: string;
  software_project_id: string;
  created_by?: string | null;

  name: string;
  goal?: string | null;
  status: SoftwareSprintStatus | string;
  start_date: string;
  end_date: string;

  created_at: string;
  updated_at: string;
}

export interface SoftwareSprintCreate {
  software_project_id: string;
  name: string;
  goal?: string | null;
  start_date: string;
  end_date: string;
  status?: SoftwareSprintStatus;
}

export interface SoftwareSprintUpdate {
  name?: string | null;
  goal?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: SoftwareSprintStatus;
}

export const SOFTWARE_SPRINT_STATUSES: SoftwareSprintStatus[] = [
  "Planned",
  "Active",
  "Completed",
  "Cancelled",
];
