import { apiClient } from "./authService";
import type { SiteVisit, SiteVisitCreate, SiteVisitUpdate } from "../types/siteVisit";

export interface SiteVisitFilterParams {
  status?: string;
  assigned_to?: string;
  property_match_id?: string;
  scheduled_from?: string;
  scheduled_to?: string;
  skip?: number;
  limit?: number;
}

const STORAGE_PREFIX = "scuilone_site_visits_tenant_";
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
    const old = localStorage.getItem("scuilone_site_visits_v1");
    if (old && (old.includes("Rahul Verma") || old.includes("tenant-default") || old.includes("Pooja Reddy"))) {
      localStorage.removeItem("scuilone_site_visits_v1");
    }
  } catch {}
}

const realDbSiteVisits: SiteVisit[] = [
  {
    id: "6d9d974e-8e9b-41a6-8e23-773afea5fd93",
    tenant_id: "5d382613-ee83-42f0-b1ac-66a0af4506a5",
    property_match_id: "e5ad273e-7897-4aad-984c-f962fc8fce7d",
    assigned_to: null,
    created_by: "7e2be28c-dccd-4717-a6cf-7f23fb90c442",
    scheduled_start: "2026-10-26T14:42:00",
    scheduled_end: "2026-10-26T15:42:00",
    status: "Completed",
    outcome: "Interested",
    buyer_feedback: "Good",
    interest_level: "Interested",
    follow_up_required: false,
    follow_up_date: null,
    cancellation_reason: null,
    created_at: "2026-10-26T09:13:04.540451",
    updated_at: "2026-10-26T09:13:58.897309",
    property_name: "Luxury Villa",
    buyer_name: "Vamshi",
  },
];

const getLocalVisits = (): SiteVisit[] => {
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

  const initial = tenantId === KNOWN_DB_TENANT ? [...realDbSiteVisits] : [];
  saveLocalVisits(initial);
  return initial;
};

const saveLocalVisits = (items: SiteVisit[]) => {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to save site visits to localStorage", err);
  }
};

export const getSiteVisits = async (
  params?: SiteVisitFilterParams
): Promise<SiteVisit[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
    if (params?.property_match_id) query.append("property_match_id", params.property_match_id);
    if (params?.scheduled_from) query.append("scheduled_from", params.scheduled_from);
    if (params?.scheduled_to) query.append("scheduled_to", params.scheduled_to);
    if (params?.skip !== undefined) query.append("skip", String(params.skip));
    if (params?.limit !== undefined) {
      const safeLimit = Math.min(Math.max(1, params.limit), 100);
      query.append("limit", String(safeLimit));
    }

    const url = `/api/v1/site-visits/${query.toString() ? `?${query.toString()}` : ""}`;
    const response = await apiClient.get<SiteVisit[]>(url);
    if (Array.isArray(response.data)) {
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  let items = getLocalVisits();
  if (params?.status) {
    items = items.filter((v) => (v.status || "").toLowerCase() === params.status?.toLowerCase());
  }
  if (params?.assigned_to) {
    items = items.filter((v) => v.assigned_to === params.assigned_to);
  }
  if (params?.property_match_id) {
    items = items.filter((v) => v.property_match_id === params.property_match_id);
  }
  return items;
};

export const getSiteVisit = async (id: string): Promise<SiteVisit> => {
  try {
    const response = await apiClient.get<SiteVisit>(`/api/v1/site-visits/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const items = getLocalVisits();
  const found = items.find((v) => v.id === id);
  if (found) return found;
  throw new Error("Site visit not found");
};

export const createSiteVisit = async (
  data: SiteVisitCreate
): Promise<SiteVisit> => {
  try {
    const response = await apiClient.post<SiteVisit>("/api/v1/site-visits/", data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  const items = getLocalVisits();
  const newVisit: SiteVisit = {
    id: `sv-${Date.now()}`,
    tenant_id: tenantId,
    property_match_id: data.property_match_id,
    assigned_to: data.assigned_to || null,
    scheduled_start: data.scheduled_start,
    scheduled_end: data.scheduled_end,
    status: "Scheduled",
    outcome: null,
    buyer_feedback: null,
    interest_level: null,
    follow_up_required: false,
    follow_up_date: null,
    cancellation_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  items.unshift(newVisit);
  saveLocalVisits(items);
  return newVisit;
};

export const updateSiteVisit = async (
  id: string,
  data: SiteVisitUpdate
): Promise<SiteVisit> => {
  try {
    const response = await apiClient.patch<SiteVisit>(`/api/v1/site-visits/${id}`, data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const items = getLocalVisits();
  const index = items.findIndex((v) => v.id === id);
  if (index === -1) throw new Error("Site visit not found");
  const existing = items[index]!;
  const updated: SiteVisit = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    property_match_id: existing.property_match_id,
    updated_at: new Date().toISOString(),
  };
  items[index] = updated;
  saveLocalVisits(items);
  return updated;
};
