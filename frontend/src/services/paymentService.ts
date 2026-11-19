import { apiClient } from "./authService";
import type { Payment, PaymentCreate, PaymentDecision } from "../types/payment";

/**
 * Booking payments (staff). Backend: /api/v1/bookings/{booking_id}/payments (routes/payments.py).
 *   GET    /                    booking.payment.view    ?status=Pending|Verified|Rejected&skip&limit(<=500)
 *   GET    /{payment_id}        booking.payment.view
 *   POST   /                    booking.payment.create  -> always created as "Pending"
 *   POST   /{payment_id}/decision  booking.payment.verify  { status: Verified|Rejected, notes }
 *
 * Every call is a real API call. Errors are thrown to the caller so the UI can show the backend's message
 * (for example "Payment exceeds the current payable balance of 200000.00"). Nothing is ever recorded or
 * "verified" locally: a payment exists only if the server returned it.
 */

const base = (bookingId: string) => `/api/v1/bookings/${bookingId}/payments`;

export const getPayments = async (
  bookingId: string,
  status?: string,
  skip?: number,
  limit?: number
): Promise<Payment[]> => {
  const response = await apiClient.get<Payment[]>(`${base(bookingId)}/`, {
    params: {
      status: status || undefined,
      skip: skip !== undefined ? Math.max(0, skip) : undefined,
      limit: limit !== undefined ? Math.min(500, Math.max(1, limit)) : undefined,
    },
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const getPayment = async (bookingId: string, paymentId: string): Promise<Payment> => {
  const response = await apiClient.get<Payment>(`${base(bookingId)}/${paymentId}`);
  return response.data;
};

export const createPayment = async (bookingId: string, data: PaymentCreate): Promise<Payment> => {
  const response = await apiClient.post<Payment>(`${base(bookingId)}/`, data);
  return response.data;
};

export const decidePayment = async (
  bookingId: string,
  paymentId: string,
  data: PaymentDecision
): Promise<Payment> => {
  const response = await apiClient.post<Payment>(`${base(bookingId)}/${paymentId}/decision`, data);
  return response.data;
};
