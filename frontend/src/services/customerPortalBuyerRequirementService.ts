import { portalApiClient } from "./customerPortalAuthService";
import type {
  PortalBuyerRequirement,
  PortalBuyerRequirementCreate,
  PortalPropertyMatch,
  PortalShortlistEntry,
  PortalShortlistedProperty,
  PortalSiteVisitRequestCreate,
  PortalSiteVisitRequestResult,
} from "../types/customerPortalBuyerRequirement";

/**
 * Customer Portal buyer requirements, matches and shortlist.
 * Uses portalApiClient (customer authentication) exclusively - never the staff CRM client.
 * Tenant / contact ownership is derived by the backend from the portal token.
 */

const BASE = "/api/v1/customer-portal/buyer-requirements";

export const getPortalBuyerRequirements = async (): Promise<PortalBuyerRequirement[]> => {
  const response = await portalApiClient.get<PortalBuyerRequirement[]>(BASE);
  return Array.isArray(response.data) ? response.data : [];
};

export const getPortalBuyerRequirement = async (id: string): Promise<PortalBuyerRequirement> => {
  const response = await portalApiClient.get<PortalBuyerRequirement>(`${BASE}/${id}`);
  return response.data;
};

export const createPortalBuyerRequirement = async (
  data: PortalBuyerRequirementCreate
): Promise<PortalBuyerRequirement> => {
  const response = await portalApiClient.post<PortalBuyerRequirement>(BASE, data);
  return response.data;
};

export const getPortalRequirementMatches = async (id: string): Promise<PortalPropertyMatch[]> => {
  const response = await portalApiClient.get<PortalPropertyMatch[]>(`${BASE}/${id}/matches`);
  return Array.isArray(response.data) ? response.data : [];
};

export const getPortalRequirementShortlist = async (id: string): Promise<PortalPropertyMatch[]> => {
  const response = await portalApiClient.get<PortalPropertyMatch[]>(`${BASE}/${id}/shortlist`);
  return Array.isArray(response.data) ? response.data : [];
};

export const addPortalShortlistProperty = async (
  requirementId: string,
  propertyMatchId: string
): Promise<PortalShortlistEntry> => {
  const response = await portalApiClient.post<PortalShortlistEntry>(
    `${BASE}/${requirementId}/shortlist`,
    { property_match_id: propertyMatchId }
  );
  return response.data;
};

export const removePortalShortlistProperty = async (
  requirementId: string,
  propertyMatchId: string
): Promise<void> => {
  await portalApiClient.delete(`${BASE}/${requirementId}/shortlist/${propertyMatchId}`);
};

/**
 * Aggregates the shortlist of every requirement. The backend exposes the shortlist per
 * requirement only, so this fans out one request per requirement (failures of a single
 * requirement are reported via `failedRequirementIds` instead of hiding the rest).
 */
export const getAllPortalShortlistedProperties = async (): Promise<{
  items: PortalShortlistedProperty[];
  failedRequirementIds: string[];
}> => {
  const requirements = await getPortalBuyerRequirements();
  const settled = await Promise.allSettled(
    requirements.map((req) => getPortalRequirementShortlist(req.id))
  );
  const items: PortalShortlistedProperty[] = [];
  const failedRequirementIds: string[] = [];
  requirements.forEach((requirement, idx) => {
    const result = settled[idx];
    if (result && result.status === "fulfilled") {
      result.value.forEach((entry) => items.push({ ...entry, requirement }));
    } else {
      failedRequirementIds.push(requirement.id);
    }
  });
  return { items, failedRequirementIds };
};

export const requestPortalSiteVisit = async (
  data: PortalSiteVisitRequestCreate
): Promise<PortalSiteVisitRequestResult> => {
  const response = await portalApiClient.post<PortalSiteVisitRequestResult>(
    "/api/v1/customer-portal/site-visits/requests",
    data
  );
  return response.data;
};
