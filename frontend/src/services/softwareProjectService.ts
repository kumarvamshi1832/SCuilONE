import { apiClient } from "./authService";
import type {
  SoftwareProject,
  SoftwareProjectCreate,
  SoftwareProjectUpdate,
} from "../types/softwareProject";
import {
  executeSoftwareRequest,
  extractBackendDetail,
  notifySoftwareDataChanged,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

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

export function extractErrorMessage(err: any): string {
  return extractBackendDetail(err);
}

export const getSoftwareProjects = async (
  params?: SoftwareProjectFilterParams,
  options?: SoftwareRequestOptions
): Promise<SoftwareProject[]> => {
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
  const requestKey = `projects:${url}`;

  return executeSoftwareRequest(
    "software_projects",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(url, { signal: options?.signal });
      const d = response.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.data)) return d.data;
      if (d && Array.isArray(d.items)) return d.items;
      if (d && Array.isArray(d.results)) return d.results;
      if (d && Array.isArray(d.projects)) return d.projects;
      return [];
    },
    options
  );
};

export const getSoftwareProject = async (
  id: string,
  options?: SoftwareRequestOptions
): Promise<SoftwareProject> => {
  const requestKey = `proj:${id}`;
  return executeSoftwareRequest(
    "software_projects",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(`${BASE_URL}/${id}`, { signal: options?.signal });
      return response.data?.data || response.data;
    },
    options
  );
};

export const createSoftwareProject = async (
  data: SoftwareProjectCreate
): Promise<SoftwareProject> => {
  try {
    const response = await apiClient.post<any>(BASE_URL, data);
    notifySoftwareDataChanged("software_projects");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const updateSoftwareProject = async (
  id: string,
  data: SoftwareProjectUpdate
): Promise<SoftwareProject> => {
  try {
    const response = await apiClient.patch<any>(`${BASE_URL}/${id}`, data);
    notifySoftwareDataChanged("software_projects");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const deleteSoftwareProject = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
    notifySoftwareDataChanged("software_projects");
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};
