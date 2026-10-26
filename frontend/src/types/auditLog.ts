export interface AuditLog {
  id: string;
  user_id?: string | null;
  action: string;
  module: string;
  record_id?: string | null;
  description: string;
  before_data?: Record<string, any> | null;
  after_data?: Record<string, any> | null;
  created_at: string;
  // Enriched
  user_name?: string;
}

export interface AuditLogPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface AuditLogsResponse {
  items: AuditLog[];
  pagination: AuditLogPagination;
}
