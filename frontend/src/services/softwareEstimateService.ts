import { apiClient } from "./authService";
import type {
  SoftwareEstimate,
  SoftwareEstimateCreate,
  SoftwareEstimateUpdate,
} from "../types/softwareEstimate";
import {

  executeSoftwareRequest,
  extractBackendDetail,
  notifySoftwareDataChanged,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

export interface SoftwareEstimateFilterParams {
  status?: string;
  requirement_id?: string;
  deal_id?: string;
  assigned_to?: string;
  search?: string;
  skip?: number;
  offset?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-estimates";

export function extractErrorMessage(err: any): string {
  return extractBackendDetail(err);
}

export const getSoftwareEstimates = async (
  params?: SoftwareEstimateFilterParams,
  options?: SoftwareRequestOptions
): Promise<SoftwareEstimate[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.requirement_id) query.append("software_requirement_id", params.requirement_id);
  if (params?.deal_id) query.append("deal_id", params.deal_id);
  if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
  if (params?.search) query.append("search", params.search);

  const offsetVal = params?.offset ?? params?.skip;
  if (offsetVal !== undefined) query.append("offset", String(offsetVal));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}/?${qs}` : `${BASE_URL}/`;
  const requestKey = `estimates:${url}`;

  return executeSoftwareRequest(
    "software_estimates",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(url, { signal: options?.signal });
      const d = response.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.data)) return d.data;
      if (d && Array.isArray(d.items)) return d.items;
      if (d && Array.isArray(d.results)) return d.results;
      if (d && Array.isArray(d.estimates)) return d.estimates;
      return [];
    },
    options
  );
};

export const getSoftwareEstimate = async (
  id: string,
  options?: SoftwareRequestOptions
): Promise<SoftwareEstimate> => {
  const requestKey = `est:${id}`;
  return executeSoftwareRequest(
    "software_estimates",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(`${BASE_URL}/${id}`, { signal: options?.signal });
      return response.data?.data || response.data;
    },
    options
  );
};

export const createSoftwareEstimate = async (
  data: SoftwareEstimateCreate
): Promise<SoftwareEstimate> => {
  try {
    const response = await apiClient.post<any>(`${BASE_URL}/`, data);
    notifySoftwareDataChanged("software_estimates");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const updateSoftwareEstimate = async (
  id: string,
  data: SoftwareEstimateUpdate
): Promise<SoftwareEstimate> => {
  try {
    const response = await apiClient.put<any>(`${BASE_URL}/${id}`, data);
    notifySoftwareDataChanged("software_estimates");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const deleteSoftwareEstimate = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
    notifySoftwareDataChanged("software_estimates");
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const createEstimateRevision = async (
  estimateId: string
): Promise<SoftwareEstimate> => {
  try {
    const response = await apiClient.post<any>(
      `${BASE_URL}/${estimateId}/revisions`
    );
    notifySoftwareDataChanged("software_estimates");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};
