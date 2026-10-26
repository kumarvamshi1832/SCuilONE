export const REQUIREMENT_TYPES = ["Buy", "Rent"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const BUYER_REQUIREMENT_STATUSES = [
  "New",
  "Qualified",
  "Matched",
  "Closed",
] as const;
export type BuyerRequirementStatus =
  (typeof BUYER_REQUIREMENT_STATUSES)[number];

export interface BuyerRequirement {
  id: string;
  tenant_id: string;
  created_by?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;
  requirement_type: RequirementType | string;
  property_type: string;
  preferred_city?: string | null;
  preferred_location?: string | null;
  min_budget?: number | string | null;
  max_budget?: number | string | null;
  bedrooms?: number | null;
  min_area?: number | string | null;
  max_area?: number | string | null;
  area_unit: string;
  status: BuyerRequirementStatus | string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // enriched fields
  lead_name?: string;
  contact_name?: string;
  assigned_to_name?: string;
}

export interface BuyerRequirementCreate {
  lead_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;
  requirement_type: string;
  property_type: string;
  preferred_city?: string | null;
  preferred_location?: string | null;
  min_budget?: number | null;
  max_budget?: number | null;
  bedrooms?: number | null;
  min_area?: number | null;
  max_area?: number | null;
  area_unit?: string;
  status?: string;
  notes?: string | null;
}

export interface BuyerRequirementUpdate {
  lead_id?: string | null;
  contact_id?: string | null;
  assigned_to?: string | null;
  requirement_type?: string;
  property_type?: string;
  preferred_city?: string | null;
  preferred_location?: string | null;
  min_budget?: number | null;
  max_budget?: number | null;
  bedrooms?: number | null;
  min_area?: number | null;
  max_area?: number | null;
  area_unit?: string;
  status?: string;
  notes?: string | null;
}
