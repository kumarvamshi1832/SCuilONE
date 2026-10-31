import { apiClient } from "./authService";
import type {
  SoftwareInvoice,
  SoftwareInvoiceCreate,
  SoftwareInvoiceStatusUpdate,
  SoftwareInvoicePaymentCreate,
  SoftwareInvoiceFilterParams,
} from "../types/softwareInvoice";

const BASE_URL = "/api/v1/software-invoices";

export const getSoftwareInvoices = async (
  params?: SoftwareInvoiceFilterParams
): Promise<SoftwareInvoice[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.project_id) query.append("project_id", params.project_id);

  const qs = query.toString();
  const url = qs ? `${BASE_URL}/?${qs}` : `${BASE_URL}/`;
  const response = await apiClient.get<SoftwareInvoice[]>(url);
  return Array.isArray(response.data) ? response.data : [];
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
  return response.data;
};

