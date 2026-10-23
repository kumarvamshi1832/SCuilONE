
import { apiClient } from "./authService";

export interface UserProfile {
  id?: string;
  full_name: string;
  email: string;
  phone?: string | null;
  job_title?: string | null;
  role?: string | null;
  status?: string | null;
  tenant_id?: string;
  photo_url?: string | null;
  profile_completed?: boolean;
  created_at?: string;
}

export interface ProfileUpdate {
  full_name: string;
  phone?: string;
  job_title?: string;
}

export interface PhotoUploadResponse {
  message: string;
  photo_url: string;
}

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export async function getMyProfile(): Promise<UserProfile> {
  const response = await apiClient.get<UserProfile>(
    "/api/v1/users/me",
    getHeaders()
  );

  return response.data;
}

export async function updateMyProfile(
  data: ProfileUpdate
): Promise<UserProfile> {
  const response = await apiClient.put<UserProfile>(
    "/api/v1/users/me",
    data,
    getHeaders()
  );

  return response.data;
}

export async function uploadMyProfilePhoto(
  file: File
): Promise<PhotoUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await apiClient.post<PhotoUploadResponse>(
    "/api/v1/users/me/photo",
    formData,
    getHeaders()
  );

  return response.data;
}