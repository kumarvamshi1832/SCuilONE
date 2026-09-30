import { apiClient } from "./authService";
import { User, Role } from "../types/user";

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export const getUsers = async (): Promise<User[]> => {
  try {
    const response = await apiClient.get<User[]>("/api/v1/users", getHeaders());
    return response.data;
  } catch (error: any) {
    if (error?.status === 405 || error?.response?.status === 405) {
      throw new Error("Users API endpoint is currently unavailable (Not Implemented).");
    }
    throw error;
  }
};

export const getUserById = async (userId: string): Promise<User> => {
  const response = await apiClient.get<User>(`/api/v1/users/${userId}`, getHeaders());
  return response.data;
};

export const updateUserRole = async (
  userId: string,
  newRole: Role,
  newStatus: string
): Promise<User> => {
  const response = await apiClient.put<User>(
    `/api/v1/users/${userId}`,
    { role: newRole, status: newStatus },
    getHeaders()
  );
  return response.data;
};

export const deleteUser = async (userId: string): Promise<void> => {
  await apiClient.delete(`/api/v1/users/${userId}`, getHeaders());
};

export const createUser = async (data: Partial<User>): Promise<User> => {
  const response = await apiClient.post<User>("/api/v1/users", data, getHeaders());
  return response.data;
};

export const getRoles = async (): Promise<Role[]> => {
  // We can fetch from API or return a fixed list if backend doesn't have an endpoint yet
  // If there's an endpoint: return (await apiClient.get<Role[]>("/api/v1/roles", getHeaders())).data;
  return [
    "Tenant Owner",
    "Tenant Admin",
    "Manager",
    "Sales User",
    "Operations User",
    "Support User",
    "Read Only",
  ];
};
