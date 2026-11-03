import { apiClient } from "./authService";
import type {
  Activity,
  ActivityCreate,
  ActivityUpdate,
  ActivityRelatedModulesResponse,
} from "../types/activity";

const getHeaders = () => {
  const token =
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("token") ||
    localStorage.getItem("token") ||
    sessionStorage.getItem("authToken") ||
    localStorage.getItem("authToken");

  return {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
};

function unwrapArray<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

/* ─── Endpoints ─── */

const ACTIVITIES_ENDPOINTS = {
  LIST: "/api/v1/activities/",
  MY_TASKS: "/api/v1/activities/my-tasks",
  RELATED_MODULES: "/api/v1/activities/related-modules",
  DETAIL: (id: string) => `/api/v1/activities/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getActivities = async (): Promise<Activity[]> => {
  const response = await apiClient.get<any>(ACTIVITIES_ENDPOINTS.LIST, getHeaders());
  return unwrapArray<Activity>(response.data);
};

export const getMyTasks = async (): Promise<Activity[]> => {
  const response = await apiClient.get<any>(ACTIVITIES_ENDPOINTS.MY_TASKS, getHeaders());
  return unwrapArray<Activity>(response.data);
};

export const getActivityRelatedModules = async (): Promise<ActivityRelatedModulesResponse> => {
  const response = await apiClient.get<any>(
    ACTIVITIES_ENDPOINTS.RELATED_MODULES,
    getHeaders()
  );
  return response.data?.data || response.data;
};

export const getActivityById = async (id: string): Promise<Activity> => {
  const response = await apiClient.get<any>(ACTIVITIES_ENDPOINTS.DETAIL(id), getHeaders());
  return response.data?.data || response.data;
};

export const createActivity = async (data: ActivityCreate): Promise<Activity> => {
  const response = await apiClient.post<any>(ACTIVITIES_ENDPOINTS.LIST, data, getHeaders());
  return response.data?.data || response.data;
};

export const updateActivity = async (id: string, data: ActivityUpdate): Promise<Activity> => {
  const response = await apiClient.put<any>(ACTIVITIES_ENDPOINTS.DETAIL(id), data, getHeaders());
  return response.data?.data || response.data;
};

export const deleteActivity = async (id: string): Promise<void> => {
  await apiClient.delete(ACTIVITIES_ENDPOINTS.DETAIL(id), getHeaders());
};
