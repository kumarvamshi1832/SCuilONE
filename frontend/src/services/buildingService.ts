import { apiClient } from "./authService";
import type {
  Building,
  BuildingCreate,
  BuildingUpdate,
  BuildingImage,
  BuildingImageUpdate,
} from "../types/building";

export interface BuildingFilterParams {
  project_id?: string;
  city?: string;
  building_type?: string;
  construction_status?: string;
  status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

export const getBuildings = async (params?: BuildingFilterParams): Promise<Building[]> => {
  const query = new URLSearchParams();
  if (params?.project_id) query.append("project_id", params.project_id);
  if (params?.city) query.append("city", params.city);
  if (params?.building_type) query.append("building_type", params.building_type);
  if (params?.construction_status) query.append("construction_status", params.construction_status);
  if (params?.status) query.append("status", params.status);
  if (params?.search) query.append("search", params.search);
  if (params?.skip !== undefined) query.append("skip", String(params.skip));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const url = `/api/v1/buildings/${query.toString() ? `?${query.toString()}` : ""}`;
  const response = await apiClient.get<Building[]>(url);
  return response.data;
};

export const getBuilding = async (id: string): Promise<Building> => {
  const response = await apiClient.get<Building>(`/api/v1/buildings/${id}`);
  return response.data;
};

export const createBuilding = async (data: BuildingCreate): Promise<Building> => {
  const response = await apiClient.post<Building>("/api/v1/buildings/", data);
  return response.data;
};

export const updateBuilding = async (id: string, data: BuildingUpdate): Promise<Building> => {
  const response = await apiClient.patch<Building>(`/api/v1/buildings/${id}`, data);
  return response.data;
};

export const deleteBuilding = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/v1/buildings/${id}`);
};

/* ─── Building Images ─── */

export const getBuildingImages = async (buildingId: string): Promise<BuildingImage[]> => {
  const response = await apiClient.get<BuildingImage[]>(`/api/v1/buildings/${buildingId}/images`);
  return response.data;
};

export const uploadBuildingImages = async (
  buildingId: string,
  files: File[],
  imageType: string = "Exterior"
): Promise<BuildingImage[]> => {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("image_type", imageType);

  const response = await apiClient.post<BuildingImage[]>(
    `/api/v1/buildings/${buildingId}/images`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
};

export const updateBuildingImage = async (
  buildingId: string,
  imageId: string,
  data: BuildingImageUpdate
): Promise<BuildingImage> => {
  const response = await apiClient.patch<BuildingImage>(
    `/api/v1/buildings/${buildingId}/images/${imageId}`,
    data
  );
  return response.data;
};

export const reorderBuildingImages = async (
  buildingId: string,
  imageIds: string[]
): Promise<BuildingImage[]> => {
  const response = await apiClient.put<BuildingImage[]>(
    `/api/v1/buildings/${buildingId}/images/reorder`,
    { image_ids: imageIds }
  );
  return response.data;
};

export const deleteBuildingImage = async (
  buildingId: string,
  imageId: string
): Promise<void> => {
  await apiClient.delete(`/api/v1/buildings/${buildingId}/images/${imageId}`);
};
