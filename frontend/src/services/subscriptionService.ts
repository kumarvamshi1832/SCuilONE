import axios from "axios";
import { apiClient } from "./authService";
import type {
  BillingInvoice,
  BillingPayment,
  BillingProfile,
  CancelSubscriptionRequest,
  EffectivePlanResources,
  InvoiceDownloadResponse,
  InvoiceListResponse,
  PaymentListResponse,
  PlanListResponse,
  SelectedPlanSummary,
  SelectPlanRequest,
  SelectPlanResponse,
  SubmitManualPaymentRequest,
  SubscriptionEventsResponse,
  SubscriptionPlan,
  TenantSupportTicketRequest,
  TenantSupportTicketResponse,
  TenantSubscription,
  UnsubscribeResponse,
  UpdateBillingProfileRequest,
} from "../types/subscription";

const BASE = "/api/v1/subscription";

const publicClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
});

export async function getSubscriptionPlans(includeTrial = true): Promise<PlanListResponse> {
  const res = await apiClient.get<PlanListResponse>(`${BASE}/plans`, {
    params: { include_trial: includeTrial },
  });
  return res.data;
}

export async function getSubscriptionPlan(planIdentifier: string): Promise<SubscriptionPlan> {
  const res = await apiClient.get<SubscriptionPlan>(`${BASE}/plans/${encodeURIComponent(planIdentifier)}`);
  return res.data;
}

export async function selectSubscriptionPlan(payload: SelectPlanRequest): Promise<SelectPlanResponse> {
  const res = await apiClient.post<SelectPlanResponse>(`${BASE}/select-plan`, payload);
  return res.data;
}

export async function getSubscriptionStatus(): Promise<TenantSubscription> {
  const res = await apiClient.get<TenantSubscription>(`${BASE}/status`);
  return res.data;
}

export async function getSelectedPlan(): Promise<SelectedPlanSummary> {
  const res = await apiClient.get<SelectedPlanSummary>(`${BASE}/selected-plan`);
  return res.data;
}

export async function getEffectiveResources(): Promise<EffectivePlanResources> {
  const res = await apiClient.get<EffectivePlanResources>(`${BASE}/resources`);
  return res.data;
}

export async function getSubscriptionInvoices(statusFilter?: string): Promise<InvoiceListResponse> {
  const res = await apiClient.get<InvoiceListResponse>(`${BASE}/invoices`, {
    params: statusFilter ? { status: statusFilter } : undefined,
  });
  return res.data;
}

export async function getSubscriptionInvoice(invoiceId: string): Promise<BillingInvoice> {
  const res = await apiClient.get<BillingInvoice>(`${BASE}/invoices/${invoiceId}`);
  return res.data;
}

export async function downloadSubscriptionInvoice(invoiceId: string): Promise<InvoiceDownloadResponse> {
  const res = await apiClient.get<InvoiceDownloadResponse>(`${BASE}/invoices/${invoiceId}/download`);
  return res.data;
}

export async function submitManualPayment(
  payload: SubmitManualPaymentRequest
): Promise<{ message: string; payment: BillingPayment }> {
  const res = await apiClient.post<{ message: string; payment: BillingPayment }>(`${BASE}/payments`, payload);
  return res.data;
}

export async function submitInvoiceManualPayment(
  invoiceId: string,
  payload: SubmitManualPaymentRequest
): Promise<{ message: string; payment: BillingPayment }> {
  const res = await apiClient.post<{ message: string; payment: BillingPayment }>(
    `${BASE}/invoices/${invoiceId}/payments`,
    payload
  );
  return res.data;
}

export async function uploadPaymentProof(
  paymentId: string,
  options: { file?: File; proof_reference?: string }
): Promise<{ message: string; payment: BillingPayment }> {
  const formData = new FormData();
  if (options.file) {
    formData.append("file", options.file);
  }
  if (options.proof_reference) {
    formData.append("proof_reference", options.proof_reference);
  }
  const res = await apiClient.post<{ message: string; payment: BillingPayment }>(
    `${BASE}/payments/${paymentId}/proof`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return res.data;
}

export async function getPaymentHistory(): Promise<PaymentListResponse> {
  const res = await apiClient.get<PaymentListResponse>(`${BASE}/payments`);
  return res.data;
}

export async function getPaymentDetail(paymentId: string): Promise<BillingPayment> {
  const res = await apiClient.get<BillingPayment>(`${BASE}/payments/${paymentId}`);
  return res.data;
}

export async function getBillingProfile(): Promise<BillingProfile> {
  const res = await apiClient.get<BillingProfile>(`${BASE}/billing-profile`);
  return res.data;
}

export async function updateBillingProfile(
  payload: UpdateBillingProfileRequest
): Promise<{ message: string; billing_profile: BillingProfile }> {
  const res = await apiClient.patch<{ message: string; billing_profile: BillingProfile }>(
    `${BASE}/billing-profile`,
    payload
  );
  return res.data;
}

export async function cancelSubscription(
  payload: CancelSubscriptionRequest
): Promise<{ message: string; subscription: TenantSubscription }> {
  const res = await apiClient.post<{ message: string; subscription: TenantSubscription }>(
    `${BASE}/cancel`,
    payload
  );
  return res.data;
}

export async function contactPlatformSupport(
  payload: TenantSupportTicketRequest
): Promise<TenantSupportTicketResponse> {
  const res = await apiClient.post<TenantSupportTicketResponse>(`${BASE}/support`, payload);
  return res.data;
}

export async function getSubscriptionEvents(): Promise<SubscriptionEventsResponse> {
  const res = await apiClient.get<SubscriptionEventsResponse>(`${BASE}/events`);
  return res.data;
}

export async function unsubscribeFromReminders(token: string): Promise<UnsubscribeResponse> {
  const res = await publicClient.post<UnsubscribeResponse>(`${BASE}/unsubscribe`, null, {
    params: { token },
  });
  return res.data;
}

