/**
 * Customer Portal buyer requirements (Real Estate).
 * Mirrors backend/app/routes/customer_portal.py and backend/app/schemas/customer_portal.py.
 * Ownership (tenant, contact, assignee, status) is supplied by the server from the
 * authenticated portal identity and is intentionally NOT part of the create payload.
 */

export type PortalRequirementType = "Buy" | "Rent";

/** POST /api/v1/customer-portal/buyer-requirements */
export interface PortalBuyerRequirementCreate {
  requirement_type: PortalRequirementType;
  property_type: string;
  preferred_city: string;
  preferred_location?: string | null;
  min_budget?: number | null;
  max_budget?: number | null;
  bedrooms?: number | null;
  min_area?: number | null;
  max_area?: number | null;
  area_unit?: string;
  notes?: string | null;
}

/** Response of the list / detail / create endpoints (decimals are serialised as strings). */
export interface PortalBuyerRequirement {
  id: string;
  requirement_type: PortalRequirementType | string;
  property_type: string;
  preferred_city: string | null;
  preferred_location: string | null;
  min_budget: string | null;
  max_budget: string | null;
  bedrooms: number | null;
  min_area: string | null;
  max_area: string | null;
  area_unit: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PortalMatchedPropertyImage {
  image_url: string;
  image_type: string | null;
  is_primary: boolean;
}

export interface PortalMatchedProperty {
  id: string;
  name: string;
  unit_number: string | null;
  property_type: string;
  listing_type: string;
  description: string | null;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string | null;
  price: string;
  currency: string;
  area: string | null;
  area_unit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string;
  status: string;
  images: PortalMatchedPropertyImage[];
}

/** Item of the /matches and /shortlist endpoints. */
export interface PortalPropertyMatch {
  match_id: string;
  match_status: string;
  property: PortalMatchedProperty;
}

export interface PortalShortlistEntry {
  id: string;
  buyer_requirement_id: string;
  property_match_id: string;
  created_at: string;
}

/** POST /api/v1/customer-portal/site-visits/requests */
export interface PortalSiteVisitRequestCreate {
  property_match_id: string;
  scheduled_start: string;
  scheduled_end: string;
}

export interface PortalSiteVisitRequestResult {
  id: string;
  property_match_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  message?: string;
}

/** A shortlisted property together with the requirement it belongs to. */
export interface PortalShortlistedProperty extends PortalPropertyMatch {
  requirement: PortalBuyerRequirement;
}
