import { apiClient } from "./authService";
import type { Lead, CreateLeadRequest, UpdateLeadRequest } from "../types/lead";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

/* ─── Endpoints ─── */

const LEADS_ENDPOINTS = {
  LIST: "/api/v1/leads/",
  DETAIL: (id: string) => `/api/v1/leads/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getLeads = async (): Promise<Lead[]> => {
  const response = await apiClient.get<Lead[]>(LEADS_ENDPOINTS.LIST, getHeaders());
  return response.data;
};

export const getLead = async (id: string): Promise<Lead> => {
  const response = await apiClient.get<Lead>(LEADS_ENDPOINTS.DETAIL(id), getHeaders());
  return response.data;
};

export const createLead = async (data: CreateLeadRequest): Promise<Lead> => {
  const response = await apiClient.post<Lead>(LEADS_ENDPOINTS.LIST, data, getHeaders());
  return response.data;
};

export const updateLead = async (id: string, data: UpdateLeadRequest): Promise<Lead> => {
  const response = await apiClient.put<Lead>(LEADS_ENDPOINTS.DETAIL(id), data, getHeaders());
  return response.data;
};

export const deleteLead = async (id: string): Promise<void> => {
  await apiClient.delete(LEADS_ENDPOINTS.DETAIL(id), getHeaders());
};
