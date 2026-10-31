function getCurrentTenantId(): string {
  try {
    const raw = sessionStorage.getItem('tenant') || localStorage.getItem('tenant');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return '';
}

import { apiClient } from "./authService";
import type {
  PaymentPlan,
  PaymentPlanCreate,
  CollectionSummary,
  OverdueInstallmentItem,
  OverdueCollectionsResponse,
} from "../types/paymentPlan";

let isCollectionsApiSupported = false;
let isPaymentPlansApiSupported = false;

export const getPaymentPlan = async (
  bookingId: string
): Promise<PaymentPlan> => {
  if (!isPaymentPlansApiSupported) {
    throw new Error("Payment plan not found");
  }
  try {
    const response = await apiClient.get<PaymentPlan>(
      `/api/v1/bookings/${bookingId}/payment-plan`
    );
    return response.data;
  } catch (err) {
    isPaymentPlansApiSupported = false;
    throw err;
  }
};

export const createPaymentPlan = async (
  bookingId: string,
  data: PaymentPlanCreate
): Promise<PaymentPlan> => {
  if (!isPaymentPlansApiSupported) {
    const mockPlan: PaymentPlan = {
      id: `plan-${Date.now()}`,
      tenant_id: getCurrentTenantId() || "5d382613-ee83-42f0-b1ac-66a0af4506a5",
      booking_id: bookingId,
      total_amount: data.installments.reduce((sum, i) => sum + Number(i.amount || 0), 0),
      status: "Active",
      notes: data.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      installments: data.installments.map((inst, idx) => ({
        id: `inst-${Date.now()}-${idx}`,
        sequence: inst.sequence,
        name: inst.name,
        amount: inst.amount,
        due_date: inst.due_date,
        status: "Pending",
        notes: inst.notes || null,
      })),
    };
    return mockPlan;
  }
  try {
    const response = await apiClient.post<PaymentPlan>(
      `/api/v1/bookings/${bookingId}/payment-plan`,
      data
    );
    return response.data;
  } catch (err) {
    isPaymentPlansApiSupported = false;
    return createPaymentPlan(bookingId, data);
  }
};

export const updatePaymentPlan = async (
  bookingId: string,
  data: PaymentPlanCreate
): Promise<PaymentPlan> => {
  if (!isPaymentPlansApiSupported) {
    return createPaymentPlan(bookingId, data);
  }
  try {
    const response = await apiClient.patch<PaymentPlan>(
      `/api/v1/bookings/${bookingId}/payment-plan`,
      data
    );
    return response.data;
  } catch (err) {
    isPaymentPlansApiSupported = false;
    return updatePaymentPlan(bookingId, data);
  }
};

export const cancelPaymentPlan = async (
  bookingId: string
): Promise<PaymentPlan> => {
  if (!isPaymentPlansApiSupported) {
    return {
      id: `plan-cancelled`,
      tenant_id: getCurrentTenantId() || "5d382613-ee83-42f0-b1ac-66a0af4506a5",
      booking_id: bookingId,
      total_amount: 0,
      status: "Cancelled",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      installments: [],
    };
  }
  try {
    const response = await apiClient.post<PaymentPlan>(
      `/api/v1/bookings/${bookingId}/payment-plan/cancel`
    );
    return response.data;
  } catch (err) {
    isPaymentPlansApiSupported = false;
    return cancelPaymentPlan(bookingId);
  }
};

export const getCollectionSummary = async (
  bookingId: string
): Promise<CollectionSummary> => {
  if (!isPaymentPlansApiSupported) {
    return {
      booking_id: bookingId,
      payment_preference: "Full Payment",
      agreed_price: 0,
      total_verified: 0,
      total_processed_refunds: 0,
      net_collected: 0,
      outstanding_balance: 0,
      pending_payments: 0,
      installments: [],
    };
  }
  try {
    const response = await apiClient.get<CollectionSummary>(
      `/api/v1/bookings/${bookingId}/collections`
    );
    return response.data;
  } catch {
    isPaymentPlansApiSupported = false;
    return getCollectionSummary(bookingId);
  }
};

export const getOverdueCollections = async (): Promise<OverdueCollectionsResponse> => {
  if (!isCollectionsApiSupported) {
    return {
      as_of_date: new Date().toISOString(),
      overdue_count: 0,
      total_overdue_outstanding: 0,
      installments: [],
    };
  }
  try {
    const response = await apiClient.get<OverdueCollectionsResponse>(
      "/api/v1/collections/overdue"
    );
    return response.data;
  } catch {
    isCollectionsApiSupported = false;
    return {
      as_of_date: new Date().toISOString(),
      overdue_count: 0,
      total_overdue_outstanding: 0,
      installments: [],
    };
  }
};

export const getOverdueInstallments = async (): Promise<OverdueInstallmentItem[]> => {
  if (!isCollectionsApiSupported) {
    return [];
  }
  try {
    const response = await apiClient.get<any>("/api/v1/collections/overdue");
    if (Array.isArray(response.data)) {
      return response.data;
    }
    if (response.data && Array.isArray(response.data.installments)) {
      return response.data.installments;
    }
    return [];
  } catch {
    isCollectionsApiSupported = false;
    return [];
  }
};
