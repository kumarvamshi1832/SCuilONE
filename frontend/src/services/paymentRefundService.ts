import { apiClient } from "./authService";
import type {
  PaymentRefund,
  PaymentRefundCreate,
  PaymentRefundDecision,
  PaymentRefundManualConfirmation,
} from "../types/paymentRefund";

export const getRefunds = async (
  bookingId: string,
  paymentId: string,
  status?: string,
  skip?: number,
  limit?: number
): Promise<PaymentRefund[]> => {
  const query = new URLSearchParams();
  if (status) query.append("status", status);
  if (skip !== undefined) query.append("skip", String(skip));
  if (limit !== undefined) query.append("limit", String(limit));

  const url = `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/${
    query.toString() ? `?${query.toString()}` : ""
  }`;
  const response = await apiClient.get<PaymentRefund[]>(url);
  return response.data;
};

export const createRefund = async (
  bookingId: string,
  paymentId: string,
  data: PaymentRefundCreate
): Promise<PaymentRefund> => {
  const response = await apiClient.post<PaymentRefund>(
    `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/`,
    data
  );
  return response.data;
};

export const rejectRefund = async (
  bookingId: string,
  paymentId: string,
  refundId: string,
  data?: PaymentRefundDecision
): Promise<PaymentRefund> => {
  const response = await apiClient.patch<PaymentRefund>(
    `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/${refundId}`,
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
  const response = await apiClient.post<PaymentRefund>(
    `/api/v1/bookings/${bookingId}/payments/${paymentId}/refunds/${refundId}/confirm`,
    data
  );
  return response.data;
};
