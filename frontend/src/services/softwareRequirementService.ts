import { apiClient } from "./authService";
import type {
  SoftwareRequirement,
  SoftwareRequirementCreate,
  SoftwareRequirementUpdate,
} from "../types/softwareRequirement";
import {

  executeSoftwareRequest,
  extractBackendDetail,
  notifySoftwareDataChanged,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

export interface SoftwareRequirementFilterParams {
  status?: string;
  software_type?: string;
  priority?: string;
  assigned_to?: string;
  lead_id?: string;
  account_id?: string;
  deal_id?: string;
  search?: string;
  skip?: number;
  offset?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-requirements";

/**
 * Extracts human-readable error messages from FastAPI/Pydantic validation errors or standard errors.
 */
export function extractErrorMessage(err: any): string {
  return extractBackendDetail(err);
}

export const getSoftwareRequirements = async (
  params?: SoftwareRequirementFilterParams,
  options?: SoftwareRequestOptions
): Promise<SoftwareRequirement[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.software_type) query.append("software_type", params.software_type);
  if (params?.priority) query.append("priority", params.priority);
  if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
  if (params?.lead_id) query.append("lead_id", params.lead_id);
  if (params?.account_id) query.append("account_id", params.account_id);
  if (params?.deal_id) query.append("deal_id", params.deal_id);
  if (params?.search) query.append("search", params.search);

  const offsetVal = params?.offset ?? params?.skip;
  if (offsetVal !== undefined) query.append("offset", String(offsetVal));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}/?${qs}` : `${BASE_URL}/`;
  const requestKey = `reqs:${url}`;

  return executeSoftwareRequest(
    "software_requirements",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(url, { signal: options?.signal });

      const d = response.data;
      if (Array.isArray(d)) {
        return d;
      } else if (d && Array.isArray(d.data)) {
        return d.data;
      } else if (d && Array.isArray(d.items)) {
        return d.items;
      } else if (d && Array.isArray(d.results)) {
        return d.results;
      } else if (d && Array.isArray(d.requirements)) {
        return d.requirements;
      } else if (d && Array.isArray(d.software_requirements)) {
        return d.software_requirements;
      }
      return [];
    },
    options
  );
};

export const getSoftwareRequirement = async (
  id: string,
  options?: SoftwareRequestOptions
): Promise<SoftwareRequirement> => {
  const requestKey = `req:${id}`;
  return executeSoftwareRequest(
    "software_requirements",
    requestKey,
    async () => {
      const response = await apiClient.get<any>(`${BASE_URL}/${id}`, { signal: options?.signal });
      return response.data?.data || response.data;
    },
    options
  );
};

/**
 * Clean and sanitize requirement payload to match backend schema.
 * Replaces empty strings with null for optional dates, numbers, strings, and UUIDs.
 */
function sanitizeRequirementData(data: SoftwareRequirementCreate | SoftwareRequirementUpdate) {
  const sanitizeStr = (val?: string | null) =>
    val && val.trim().length > 0 ? val.trim() : null;

  const sanitizeNum = (val?: number | string | null) => {
    if (val === undefined || val === null || (val as any) === "") return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  };

  return {
    ...data,
    title: (data.title || "").trim(),
    description: (data.description || "").trim(),
    target_date: sanitizeStr(data.target_date),
    platforms: sanitizeStr(data.platforms),
    integrations: sanitizeStr(data.integrations),
    notes: sanitizeStr(data.notes),
    deal_id: sanitizeStr(data.deal_id),
    lead_id: sanitizeStr(data.lead_id),
    account_id: sanitizeStr(data.account_id),
    contact_id: sanitizeStr(data.contact_id),
    assigned_to: sanitizeStr(data.assigned_to),
    min_budget: sanitizeNum(data.min_budget),
    max_budget: sanitizeNum(data.max_budget),
    currency: data.currency || "INR",
    priority: data.priority || "Medium",
    status: data.status || "New",
  };
}

export const createSoftwareRequirement = async (
  data: SoftwareRequirementCreate
): Promise<SoftwareRequirement> => {
  const payload = sanitizeRequirementData(data);
  try {
    const response = await apiClient.post<any>(`${BASE_URL}/`, payload);
    const created: SoftwareRequirement = response.data?.data || response.data;
    if (created && created.id) {
      notifySoftwareDataChanged("software_requirements");
      return created;
    }
    throw new Error("Invalid response received from server when creating requirement.");
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const updateSoftwareRequirement = async (
  id: string,
  data: SoftwareRequirementUpdate
): Promise<SoftwareRequirement> => {
  const payload = sanitizeRequirementData(data);
  try {
    const response = await apiClient.put<any>(`${BASE_URL}/${id}`, payload);
    const updated: SoftwareRequirement = response.data?.data || response.data;
    if (updated && updated.id) {
      notifySoftwareDataChanged("software_requirements");
      return updated;
    }
    throw new Error("Invalid response received from server when updating requirement.");
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const deleteSoftwareRequirement = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
    notifySoftwareDataChanged("software_requirements");
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};
