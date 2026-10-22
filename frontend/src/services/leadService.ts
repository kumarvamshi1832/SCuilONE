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
  MY_LEADS: "/api/v1/leads/my-leads",
  DETAIL: (id: string) => `/api/v1/leads/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getLeads = async (): Promise<Lead[]> => {
  const response = await apiClient.get<Lead[]>(LEADS_ENDPOINTS.LIST, getHeaders());
  return response.data;
};

export const getMyLeads = async (): Promise<Lead[]> => {
  const response = await apiClient.get<Lead[]>(LEADS_ENDPOINTS.MY_LEADS, getHeaders());
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