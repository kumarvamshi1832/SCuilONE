import { portalApiClient } from "./customerPortalAuthService";
import { getPortalBuyerRequirements, getPortalRequirementMatches } from "./customerPortalBuyerRequirementService";
import { getBookingRequests } from "./customerPortalJourneyService";
import { getPortalRentalBookingRequests } from "./customerPortalRentalService";
import { getPortalOffers } from "./customerPortalOfferService";
import { byCreatedAt, isRentalListing } from "../utils/offerDisplay";
import type { PropertyOffer } from "../types/propertyOffer";
import type { NegotiationTarget, PortalPropertyMatch } from "../types/customerPortalBuyerRequirement";
import type { RentalBookingRequest } from "../types/rentalBookingRequest";
import type { BookingRequest } from "../types/customerBookingJourney";

/**
 * Price negotiation for a BOOKING REQUEST, on the existing customer property-offers API.
 *
 * The backend keys negotiations by property match (customer-portal/property-matches/{match_id}/offers) and a booking
 * request does not expose its match id - only its property_id. A booking request is therefore connected to its
 * negotiation through the customer's own matched properties: every match of the customer's requirements that points at
 * the request's property is a candidate, and the candidate whose thread has the most recent offer is the negotiation
 * (staff open it on the visit's match, which is always one of the customer's matches for that property).
 *
 * Nothing is stored or invented here: matches and offers are read from the API each time.
 */

export interface BookingNegotiation {
  match: NegotiationTarget;
  offers: PropertyOffer[];
}

/** Every matched property of the customer's requirements, de-duplicated by match id, enriched with requirement context. */
export const loadPortalMatches = async (): Promise<PortalPropertyMatch[]> => {
  const requirements = await getPortalBuyerRequirements().catch(() => []);
  const lists = await Promise.allSettled(
    requirements.map(async (r) => {
      const matches = await getPortalRequirementMatches(r.id).catch(() => [] as PortalPropertyMatch[]);
      return matches.map((m) => ({
        ...m,
        requirement_id: r.id,
        requirement_type: r.requirement_type,
      }));
    })
  );
  const byId = new Map<string, PortalPropertyMatch>();
  lists.forEach((result) => {
    if (result.status === "fulfilled") {
      result.value.forEach((m) => {
        const existing = byId.get(m.match_id);
        if (!existing || (!existing.requirement_id && m.requirement_id)) {
          byId.set(m.match_id, m);
        }
      });
    }
  });

  // Also harvest matches from Rental Booking Requests & Journey Booking Requests
  // This ensures matches whose property status is 'Reserved' or 'Booked' are still discovered!
  const [rentalReqs, journeyReqs] = await Promise.allSettled([
    getPortalRentalBookingRequests().catch(() => [] as RentalBookingRequest[]),
    getBookingRequests().catch(() => [] as BookingRequest[]),
  ]);

  if (rentalReqs.status === "fulfilled") {
    rentalReqs.value.forEach((req) => {
      if (req.property_match_id) {
        const existing = byId.get(req.property_match_id);
        if (existing) {
          if (!existing.requirement_id && req.buyer_requirement_id) {
            existing.requirement_id = req.buyer_requirement_id;
          }
          if (!existing.requirement_type) {
            existing.requirement_type = (req.booking_type as any) || "Rent";
          }
        } else {
          byId.set(req.property_match_id, {
            match_id: req.property_match_id,
            requirement_id: req.buyer_requirement_id || undefined,
            requirement_type: (req.booking_type as any) || "Rent",
            match_status: req.status,
            property: {
              id: req.property_id,
              name: null,
              unit_number: null,
              property_type: req.booking_type || "Residential",
              listing_type: req.booking_type || "Rent",
              price: Number(req.proposed_rent_amount) || 0,
              currency: "INR",
              security_deposit: Number(req.proposed_deposit_amount) || null,
            } as any,
          });
        }
      }
    });
  }

  if (journeyReqs.status === "fulfilled") {
    journeyReqs.value.forEach((req) => {
      if (req.property_match_id) {
        const existing = byId.get(req.property_match_id);
        if (!existing) {
          byId.set(req.property_match_id, {
            match_id: req.property_match_id,
            match_status: req.status,
            property: {
              id: req.property_id,
              name: null,
              unit_number: null,
              property_type: "Residential",
              listing_type: "Sale",
              price: Number(req.agreed_price) || 0,
              currency: "INR",
            } as any,
          });
        }
      }
    });
  }

  // Best effort: enrich property names and locations from site visits
  try {
    const visitsRes = await portalApiClient.get<
      Array<{ property?: { id: string; name: string; address?: string; city?: string; state?: string } }>
    >("/api/v1/customer-portal/site-visits").catch(() => null);
    if (Array.isArray(visitsRes?.data)) {
      visitsRes.data.forEach((v) => {
        if (v.property?.id && v.property?.name) {
          byId.forEach((m) => {
            if (m.property.id === v.property!.id && !m.property.name) {
              m.property.name = v.property!.name;
              if (v.property!.address) m.property.address = v.property!.address;
              if (v.property!.city) m.property.city = v.property!.city;
              if (v.property!.state) m.property.state = v.property!.state;
            }
          });
        }
      });
    }
  } catch {
    /* site visits enrichment is optional */
  }

  return Array.from(byId.values());
};

