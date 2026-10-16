import { apiClient } from "./authService";

export interface RoleDetail {
  id: string;
  name: string;
  description: string;
  users_count: number;
  permissions_count: number;
}

export interface CreateRoleRequest {
  name: string;
  description: string;
  permission_ids: string[];
}

export interface UpdateRoleRequest {
  name: string;
  description: string;
  permission_ids: string[];
}

export const getRoles = async (): Promise<RoleDetail[]> => {
  const response = await apiClient.get<RoleDetail[]>("/api/v1/roles");
  return response.data;
};

export const getRoleById = async (roleId: string): Promise<RoleDetail> => {
  const response = await apiClient.get<RoleDetail>(`/api/v1/roles/${roleId}`);
  return response.data;
};

export const createRole = async (data: CreateRoleRequest): Promise<RoleDetail> => {
  const response = await apiClient.post<RoleDetail>("/api/v1/roles", data);
  return response.data;
};

export const updateRole = async (roleId: string, data: UpdateRoleRequest): Promise<RoleDetail> => {
  const response = await apiClient.put<RoleDetail>(`/api/v1/roles/${roleId}`, data);
  return response.data;
};

export const deleteRole = async (roleId: string): Promise<void> => {
  await apiClient.delete(`/api/v1/roles/${roleId}`);
};

export const getRolePermissions = async (roleId: string): Promise<string[]> => {
  const response = await apiClient.get<string[]>(`/api/v1/roles/${roleId}/permissions`);
  return response.data;
};
