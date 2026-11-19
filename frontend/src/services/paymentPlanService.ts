import { apiClient } from "./authService";
import type {
  PaymentPlan,
  PaymentPlanCreate,
  CollectionSummary,
  OverdueInstallmentItem,
  OverdueCollectionsResponse,
} from "../types/paymentPlan";

/**
 * Instalment schedules and collections (staff). Backend: routes/payment_plans.py.
 *   GET   /api/v1/bookings/{id}/payment-plan          booking.payment_plan.view   404 when none exists
 *   POST  /api/v1/bookings/{id}/payment-plan          booking.payment_plan.create 201; one plan per booking
 *   PATCH /api/v1/bookings/{id}/payment-plan          booking.payment_plan.edit   replaces the schedule
 *   POST  /api/v1/bookings/{id}/payment-plan/cancel   booking.payment_plan.edit
 *   GET   /api/v1/bookings/{id}/collections           booking.payment.view
 *   GET   /api/v1/collections/overdue                 booking.payment_plan.view
 *
 * Real API calls only. A missing plan is reported as the HTTP 404 the server sends; every other failure is
 * thrown with the server's message. No schedule is ever created or assumed on the client.
 */

export const getPaymentPlan = async (bookingId: string): Promise<PaymentPlan> => {
  const response = await apiClient.get<PaymentPlan>(`/api/v1/bookings/${bookingId}/payment-plan`);
  return response.data;
};

export const createPaymentPlan = async (bookingId: string, data: PaymentPlanCreate): Promise<PaymentPlan> => {
  const response = await apiClient.post<PaymentPlan>(`/api/v1/bookings/${bookingId}/payment-plan`, data);
  return response.data;
};

export const updatePaymentPlan = async (bookingId: string, data: PaymentPlanCreate): Promise<PaymentPlan> => {
  const response = await apiClient.patch<PaymentPlan>(`/api/v1/bookings/${bookingId}/payment-plan`, data);
  return response.data;
};

export const cancelPaymentPlan = async (bookingId: string): Promise<PaymentPlan> => {
  const response = await apiClient.post<PaymentPlan>(`/api/v1/bookings/${bookingId}/payment-plan/cancel`);
  return response.data;
};

export const getCollectionSummary = async (bookingId: string): Promise<CollectionSummary> => {
  const response = await apiClient.get<CollectionSummary>(`/api/v1/bookings/${bookingId}/collections`);
  return response.data;
};

export const getOverdueCollections = async (): Promise<OverdueCollectionsResponse> => {
  const response = await apiClient.get<OverdueCollectionsResponse>("/api/v1/collections/overdue");
  return response.data;
};

export const getOverdueInstallments = async (): Promise<OverdueInstallmentItem[]> => {
  const response = await apiClient.get<{ installments?: OverdueInstallmentItem[] } | OverdueInstallmentItem[]>(
    "/api/v1/collections/overdue"
  );
  const data = response.data;
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.installments) ? data.installments : [];
};
