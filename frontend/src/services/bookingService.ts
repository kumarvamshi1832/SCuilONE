import { apiClient } from "./authService";
import type {
  Booking,
  BookingCreate,
  BookingUpdate,
  BookingCancel,
} from "../types/booking";
import { initialBookings } from "../data/realEstateProtoData";

export interface BookingFilterParams {
  status?: string;
  property_id?: string;
  skip?: number;
  limit?: number;
}

const STORAGE_PREFIX = "scuilone_bookings_tenant_";
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
    const old = localStorage.getItem("scuilone_bookings_v1");
    if (old && (old.includes("Skyline") || old.includes("tenant-default") || old.includes("Pooja Reddy"))) {
      localStorage.removeItem("scuilone_bookings_v1");
    }
  } catch {}
}

const getLocalBookings = (): Booking[] => {
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

  const initial = tenantId === KNOWN_DB_TENANT ? [...initialBookings] : [];
  saveLocalBookings(initial);
  return initial;
};

const saveLocalBookings = (items: Booking[]) => {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to persist bookings to localStorage", err);
  }
};

export const getBookings = async (
  params?: BookingFilterParams
): Promise<Booking[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.status) query.append("status", params.status);
    if (params?.property_id) query.append("property_id", params.property_id);
    if (params?.skip !== undefined) query.append("skip", String(params.skip));
    if (params?.limit !== undefined) {
      const safeLimit = Math.min(Math.max(1, params.limit), 100);
      query.append("limit", String(safeLimit));
    }

    const url = `/api/v1/bookings/${query.toString() ? `?${query.toString()}` : ""}`;
    const response = await apiClient.get<Booking[]>(url);
    if (Array.isArray(response.data)) {
      return response.data;
    }
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  let items = getLocalBookings();
  if (params?.status) {
    items = items.filter((b) => (b.status || "").toLowerCase() === params.status?.toLowerCase());
  }
  if (params?.property_id) {
    items = items.filter((b) => b.property_id === params.property_id);
  }
  if (params?.skip || params?.limit) {
    const start = params.skip || 0;
    const end = params.limit ? start + params.limit : undefined;
    return items.slice(start, end);
  }
  return items;
};

export const getBooking = async (id: string): Promise<Booking> => {
  try {
    const response = await apiClient.get<Booking>(`/api/v1/bookings/${id}`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const items = getLocalBookings();
  const found = items.find((b) => b.id === id);
  if (found) return found;
  throw new Error("Booking not found");
};

export const createBooking = async (
  data: BookingCreate
): Promise<Booking> => {
  try {
    const response = await apiClient.post<Booking>("/api/v1/bookings/", data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const tenantId = getCurrentTenantId() || KNOWN_DB_TENANT;
  const items = getLocalBookings();
  const newBooking: Booking = {
    id: `bkg-${Date.now()}`,
    tenant_id: tenantId,
    property_id: data.property_id,
    lead_id: data.lead_id || null,
    buyer_requirement_id: data.buyer_requirement_id || null,
    buyer_name: data.buyer_name,
    buyer_email: data.buyer_email || null,
    buyer_phone: data.buyer_phone || null,
    booking_amount: data.booking_amount,
    agreed_price: data.agreed_price ?? data.booking_amount,
    payment_preference: data.payment_preference || "Full Payment",
    installment_request_notes: data.installment_request_notes || null,
    refund_amount: 0,
    status: "Pending",
    booking_date: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    total_paid: data.booking_amount,
  };
  items.unshift(newBooking);
  saveLocalBookings(items);
  return newBooking;
};

export const updateBooking = async (
  id: string,
  data: BookingUpdate
): Promise<Booking> => {
  try {
    const response = await apiClient.patch<Booking>(`/api/v1/bookings/${id}`, data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const items = getLocalBookings();
  const index = items.findIndex((b) => b.id === id);
  if (index === -1) throw new Error("Booking not found");
  const existing = items[index]!;
  const updated: Booking = {
    ...existing,
    ...data,
    id: existing.id,
    tenant_id: existing.tenant_id,
    property_id: existing.property_id,
    buyer_name: data.buyer_name ?? existing.buyer_name,
    status: data.status ?? existing.status,
    booking_amount: existing.booking_amount,
    agreed_price: existing.agreed_price,
    refund_amount: existing.refund_amount,
    booking_date: existing.booking_date,
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };
  items[index] = updated;
  saveLocalBookings(items);
  return updated;
};

export const cancelBooking = async (
  id: string,
  data: BookingCancel
): Promise<Booking> => {
  try {
    const response = await apiClient.post<Booking>(`/api/v1/bookings/${id}/cancel`, data);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const items = getLocalBookings();
  const index = items.findIndex((b) => b.id === id);
  if (index === -1) throw new Error("Booking not found");
  const existing = items[index]!;
  const cancelled: Booking = {
    ...existing,
    id: existing.id,
    tenant_id: existing.tenant_id,
    property_id: existing.property_id,
    buyer_name: existing.buyer_name,
    booking_amount: existing.booking_amount,
    agreed_price: existing.agreed_price,
    refund_amount: existing.refund_amount,
    booking_date: existing.booking_date,
    created_at: existing.created_at,
    status: "Cancelled",
    cancellation_reason: data.cancellation_reason,
    updated_at: new Date().toISOString(),
  };
  items[index] = cancelled;
  saveLocalBookings(items);
  return cancelled;
};

export const completeBooking = async (id: string): Promise<Booking> => {
  try {
    const response = await apiClient.post<Booking>(`/api/v1/bookings/${id}/complete`);
    if (response.data) return response.data;
  } catch (err: any) {
    if (err?.response?.status !== 404) throw err;
  }

  const items = getLocalBookings();
  const index = items.findIndex((b) => b.id === id);
  if (index === -1) throw new Error("Booking not found");
  const existing = items[index]!;
  const completed: Booking = {
    ...existing,
    id: existing.id,
    tenant_id: existing.tenant_id,
    property_id: existing.property_id,
    buyer_name: existing.buyer_name,
    booking_amount: existing.booking_amount,
    agreed_price: existing.agreed_price,
    refund_amount: existing.refund_amount,
    booking_date: existing.booking_date,
    created_at: existing.created_at,
    status: "Completed",
    updated_at: new Date().toISOString(),
  };
  items[index] = completed;
  saveLocalBookings(items);
  return completed;
};
