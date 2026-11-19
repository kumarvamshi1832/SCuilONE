import { apiClient } from "./authService";
import type {
  PaymentRefund,
  PaymentRefundCreate,
  PaymentRefundDecision,
  PaymentRefundManualConfirmation,
} from "../types/paymentRefund";

/**
 * Payment refunds (staff). Backend: /api/v1/bookings/{booking_id}/payments/{payment_id}/refunds (payment_refunds.py).
 *   GET    /                      list
 *   POST   /                      { amount, reason }                                      -> Pending
 *   PATCH  /{refund_id}           { status: "Rejected", external_reference?, notes? }
 *   POST   /{refund_id}/confirm   { confirmed_returned: true, external_reference, notes } -> Processed
 *
 * Real API calls only; errors propagate so a refund is never shown as created, rejected or processed unless the
 * server confirmed it.
 */

const base = (bookingId: string, paymentId: string) => `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds`;

export const getRefunds = async (
  bookingId: string,
  paymentId: string,
  status?: string,
  skip?: number,
  limit?: number
): Promise<PaymentRefund[]> => {
  const response = await apiClient.get<PaymentRefund[]>(`${base(bookingId, paymentId)}/`, {
    params: {
      status: status || undefined,
      skip: skip !== undefined ? Math.max(0, skip) : undefined,
      limit: limit !== undefined ? Math.max(1, limit) : undefined,
    },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const createRefund = async (
  bookingId: string,
  paymentId: string,
  data: PaymentRefundCreate
): Promise<PaymentRefund> => {
  const response = await apiClient.post<PaymentRefund>(`${base(bookingId, paymentId)}/`, data);
  return response.data;
};

export const rejectRefund = async (
  bookingId: string,
  paymentId: string,
  refundId: string,
  data?: PaymentRefundDecision
): Promise<PaymentRefund> => {
  const response = await apiClient.patch<PaymentRefund>(
    `${base(bookingId, paymentId)}/${refundId}`,
    data || { status: "Rejected" }
  );
  return response.data;
};

export const confirmManualRefund = async (
  bookingId: string,
  paymentId: string,
  refundId: string,
  data: PaymentRefundManualConfirmation
): Promise<PaymentRefund> => {
  const response = await apiClient.post<PaymentRefund>(`${base(bookingId, paymentId)}/${refundId}/confirm`, data);
  return response.data;
};
