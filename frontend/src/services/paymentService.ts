import { apiClient } from "./authService";
import type { Payment, PaymentCreate, PaymentDecision } from "../types/payment";

export const getPayments = async (
  bookingId: string,
  status?: string,
  skip?: number,
  limit?: number
): Promise<Payment[]> => {
  const query = new URLSearchParams();
  if (status) query.append("status", status);
  if (skip !== undefined) query.append("skip", String(skip));
  if (limit !== undefined) query.append("limit", String(limit));

  const url = `/api/v1/bookings/${bookingId}/payments/${query.toString() ? `?${query.toString()}` : ""}`;
  const response = await apiClient.get<Payment[]>(url);
  return response.data;
};

export const getPayment = async (
  bookingId: string,
  paymentId: string
): Promise<Payment> => {
  const response = await apiClient.get<Payment>(
    `/api/v1/bookings/${bookingId}/payments/${paymentId}`
  );
  return response.data;
};

export const createPayment = async (
  bookingId: string,
  data: PaymentCreate
): Promise<Payment> => {
  const response = await apiClient.post<Payment>(
    `/api/v1/bookings/${bookingId}/payments/`,
    data
  );
  return response.data;
};

export const decidePayment = async (
  bookingId: string,
  paymentId: string,
  data: PaymentDecision
): Promise<Payment> => {
  const response = await apiClient.post<Payment>(
    `/api/v1/bookings/${bookingId}/payments/${paymentId}/decision`,
    data
  );
  return response.data;
};
