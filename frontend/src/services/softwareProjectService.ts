import { apiClient } from "./authService";
import type {
  SoftwareProject,
  SoftwareProjectCreate,
  SoftwareProjectUpdate,
} from "../types/softwareProject";

export interface SoftwareProjectFilterParams {
  status?: string;
  priority?: string;
  contract_id?: string;
  project_manager_id?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-projects";
const STORAGE_PREFIX = "scuilone_software_projects_tenant_";

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

function getLocalProjects(): SoftwareProject[] {
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

function saveLocalProjects(items: SoftwareProject[]): void {
  const tenantId = getCurrentTenantId();
  const key = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export const getSoftwareProjects = async (
  params?: SoftwareProjectFilterParams
): Promise<SoftwareProject[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.priority) query.append("priority", params.priority);
    if (params?.contract_id) query.append("contract_id", params.contract_id);
    if (params?.project_manager_id) query.append("project_manager_id", params.project_manager_id);
    if (params?.search) query.append("search", params.search);
    if (params?.skip !== undefined) query.append("skip", String(params.skip));
    if (params?.limit !== undefined) query.append("limit", String(params.limit));

    const qs = query.toString();
    const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;
    const response = await apiClient.get<SoftwareProject[]>(url);
    if (Array.isArray(response.data)) {
      saveLocalProjects(response.data);
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  let list = getLocalProjects();
  if (params?.status) {
    const st = params.status.toLowerCase();
    list = list.filter((p) => (p.status || "").toLowerCase() === st);
  }
  if (params?.priority) {
    const pr = params.priority.toLowerCase();
    list = list.filter((p) => (p.priority || "").toLowerCase() === pr);
  }
  if (params?.contract_id) {
    list = list.filter((p) => p.software_contract_id === params.contract_id);
  }
  if (params?.project_manager_id) {
    list = list.filter((p) => p.project_manager_id === params.project_manager_id);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.project_number && p.project_number.toLowerCase().includes(q))
    );
  }
  return list;
};

export const getSoftwareProject = async (id: string): Promise<SoftwareProject> => {
  try {
    const response = await apiClient.get<SoftwareProject>(`${BASE_URL}/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalProjects();
  const found = list.find((p) => p.id === id);
  if (!found) throw new Error(`Project with id ${id} not found.`);
  return found;
};

export const createSoftwareProject = async (
  data: SoftwareProjectCreate
): Promise<SoftwareProject> => {
  try {
    const response = await apiClient.post<SoftwareProject>(BASE_URL, data);
    if (response.data) {
      const list = getLocalProjects();
      saveLocalProjects([response.data, ...list]);
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalProjects();
  const nextNumber = data.project_number || `PRJ-2026-00${list.length + 1}`;
  const now = new Date().toISOString();
  const tenantId = getCurrentTenantId();

  const newProject: SoftwareProject = {
    id: `proj-sw-${Date.now()}`,
    tenant_id: tenantId,
    software_contract_id: data.software_contract_id || "",
    deal_id: data.deal_id ?? null,
    project_manager_id: data.project_manager_id ?? null,
    project_number: nextNumber,
    name: data.name || "Untitled Project",
    description: data.description ?? "",
    status: data.status ?? "Planned",
    priority: data.priority ?? "Medium",
    progress_percentage: 0,
    budget: data.budget !== undefined && data.budget !== null ? Number(data.budget) : 0,
    currency: data.currency ?? "INR",
    start_date: data.start_date ?? null,
    target_end_date: data.target_end_date ?? null,
    actual_end_date: data.actual_end_date ?? null,
    scope_of_work: data.scope_of_work || undefined,
    deliverables: data.deliverables || undefined,
    notes: data.notes ?? null,
    created_at: now,
    updated_at: now,
  };

  saveLocalProjects([newProject, ...list]);
  return newProject;
};

export const updateSoftwareProject = async (
  id: string,
  data: SoftwareProjectUpdate
): Promise<SoftwareProject> => {
  try {
    const response = await apiClient.patch<SoftwareProject>(`${BASE_URL}/${id}`, data);
    if (response.data) {
      const list = getLocalProjects();
      const idx = list.findIndex((p) => p.id === id);
      if (idx !== -1) {
        list[idx] = response.data;
        saveLocalProjects(list);
      }
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalProjects();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Project with id ${id} not found.`);

  const existing = list[idx]!;
  const updated: SoftwareProject = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    software_contract_id: existing.software_contract_id,
    project_number: existing.project_number,
    name: data.name !== undefined ? (data.name || "Untitled Project") : existing.name,
    budget:
      data.budget !== undefined && data.budget !== null
        ? Number(data.budget)
        : existing.budget,
    currency: data.currency || existing.currency,
    status: data.status || existing.status,
    priority: data.priority || existing.priority,
    scope_of_work: (data.scope_of_work !== undefined ? data.scope_of_work : existing.scope_of_work) || undefined,
    deliverables: (data.deliverables !== undefined ? data.deliverables : existing.deliverables) || undefined,
    updated_at: new Date().toISOString(),
  };

  list[idx] = updated;
  saveLocalProjects(list);
  return updated;
};

export const deleteSoftwareProject = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }
  const list = getLocalProjects();
  saveLocalProjects(list.filter((p) => p.id !== id));
};
