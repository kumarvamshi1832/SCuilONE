import { apiClient } from "./authService";
import type {
  SoftwareContract,
  SoftwareContractCreate,
  SoftwareContractUpdate,
  SoftwareContractMilestone,
  SoftwareContractMilestoneReadyRequest,
  SoftwareContractMilestoneInvoiceRequest,
} from "../types/softwareContract";

export interface SoftwareContractFilterParams {
  status?: string;
  estimate_id?: string;
  deal_id?: string;
  account_id?: string;
  assigned_to?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-contracts";

export const getSoftwareContracts = async (
  params?: SoftwareContractFilterParams
): Promise<SoftwareContract[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.estimate_id) query.append("estimate_id", params.estimate_id);
  if (params?.deal_id) query.append("deal_id", params.deal_id);
  if (params?.account_id) query.append("account_id", params.account_id);
  if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
  if (params?.search) query.append("search", params.search);
  if (params?.skip !== undefined) query.append("skip", String(params.skip));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;
  const response = await apiClient.get<SoftwareContract[]>(url);
  return Array.isArray(response.data) ? response.data : [];
};

export const getSoftwareContract = async (id: string): Promise<SoftwareContract> => {
  const response = await apiClient.get<SoftwareContract>(`${BASE_URL}/${id}`);
  return response.data;
};

export const createSoftwareContract = async (
  data: SoftwareContractCreate
): Promise<SoftwareContract> => {
  const response = await apiClient.post<SoftwareContract>(BASE_URL, data);
  return response.data;
};

export const updateSoftwareContract = async (
  id: string,
  data: SoftwareContractUpdate
): Promise<SoftwareContract> => {
  const response = await apiClient.patch<SoftwareContract>(`${BASE_URL}/${id}`, data);
  return response.data;
};

export const deleteSoftwareContract = async (id: string): Promise<void> => {
  await apiClient.delete(`${BASE_URL}/${id}`);
};

export const markContractMilestoneReady = async (
  contractId: string,
  milestoneId: string,
  payload?: SoftwareContractMilestoneReadyRequest
): Promise<SoftwareContractMilestone> => {
  const response = await apiClient.post<SoftwareContractMilestone>(
    `${BASE_URL}/${contractId}/milestones/${milestoneId}/ready`,
    payload || {}
  );
  return response.data;
};

export const invoiceContractMilestone = async (
  contractId: string,
  milestoneId: string,
  payload?: SoftwareContractMilestoneInvoiceRequest
): Promise<SoftwareContractMilestone> => {
  const response = await apiClient.post<SoftwareContractMilestone>(
    `${BASE_URL}/${contractId}/milestones/${milestoneId}/invoice`,
    payload || {}
  );
  return response.data;
};
