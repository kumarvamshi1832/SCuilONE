import { apiClient } from "./authService";
import type {
  DocumentItem,
  DocumentListResponse,
  DocumentDetailResponse,
  DocumentDownloadResponse,
  DocumentUploadParams,
  DocumentSharingResponse,
} from "../types/document";

const DOCUMENTS_ENDPOINTS = {
  BASE: "/api/v1/documents",
  LIST: "/api/v1/documents/",
  DETAIL: (id: string) => `/api/v1/documents/${id}`,
  DOWNLOAD: (id: string) => `/api/v1/documents/${id}/download`,
  DELETE: (id: string) => `/api/v1/documents/${id}`,
  SHARING: (id: string, shared: boolean) =>
    `/api/v1/documents/${id}/sharing?shared_with_customer=${shared}`,
} as const;

function getHeaders() {
  const token =
    sessionStorage.getItem("access_token") || localStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
}

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
  formData.append(
    "shared_with_customer",
    String(Boolean(params.shared_with_customer && !params.is_confidential))
  );

  if (params.lead_id) formData.append("lead_id", params.lead_id);
  else if (params.contact_id) formData.append("contact_id", params.contact_id);
  else if (params.account_id) formData.append("account_id", params.account_id);
  else if (params.deal_id) formData.append("deal_id", params.deal_id);

  const token =
    sessionStorage.getItem("access_token") || localStorage.getItem("access_token");
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
 * Opt a document in or out of the customer portal.
 * Returns 409 if confidential or not linked to an Account or Contact.
 */
export const updateDocumentSharing = async (
  documentId: string,
  sharedWithCustomer: boolean
): Promise<DocumentSharingResponse> => {
  const url = DOCUMENTS_ENDPOINTS.SHARING(documentId, sharedWithCustomer);
  const response = await apiClient.patch<DocumentSharingResponse>(
    url,
    {},
    getHeaders()
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
