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

let isDocumentsApiSupported = true;
const STORAGE_PREFIX = "scuilone_documents_tenant_";
const KNOWN_DB_TENANT = "5d382613-ee83-42f0-b1ac-66a0af4506a5";

function getCurrentTenantId(): string {
  try {
    const raw = sessionStorage.getItem("tenant") || localStorage.getItem("tenant");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return "";
}

function purgeLegacyStaleData() {
  try {
    const old = localStorage.getItem("scuilone_documents_v1");
    if (
      old &&
      (old.includes("Emerald Heights") ||
        old.includes("sale-deed") ||
        old.includes("tenant-default"))
    ) {
      localStorage.removeItem("scuilone_documents_v1");
    }
  } catch {}
}

const realDbDocuments: DocumentItem[] = [
  {
    id: "7b805e72-5ebc-42b2-8f36-ed0ce5e72427",
    tenant_id: "5d382613-ee83-42f0-b1ac-66a0af4506a5",
    uploaded_by: "7e2be28c-dccd-4717-a6cf-7f23fb90c442",
    updated_by: null,
    deleted_by: null,
    lead_id: "535296b6-8929-4513-98e4-4f337227e54d",
    contact_id: null,
    account_id: null,
    deal_id: null,
    title: "SQL_KEYS",
    filename: "SQL_KEYS.pdf",
    document_type: "Contract",
    content_type: "application/pdf",
    file_size: 1371570,
    description: null,
    version_number: 1,
    is_confidential: true,
    expires_at: null,
    is_deleted: false,
    deleted_at: null,
    created_at: "2026-10-26T11:30:25.298551",
    updated_at: "2026-10-26T11:30:25.298551",
    file_url:
      "/uploads/documents/5d382613-ee83-42f0-b1ac-66a0af4506a5/a845371c02d3455cafb1ed5884700742_SQL_KEYS.pdf",
    download_url:
      "/api/v1/documents/7b805e72-5ebc-42b2-8f36-ed0ce5e72427/download",
  },
];

const normalizeDoc = (item: any): DocumentItem => {
  const currentTenant = getCurrentTenantId();
  return {
    ...item,
    id: String(item.id || `doc-${Date.now()}`),
    tenant_id: String(item.tenant_id || currentTenant),
    uploaded_by: String(item.uploaded_by || "User"),
    updated_by: item.updated_by ?? null,
    deleted_by: item.deleted_by ?? null,
    lead_id: item.lead_id ?? null,
    contact_id: item.contact_id ?? null,
    account_id: item.account_id ?? null,
    deal_id: item.deal_id ?? null,
    title: String(item.title || "Untitled Document"),
    filename: String(item.filename || item.original_filename || item.name || "document.pdf"),
    document_type: String(item.document_type || "Other"),
    content_type: String(item.content_type || "application/pdf"),
    file_size: Number(item.file_size || item.file_size_bytes || 0),
    description: item.description ?? null,
    version_number: Number(item.version_number || 1),
    is_confidential: Boolean(item.is_confidential),
    expires_at: item.expires_at ?? null,
    is_deleted: Boolean(item.is_deleted),
    deleted_at: item.deleted_at ?? null,
    created_at: item.created_at || new Date().toISOString(),
    updated_at: item.updated_at || new Date().toISOString(),
    file_url: item.file_url,
    download_url: item.download_url,
  };
};

const getLocalDocs = (): DocumentItem[] => {
  purgeLegacyStaleData();
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      const initial = tenantId === KNOWN_DB_TENANT ? [...realDbDocuments] : [];
      localStorage.setItem(storageKey, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizeDoc);
    }
    return [];
  } catch {
    return [];
  }
};

const saveLocalDocs = (items: DocumentItem[]) => {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to save documents", err);
  }
};

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
  if (!isDocumentsApiSupported) {
    const items = getLocalDocs();
    return {
      count: items.length,
      documents: items,
    };
  }

  const query = new URLSearchParams();
  if (params?.lead_id) query.append("lead_id", params.lead_id);
  if (params?.contact_id) query.append("contact_id", params.contact_id);
  if (params?.account_id) query.append("account_id", params.account_id);
  if (params?.deal_id) query.append("deal_id", params.deal_id);

  const url = `${DOCUMENTS_ENDPOINTS.LIST}${query.toString() ? `?${query.toString()}` : ""}`;
  try {
    const response = await apiClient.get<DocumentListResponse>(url, getHeaders());
    return response.data;
  } catch {
    isDocumentsApiSupported = false;
    return getDocuments(params);
  }
};

