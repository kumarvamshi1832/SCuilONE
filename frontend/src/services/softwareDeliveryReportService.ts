import { apiClient } from "./authService";
import type {
  ProjectTimeSummary,
  ProjectTasksReport,
  SprintTimeSummary,
  TeamTimeSummary,
  BillingTimeSummary,
  DeliveryReportFilterParams,
} from "../types/softwareDeliveryReport";
import {
  executeSoftwareRequest,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

const BASE_URL = "/api/v1/software-reports";

export const getProjectTimeSummary = async (
  projectId: string,
  fromDateOrParams?: { from_date?: string; to_date?: string } | string,
  toDate?: string,
  options?: SoftwareRequestOptions
): Promise<ProjectTimeSummary> => {
  const fromDate = typeof fromDateOrParams === "object" ? fromDateOrParams.from_date : fromDateOrParams;
  const toDateResolved = typeof fromDateOrParams === "object" ? fromDateOrParams.to_date : toDate;

  const query = new URLSearchParams();
  if (fromDate) query.append("from_date", fromDate);
  if (toDateResolved) query.append("to_date", toDateResolved);

  const qs = query.toString();
  const url = `${BASE_URL}/projects/${projectId}/time-summary${qs ? `?${qs}` : ""}`;
  const requestKey = `report-proj:${url}`;

  return executeSoftwareRequest(
    "software_reports",
    requestKey,
    async () => {
      const response = await apiClient.get<ProjectTimeSummary>(url, { signal: options?.signal });
      return response.data;
    },
    options
  );
};

export const getProjectTasksReport = async (
  projectId: string,
  fromDate?: string,
  toDate?: string,
  options?: SoftwareRequestOptions
): Promise<ProjectTasksReport> => {
  const query = new URLSearchParams();
  if (fromDate) query.append("from_date", fromDate);
  if (toDate) query.append("to_date", toDate);

  const qs = query.toString();
  const url = `${BASE_URL}/projects/${projectId}/tasks${qs ? `?${qs}` : ""}`;
  const requestKey = `report-tasks:${url}`;

  return executeSoftwareRequest(
    "software_reports",
    requestKey,
    async () => {
      const response = await apiClient.get<ProjectTasksReport>(url, { signal: options?.signal });
      return response.data;
    },
    options
  );
};

export const getSprintTimeSummary = async (
  sprintId: string,
  fromDate?: string,
  toDate?: string,
  options?: SoftwareRequestOptions
): Promise<SprintTimeSummary> => {
  const query = new URLSearchParams();
  if (fromDate) query.append("from_date", fromDate);
  if (toDate) query.append("to_date", toDate);

  const qs = query.toString();
  const url = `${BASE_URL}/sprints/${sprintId}/time-summary${qs ? `?${qs}` : ""}`;
  const requestKey = `report-sprint:${url}`;

  return executeSoftwareRequest(
    "software_reports",
    requestKey,
    async () => {
      const response = await apiClient.get<SprintTimeSummary>(url, { signal: options?.signal });
      return response.data;
    },
    options
  );
};

export const getTeamTimeSummary = async (
  params?: DeliveryReportFilterParams,
  options?: SoftwareRequestOptions
): Promise<TeamTimeSummary> => {
  const query = new URLSearchParams();
  if (params?.from_date) query.append("from_date", params.from_date);
  if (params?.to_date) query.append("to_date", params.to_date);
  if (params?.project_id) query.append("project_id", params.project_id);

  const qs = query.toString();
  const url = `${BASE_URL}/team/time-summary${qs ? `?${qs}` : ""}`;
  const requestKey = `report-team:${url}`;

  return executeSoftwareRequest(
    "software_reports",
    requestKey,
    async () => {
      const response = await apiClient.get<TeamTimeSummary>(url, { signal: options?.signal });
      return response.data;
    },
    options
  );
};

export const getBillingTimeSummary = async (
  params?: DeliveryReportFilterParams,
  options?: SoftwareRequestOptions
): Promise<BillingTimeSummary> => {
  const query = new URLSearchParams();
  if (params?.from_date) query.append("from_date", params.from_date);
  if (params?.to_date) query.append("to_date", params.to_date);
  if (params?.project_id) query.append("project_id", params.project_id);

  const qs = query.toString();
  const url = `${BASE_URL}/billing/time-summary${qs ? `?${qs}` : ""}`;
  const requestKey = `report-billing:${url}`;

  return executeSoftwareRequest(
    "software_reports",
    requestKey,
    async () => {
      const response = await apiClient.get<BillingTimeSummary>(url, { signal: options?.signal });
      return response.data;
    },
    options
  );
};

