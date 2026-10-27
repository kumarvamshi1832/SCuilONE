import { apiClient } from "./authService";
import type {
  PaymentPlan,
  PaymentPlanCreate,
  CollectionSummary,
  OverdueInstallmentItem,
  OverdueCollectionsResponse,
} from "../types/paymentPlan";

export const getPaymentPlan = async (
  bookingId: string
): Promise<PaymentPlan> => {
  const response = await apiClient.get<PaymentPlan>(
    `/api/v1/bookings/${bookingId}/payment-plan`
  );
  return response.data;
};

export const createPaymentPlan = async (
  bookingId: string,
  data: PaymentPlanCreate
): Promise<PaymentPlan> => {
  const response = await apiClient.post<PaymentPlan>(
    `/api/v1/bookings/${bookingId}/payment-plan`,
    data
  );
  return response.data;
};

export const updatePaymentPlan = async (
  bookingId: string,
  data: PaymentPlanCreate
): Promise<PaymentPlan> => {
  const response = await apiClient.patch<PaymentPlan>(
    `/api/v1/bookings/${bookingId}/payment-plan`,
    data
  );
  return response.data;
};

export const cancelPaymentPlan = async (
  bookingId: string
): Promise<PaymentPlan> => {
  const response = await apiClient.post<PaymentPlan>(
    `/api/v1/bookings/${bookingId}/payment-plan/cancel`
  );
  return response.data;
};

export const getCollectionSummary = async (
  bookingId: string
): Promise<CollectionSummary> => {
  const response = await apiClient.get<CollectionSummary>(
    `/api/v1/bookings/${bookingId}/collections`
  );
  return response.data;
};

export const getOverdueCollections = async (): Promise<OverdueCollectionsResponse> => {
  const response = await apiClient.get<OverdueCollectionsResponse>(
    "/api/v1/collections/overdue"
  );
  return response.data;
};

export const getOverdueInstallments = async (): Promise<OverdueInstallmentItem[]> => {
  const response = await apiClient.get<any>(
    "/api/v1/collections/overdue"
  );
  if (Array.isArray(response.data)) {
    return response.data;
  }
  if (response.data && Array.isArray(response.data.installments)) {
    return response.data.installments;
  }
  return [];
};
