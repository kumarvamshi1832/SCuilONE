/**
 * SCuilONE CRM — Document Service
 * Integrates directly with FastAPI backend routes in app/routes/documents.py
 */

import { apiClient } from "./authService";
import type {
  DocumentItem,
  DocumentListResponse,
  DocumentDetailResponse,
  DocumentDownloadResponse,
  DocumentUploadParams,
} from "../types/document";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

const DOCUMENTS_ENDPOINTS = {
  LIST: "/api/v1/documents/",
  DETAIL: (id: string) => `/api/v1/documents/${id}`,
  DOWNLOAD: (id: string) => `/api/v1/documents/${id}/download`,
  DELETE: (id: string) => `/api/v1/documents/${id}`,
} as const;

/**
 * List documents for the current tenant.
 * Optionally filter by one CRM record (lead_id, contact_id, account_id, or deal_id).
 */
export const getDocuments = async (params?: {
  lead_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
}): Promise<DocumentListResponse> => {
  const query = new URLSearchParams();
  if (params?.lead_id) query.append("lead_id", params.lead_id);
  if (params?.contact_id) query.append("contact_id", params.contact_id);
  if (params?.account_id) query.append("account_id", params.account_id);
  if (params?.deal_id) query.append("deal_id", params.deal_id);

  const url = `${DOCUMENTS_ENDPOINTS.LIST}${query.toString() ? `?${query.toString()}` : ""}`;
  const response = await apiClient.get<DocumentListResponse>(url, getHeaders());
  return response.data;
};

/**
 * Get single document details with its secure download URL.
 */
export const getDocument = async (id: string): Promise<DocumentDetailResponse> => {
  const response = await apiClient.get<DocumentDetailResponse>(
    DOCUMENTS_ENDPOINTS.DETAIL(id),
    getHeaders()
  );
  return response.data;
};

/**
 * Fetch download metadata (filename, content_type, download_url).
 */
export const downloadDocument = async (
  id: string
): Promise<DocumentDownloadResponse> => {
  const response = await apiClient.get<DocumentDownloadResponse>(
    DOCUMENTS_ENDPOINTS.DOWNLOAD(id),
    getHeaders()
  );
  return response.data;
};

/**
 * Upload a new document file associated with exactly one CRM record.
 */
export const uploadDocument = async (
  params: DocumentUploadParams,
  onUploadProgress?: (progressEvent: any) => void
): Promise<{ message: string; document: DocumentItem }> => {
  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("title", params.title.trim());
  formData.append("document_type", params.document_type || "Other");
  if (params.description) {
    formData.append("description", params.description.trim());
  }
  formData.append("is_confidential", String(Boolean(params.is_confidential)));

  // Exactly one parent record required by backend
  if (params.lead_id) formData.append("lead_id", params.lead_id);
  else if (params.contact_id) formData.append("contact_id", params.contact_id);
  else if (params.account_id) formData.append("account_id", params.account_id);
  else if (params.deal_id) formData.append("deal_id", params.deal_id);

  const token = sessionStorage.getItem("access_token");
  const response = await apiClient.post<{ message: string; document: DocumentItem }>(
    DOCUMENTS_ENDPOINTS.LIST,
    formData,
    {
      headers: {
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
    }
  );

  return response.data;
};

/**
 * Soft delete a document from the system.
 */
export const deleteDocument = async (
  id: string
): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(
    DOCUMENTS_ENDPOINTS.DELETE(id),
    getHeaders()
  );
  return response.data;
};
