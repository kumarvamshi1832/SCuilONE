import { apiClient } from "./authService";
import type { AuditLogsResponse } from "../types/auditLog";

export interface AuditLogFilterParams {
  module?: string;
  action?: string;
  record_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

export const getAuditLogs = async (
  params?: AuditLogFilterParams
): Promise<AuditLogsResponse> => {
  const query = new URLSearchParams();
  if (params?.module) query.append("module", params.module);
  if (params?.action) query.append("action", params.action);
  if (params?.record_id) query.append("record_id", params.record_id);
  if (params?.start_date) query.append("start_date", params.start_date);
  if (params?.end_date) query.append("end_date", params.end_date);
  if (params?.page !== undefined) query.append("page", String(params.page));
  if (params?.page_size !== undefined) query.append("page_size", String(params.page_size));

  const url = `/api/v1/audit-logs/${query.toString() ? `?${query.toString()}` : ""}`;
  const response = await apiClient.get<AuditLogsResponse>(url);
  return response.data;
};
