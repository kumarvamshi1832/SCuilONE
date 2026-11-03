import { apiClient } from "./authService";
import type {
  SoftwareContract,
  SoftwareContractCreate,
  SoftwareContractUpdate,
  SoftwareContractMilestone,
  SoftwareContractMilestoneReadyRequest,
  SoftwareContractMilestoneInvoiceRequest,
} from "../types/softwareContract";
import {

  executeSoftwareRequest,
  extractBackendDetail,
  notifySoftwareDataChanged,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

export interface SoftwareContractFilterParams {
  status?: string;
  estimate_id?: string;
  deal_id?: string;
  account_id?: string;
  assigned_to?: string;
  search?: string;
  skip?: number;
  offset?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-contracts";

export function extractErrorMessage(err: any): string {
  return extractBackendDetail(err);
}

export const getSoftwareContracts = async (
  params?: SoftwareContractFilterParams,
  options?: SoftwareRequestOptions
): Promise<SoftwareContract[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.estimate_id) query.append("estimate_id", params.estimate_id);
  if (params?.deal_id) query.append("deal_id", params.deal_id);
  if (params?.account_id) query.append("account_id", params.account_id);
  if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
  if (params?.search) query.append("search", params.search);

  const offsetVal = params?.offset ?? params?.skip;
  if (offsetVal !== undefined) query.append("offset", String(offsetVal));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;
  const requestKey = `contracts:${url}`;

  return executeSoftwareRequest(
    "software_contracts",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(url, { signal: options?.signal });
      const d = response.data;
      if (Array.isArray(d)) return d;
      if (d && Array.isArray(d.data)) return d.data;
      if (d && Array.isArray(d.items)) return d.items;
      if (d && Array.isArray(d.results)) return d.results;
      if (d && Array.isArray(d.contracts)) return d.contracts;
      return [];
    },
    options
  );
};

export const getSoftwareContract = async (
  id: string,
  options?: SoftwareRequestOptions
): Promise<SoftwareContract> => {
  const requestKey = `contract:${id}`;
  return executeSoftwareRequest(
    "software_contracts",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(`${BASE_URL}/${id}`, { signal: options?.signal });
    return response.data?.data || response.data;
    },
    options
  );
};

export const createSoftwareContract = async (
  data: SoftwareContractCreate
): Promise<SoftwareContract> => {
  try {
    const response = await apiClient.post<any>(BASE_URL, data);
    notifySoftwareDataChanged("software_contracts");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const updateSoftwareContract = async (
  id: string,
  data: SoftwareContractUpdate
): Promise<SoftwareContract> => {
  try {
    const response = await apiClient.patch<any>(`${BASE_URL}/${id}`, data);
    notifySoftwareDataChanged("software_contracts");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const deleteSoftwareContract = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
    notifySoftwareDataChanged("software_contracts");
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const markContractMilestoneReady = async (
  contractId: string,
  milestoneId: string,
  payload?: SoftwareContractMilestoneReadyRequest
): Promise<SoftwareContractMilestone> => {
  try {
    const response = await apiClient.post<any>(
      `${BASE_URL}/${contractId}/milestones/${milestoneId}/ready`,
      payload || {}
    );
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const invoiceContractMilestone = async (
  contractId: string,
  milestoneId: string,
  payload?: SoftwareContractMilestoneInvoiceRequest
): Promise<SoftwareContractMilestone> => {
  try {
    const response = await apiClient.post<any>(
      `${BASE_URL}/${contractId}/milestones/${milestoneId}/invoice`,
      payload || {}
    );
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};
