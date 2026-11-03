import { apiClient } from "./authService";
import type { Lead, CreateLeadRequest, UpdateLeadRequest } from "../types/lead";

const getHeaders = () => {
  const token =
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token");
  return token
    ? {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    : {};
};

/* ─── Endpoints ─── */

const LEADS_ENDPOINTS = {
  LIST: "/api/v1/leads/",
  MY_LEADS: "/api/v1/leads/my-leads",
  DETAIL: (id: string) => `/api/v1/leads/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getLeads = async (): Promise<Lead[]> => {
  const response = await apiClient.get<any>(LEADS_ENDPOINTS.LIST, getHeaders());
  if (Array.isArray(response.data)) {
    return response.data;
  }
  if (response.data && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  if (response.data && Array.isArray(response.data.items)) {
    return response.data.items;
  }
  if (response.data && Array.isArray(response.data.results)) {
    return response.data.results;
  }
  return [];
};

export const getMyLeads = async (): Promise<Lead[]> => {
  const response = await apiClient.get<any>(LEADS_ENDPOINTS.MY_LEADS, getHeaders());
  if (Array.isArray(response.data)) {
    return response.data;
  }
  if (response.data && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  if (response.data && Array.isArray(response.data.items)) {
    return response.data.items;
  }
  if (response.data && Array.isArray(response.data.results)) {
    return response.data.results;
  }
  return [];
};

export const getLead = async (id: string): Promise<Lead> => {
  const response = await apiClient.get<any>(LEADS_ENDPOINTS.DETAIL(id), getHeaders());
  return response.data?.data || response.data;
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

export interface LeadAssignmentHistoryItem {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  previous_assigned_to: string | null;
  previous_assignee_name: string | null;
  new_assigned_to: string | null;
  new_assignee_name: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  reason: string;
  action: string;
  created_at: string;
}

export interface LeadAssignmentHistoryResponse {
  items: LeadAssignmentHistoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const getLeadAssignmentHistory = async (
  page: number = 1,
  pageSize: number = 10
): Promise<LeadAssignmentHistoryResponse> => {
  const response = await apiClient.get<LeadAssignmentHistoryResponse>(
    `/api/v1/leads/assignment-history?page=${page}&page_size=${pageSize}`,
    getHeaders()
  );

  return response.data;
};
