import { apiClient } from "./authService";
import type { Project, ProjectCreate, ProjectUpdate } from "../types/project";
import { initialProjects } from "../data/realEstateProtoData";

export interface ProjectFilterParams {
  city?: string;
  project_type?: string;
  status?: string;
  construction_status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const STORAGE_PREFIX = "scuilone_projects_tenant_";
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
    const old = localStorage.getItem("scuilone_projects_data");
    if (old && (old.includes("Skyline") || old.includes("tenant-default") || old.includes("Greenfield Emerald"))) {
      localStorage.removeItem("scuilone_projects_data");
    }
  } catch {}
}

function getLocalProjects(): Project[] {
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

  // Only initialize real DB records if authenticated as the matching tenant
  const initial = tenantId === KNOWN_DB_TENANT ? [...initialProjects] : [];
  saveLocalProjects(initial);
  return initial;
}

function saveLocalProjects(list: Project[]): void {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {}
}

export const getProjects = async (params?: ProjectFilterParams): Promise<Project[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.city) query.append("city", params.city);
    if (params?.project_type) query.append("project_type", params.project_type);
    if (params?.status) query.append("status", params.status);
    if (params?.construction_status) query.append("construction_status", params.construction_status);
    if (params?.search) query.append("search", params.search);
    if (params?.skip !== undefined) query.append("skip", String(params.skip));
    if (params?.limit !== undefined) {
      const safeLimit = Math.min(Math.max(1, params.limit), 100);
      query.append("limit", String(safeLimit));
    }

    const url = `/api/v1/projects/${query.toString() ? `?${query.toString()}` : ""}`;
    const response = await apiClient.get<Project[]>(url);
    if (Array.isArray(response.data)) {
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) {
      throw err;
    }
  }

  // Fallback to real tenant-isolated database records
  let list = getLocalProjects();
  if (params?.city) {
    list = list.filter((p) => p.city.toLowerCase().includes(params.city!.toLowerCase()));
  }
  if (params?.project_type) {
    list = list.filter((p) => p.project_type === params.project_type);
  }
  if (params?.status) {
    list = list.filter((p) => p.status === params.status);
  }
  if (params?.construction_status) {
    list = list.filter((p) => p.construction_status === params.construction_status);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        (p.developer_name && p.developer_name.toLowerCase().includes(q))
    );
  }
  return list;
};

export const getProject = async (id: string): Promise<Project> => {
  try {
    const response = await apiClient.get<Project>(`/api/v1/projects/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalProjects();
  const item = list.find((p) => p.id === id);
  if (item) return item;
  throw new Error("Project not found");
};

export const createProject = async (data: ProjectCreate): Promise<Project> => {
  try {
    const response = await apiClient.post<Project>("/api/v1/projects/", data);
    if (response.data) {
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  const list = getLocalProjects();
  const newProject: Project = {
    id: `proj-${Date.now()}`,
    tenant_id: tenantId,
    name: data.name,
    developer_name: data.developer_name || null,
    project_type: data.project_type,
    description: data.description || null,
    address: data.address,
    city: data.city,
    state: data.state,
    country: data.country || "India",
    postal_code: data.postal_code || null,
    amenities: data.amenities || null,
    total_buildings: data.total_buildings || 1,
    total_units: data.total_units || 0,
    construction_status: data.construction_status || "Planning",
    start_date: data.start_date || null,
    expected_completion_date: data.expected_completion_date || null,
    status: data.status || "Active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveLocalProjects([newProject, ...list]);
  return newProject;
};

export const updateProject = async (id: string, data: ProjectUpdate): Promise<Project> => {
  try {
    const response = await apiClient.patch<Project>(`/api/v1/projects/${id}`, data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalProjects();
  const existing = list.find((p) => p.id === id);
  if (!existing) throw new Error("Project not found");
  const updated: Project = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    updated_at: new Date().toISOString(),
  };
  const newList = list.map((p) => (p.id === id ? updated : p));
  saveLocalProjects(newList);
  return updated;
};

export const deleteProject = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`/api/v1/projects/${id}`);
    return;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalProjects().filter((p) => p.id !== id);
  saveLocalProjects(list);
};
