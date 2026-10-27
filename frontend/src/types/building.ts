export const BUILDING_TYPES = [
  "Residential Tower",
  "Commercial Building",
  "Villa Block",
  "Office Block",
  "Other",
] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

export const BUILDING_CONSTRUCTION_STATUSES = [
  "Planning",
  "Under Construction",
  "Completed",
  "On Hold",
] as const;

export const BUILDING_STATUSES = [
  "Active",
  "Inactive",
  "Completed",
  "On Hold",
] as const;

export const BUILDING_IMAGE_CATEGORIES = [
  "Exterior",
  "Interior",
  "Floor Plan",
  "Amenities",
  "Other",
] as const;

export type BuildingImageCategory = (typeof BUILDING_IMAGE_CATEGORIES)[number];

export interface Building {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  building_code?: string | null;
  building_type: BuildingType | string;
  description?: string | null;
  total_floors: number;
  total_units: number;
  construction_status: string;
  start_date?: string | null;
  expected_completion_date?: string | null;
  status: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // enriched fields if joined
  project_name?: string;
  images?: (BuildingImage | string | { url?: string; image_url?: string })[];
  image_url?: string;
  primary_image_url?: string;
}

export interface BuildingCreate {
  project_id: string;
  name: string;
  building_code?: string | null;
  building_type: string;
  description?: string | null;
  total_floors: number;
  total_units?: number;
  construction_status?: string;
  start_date?: string | null;
  expected_completion_date?: string | null;
  status?: string;
}

export interface BuildingUpdate {
  project_id?: string;
  name?: string;
  building_code?: string | null;
  building_type?: string;
  description?: string | null;
  total_floors?: number;
  total_units?: number;
  construction_status?: string;
  start_date?: string | null;
  expected_completion_date?: string | null;
  status?: string;
}

export interface BuildingImage {
  id: string;
  building_id: string;
  image_url: string;
  image_type: BuildingImageCategory | string;
  is_primary: boolean;
  sort_order: number;
  uploaded_by?: string | null;
  created_at: string;
}

export interface BuildingImageUpdate {
  image_type?: string;
  is_primary?: boolean;
  sort_order?: number;
}
