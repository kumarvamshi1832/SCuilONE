import { apiClient } from "./authService";
import type {
  Property,
  PropertyCreate,
  PropertyUpdate,
  PropertyImage,
  PropertyImageUpdate,
} from "../types/property";

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

export const getProperties = async (params?: PropertyFilterParams): Promise<Property[]> => {
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
  return response.data;
};

export const getProperty = async (id: string): Promise<Property> => {
  const response = await apiClient.get<Property>(`/api/v1/properties/${id}`);
  return response.data;
};

export const createProperty = async (data: PropertyCreate): Promise<Property> => {
  const response = await apiClient.post<Property>("/api/v1/properties/", data);
  return response.data;
};

export const updateProperty = async (id: string, data: PropertyUpdate): Promise<Property> => {
  const response = await apiClient.patch<Property>(`/api/v1/properties/${id}`, data);
  return response.data;
};

export const deleteProperty = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/v1/properties/${id}`);
};

/* ─── Property Images ─── */

export const getPropertyImages = async (propertyId: string): Promise<PropertyImage[]> => {
  const response = await apiClient.get<PropertyImage[]>(`/api/v1/properties/${propertyId}/images`);
  return response.data;
};

export const uploadPropertyImages = async (
  propertyId: string,
  files: File[],
  imageType: string = "Exterior"
): Promise<PropertyImage[]> => {
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
};

export const updatePropertyImage = async (
  propertyId: string,
  imageId: string,
  data: PropertyImageUpdate
): Promise<PropertyImage> => {
  const response = await apiClient.patch<PropertyImage>(
    `/api/v1/properties/${propertyId}/images/${imageId}`,
    data
  );
  return response.data;
};

export const reorderPropertyImages = async (
  propertyId: string,
  images: { id: string; sort_order: number }[]
): Promise<PropertyImage[]> => {
  const response = await apiClient.put<PropertyImage[]>(
    `/api/v1/properties/${propertyId}/images/reorder`,
    { images }
  );
  return response.data;
};

export const deletePropertyImage = async (
  propertyId: string,
  imageId: string
): Promise<void> => {
  await apiClient.delete(`/api/v1/properties/${propertyId}/images/${imageId}`);
};
