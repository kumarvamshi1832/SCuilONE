import { apiClient } from "./authService";
import type {
  BuyerRequirement,
  BuyerRequirementCreate,
  BuyerRequirementUpdate,
} from "../types/buyerRequirement";
import { initialBuyerRequirements } from "../data/realEstateProtoData";

const STORAGE_PREFIX = "scuilone_buyer_requirements_tenant_";
const KNOWN_DB_TENANT = "5d382613-ee83-42f0-b1ac-66a0af4506a5";

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

function purgeLegacyStaleData() {
  try {
    const old = localStorage.getItem("scuilone_buyer_requirements_v1");
    if (old && (old.includes("Skyline") || old.includes("tenant-default") || old.includes("Pooja Reddy"))) {
      localStorage.removeItem("scuilone_buyer_requirements_v1");
    }
  } catch {}
}

function getLocalRequirements(): BuyerRequirement[] {
  purgeLegacyStaleData();
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  const initial = tenantId === KNOWN_DB_TENANT ? [...initialBuyerRequirements] : [];
  saveLocalRequirements(initial);
  return initial;
}

function saveLocalRequirements(items: BuyerRequirement[]): void {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {}
}

export const getBuyerRequirements = async (): Promise<BuyerRequirement[]> => {
  try {
    const response = await apiClient.get<BuyerRequirement[]>("/api/v1/buyer-requirements/");
    if (Array.isArray(response.data)) {
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  return getLocalRequirements();
};

export const getBuyerRequirement = async (id: string): Promise<BuyerRequirement> => {
  try {
    const response = await apiClient.get<BuyerRequirement>(`/api/v1/buyer-requirements/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const item = getLocalRequirements().find((r) => r.id === id);
  if (item) return item;
  throw new Error("Buyer requirement not found");
};

export const createBuyerRequirement = async (
  data: BuyerRequirementCreate
): Promise<BuyerRequirement> => {
  try {
    const response = await apiClient.post<BuyerRequirement>("/api/v1/buyer-requirements/", data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  const list = getLocalRequirements();
  const newReq: BuyerRequirement = {
    id: `req-${Date.now()}`,
    tenant_id: tenantId,
    lead_id: data.lead_id || null,
    contact_id: data.contact_id || null,
    assigned_to: data.assigned_to || null,
    requirement_type: data.requirement_type,
    property_type: data.property_type,
    preferred_city: data.preferred_city || null,
    preferred_location: data.preferred_location || null,
    min_budget: data.min_budget || null,
    max_budget: data.max_budget || null,
    bedrooms: data.bedrooms || null,
    min_area: data.min_area || null,
    max_area: data.max_area || null,
    area_unit: data.area_unit || "sqft",
    status: data.status || "New",
    notes: data.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  saveLocalRequirements([newReq, ...list]);
  return newReq;
};

export const updateBuyerRequirement = async (
  id: string,
  data: BuyerRequirementUpdate
): Promise<BuyerRequirement> => {
  try {
    const response = await apiClient.patch<BuyerRequirement>(
      `/api/v1/buyer-requirements/${id}`,
      data
    );
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalRequirements();
  const existing = list.find((r) => r.id === id);
  if (!existing) throw new Error("Buyer requirement not found");
  const updated: BuyerRequirement = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    updated_at: new Date().toISOString(),
  };
  const newList = list.map((r) => (r.id === id ? updated : r));
  saveLocalRequirements(newList);
  return updated;
};

export const deleteBuyerRequirement = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`/api/v1/buyer-requirements/${id}`);
    return;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const list = getLocalRequirements().filter((r) => r.id !== id);
  saveLocalRequirements(list);
};
