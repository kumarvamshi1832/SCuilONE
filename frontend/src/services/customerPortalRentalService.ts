import { portalApiClient } from "./customerPortalAuthService";
import { getPortalBuyerRequirements, getPortalRequirementMatches } from "./customerPortalBuyerRequirementService";
import type {
  PortalRentalDetail,
  RentalAgreement,
  RentalPayment,
  RentalPaymentCreate,
  RentalReceipt,
  RentalRenewal,
} from "../types/rental";
import type {
  EligibleRentalProperty,
  PortalRentalBookingRequestDetail,
  RentalBookingRequest,
  RentalBookingRequestPortalCreate,
} from "../types/rentalBookingRequest";

/**
 * Customer-side rentals and leases (portal client, customer token). The backend scopes every call to the signed-in
 * customer's own agreements (tenant + contact) and hides Draft and Cancelled ones: another customer's id returns 404.
 *
 * Backend: /api/v1/customer-portal/rental-agreements
 *   GET  /                                   the customer's agreements
 *   GET  /{id}                               agreement + schedule + payments + inspections + settlement
 *   POST /{id}/sign                          { accepted_terms, signature_name } - the typed name must match the contact's full name
 *   POST /{id}/inspections/{iid}/acknowledge { notes }
 *   POST /{id}/payments                      Deposit (while Pending Signature, after signing) | Rent | Maintenance (needs schedule_id)
 *   GET  /{id}/payments/{pid}/receipt        only after verification
 *   POST /{id}/exit-requests                 { requested_vacate_date, notice_served_date?, reason }
 *   POST /{id}/renewals                      { new_end_date, new_rent_amount, reason? }
 */
const BASE = "/api/v1/customer-portal/rental-agreements";

export const getPortalRentalAgreements = async (): Promise<RentalAgreement[]> => {
  const response = await portalApiClient.get<RentalAgreement[]>(BASE);
  return Array.isArray(response.data) ? response.data : [];
};

export const getPortalRentalAgreement = async (id: string): Promise<PortalRentalDetail> =>
  (await portalApiClient.get<PortalRentalDetail>(`${BASE}/${id}`)).data;

export const signPortalRentalAgreement = async (id: string, data: { accepted_terms: boolean; signature_name: string }) =>
  (await portalApiClient.post<{ agreement_id: string; customer_signed_at: string; customer_signature_name: string; signature_method: string }>(`${BASE}/${id}/sign`, data)).data;

export const acknowledgePortalInspection = async (id: string, inspectionId: string, notes?: string | null) =>
  (await portalApiClient.post<{ inspection_id: string; tenant_acknowledged: boolean }>(`${BASE}/${id}/inspections/${inspectionId}/acknowledge`, { notes: notes || null })).data;

export const submitPortalRentalPayment = async (id: string, data: RentalPaymentCreate): Promise<RentalPayment> =>
  (await portalApiClient.post<RentalPayment>(`${BASE}/${id}/payments`, data)).data;

export const getPortalRentalReceipt = async (id: string, paymentId: string): Promise<RentalReceipt> =>
  (await portalApiClient.get<RentalReceipt>(`${BASE}/${id}/payments/${paymentId}/receipt`)).data;

export const requestPortalRentalExit = async (id: string, data: { requested_vacate_date: string; notice_served_date?: string | null; reason: string }) =>
  (await portalApiClient.post<Record<string, unknown>>(`${BASE}/${id}/exit-requests`, data)).data;

export const requestPortalRentalRenewal = async (id: string, data: { new_end_date: string; new_rent_amount: number; reason?: string | null }): Promise<Partial<RentalRenewal>> =>
  (await portalApiClient.post<Partial<RentalRenewal>>(`${BASE}/${id}/renewals`, data)).data;

/**
 * The portal rental payload carries only property_id, and the portal has no property-by-id endpoint. The names are
 * therefore taken, best effort, from the customer's own requirements' matched properties; an unknown property is left
 * out of the map and the screens fall back to a generic label.
 */
export const getPortalPropertyNameMap = async (): Promise<Record<string, string>> => {
  const map: Record<string, string> = {};
  try {
    const requirements = await getPortalBuyerRequirements();
    const lists = await Promise.allSettled(requirements.map((r) => getPortalRequirementMatches(r.id)));
    lists.forEach((result) => {
      if (result.status !== "fulfilled") return;
      result.value.forEach((m) => {
        map[m.property.id] = m.property.unit_number ? `${m.property.name} (Unit ${m.property.unit_number})` : m.property.name;
      });
    });
  } catch {
    /* names are optional */
  }
  try {
    const visitsRes = await portalApiClient.get<
      Array<{ property?: { id: string; name: string; unit_number?: string | null } }>
    >("/api/v1/customer-portal/site-visits").catch(() => null);
    if (Array.isArray(visitsRes?.data)) {
      visitsRes.data.forEach((v) => {
        if (v.property?.id && v.property?.name && !map[v.property.id]) {
          map[v.property.id] = v.property.unit_number
            ? `${v.property.name} (Unit ${v.property.unit_number})`
            : v.property.name;
        }
      });
    }
  } catch {
    /* site visit names are optional */
  }
  return map;
};

/* ─── rent / lease BOOKING REQUESTS (customer) ───
 * Backend: /api/v1/customer-portal
 *   GET  /rental-properties                       Available Rent / Lease listings (filters: listing_type, city, property_type)
 *   POST /rental-booking-requests                 submit a request; the property is held immediately (409 when held / unavailable)
 *   GET  /rental-booking-requests                 the customer's own requests (expired holds are flagged on read)
 *   GET  /rental-booking-requests/{id}            one request (+ its agreement once it left Draft / Cancelled)
 *   POST /rental-booking-requests/{id}/cancel     { reason } while Requested / Approved / Agreement Created
 */
const PORTAL_BASE = "/api/v1/customer-portal";

export const getPortalRentalProperties = async (filters?: { listing_type?: string; city?: string; property_type?: string }): Promise<EligibleRentalProperty[]> => {
  const response = await portalApiClient.get<EligibleRentalProperty[]>(`${PORTAL_BASE}/rental-properties`, { params: filters });
  return Array.isArray(response.data) ? response.data : [];
};

export const createPortalRentalBookingRequest = async (data: RentalBookingRequestPortalCreate): Promise<RentalBookingRequest> =>
  (await portalApiClient.post<RentalBookingRequest>(`${PORTAL_BASE}/rental-booking-requests`, data)).data;

export const getPortalRentalBookingRequests = async (): Promise<RentalBookingRequest[]> => {
  const response = await portalApiClient.get<RentalBookingRequest[]>(`${PORTAL_BASE}/rental-booking-requests`);
  return Array.isArray(response.data) ? response.data : [];
};

export const getPortalRentalBookingRequest = async (id: string): Promise<PortalRentalBookingRequestDetail> =>
  (await portalApiClient.get<PortalRentalBookingRequestDetail>(`${PORTAL_BASE}/rental-booking-requests/${id}`)).data;

export const cancelPortalRentalBookingRequest = async (id: string, reason: string): Promise<RentalBookingRequest> =>
  (await portalApiClient.post<RentalBookingRequest>(`${PORTAL_BASE}/rental-booking-requests/${id}/cancel`, { reason })).data;
