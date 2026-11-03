import { apiClient } from "./authService";
import type {
  SoftwareTimeEntry,
  ManualTimeEntryCreate,
  TimerStartRequest,
  SoftwareTimeEntryFilterParams,
} from "../types/softwareTimeEntry";
import {
  extractBackendDetail,
  notifySoftwareDataChanged,
  type SoftwareRequestOptions,
} from "./softwareRequestManager";

const BASE_URL = "/api/v1/software-time-entries";

export function extractErrorMessage(err: any): string {
  return extractBackendDetail(err);
}

export const getTimeEntries = async (
  params?: SoftwareTimeEntryFilterParams,
  options?: SoftwareRequestOptions
): Promise<SoftwareTimeEntry[]> => {
  try {
    const query = new URLSearchParams();
    if (params?.activity_id) query.append("activity_id", params.activity_id);
    if (params?.project_id) query.append("project_id", params.project_id);
    if (params?.sprint_id) query.append("sprint_id", params.sprint_id);
    if (params?.user_id) query.append("user_id", params.user_id);
    if (params?.from_date) query.append("from_date", params.from_date);
    if (params?.to_date) query.append("to_date", params.to_date);

    const qs = query.toString();
    const url = qs ? `${BASE_URL}/?${qs}` : `${BASE_URL}/`;
    const response = await apiClient.get<any>(url, { signal: options?.signal });
    const d = response.data;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.data)) return d.data;
    if (d && Array.isArray(d.items)) return d.items;
    if (d && Array.isArray(d.results)) return d.results;
    if (d && Array.isArray(d.entries)) return d.entries;
    return [];
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const createManualTimeEntry = async (
  data: ManualTimeEntryCreate
): Promise<SoftwareTimeEntry> => {
  try {
    const response = await apiClient.post<any>(`${BASE_URL}/manual`, data);
    notifySoftwareDataChanged("software_time_entries");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const startTimer = async (
  data: TimerStartRequest
): Promise<SoftwareTimeEntry> => {
  try {
    const response = await apiClient.post<any>(`${BASE_URL}/timer/start`, data);
    notifySoftwareDataChanged("software_time_entries");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const stopTimer = async (
  entryId: string
): Promise<SoftwareTimeEntry> => {
  try {
    const response = await apiClient.post<any>(`${BASE_URL}/${entryId}/timer/stop`);
    notifySoftwareDataChanged("software_time_entries");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};

export const approveTimeEntryBilling = async (
  entryId: string
): Promise<SoftwareTimeEntry> => {
  try {
    const response = await apiClient.post<any>(`${BASE_URL}/${entryId}/approve-billing`);
    notifySoftwareDataChanged("software_time_entries");
    return response.data?.data || response.data;
  } catch (err: any) {
    throw new Error(extractErrorMessage(err));
  }
};
