import { portalApiClient } from "./customerPortalAuthService";
import type { PropertyOffer, PropertyOfferCreate, PropertyOfferDecision } from "../types/propertyOffer";

/**
 * Customer-side property negotiation (portal client, customer token). Ownership is enforced by the backend from the
 * portal token: a match that does not belong to the signed-in customer returns 404.
 *
 * Backend: /api/v1/customer-portal
 *   GET  /property-matches/{match_id}/offers      the whole thread, oldest first
 *   POST /property-offers                         the customer submits an offer (409 while another is unresolved)
 *   POST /property-offers/{id}/decision           respond to a STAFF ("Seller") offer: Accepted | Rejected | Countered
 *                                                 (403 on the customer's own offers, 400 for Withdrawn, 409 when expired)
 */
const BASE = "/api/v1/customer-portal";

export const getPortalOffers = async (matchId: string): Promise<PropertyOffer[]> => {
  const response = await portalApiClient.get<PropertyOffer[]>(`${BASE}/property-matches/${matchId}/offers`);
  return Array.isArray(response.data) ? response.data : [];
};

export const submitPortalOffer = async (data: PropertyOfferCreate): Promise<PropertyOffer> => {
  const response = await portalApiClient.post<PropertyOffer>(`${BASE}/property-offers`, data);
  return response.data;
};

export const decidePortalOffer = async (offerId: string, data: PropertyOfferDecision): Promise<PropertyOffer> => {
  const response = await portalApiClient.post<PropertyOffer>(`${BASE}/property-offers/${offerId}/decision`, data);
  return response.data;
};
