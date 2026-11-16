import { apiClient } from "./authService";
import type {
  SoftwareInvoice,
  SoftwareInvoiceCreate,
  SoftwareInvoiceStatusUpdate,
  SoftwareInvoicePaymentCreate,
  SoftwareInvoicePaymentReverse,
  SoftwareCreditNoteCreate,
  SoftwareInvoiceFilterParams,
  BillingSummaryResponse,
} from "../types/softwareInvoice";
import {
  executeSoftwareRequest,
  notifySoftwareDataChanged,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

const BASE_URL = "/api/v1/software-invoices";

export const getSoftwareInvoices = async (
  params?: SoftwareInvoiceFilterParams,
  options?: SoftwareRequestOptions
): Promise<SoftwareInvoice[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.project_id) query.append("project_id", params.project_id);
  if (params?.overdue) query.append("overdue", "true");

  const qs = query.toString();
  const url = qs ? `${BASE_URL}/?${qs}` : `${BASE_URL}/`;
  const requestKey = `invoices:${url}`;

  return executeSoftwareRequest(
    "software_invoices",
    requestKey,
    async () => {
      const response = await apiClient.get<SoftwareInvoice[]>(url, { signal: options?.signal });
      return Array.isArray(response.data) ? response.data : [];
    },
    options
  );
};

export const getSoftwareInvoice = async (
  invoiceId: string
): Promise<SoftwareInvoice> => {
  const response = await apiClient.get<SoftwareInvoice>(
    `${BASE_URL}/${invoiceId}`
  );
  return response.data;
};

export const createSoftwareInvoice = async (
  data: SoftwareInvoiceCreate
): Promise<SoftwareInvoice> => {
  const response = await apiClient.post<SoftwareInvoice>(
    `${BASE_URL}/`,
    data
  );
  notifySoftwareDataChanged("software_invoices");
  return response.data;
};

export const updateSoftwareInvoiceStatus = async (
  invoiceId: string,
  data: SoftwareInvoiceStatusUpdate
): Promise<SoftwareInvoice> => {
  const response = await apiClient.patch<SoftwareInvoice>(
    `${BASE_URL}/${invoiceId}/status`,
    data
  );
  notifySoftwareDataChanged("software_invoices");
  return response.data;
};

export const recordSoftwareInvoicePayment = async (
  invoiceId: string,
  data: SoftwareInvoicePaymentCreate
): Promise<SoftwareInvoice> => {
  const response = await apiClient.post<SoftwareInvoice>(
    `${BASE_URL}/${invoiceId}/payments`,
    data
  );
  notifySoftwareDataChanged("software_invoices");
  return response.data;
};

export const reverseSoftwareInvoicePayment = async (
  invoiceId: string,
  paymentId: string,
  data: SoftwareInvoicePaymentReverse
): Promise<SoftwareInvoice> => {
  const response = await apiClient.post<SoftwareInvoice>(
    `${BASE_URL}/${invoiceId}/payments/${paymentId}/reverse`,
    data
  );
  notifySoftwareDataChanged("software_invoices");
  return response.data;
};

export const createSoftwareInvoiceCreditNote = async (
  invoiceId: string,
  data: SoftwareCreditNoteCreate
): Promise<SoftwareInvoice> => {
  const response = await apiClient.post<SoftwareInvoice>(
    `${BASE_URL}/${invoiceId}/credit-notes`,
    data
  );
  notifySoftwareDataChanged("software_invoices");
  return response.data;
};

export const getBillingSummary = async (
  projectId?: string,
  options?: SoftwareRequestOptions
): Promise<BillingSummaryResponse> => {
  const url = projectId
    ? `${BASE_URL}/summary?project_id=${encodeURIComponent(projectId)}`
    : `${BASE_URL}/summary`;
  const requestKey = `invoices-summary:${url}`;

  return executeSoftwareRequest(
    "software_invoices",
    requestKey,
    async () => {
      const response = await apiClient.get<BillingSummaryResponse>(url, { signal: options?.signal });
      return response.data || { items: [] };
    },
    options
  );
};
