import { apiClient } from "./authService";

export interface PermissionDetail {
  id: string;
  name: string; // e.g. "leads.view"
  module: string; // e.g. "Leads"
  action: string; // e.g. "View"
  description: string;
}

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export const getPermissions = async (): Promise<PermissionDetail[]> => {
  const response = await apiClient.get<PermissionDetail[]>("/api/v1/permissions", getHeaders());
  return response.data;
};
