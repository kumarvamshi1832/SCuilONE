import type { Property } from "./property";

export interface PropertyMatch {
  id: string;
  tenant_id: string;
  buyer_requirement_id: string;
  property_id: string;
  assigned_to?: string | null;
  created_by?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  // Enriched UI fields
  property_name?: string;
  property_price?: number;
  property_city?: string;
  property_type?: string;
  buyer_name?: string;
  assigned_to_name?: string;
  property?: Property;
}

export interface PropertyMatchCreate {
  buyer_requirement_id: string;
  property_id: string;
  assigned_to?: string | null;
}

