import { apiClient } from "./authService";
import type { SiteVisit, SiteVisitCreate, SiteVisitUpdate } from "../types/siteVisit";

export interface SiteVisitFilterParams {
  status?: string;
  assigned_to?: string;
  property_match_id?: string;
  scheduled_from?: string;
  scheduled_to?: string;
  skip?: number;
  limit?: number;
}

export const getSiteVisits = async (
  params?: SiteVisitFilterParams
): Promise<SiteVisit[]> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
  if (params?.property_match_id) query.append("property_match_id", params.property_match_id);
  if (params?.scheduled_from) query.append("scheduled_from", params.scheduled_from);
  if (params?.scheduled_to) query.append("scheduled_to", params.scheduled_to);
  if (params?.skip !== undefined) query.append("skip", String(params.skip));
  if (params?.limit !== undefined) query.append("limit", String(params.limit));

  const url = `/api/v1/site-visits/${query.toString() ? `?${query.toString()}` : ""}`;
  const response = await apiClient.get<SiteVisit[]>(url);
  return response.data;
};

export const getSiteVisit = async (id: string): Promise<SiteVisit> => {
  const response = await apiClient.get<SiteVisit>(`/api/v1/site-visits/${id}`);
  return response.data;
};

export const createSiteVisit = async (data: SiteVisitCreate): Promise<SiteVisit> => {
  const response = await apiClient.post<SiteVisit>("/api/v1/site-visits/", data);
  return response.data;
};

export const updateSiteVisit = async (
  id: string,
  data: SiteVisitUpdate
): Promise<SiteVisit> => {
  const response = await apiClient.patch<SiteVisit>(`/api/v1/site-visits/${id}`, data);
  return response.data;
};
