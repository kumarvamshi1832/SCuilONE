export const PROPERTY_TYPES = [
  "Apartment",
  "Independent House",
  "Villa",
  "Plot",
  "Commercial",
  "Office",
  "Shop",
  "Warehouse",
  "Other",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LISTING_TYPES = ["Sale", "Rent"] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const PROPERTY_STATUSES = [
  "Available",
  "Reserved",
  "Sold",
  "Rented",
  "Inactive",
] as const;
export type PropertyStatus = (typeof PROPERTY_STATUSES)[number];

export const FURNISHING_TYPES = [
  "Unfurnished",
  "Semi-Furnished",
  "Furnished",
] as const;
export type FurnishingType = (typeof FURNISHING_TYPES)[number];

export const AREA_UNITS = ["sqft", "sqm", "sqyd", "acre"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

export const PROPERTY_IMAGE_CATEGORIES = [
  "Exterior",
  "Interior",
  "Floor Plan",
  "Amenities",
  "Other",
] as const;
export type PropertyImageCategory = (typeof PROPERTY_IMAGE_CATEGORIES)[number];

export interface Property {
  id: string;
  tenant_id: string;
  created_by?: string | null;
  building_id?: string | null;
  unit_number?: string | null;
  name: string;
  property_type: PropertyType | string;
  listing_type: ListingType | string;
  description?: string | null;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code?: string | null;
  price: number | string;
  currency: string;
  area?: number | string | null;
  area_unit: AreaUnit | string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnishing: FurnishingType | string;
  status: PropertyStatus | string;
  owner_name?: string | null;
  developer_name?: string | null;
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
  // enriched fields
  building_name?: string;
  assigned_to_name?: string;
  primary_image_url?: string;
}

export interface PropertyCreate {
  building_id?: string | null;
  unit_number?: string | null;
  name: string;
  property_type: string;
  listing_type: string;
  description?: string | null;
  address: string;
  city: string;
  state: string;
  country?: string;
  postal_code?: string | null;
  price: number;
  currency?: string;
  area?: number | null;
  area_unit?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnishing?: string;
  status?: string;
  owner_name?: string | null;
  developer_name?: string | null;
  assigned_to?: string | null;
}

export interface PropertyUpdate {
  building_id?: string | null;
  unit_number?: string | null;
  name?: string;
  property_type?: string;
  listing_type?: string;
  description?: string | null;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string | null;
  price?: number;
  currency?: string;
  area?: number | null;
  area_unit?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  furnishing?: string;
  status?: string;
  owner_name?: string | null;
  developer_name?: string | null;
  assigned_to?: string | null;
}

export interface PropertyImage {
  id: string;
  tenant_id: string;
  property_id: string;
  uploaded_by?: string | null;
  image_url: string;
  public_id: string;
  image_type: PropertyImageCategory | string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

export interface PropertyImageUpdate {
  image_type?: PropertyImageCategory | string;
  is_primary?: boolean;
  sort_order?: number;
}
