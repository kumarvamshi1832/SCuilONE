
import { apiClient } from "./authService";
import type { ReportsSummary } from "../types/report";

export interface ReportFilters {
  start_date?: string;
  end_date?: string;
}

export const getReportsSummary = async (
  filters: ReportFilters = {}
): Promise<ReportsSummary> => {
  const params: Record<string, string> = {};

  if (filters.start_date) {
    params.start_date = filters.start_date;
  }

  if (filters.end_date) {
    params.end_date = filters.end_date;
  }

  const response = await apiClient.get<ReportsSummary>(
    "/api/v1/reports/summary",
    { params }
  );

  return response.data;
};
