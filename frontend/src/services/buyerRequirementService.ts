import { apiClient } from "./authService";
import type {
  BuyerRequirement,
  BuyerRequirementCreate,
  BuyerRequirementUpdate,
} from "../types/buyerRequirement";

export const getBuyerRequirements = async (): Promise<BuyerRequirement[]> => {
  const response = await apiClient.get<BuyerRequirement[]>("/api/v1/buyer-requirements/");
  return response.data;
};

export const getBuyerRequirement = async (id: string): Promise<BuyerRequirement> => {
  const response = await apiClient.get<BuyerRequirement>(`/api/v1/buyer-requirements/${id}`);
  return response.data;
};

export const createBuyerRequirement = async (
  data: BuyerRequirementCreate
): Promise<BuyerRequirement> => {
  const response = await apiClient.post<BuyerRequirement>("/api/v1/buyer-requirements/", data);
  return response.data;
};

export const updateBuyerRequirement = async (
  id: string,
  data: BuyerRequirementUpdate
): Promise<BuyerRequirement> => {
  const response = await apiClient.put<BuyerRequirement>(`/api/v1/buyer-requirements/${id}`, data);
  return response.data;
};

export const deleteBuyerRequirement = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/v1/buyer-requirements/${id}`);
};
