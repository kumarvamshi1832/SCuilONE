export const PROJECT_TYPES = [
  "Residential",
  "Commercial",
  "Mixed Use",
  "Industrial",
  "Land Development",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const CONSTRUCTION_STATUSES = [
  "Planning",
  "Under Construction",
  "Completed",
  "On Hold",
] as const;

export type ConstructionStatus = (typeof CONSTRUCTION_STATUSES)[number];

export const PROJECT_STATUSES = [
  "Active",
  "Inactive",
  "Completed",
  "On Hold",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  developer_name?: string | null;
  project_type: ProjectType | string;
  description?: string | null;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code?: string | null;
  amenities?: string | null;
  total_buildings?: number | null;
  total_units?: number | null;
  construction_status: ConstructionStatus | string;
  start_date?: string | null;
  expected_completion_date?: string | null;
  status: ProjectStatus | string;
  image_url?: string | null;
  thumbnail_url?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  developer_name?: string | null;
  project_type: string;
  description?: string | null;
  address: string;
  city: string;
  state: string;
  country?: string;
  postal_code?: string | null;
  amenities?: string | null;
  total_buildings?: number | null;
  total_units?: number | null;
  construction_status?: string;
  start_date?: string | null;
  expected_completion_date?: string | null;
  status?: string;
}

export interface ProjectUpdate {
  name?: string;
  developer_name?: string | null;
  project_type?: string;
  description?: string | null;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string | null;
  amenities?: string | null;
  total_buildings?: number | null;
  total_units?: number | null;
  construction_status?: string;
  start_date?: string | null;
  expected_completion_date?: string | null;
  status?: string;
}
