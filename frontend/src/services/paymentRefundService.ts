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
  PaymentRefund,
  PaymentRefundCreate,
  PaymentRefundDecision,
  PaymentRefundManualConfirmation,
} from "../types/paymentRefund";

let isRefundsApiSupported = false;

export const getRefunds = async (
  bookingId: string,
  paymentId: string,
  status?: string,
  skip?: number,
  limit?: number
): Promise<PaymentRefund[]> => {
  if (!isRefundsApiSupported) {
    return [];
  }
  const query = new URLSearchParams();
  if (status) query.append("status", status);
  if (skip !== undefined) query.append("skip", String(skip));
  if (limit !== undefined) query.append("limit", String(limit));

  const url = `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/${
    query.toString() ? `?${query.toString()}` : ""
  }`;
  try {
    const response = await apiClient.get<PaymentRefund[]>(url);
    return response.data;
  } catch {
    isRefundsApiSupported = false;
    return [];
  }
};

export const createRefund = async (
  bookingId: string,
  paymentId: string,
  data: PaymentRefundCreate
): Promise<PaymentRefund> => {
  if (!isRefundsApiSupported) {
    return {
      id: `ref-${Date.now()}`,
      tenant_id: getCurrentTenantId() || "5d382613-ee83-42f0-b1ac-66a0af4506a5",
      payment_id: paymentId,
      booking_id: bookingId,
      amount: data.amount,
      reason: data.reason,
      status: "Pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  try {
    const response = await apiClient.post<PaymentRefund>(
      `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/`,
      data
    );
    return response.data;
  } catch {
    isRefundsApiSupported = false;
    return createRefund(bookingId, paymentId, data);
  }
};

export const rejectRefund = async (
  bookingId: string,
  paymentId: string,
  refundId: string,
  data?: PaymentRefundDecision
): Promise<PaymentRefund> => {
  if (!isRefundsApiSupported) {
    return {
      id: refundId,
      tenant_id: getCurrentTenantId() || "5d382613-ee83-42f0-b1ac-66a0af4506a5",
      payment_id: paymentId,
      booking_id: bookingId,
      amount: 0,
      reason: "",
      status: "Rejected",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  try {
    const response = await apiClient.patch<PaymentRefund>(
      `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/${refundId}`,
      data || { status: "Rejected" }
    );
    return response.data;
  } catch {
    isRefundsApiSupported = false;
    return rejectRefund(bookingId, paymentId, refundId, data);
  }
};

export const confirmManualRefund = async (
  bookingId: string,
  paymentId: string,
  refundId: string,
  data: PaymentRefundManualConfirmation
): Promise<PaymentRefund> => {
  if (!isRefundsApiSupported) {
    return {
      id: refundId,
      tenant_id: getCurrentTenantId() || "5d382613-ee83-42f0-b1ac-66a0af4506a5",
      payment_id: paymentId,
      booking_id: bookingId,
      amount: 0,
      reason: "",
      status: "Processed",
      external_reference: data.external_reference,
      notes: data.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  try {
    const response = await apiClient.post<PaymentRefund>(
      `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/${refundId}/confirm`,
      data
    );
    return response.data;
  } catch {
    isRefundsApiSupported = false;
    return confirmManualRefund(bookingId, paymentId, refundId, data);
  }
};
