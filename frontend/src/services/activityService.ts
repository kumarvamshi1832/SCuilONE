import { apiClient } from "./authService";
import type { Activity, ActivityCreate, ActivityUpdate } from "../types/activity";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

/* ─── Endpoints ─── */

const ACTIVITIES_ENDPOINTS = {
  LIST: "/api/v1/activities/",
  MY_TASKS: "/api/v1/activities/my-tasks",
  DETAIL: (id: string) => `/api/v1/activities/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getActivities = async (): Promise<Activity[]> => {
  const response = await apiClient.get<Activity[]>(ACTIVITIES_ENDPOINTS.LIST, getHeaders());
  return response.data;
};

export const getMyTasks = async (): Promise<Activity[]> => {
  const response = await apiClient.get<Activity[]>(ACTIVITIES_ENDPOINTS.MY_TASKS, getHeaders());
  return response.data;
};

export const getActivityById = async (id: string): Promise<Activity> => {
  const response = await apiClient.get<Activity>(ACTIVITIES_ENDPOINTS.DETAIL(id), getHeaders());
  return response.data;
};

export const createActivity = async (data: ActivityCreate): Promise<Activity> => {
  const response = await apiClient.post<Activity>(ACTIVITIES_ENDPOINTS.LIST, data, getHeaders());
  return response.data;
};

export const updateActivity = async (id: string, data: ActivityUpdate): Promise<Activity> => {
  const response = await apiClient.put<Activity>(ACTIVITIES_ENDPOINTS.DETAIL(id), data, getHeaders());
  return response.data;
};

export const deleteActivity = async (id: string): Promise<void> => {
  await apiClient.delete(ACTIVITIES_ENDPOINTS.DETAIL(id), getHeaders());
};
