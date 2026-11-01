import { apiClient } from "./authService";
import type {
  SoftwareEstimate,
  SoftwareEstimateCreate,
  SoftwareEstimateUpdate,
} from "../types/softwareEstimate";

export interface SoftwareEstimateFilterParams {
  status?: string;
  requirement_id?: string;
  deal_id?: string;
  assigned_to?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

const BASE_URL = "/api/v1/software-estimates";
const STORAGE_PREFIX = "scuilone_software_estimates_tenant_";

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

function getLocalEstimates(): SoftwareEstimate[] {
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

function saveLocalEstimates(items: SoftwareEstimate[]): void {
  const tenantId = getCurrentTenantId();
  const key = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {}
}

export const getSoftwareEstimates = async (
  params?: SoftwareEstimateFilterParams
): Promise<SoftwareEstimate[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.append("status_filter", params.status);
    if (params?.requirement_id) query.append("requirement_id", params.requirement_id);
    if (params?.deal_id) query.append("deal_id", params.deal_id);
    if (params?.search) query.append("search", params.search);

    const qs = query.toString();
    const url = qs ? `${BASE_URL}/?${qs}` : `${BASE_URL}/`;
    const response = await apiClient.get<SoftwareEstimate[]>(url);
    if (Array.isArray(response.data)) {
      saveLocalEstimates(response.data);
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  let list = getLocalEstimates();
  if (params?.status) {
    const st = params.status.toLowerCase();
    list = list.filter((e) => (e.status || "").toLowerCase() === st);
  }
  if (params?.requirement_id) {
    list = list.filter((e) => e.software_requirement_id === params.requirement_id);
  }
  if (params?.deal_id) {
    list = list.filter((e) => e.deal_id === params.deal_id);
  }
  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (e) =>
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.estimate_number && e.estimate_number.toLowerCase().includes(q))
    );
  }
  return list;
};

