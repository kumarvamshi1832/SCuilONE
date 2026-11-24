import { apiClient } from "./authService";
import type { PropertyOffer, PropertyOfferCreate, PropertyOfferDecision } from "../types/propertyOffer";

/**
 * Negotiation offers (staff CRM client; the tenant comes from the authenticated token).
 *
 * Backend: /api/v1/property-offers
 *   GET  /?property_match_id=          offers of a match, oldest first                       (buyer_requirement.view)
 *   POST /                             PROPOSE a price to the customer -> a "Seller" offer    (buyer_requirement.update)
 *                                      409 while another offer of the match is unresolved
 *   POST /record-buyer-offer           record a buyer's phone / walk-in offer -> "Buyer"      (buyer_requirement.update)
 *   POST /{id}/decision                respond to a BUYER offer: Accepted | Rejected | Countered (buyer_requirement.update)
 *                                      403 on a Seller offer, 400 for Withdrawn, 409 when expired or already decided
 *   POST /{id}/owner-approval?approved=  decide an offer "Pending Owner Approval"            (property.update + owner/admin role)
 *
 * Errors are propagated so the UI shows the backend message. Nothing is cached or simulated locally.
 */
const BASE = "/api/v1/property-offers";

export const getOffersForMatch = async (propertyMatchId: string): Promise<PropertyOffer[]> => {
  const response = await apiClient.get<PropertyOffer[]>(`${BASE}/`, { params: { property_match_id: propertyMatchId } });
  return Array.isArray(response.data) ? response.data : [];
};

/** Staff proposes a price (creates a Seller offer and notifies the customer). */
export const proposeOffer = async (data: PropertyOfferCreate): Promise<PropertyOffer> => {
  const response = await apiClient.post<PropertyOffer>(`${BASE}/`, data);
  return response.data;
};

/** Staff records an offer the buyer made outside the portal (creates a Buyer offer). */
export const recordBuyerOffer = async (data: PropertyOfferCreate): Promise<PropertyOffer> => {
  const response = await apiClient.post<PropertyOffer>(`${BASE}/record-buyer-offer`, data);
  return response.data;
};

export const decideOffer = async (offerId: string, data: PropertyOfferDecision): Promise<PropertyOffer> => {
  const response = await apiClient.post<PropertyOffer>(`${BASE}/${offerId}/decision`, data);
  return response.data;
};

/** Owner decision on an accepted offer that needs owner approval. `approved` is a query parameter, not a body field. */
export const decideOwnerApproval = async (offerId: string, approved: boolean): Promise<PropertyOffer> => {
  const response = await apiClient.post<PropertyOffer>(`${BASE}/${offerId}/owner-approval`, null, { params: { approved } });
  return response.data;
};
