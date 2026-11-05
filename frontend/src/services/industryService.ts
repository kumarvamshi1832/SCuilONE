import { apiClient } from "./authService";
import type {
  TenantIndustryConfigResponse,
  IndustryPackSummary,
  IndustryConfigUpdate,
} from "../types/industryConfig";

const BASE_URL = "/api/v1/industry";

/**
 * Retrieve the active industry configuration for the current authenticated tenant.
 * Backend route: GET /api/v1/industry/config
 */
export async function getTenantIndustryConfig(): Promise<TenantIndustryConfigResponse> {
  const response = await apiClient.get<TenantIndustryConfigResponse>(`${BASE_URL}/config`);
  return response.data;
}

/**
 * Retrieve the available active industry packs configured in the system.
 * Backend route: GET /api/v1/industry/packs
 * Handles both direct array responses and `{ items: [...] }` paginated wrappers safely.
 */
export async function getIndustryPacks(): Promise<IndustryPackSummary[]> {
  const response = await apiClient.get<any>(`${BASE_URL}/packs`);
  const data = response.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

/**
 * Update tenant industry configuration (enabled modules, settings, widgets, custom labels).
 * Backend route: PATCH /api/v1/industry/config
 * Requires permission: industry_config.update
 */
export async function updateTenantIndustryConfig(
  payload: IndustryConfigUpdate
): Promise<any> {
  const response = await apiClient.patch<any>(
    `${BASE_URL}/config`,
    payload
  );
  return response.data;
}
