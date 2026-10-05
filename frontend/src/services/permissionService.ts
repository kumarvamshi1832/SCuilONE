import { apiClient } from "./authService";

export interface PermissionDetail {
  id: string;
  name: string; // e.g. "leads.view"
  module: string; // e.g. "Leads"
  action: string; // e.g. "View"
  description: string;
}

export const getPermissions = async (): Promise<PermissionDetail[]> => {
  const response = await apiClient.get<PermissionDetail[]>("/api/v1/permissions");
  return response.data;
};
