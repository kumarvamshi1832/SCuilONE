import { apiClient } from "./authService";
import type { Project, ProjectCreate, ProjectUpdate } from "../types/project";

export interface ProjectFilterParams {
  city?: string;
  project_type?: string;
  status?: string;
  construction_status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

export const getProjects = async (params?: ProjectFilterParams): Promise<Project[]> => {
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
  return response.data;
};

export const getProject = async (id: string): Promise<Project> => {
  const response = await apiClient.get<Project>(`/api/v1/projects/${id}`);
  return response.data;
};

export const createProject = async (data: ProjectCreate): Promise<Project> => {
  const response = await apiClient.post<Project>("/api/v1/projects/", data);
  return response.data;
};

export const updateProject = async (id: string, data: ProjectUpdate): Promise<Project> => {
  const response = await apiClient.patch<Project>(`/api/v1/projects/${id}`, data);
  return response.data;
};

export const deleteProject = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/v1/projects/${id}`);
};
