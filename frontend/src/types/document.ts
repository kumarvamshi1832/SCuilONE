/**
 * SCuilONE CRM — Documents Module Types
 * Matches the backend Document model in app/models/document.py
 * and endpoints in app/routes/documents.py
 */

export interface DocumentItem {
  id: string;
  tenant_id: string;
  uploaded_by: string;
  updated_by: string | null;
  deleted_by: string | null;
  lead_id: string | null;
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
  title: string;
  filename: string;
  document_type: string;
  content_type: string;
  file_size: number;
  description: string | null;
  version_number: number;
  is_confidential: boolean;
  expires_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  file_url?: string;
  download_url?: string;
}

export interface DocumentListResponse {
  count: number;
  documents: DocumentItem[];
}

export interface DocumentDetailResponse {
  document: DocumentItem;
  download_url?: string;
}

export interface DocumentDownloadResponse {
  filename: string;
  content_type: string;
  download_url: string;
}

export interface DocumentUploadParams {
  file: File;
  title: string;
  document_type?: string;
  description?: string;
  is_confidential?: boolean;
  lead_id?: string;
  contact_id?: string;
  account_id?: string;
  deal_id?: string;
}

export interface DocumentFilterParams {
  search?: string;
  document_type?: string;
  related_entity_type?: "all" | "lead" | "contact" | "account" | "deal";
  related_entity_id?: string;
  uploaded_by?: string;
  is_confidential?: boolean | "all";
}

/** Predefined Real Estate and CRM document categories */
export const DOCUMENT_CATEGORIES = [
  "All Types",
  "Contract",
  "Agreement",
  "Sale Deed",
  "Booking Document",
  "KYC / ID Proof",
  "Floor Plan",
  "Brochure",
  "Building Plan",
  "Payment Receipt",
  "Site Visit Report",
  "Legal Document",
  "Invoice",
  "Tax Document",
  "Other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const MAX_DOCUMENT_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];
