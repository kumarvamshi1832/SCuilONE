import { apiClient } from "./authService";
import type {
  SoftwareSprint,
  SoftwareSprintCreate,
  SoftwareSprintUpdate,
} from "../types/softwareSprint";

export interface SoftwareSprintFilterParams {
  project_id?: string;
  status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-sprints";
const STORAGE_PREFIX = "scuilone_software_sprints_tenant_";

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

function getLocalSprints(): SoftwareSprint[] {
  const tenantId = getCurrentTenantId();
  const key = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalSprints(items: SoftwareSprint[]): void {
  const tenantId = getCurrentTenantId();
  const key = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export const getSoftwareSprints = async (
  params?: SoftwareSprintFilterParams
): Promise<SoftwareSprint[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.project_id) query.append("project_id", params.project_id);
    if (params?.status) query.append("status_filter", params.status);
    if (params?.search) query.append("search", params.search);
    if (params?.skip !== undefined) query.append("skip", String(params.skip));
    if (params?.limit !== undefined) query.append("limit", String(params.limit));

    const qs = query.toString();
    const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;
    const response = await apiClient.get<SoftwareSprint[]>(url);
    if (Array.isArray(response.data)) {
      saveLocalSprints(response.data);
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  let list = getLocalSprints();
  if (params?.project_id) {
    list = list.filter((s) => s.software_project_id === params.project_id);
  }
  if (params?.status) {
    const st = params.status.toLowerCase();
    list = list.filter((s) => (s.status || "").toLowerCase() === st);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (s) =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.goal && s.goal.toLowerCase().includes(q))
    );
  }
  return list;
};

export const getSoftwareSprint = async (id: string): Promise<SoftwareSprint> => {
  try {
    const response = await apiClient.get<SoftwareSprint>(`${BASE_URL}/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalSprints();
  const found = list.find((s) => s.id === id);
  if (!found) throw new Error(`Sprint with id ${id} not found.`);
  return found;
};

export const createSoftwareSprint = async (
  data: SoftwareSprintCreate
): Promise<SoftwareSprint> => {
  try {
    const response = await apiClient.post<SoftwareSprint>(BASE_URL, data);
    if (response.data) {
      const list = getLocalSprints();
      saveLocalSprints([response.data, ...list]);
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalSprints();
  const now = new Date().toISOString();
  const tenantId = getCurrentTenantId();

  const newSprint: SoftwareSprint = {
    id: `sprint-sw-${Date.now()}`,
    tenant_id: tenantId,
    software_project_id: data.software_project_id,
    name: data.name,
    goal: data.goal ?? null,
    status: data.status ?? "Planned",
    start_date: data.start_date,
    end_date: data.end_date,
    created_at: now,
    updated_at: now,
  };

  saveLocalSprints([newSprint, ...list]);
  return newSprint;
};

export const updateSoftwareSprint = async (
  id: string,
  data: SoftwareSprintUpdate
): Promise<SoftwareSprint> => {
  try {
    const response = await apiClient.patch<SoftwareSprint>(`${BASE_URL}/${id}`, data);
    if (response.data) {
      const list = getLocalSprints();
      const idx = list.findIndex((s) => s.id === id);
      if (idx !== -1) {
        list[idx] = response.data;
        saveLocalSprints(list);
      }
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalSprints();
  const idx = list.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Sprint with id ${id} not found.`);

  const existing = list[idx]!;
  const updated: SoftwareSprint = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    software_project_id: existing.software_project_id,
    name: data.name !== undefined ? (data.name || "Untitled Sprint") : existing.name,
    start_date: data.start_date || existing.start_date,
    end_date: data.end_date || existing.end_date,
    status: data.status || existing.status,
    updated_at: new Date().toISOString(),
  };

  list[idx] = updated;
  saveLocalSprints(list);
  return updated;
};

export const deleteSoftwareSprint = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }
  const list = getLocalSprints();
  saveLocalSprints(list.filter((s) => s.id !== id));
};
