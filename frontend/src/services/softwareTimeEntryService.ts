import { apiClient } from "./authService";
import type {
  SoftwareTimeEntry,
  ManualTimeEntryCreate,
  TimerStartRequest,
  SoftwareTimeEntryFilterParams,
} from "../types/softwareTimeEntry";

const BASE_URL = "/api/v1/software-time-entries";

export const getTimeEntries = async (
  params?: SoftwareTimeEntryFilterParams
): Promise<SoftwareTimeEntry[]> => {
  const query = new URLSearchParams();
  if (params?.activity_id) query.append("activity_id", params.activity_id);
  if (params?.project_id) query.append("project_id", params.project_id);
  if (params?.sprint_id) query.append("sprint_id", params.sprint_id);
  if (params?.user_id) query.append("user_id", params.user_id);
  if (params?.from_date) query.append("from_date", params.from_date);
  if (params?.to_date) query.append("to_date", params.to_date);

  const qs = query.toString();
  const url = qs ? `${BASE_URL}/?${qs}` : `${BASE_URL}/`;
  const response = await apiClient.get<SoftwareTimeEntry[]>(url);
  return Array.isArray(response.data) ? response.data : [];
};

export const createManualTimeEntry = async (
  data: ManualTimeEntryCreate
): Promise<SoftwareTimeEntry> => {
  const response = await apiClient.post<SoftwareTimeEntry>(
    `${BASE_URL}/manual`,
    data
  );
  return response.data;
};

export const startTimer = async (
  data: TimerStartRequest
): Promise<SoftwareTimeEntry> => {
  const response = await apiClient.post<SoftwareTimeEntry>(
    `${BASE_URL}/timer/start`,
    data
  );
  return response.data;
};

export const stopTimer = async (
  entryId: string
): Promise<SoftwareTimeEntry> => {
  const response = await apiClient.post<SoftwareTimeEntry>(
    `${BASE_URL}/${entryId}/timer/stop`
  );
  return response.data;
};

export const approveTimeEntryBilling = async (
  entryId: string
): Promise<SoftwareTimeEntry> => {
  const response = await apiClient.post<SoftwareTimeEntry>(
    `${BASE_URL}/${entryId}/approve-billing`
  );
  return response.data;
};

