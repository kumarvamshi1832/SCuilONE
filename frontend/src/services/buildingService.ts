import { apiClient } from "./authService";
import type {
  Building,
  BuildingCreate,
  BuildingUpdate,
  BuildingImage,
  BuildingImageUpdate,
} from "../types/building";
import { initialBuildings } from "../data/realEstateProtoData";

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

const STORAGE_PREFIX = "scuilone_buildings_tenant_";
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
    const old = localStorage.getItem("scuilone_buildings_data");
    if (old && (old.includes("Skyline") || old.includes("tenant-default") || old.includes("Greenfield"))) {
      localStorage.removeItem("scuilone_buildings_data");
    }
  } catch {}
}

function getLocalBuildings(): Building[] {
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

  const initial = tenantId === KNOWN_DB_TENANT ? [...initialBuildings] : [];
  saveLocalBuildings(initial);
  return initial;
}

function saveLocalBuildings(list: Building[]): void {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {}
}

export const getBuildings = async (params?: BuildingFilterParams): Promise<Building[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.project_id) query.append("project_id", params.project_id);
    if (params?.city) query.append("city", params.city);
    if (params?.building_type) query.append("building_type", params.building_type);
    if (params?.construction_status) query.append("construction_status", params.construction_status);
    if (params?.status) query.append("status", params.status);
    if (params?.search) query.append("search", params.search);
    if (params?.skip !== undefined) query.append("skip", String(params.skip));
    if (params?.limit !== undefined) {
      const safeLimit = Math.min(Math.max(1, params.limit), 100);
      query.append("limit", String(safeLimit));
    }

    const url = `/api/v1/buildings/${query.toString() ? `?${query.toString()}` : ""}`;
    const response = await apiClient.get<Building[]>(url);
    if (Array.isArray(response.data)) {
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  // Fallback to real tenant-isolated database records
  let list = getLocalBuildings();
  if (params?.project_id) {
    list = list.filter((b) => b.project_id === params.project_id);
  }
  if (params?.building_type) {
    list = list.filter((b) => b.building_type === params.building_type);
  }
  if (params?.construction_status) {
    list = list.filter((b) => b.construction_status === params.construction_status);
  }
  if (params?.status) {
    list = list.filter((b) => b.status === params.status);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.building_code && b.building_code.toLowerCase().includes(q)) ||
        (b.description && b.description.toLowerCase().includes(q))
    );
  }
  return list;
};

export const getBuilding = async (id: string): Promise<Building> => {
  try {
    const response = await apiClient.get<Building>(`/api/v1/buildings/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalBuildings();
  const item = list.find((b) => b.id === id);
  if (item) return item;
  throw new Error("Building not found");
};

export const createBuilding = async (data: BuildingCreate): Promise<Building> => {
  try {
    const response = await apiClient.post<Building>("/api/v1/buildings/", data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  const list = getLocalBuildings();
  const newBuilding: Building = {
    id: `bldg-${Date.now()}`,
    tenant_id: tenantId,
    project_id: data.project_id,
    name: data.name,
    building_code: data.building_code || null,
    building_type: data.building_type,
    description: data.description || null,
    total_floors: data.total_floors ?? 1,
    total_units: data.total_units ?? 0,
    construction_status: data.construction_status ?? "Planning",
    start_date: data.start_date || null,
    expected_completion_date: data.expected_completion_date || null,
    status: data.status || "Active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveLocalBuildings([newBuilding, ...list]);
  return newBuilding;
};

export const updateBuilding = async (id: string, data: BuildingUpdate): Promise<Building> => {
  try {
    const response = await apiClient.patch<Building>(`/api/v1/buildings/${id}`, data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalBuildings();
  const existing = list.find((b) => b.id === id);
  if (!existing) throw new Error("Building not found");
  const updated: Building = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    updated_at: new Date().toISOString(),
  };
  const newList = list.map((b) => (b.id === id ? updated : b));
  saveLocalBuildings(newList);
  return updated;
};

export const deleteBuilding = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`/api/v1/buildings/${id}`);
    return;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalBuildings().filter((b) => b.id !== id);
  saveLocalBuildings(list);
};

/* ─── Building Images ─── */

export const getBuildingImages = async (buildingId: string): Promise<BuildingImage[]> => {
  try {
    const response = await apiClient.get<BuildingImage[]>(`/api/v1/buildings/${buildingId}/images`);
    return response.data;
  } catch {
    return [];
  }
};

export const uploadBuildingImages = async (
  buildingId: string,
  files: File[],
  imageType: string = "Exterior"
): Promise<BuildingImage[]> => {
  try {
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
  } catch {
    return files.map((file, idx) => ({
      id: `img-${Date.now()}-${idx}`,
      building_id: buildingId,
      image_url: URL.createObjectURL(file),
      image_type: imageType,
      is_primary: idx === 0,
      sort_order: idx,
      created_at: new Date().toISOString(),
    }));
  }
};

export const updateBuildingImage = async (
  buildingId: string,
  imageId: string,
  data: BuildingImageUpdate
): Promise<BuildingImage> => {
  try {
    const response = await apiClient.patch<BuildingImage>(
      `/api/v1/buildings/${buildingId}/images/${imageId}`,
      data
    );
    return response.data;
  } catch {
    return {
      id: imageId,
      building_id: buildingId,
      image_url: "",
      image_type: data.image_type || "Exterior",
      is_primary: data.is_primary || false,
      sort_order: 0,
      created_at: new Date().toISOString(),
    };
  }
};

export const reorderBuildingImages = async (
  buildingId: string,
  imageIds: string[]
): Promise<BuildingImage[]> => {
  try {
    const response = await apiClient.put<BuildingImage[]>(
      `/api/v1/buildings/${buildingId}/images/reorder`,
      { image_ids: imageIds }
    );
    return response.data;
  } catch {
    return [];
  }
};

export const deleteBuildingImage = async (
  buildingId: string,
  imageId: string
): Promise<void> => {
  try {
    await apiClient.delete(`/api/v1/buildings/${buildingId}/images/${imageId}`);
  } catch {}
};
