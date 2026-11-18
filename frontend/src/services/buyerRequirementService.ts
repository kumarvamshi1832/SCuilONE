import { apiClient } from "./authService";
import type {
  BuyerRequirement,
  BuyerRequirementCreate,
  BuyerRequirementUpdate,
} from "../types/buyerRequirement";

/**
 * Staff CRM buyer requirements (authenticated CRM client).
 *
 * Backend: /api/v1/buyer-requirements
 *   GET /, POST /, GET /{id}, PUT /{id}, DELETE /{id}
 * Permissions: buyer_requirement.view / .create / .update / .delete
 *
 * All data comes from the API. Errors are propagated so pages can display them;
 * no locally fabricated or cached records are ever returned.
 */

export const getBuyerRequirements = async (): Promise<BuyerRequirement[]> => {
  const response = await apiClient.get<BuyerRequirement[]>("/api/v1/buyer-requirements/");
  return Array.isArray(response.data) ? response.data : [];
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

/** The backend route is PUT and only applies the fields that were sent. */
export const updateBuyerRequirement = async (
  id: string,
  data: BuyerRequirementUpdate
): Promise<BuyerRequirement> => {
  const response = await apiClient.put<BuyerRequirement>(
    `/api/v1/buyer-requirements/${id}`,
    data
  );
  return response.data;
};

export const deleteBuyerRequirement = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/v1/buyer-requirements/${id}`);
};
