import { apiClient } from "./authService";
import type { Deal, DealCreate, DealUpdate } from "../types/deal";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

/* ─── Endpoints ─── */

const DEALS_ENDPOINTS = {
  LIST: "/api/v1/deals/",
  DETAIL: (id: string) => `/api/v1/deals/${id}`,
} as const;

/* ─── Service Functions ─── */

export const getDeals = async (): Promise<Deal[]> => {
  const response = await apiClient.get<Deal[]>(DEALS_ENDPOINTS.LIST, getHeaders());
  return response.data;
};

export const getDealById = async (id: string): Promise<Deal> => {
  const response = await apiClient.get<Deal>(DEALS_ENDPOINTS.DETAIL(id), getHeaders());
  return response.data;
};

export const createDeal = async (data: DealCreate): Promise<Deal> => {
  const response = await apiClient.post<Deal>(DEALS_ENDPOINTS.LIST, data, getHeaders());
  return response.data;
};

export const updateDeal = async (id: string, data: DealUpdate): Promise<Deal> => {
  const response = await apiClient.put<Deal>(DEALS_ENDPOINTS.DETAIL(id), data, getHeaders());
  return response.data;
};

export const deleteDeal = async (id: string): Promise<void> => {
  await apiClient.delete(DEALS_ENDPOINTS.DETAIL(id), getHeaders());
};
