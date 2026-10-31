import { apiClient } from "./authService";
import type {
  SoftwareRequirement,
  SoftwareRequirementCreate,
  SoftwareRequirementUpdate,
} from "../types/softwareRequirement";

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
const STORAGE_PREFIX = "scuilone_software_requirements_tenant_";

/**
 * Extracts human-readable error messages from FastAPI/Pydantic validation errors or standard errors.
 * Ensures arrays of error objects never crash React render trees.
 */
export function extractErrorMessage(err: any): string {
  if (!err) return "An unexpected error occurred.";
  if (typeof err === "string") return err;

  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item: any) => {
        if (typeof item === "string") return item;
        const loc = Array.isArray(item.loc)
          ? item.loc.filter((l: any) => l !== "body").join(".")
          : "";
        const msg = item.msg || item.message || "Invalid value";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join("; ");
  }

  if (detail && typeof detail === "object") {
    return detail.message || detail.error || JSON.stringify(detail);
  }

  return err?.message || "Failed to process request.";
}

function getCurrentTenantId(): string {
  try {
    const raw = sessionStorage.getItem("tenant") || localStorage.getItem("tenant");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return "";
}

function getLocalRequirements(): SoftwareRequirement[] {
  const tenantId = getCurrentTenantId();
  const key = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalRequirements(items: SoftwareRequirement[]): void {
  const tenantId = getCurrentTenantId();
  const key = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export const getSoftwareRequirements = async (
  params?: SoftwareRequirementFilterParams
): Promise<SoftwareRequirement[]> => {
  try {
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
    const response = await apiClient.get<any>(url);

    let list: SoftwareRequirement[] = [];
    if (Array.isArray(response.data)) {
      list = response.data;
    } else if (response.data && Array.isArray(response.data.data)) {
      list = response.data.data;
    } else if (response.data && Array.isArray(response.data.items)) {
      list = response.data.items;
    } else if (response.data && Array.isArray(response.data.results)) {
      list = response.data.results;
    }

    if (list.length > 0) {
      saveLocalRequirements(list);
    }
    return list;
  } catch (err: any) {
    // If backend returns 404 or network issue, fallback to cached list
    const cached = getLocalRequirements();
    if (cached.length > 0) {
      return cached;
    }
    throw new Error(extractErrorMessage(err));
  }
};

export const getSoftwareRequirement = async (
  id: string
): Promise<SoftwareRequirement> => {
  try {
    const response = await apiClient.get<any>(`${BASE_URL}/${id}`);
    const item = response.data?.data || response.data;
    if (item && item.id) return item;
  } catch (err: any) {
    const cached = getLocalRequirements().find((r) => r.id === id);
    if (cached) return cached;
    throw new Error(extractErrorMessage(err));
  }

  const found = getLocalRequirements().find((r) => r.id === id);
  if (!found) throw new Error(`Requirement with id ${id} not found.`);
  return found;
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
    const created: SoftwareRequirement =
      response.data?.data || response.data;

    if (created && created.id) {
      const list = getLocalRequirements();
      saveLocalRequirements([created, ...list]);
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
    const updated: SoftwareRequirement =
      response.data?.data || response.data;

    if (updated && updated.id) {
      const list = getLocalRequirements();
      const idx = list.findIndex((r) => r.id === id);
      if (idx !== -1) {
        list[idx] = updated;
      } else {
        list.unshift(updated);
      }
      saveLocalRequirements(list);
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
    const list = getLocalRequirements();
    saveLocalRequirements(list.filter((r) => r.id !== id));
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};
