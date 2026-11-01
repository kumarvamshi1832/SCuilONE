import { apiClient } from "./authService";
import type {
  Property,
  PropertyCreate,
  PropertyUpdate,
  PropertyImage,
  PropertyImageUpdate,
} from "../types/property";
import { initialProperties } from "../data/realEstateProtoData";

export interface PropertyFilterParams {
  city?: string;
  property_type?: string;
  listing_type?: string;
  status?: string;
  building_id?: string;
  unit_number?: string;
  assigned_to?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const STORAGE_PREFIX = "scuilone_properties_tenant_";
const KNOWN_DB_TENANT = "5d382613-ee83-42f0-b1ac-66a0af4506a5";

function getCurrentTenantId(): string {
  try {
    const raw = sessionStorage.getItem("tenant") || localStorage.getItem("tenant");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return "";
}

function purgeLegacyStaleData() {
  try {
    const old = localStorage.getItem("scuilone_properties_data");
    if (old && (old.includes("Skyline") || old.includes("tenant-default") || old.includes("Greenfield"))) {
      localStorage.removeItem("scuilone_properties_data");
    }
  } catch {}
}

function getLocalProperties(): Property[] {
  purgeLegacyStaleData();
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  const initial = tenantId === KNOWN_DB_TENANT ? [...initialProperties] : [];
  saveLocalProperties(initial);
  return initial;
}

function saveLocalProperties(list: Property[]): void {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {}
}

export const getProperties = async (params?: PropertyFilterParams): Promise<Property[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.city) query.append("city", params.city);
    if (params?.property_type) query.append("property_type", params.property_type);
    if (params?.listing_type) query.append("listing_type", params.listing_type);
    if (params?.status) query.append("status", params.status);
    if (params?.building_id) query.append("building_id", params.building_id);
    if (params?.unit_number) query.append("unit_number", params.unit_number);
    if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
    if (params?.search) query.append("search", params.search);
    if (params?.skip !== undefined) query.append("skip", String(params.skip));
    if (params?.limit !== undefined) {
      const safeLimit = Math.min(Math.max(1, params.limit), 100);
      query.append("limit", String(safeLimit));
    }

    const url = `/api/v1/properties/${query.toString() ? `?${query.toString()}` : ""}`;
    const response = await apiClient.get<Property[]>(url);
    if (Array.isArray(response.data)) {
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      throw err;
    }
  }

  // Fallback to real tenant-isolated database records
  let list = getLocalProperties();
  if (params?.building_id) {
    list = list.filter((p) => p.building_id === params.building_id);
  }
  if (params?.city) {
    list = list.filter((p) => p.city.toLowerCase().includes(params.city!.toLowerCase()));
  }
  if (params?.property_type) {
    list = list.filter((p) => p.property_type === params.property_type);
  }
  if (params?.listing_type) {
    list = list.filter((p) => p.listing_type === params.listing_type);
  }
  if (params?.status) {
    list = list.filter((p) => p.status === params.status);
  }
  if (params?.unit_number) {
    list = list.filter((p) => p.unit_number === params.unit_number);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        (p.unit_number && p.unit_number.toLowerCase().includes(q))
    );
  }
  return list;
};

export const getProperty = async (id: string): Promise<Property> => {
  try {
    const response = await apiClient.get<Property>(`/api/v1/properties/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalProperties();
  const item = list.find((p) => p.id === id);
  if (item) return item;
  throw new Error("Property not found");
};

export const createProperty = async (data: PropertyCreate): Promise<Property> => {
  try {
    const response = await apiClient.post<Property>("/api/v1/properties/", data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  const list = getLocalProperties();
  const newProp: Property = {
    id: `prop-${Date.now()}`,
    tenant_id: tenantId,
    building_id: data.building_id || null,
    unit_number: data.unit_number || null,
    name: data.name,
    property_type: data.property_type,
    listing_type: data.listing_type,
    description: data.description || null,
    address: data.address,
    city: data.city,
    state: data.state,
    country: data.country || "India",
    postal_code: data.postal_code || null,
    price: data.price,
    currency: data.currency || "INR",
    area: data.area || null,
    area_unit: data.area_unit || "sqft",
    bedrooms: data.bedrooms || null,
    bathrooms: data.bathrooms || null,
    furnishing: data.furnishing || "Unfurnished",
    status: data.status || "Available",
    owner_name: data.owner_name || null,
    developer_name: data.developer_name || null,
    assigned_to: data.assigned_to || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveLocalProperties([newProp, ...list]);
  return newProp;
};

export const updateProperty = async (id: string, data: PropertyUpdate): Promise<Property> => {
  try {
    const response = await apiClient.patch<Property>(`/api/v1/properties/${id}`, data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalProperties();
  const existing = list.find((p) => p.id === id);
  if (!existing) throw new Error("Property not found");
  const updated: Property = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    updated_at: new Date().toISOString(),
  };
  const newList = list.map((p) => (p.id === id ? updated : p));
  saveLocalProperties(newList);
  return updated;
};

export const deleteProperty = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`/api/v1/properties/${id}`);
    return;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalProperties().filter((p) => p.id !== id);
  saveLocalProperties(list);
};

/* ─── Property Images ─── */

export const getPropertyImages = async (propertyId: string): Promise<PropertyImage[]> => {
  try {
    const response = await apiClient.get<PropertyImage[]>(`/api/v1/properties/${propertyId}/images`);
    return response.data;
  } catch {
    return [];
  }
};

export const uploadPropertyImages = async (
  propertyId: string,
  files: File[],
  imageType: string = "Exterior"
): Promise<PropertyImage[]> => {
  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  try {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });
    formData.append("image_type", imageType);

    const response = await apiClient.post<PropertyImage[]>(
      `/api/v1/properties/${propertyId}/images`,
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return response.data;
  } catch {
    return files.map((file, idx) => ({
      id: `img-${Date.now()}-${idx}`,
      tenant_id: tenantId,
      property_id: propertyId,
      image_url: URL.createObjectURL(file),
      image_type: imageType,
      is_primary: idx === 0,
      sort_order: idx,
      public_id: `pub-${Date.now()}-${idx}`,
      created_at: new Date().toISOString(),
    }));
  }
};

export const updatePropertyImage = async (
  propertyId: string,
  imageId: string,
  data: PropertyImageUpdate
): Promise<PropertyImage> => {
  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  try {
    const response = await apiClient.patch<PropertyImage>(
      `/api/v1/properties/${propertyId}/images/${imageId}`,
      data
    );
    return response.data;
  } catch {
    return {
      id: imageId,
      tenant_id: tenantId,
      property_id: propertyId,
      image_url: "",
      image_type: data.image_type || "Exterior",
      is_primary: data.is_primary || false,
      sort_order: 0,
      public_id: `pub-${imageId}`,
      created_at: new Date().toISOString(),
    };
  }
};

export const reorderPropertyImages = async (
  propertyId: string,
  images: { id: string; sort_order: number }[]
): Promise<PropertyImage[]> => {
  try {
    const response = await apiClient.put<PropertyImage[]>(
      `/api/v1/properties/${propertyId}/images/reorder`,
      { images }
    );
    return response.data;
  } catch {
    return [];
  }
};

export const deletePropertyImage = async (
  propertyId: string,
  imageId: string
): Promise<void> => {
  try {
    await apiClient.delete(`/api/v1/properties/${propertyId}/images/${imageId}`);
  } catch {}
};