const lastOfferTime = (offers: PropertyOffer[]): number => {
  const last = offers.length > 0 ? offers[offers.length - 1] : undefined;
  return last ? new Date(last.created_at.endsWith("Z") ? last.created_at : `${last.created_at}Z`).getTime() || 0 : 0;
};

/**
 * The negotiation of one property, or null when the customer has no matched property for it. Throws when every thread
 * fails to load. When the booking request itself names its match (`property_match_id`) that thread is loaded directly -
 * this is the only way to reach it once the property is Reserved, because the matches endpoint lists Available
 * properties only.
 */
export const loadNegotiation = async (
  propertyId: string,
  matches?: PortalPropertyMatch[],
  knownMatchId?: string | null
): Promise<BookingNegotiation | null> => {
  const allMatches = matches ?? (await loadPortalMatches().catch(() => []));
  if (knownMatchId) {
    const offers = [...(await getPortalOffers(knownMatchId))].sort(byCreatedAt);
    const listed = allMatches.find((m) => m.match_id === knownMatchId);
    const candidate = allMatches.find((m) => m.property.id === propertyId);
    return {
      match: listed ?? {
        match_id: knownMatchId,
        property: {
          id: propertyId,
          name: candidate?.property.name ?? null,
          currency: candidate?.property.currency || "INR",
          listing_type: candidate?.property.listing_type,
          price: candidate?.property.price,
        },
      },
      offers,
    };
  }
  const candidates = allMatches.filter((m) => m.property.id === propertyId);
  if (candidates.length === 0) return null;
  const settled = await Promise.allSettled(candidates.map(async (match) => ({ match, offers: [...(await getPortalOffers(match.match_id))].sort(byCreatedAt) })));
  const threads = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  if (threads.length === 0) {
    const failure = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    throw failure?.reason ?? new Error("The negotiation could not be loaded.");
  }
  // The thread with the newest offer; with no offers anywhere, the first candidate.
  return threads.sort((a, b) => lastOfferTime(b.offers) - lastOfferTime(a.offers))[0] ?? null;
};

/** Negotiations for many booking requests at once (one matches lookup shared by all). Keyed by booking request id. */
export const loadNegotiationsForRequests = async (
  requests: Array<{ id: string; property_id: string; property_match_id?: string | null }>
): Promise<Map<string, BookingNegotiation | null>> => {
  const result = new Map<string, BookingNegotiation | null>();
  if (requests.length === 0) return result;
  const matches = await loadPortalMatches().catch(() => []);
  const byKey = new Map<string, Promise<BookingNegotiation | null>>();
  // If property_match_id is present, key strictly by match ID to avoid cross-request contamination.
  // Otherwise key by request ID so separate requests for the same property don't overwrite each other.
  const keyOf = (r: { id: string; property_id: string; property_match_id?: string | null }) =>
    r.property_match_id ? `match:${r.property_match_id}` : `req:${r.id}`;

  for (const request of requests) {
    const key = keyOf(request);
    if (!byKey.has(key)) byKey.set(key, loadNegotiation(request.property_id, matches, request.property_match_id).catch(() => null));
  }
  for (const request of requests) result.set(request.id, (await byKey.get(keyOf(request))) ?? null);
  return result;
};

/**
 * The booking request an offer notification is about (notifications carry only the offer id): find the offer in the
 * customer's threads, then the booking request for that offer's property.
 */