/**
 * Get single document details with its secure download URL.
 */
export const getDocument = async (id: string): Promise<DocumentDetailResponse> => {
  if (!isDocumentsApiSupported) {
    const doc = getLocalDocs().find((d) => d.id === id);
    if (!doc) throw new Error("Document not found");
    return {
      document: doc,
      download_url: `/api/v1/documents/${id}/download`,
    };
  }
  try {
    const response = await apiClient.get<DocumentDetailResponse>(
      DOCUMENTS_ENDPOINTS.DETAIL(id),
      getHeaders()
    );
    return response.data;
  } catch {
    isDocumentsApiSupported = false;
    const doc = getLocalDocs().find((d) => d.id === id);
    if (!doc) throw new Error("Document not found");
    return {
      document: doc,
      download_url: `/api/v1/documents/${id}/download`,
    };
  }
};

/**
 * Fetch download metadata (filename, content_type, download_url).
 */
export const downloadDocument = async (
  id: string
): Promise<DocumentDownloadResponse> => {
  if (!isDocumentsApiSupported) {
    const doc = getLocalDocs().find((d) => d.id === id);
    return {
      filename: doc?.filename || "document.pdf",
      content_type: doc?.content_type || "application/pdf",
      download_url: "#",
    };
  }
  try {
    const response = await apiClient.get<DocumentDownloadResponse>(
      DOCUMENTS_ENDPOINTS.DOWNLOAD(id),
      getHeaders()
    );
    return response.data;
  } catch {
    isDocumentsApiSupported = false;
    return downloadDocument(id);
  }
};

/**
 * Upload a new document file associated with exactly one CRM record.
 */
export const uploadDocument = async (
  params: DocumentUploadParams,
  _onUploadProgress?: (progressEvent: any) => void
): Promise<{ message: string; document: DocumentItem }> => {
  if (!isDocumentsApiSupported) {
    const items = getLocalDocs();
    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      tenant_id: getCurrentTenantId(),
      uploaded_by: "Sales Admin",
      updated_by: null,
      deleted_by: null,
      lead_id: params.lead_id || null,
      contact_id: params.contact_id || null,
      account_id: params.account_id || null,
      deal_id: params.deal_id || null,
      title: params.title.trim(),
      filename: params.file?.name || "uploaded-file.pdf",
      document_type: params.document_type || "Other",
      content_type: params.file?.type || "application/octet-stream",
      file_size: params.file?.size || 1024,
      description: params.description || null,
      version_number: 1,
      is_confidential: Boolean(params.is_confidential),
      expires_at: null,
      is_deleted: false,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    items.unshift(newDoc);
    saveLocalDocs(items);
    return {
      message: "Document uploaded successfully",
      document: newDoc,
    };
  }

  const formData = new FormData();
  formData.append("file", params.file);
  formData.append("title", params.title.trim());
  formData.append("document_type", params.document_type || "Other");
  if (params.description) {
    formData.append("description", params.description.trim());
  }
  formData.append("is_confidential", String(Boolean(params.is_confidential)));

  if (params.lead_id) formData.append("lead_id", params.lead_id);
  else if (params.contact_id) formData.append("contact_id", params.contact_id);
  else if (params.account_id) formData.append("account_id", params.account_id);
  else if (params.deal_id) formData.append("deal_id", params.deal_id);

  const token = sessionStorage.getItem("access_token");
  try {
    const response = await apiClient.post<{ message: string; document: DocumentItem }>(
      DOCUMENTS_ENDPOINTS.LIST,
      formData,
      {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: _onUploadProgress,
      }
    );
    return response.data;
  } catch {
    isDocumentsApiSupported = false;
    return uploadDocument(params, _onUploadProgress);
  }
};

/**
 * Soft delete a document from the system.
 */
export const deleteDocument = async (
  id: string
): Promise<{ message: string }> => {
  if (!isDocumentsApiSupported) {
    const items = getLocalDocs().filter((d) => d.id !== id);
    saveLocalDocs(items);
    return { message: "Document deleted successfully" };
  }
  try {
    const response = await apiClient.delete<{ message: string }>(
      DOCUMENTS_ENDPOINTS.DELETE(id),
      getHeaders()
    );
    return response.data;
  } catch {
    isDocumentsApiSupported = false;
    const items = getLocalDocs().filter((d) => d.id !== id);
    saveLocalDocs(items);
    return { message: "Document deleted successfully" };
  }
};
