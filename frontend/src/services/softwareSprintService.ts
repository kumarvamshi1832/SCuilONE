import { apiClient } from "./authService";
import type {
  SoftwareSprint,
  SoftwareSprintCreate,
  SoftwareSprintUpdate,
} from "../types/softwareSprint";
import {
  executeSoftwareRequest,
  extractBackendDetail,
  notifySoftwareDataChanged,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

export interface SoftwareSprintFilterParams {
  project_id?: string;
  status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-sprints";

export function extractErrorMessage(err: any): string {
  return extractBackendDetail(err);
}

export const getSoftwareSprints = async (
  params?: SoftwareSprintFilterParams,
  options?: SoftwareRequestOptions
): Promise<SoftwareSprint[]> => {
  const query = new URLSearchParams();
  if (params?.project_id) query.append("project_id", params.project_id);
  if (params?.status) query.append("status_filter", params.status);
  if (params?.search) query.append("search", params.search);
  if (params?.skip !== undefined) query.append("skip", String(params.skip));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;
  const requestKey = `sprints:${url}`;

  return executeSoftwareRequest(
    "software_sprints",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(url, { signal: options?.signal });
      const d = response.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.data)) return d.data;
      if (d && Array.isArray(d.items)) return d.items;
      if (d && Array.isArray(d.results)) return d.results;
      if (d && Array.isArray(d.sprints)) return d.sprints;
      return [];
    },
    options
  );
};

export const getSoftwareSprint = async (
  id: string,
  options?: SoftwareRequestOptions
): Promise<SoftwareSprint> => {
  const requestKey = `sprint:${id}`;
  return executeSoftwareRequest(
    "software_sprints",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(`${BASE_URL}/${id}`, { signal: options?.signal });
      return response.data?.data || response.data;
    },
    options
  );
};

export const createSoftwareSprint = async (
  data: SoftwareSprintCreate
): Promise<SoftwareSprint> => {
  try {
    const response = await apiClient.post<any>(BASE_URL, data);
    notifySoftwareDataChanged("software_sprints");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const updateSoftwareSprint = async (
  id: string,
  data: SoftwareSprintUpdate
): Promise<SoftwareSprint> => {
  try {
    const response = await apiClient.patch<any>(`${BASE_URL}/${id}`, data);
    notifySoftwareDataChanged("software_sprints");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const deleteSoftwareSprint = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
    notifySoftwareDataChanged("software_sprints");
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};