export const findBookingRequestForOffer = async (offerId: string): Promise<string | null> => {
  const matches = await loadPortalMatches().catch(() => []);
  for (const match of matches) {
    const offers = await getPortalOffers(match.match_id).catch(() => [] as PropertyOffer[]);
    if (offers.some((o) => o.id === offerId)) {
      const requests = await getBookingRequests().catch(() => []);
      // 1. Exact match on property_match_id
      const byMatch = requests.find((r) => r.property_match_id === match.match_id);
      if (byMatch) return byMatch.id;
      // 2. Matching property_id, prioritizing active requests
      const forProperty = requests.filter((r) => r.property_id === match.property.id);
      const first = forProperty[0];
      if (forProperty.length === 1 && first) return first.id;
      if (forProperty.length > 1 && first) {
        const active = forProperty.find((r) => !["Rejected", "Cancelled", "Expired"].includes(r.status));
        return (active ?? first).id;
      }
      return null;
    }
  }
  return null;
};

export interface OfferTargetLocation {
  isRental: boolean;
  offerId: string;
  matchId: string;
  propertyId: string;
  requestId: string | null;
  link: string;
}

/**
 * Resolves the destination for an offer notification:
 *  - Rental / lease properties navigate to Rentals & Leases (/portal/rentals?respond=true&offer=...)
 *  - Sale properties navigate to Booking Requests (/portal/booking-requests/:id?respond=true&offer=...)
 * Derived strictly from property / match data and offer price frequency (never inferred from title alone).
 */
export const resolveOfferTarget = async (offerId: string): Promise<OfferTargetLocation | null> => {
  const matches = await loadPortalMatches().catch(() => []);
  for (const match of matches) {
    const offers = await getPortalOffers(match.match_id).catch(() => [] as PropertyOffer[]);
    const offer = offers.find((o) => o.id === offerId);
    if (offer) {
      const isRental =
        isRentalListing(match.property.listing_type) ||
        isRentalListing(match.requirement_type) ||
        (Boolean(offer.price_frequency) && offer.price_frequency !== "One-time");

      if (isRental) {
        return {
          isRental: true,
          offerId,
          matchId: match.match_id,
          propertyId: match.property.id,
          requestId: null,
          link: `/portal/rentals?respond=true&offer=${encodeURIComponent(offerId)}`,
        };
      }

      const requests = await getBookingRequests().catch(() => []);
      const byMatch = requests.find((r) => r.property_match_id === match.match_id);
      let targetRequestId = byMatch?.id ?? null;
      if (!targetRequestId) {
        const forProperty = requests.filter((r) => r.property_id === match.property.id);
        const first = forProperty[0];
        if (forProperty.length === 1 && first) {
          targetRequestId = first.id;
        } else if (forProperty.length > 1 && first) {
          const active = forProperty.find((r) => !["Rejected", "Cancelled", "Expired"].includes(r.status));
          targetRequestId = (active ?? first).id;
        }
      }

      return {
        isRental: false,
        offerId,
        matchId: match.match_id,
        propertyId: match.property.id,
        requestId: targetRequestId,
        link: targetRequestId
          ? `/portal/booking-requests/${targetRequestId}?respond=true&offer=${encodeURIComponent(offerId)}`
          : `/portal/booking-requests?respond=true&offer=${encodeURIComponent(offerId)}`,
      };
    }
  }

  // Fallback 1: check rental booking requests directly in case match was not in active matches
  const rentalReqs = await getPortalRentalBookingRequests().catch(() => [] as RentalBookingRequest[]);
  for (const req of rentalReqs) {
    if (req.property_match_id) {
      const offers = await getPortalOffers(req.property_match_id).catch(() => [] as PropertyOffer[]);
      const offer = offers.find((o) => o.id === offerId);
      if (offer) {
        return {
          isRental: true,
          offerId,
          matchId: req.property_match_id,
          propertyId: req.property_id,
          requestId: req.id,
          link: `/portal/rentals?respond=true&offer=${encodeURIComponent(offerId)}`,
        };
      }
    }
  }

  // Fallback 2: check booking requests directly in case match was not in active matches
  const requests = await getBookingRequests().catch(() => []);
  for (const req of requests) {
    if (req.property_match_id) {
      const offers = await getPortalOffers(req.property_match_id).catch(() => [] as PropertyOffer[]);
      const offer = offers.find((o) => o.id === offerId);
      if (offer) {
        const isRental =
          isRentalListing((req as any).booking_type) ||
          (Boolean(offer.price_frequency) && offer.price_frequency !== "One-time");
        return {
          isRental,
          offerId,
          matchId: req.property_match_id,
          propertyId: req.property_id,
          requestId: req.id,
          link: isRental
            ? `/portal/rentals?respond=true&offer=${encodeURIComponent(offerId)}`
            : `/portal/booking-requests/${req.id}?respond=true&offer=${encodeURIComponent(offerId)}`,
        };
      }
    }
  }

  return null;
};