export const getSoftwareEstimate = async (id: string): Promise<SoftwareEstimate> => {
  try {
    const response = await apiClient.get<SoftwareEstimate>(`${BASE_URL}/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalEstimates();
  const found = list.find((e) => e.id === id);
  if (!found) throw new Error(`Estimate with id ${id} not found.`);
  return found;
};

export const createSoftwareEstimate = async (
  data: SoftwareEstimateCreate
): Promise<SoftwareEstimate> => {
  try {
    const response = await apiClient.post<SoftwareEstimate>(`${BASE_URL}/`, data);
    if (response.data) {
      const list = getLocalEstimates();
      saveLocalEstimates([response.data, ...list]);
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalEstimates();
  const nextNumber = data.estimate_number || `EST-2026-00${list.length + 1}`;
  const now = new Date().toISOString();
  const tenantId = getCurrentTenantId();

  const processedItems = data.items.map((item, idx) => {
    const qty = Number(item.quantity) || 1;
    const price = Number(item.unit_price) || 0;
    const discPct = Number(item.discount_percent) || 0;
    const taxPct = Number(item.tax_percent) || 0;

    const subtotal = qty * price;
    const discount = subtotal * (discPct / 100);
    const tax = (subtotal - discount) * (taxPct / 100);
    const total = subtotal - discount + tax;

    return {
      id: `item-${Date.now()}-${idx}`,
      estimate_id: `est-sw-${Date.now()}`,
      item_name: item.item_name,
      description: item.description ?? "",
      quantity: qty,
      unit_price: price,
      discount_percent: discPct,
      tax_percent: taxPct,
      line_subtotal: subtotal,
      line_discount: discount,
      line_tax: tax,
      line_total: total,
      sort_order: item.sort_order ?? idx + 1,
    };
  });

  const subtotal = processedItems.reduce((acc, i) => acc + (i.line_subtotal || 0), 0);
  const taxAmount = processedItems.reduce((acc, i) => acc + (i.line_tax || 0), 0);
  const discountAmount = Number(data.discount_amount) || 0;
  const totalAmount = Math.max(0, subtotal - discountAmount + taxAmount);

  const newEstimate: SoftwareEstimate = {
    id: `est-sw-${Date.now()}`,
    tenant_id: tenantId,
    software_requirement_id: data.software_requirement_id,
    parent_estimate_id: null,
    revision_number: 1,
    deal_id: data.deal_id ?? null,
    assigned_to: data.assigned_to ?? null,
    estimate_number: nextNumber,
    title: data.title || "Untitled Estimate",
    description: data.description ?? "",
    currency: data.currency ?? "INR",
    issue_date: data.issue_date || now,
    expiry_date: data.expiry_date ?? null,
    status: data.status ?? "Draft",
    subtotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    terms_and_conditions: data.terms_and_conditions ?? "",
    notes: data.notes ?? null,
    created_at: now,
    updated_at: now,
    items: processedItems,
  };

  saveLocalEstimates([newEstimate, ...list]);
  return newEstimate;
};

export const updateSoftwareEstimate = async (
  id: string,
  data: SoftwareEstimateUpdate
): Promise<SoftwareEstimate> => {
  try {
    const response = await apiClient.put<SoftwareEstimate>(`${BASE_URL}/${id}`, data);
    if (response.data) {
      const list = getLocalEstimates();
      const idx = list.findIndex((e) => e.id === id);
      if (idx !== -1) {
        list[idx] = response.data;
        saveLocalEstimates(list);
      }
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }

  const list = getLocalEstimates();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) throw new Error(`Estimate with id ${id} not found.`);

  const existing = list[idx]!;
  const processedItems = data.items
    ? data.items.map((item, i) => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.unit_price) || 0;
        const discPct = Number(item.discount_percent) || 0;
        const taxPct = Number(item.tax_percent) || 0;

        const subtotal = qty * price;
        const discount = subtotal * (discPct / 100);
        const tax = (subtotal - discount) * (taxPct / 100);
        const total = subtotal - discount + tax;

        return {
          id: `item-${Date.now()}-${i}`,
          estimate_id: id,
          item_name: item.item_name,
          description: item.description ?? "",
          quantity: qty,
          unit_price: price,
          discount_percent: discPct,
          tax_percent: taxPct,
          line_subtotal: subtotal,
          line_discount: discount,
          line_tax: tax,
          line_total: total,
          sort_order: item.sort_order ?? i + 1,
        };
      })
    : existing.items || [];

  const subtotal = processedItems.reduce((acc, i) => acc + (i.line_subtotal || 0), 0);
  const taxAmount = processedItems.reduce((acc, i) => acc + (i.line_tax || 0), 0);
  const discountAmount =
    data.discount_amount !== undefined
      ? Number(data.discount_amount)
      : existing.discount_amount;
  const totalAmount = Math.max(0, subtotal - discountAmount + taxAmount);

  const updated: SoftwareEstimate = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    software_requirement_id: existing.software_requirement_id,
    parent_estimate_id: existing.parent_estimate_id,
    revision_number: existing.revision_number,
    estimate_number: existing.estimate_number,
    title: data.title !== undefined ? (data.title || "Untitled Estimate") : existing.title,
    currency: data.currency || existing.currency,
    issue_date: data.issue_date || existing.issue_date,
    status: data.status || existing.status,
    subtotal,
    tax_amount: taxAmount,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    items: processedItems,
    updated_at: new Date().toISOString(),
  };

  list[idx] = updated;
  saveLocalEstimates(list);
  return updated;
};

export const deleteSoftwareEstimate = async (id: string): Promise<void> => {
  try {
    await apiClient.delete(`${BASE_URL}/${id}`);
  } catch (err: any) {
    if (err?.response?.status !== 404 && err?.response?.status !== 500) {
      throw err;
    }
  }
  const list = getLocalEstimates();
  saveLocalEstimates(list.filter((e) => e.id !== id));
};

export const createEstimateRevision = async (
  estimateId: string
): Promise<SoftwareEstimate> => {
  const response = await apiClient.post<SoftwareEstimate>(
    `${BASE_URL}/${estimateId}/revisions`
  );
  if (response.data) {
    const list = getLocalEstimates();
    saveLocalEstimates([response.data, ...list]);
  }
  return response.data;
};
