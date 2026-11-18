import { apiClient } from "./authService";
import type { PropertyMatch, PropertyMatchCreate } from "../types/propertyMatch";
import type { Property } from "../types/property";

/**
 * Staff CRM property matches (authenticated CRM client).
 *
 * Backend: /api/v1/property-matches
 *   POST /                                       create one match   (property_match.create)
 *   POST /requirements/{id}/auto-match           auto match         (property_match.create)
 *   GET  /requirements/{id}                      matches of a requirement (property_match.view)
 *   GET  /properties/{id}                        matches of a property    (property_match.view)
 *   GET  /potential/{requirement_id}             near-budget properties   (property_match.view)
 *
 * Every function talks to the API only. Errors are propagated so pages can show them;
 * no match is ever simulated, cached or stored locally. Tenant isolation is enforced by
 * the backend from the authenticated staff token.
 */

const BASE = "/api/v1/property-matches";

export const createPropertyMatch = async (
  data: PropertyMatchCreate
): Promise<PropertyMatch> => {
  const response = await apiClient.post<PropertyMatch>(`${BASE}/`, data);
  return response.data;
};

export interface PropertyMatchBatchResult {
  propertyId: string;
  match?: PropertyMatch;
  error?: unknown;
}

/**
 * Creates one match per property through POST /api/v1/property-matches/.
 * The backend has no bulk endpoint, so requests are sent one after another and every
 * outcome is reported individually (a failure never hides the properties that succeeded).
 */
export const createPropertyMatches = async (
  buyerRequirementId: string,
  propertyIds: string[],
  assignedTo?: string | null
): Promise<PropertyMatchBatchResult[]> => {
  const results: PropertyMatchBatchResult[] = [];
  for (const propertyId of propertyIds) {
    try {
      const match = await createPropertyMatch({
        buyer_requirement_id: buyerRequirementId,
        property_id: propertyId,
        ...(assignedTo ? { assigned_to: assignedTo } : {}),
      });
      results.push({ propertyId, match });
    } catch (error) {
      results.push({ propertyId, error });
    }
  }
  return results;
};

/** Reads the matches of a requirement straight from the backend. */
export const fetchApiMatchesForRequirement = async (
  requirementId: string
): Promise<PropertyMatch[]> => {
  const response = await apiClient.get<PropertyMatch[]>(
    `${BASE}/requirements/${requirementId}`
  );
  return Array.isArray(response.data) ? response.data : [];
};

export const getMatchesForRequirement = fetchApiMatchesForRequirement;

export const getMatchesForProperty = async (
  propertyId: string
): Promise<PropertyMatch[]> => {
  const response = await apiClient.get<PropertyMatch[]>(
    `${BASE}/properties/${propertyId}`
  );
  return Array.isArray(response.data) ? response.data : [];
};

export const autoMatchProperties = async (
  requirementId: string
): Promise<PropertyMatch[]> => {
  const response = await apiClient.post<PropertyMatch[]>(
    `${BASE}/requirements/${requirementId}/auto-match`
  );
  return Array.isArray(response.data) ? response.data : [];
};

export const getPotentialMatches = async (
  requirementId: string
): Promise<Property[]> => {
  const response = await apiClient.get<Property[]>(`${BASE}/potential/${requirementId}`);
  return Array.isArray(response.data) ? response.data : [];
};
