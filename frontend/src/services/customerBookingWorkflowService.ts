import { apiClient } from "./authService";
import type {
  AgreementVerifyInput,
  BookingDecisionInput,
  BookingRequest,
  BookingRequestDetail,
  FinalConfirmResult,
  HoldExtensionInput,
  JourneyFile,
  JourneyPayment,
  PaymentInstructionsResult,
} from "../types/customerBookingJourney";

/**
 * Staff-side workflow for customer booking requests. Uses the authenticated CRM client
 * (apiClient) only - never the customer portal client.
 *
 *   GET  /api/v1/customer-booking-workflow/requests                       booking.view
 *   GET  /api/v1/customer-booking-workflow/requests/{id}                  booking.view
 *   POST /api/v1/customer-booking-workflow/requests/{id}/decision         booking.create
 *   POST /api/v1/customer-booking-workflow/requests/{id}/extend-hold      booking.update
 *   PUT  /api/v1/customer-booking-workflow/requests/{id}/payment-instructions   booking.update
 *   POST /api/v1/customer-booking-workflow/requests/{id}/agreement        booking.update
 *   POST /api/v1/customer-booking-workflow/requests/{id}/agreement/verify booking.update
 *   POST /api/v1/customer-booking-workflow/requests/{id}/final-confirm    booking.update
 */

const BASE = "/api/v1/customer-booking-workflow/requests";

export const getStaffBookingRequests = async (): Promise<BookingRequest[]> => {
  const response = await apiClient.get<BookingRequest[]>(BASE);
  return Array.isArray(response.data) ? response.data : [];
};

interface RawStaffPayment {
  id: string;
  amount: string;
  status: string;
  payment_method?: string | null;
  transaction_reference?: string | null;
  verified_at?: string | null;
}

export const getStaffBookingRequest = async (requestId: string): Promise<BookingRequestDetail> => {
  const response = await apiClient.get<
    Omit<BookingRequestDetail, "payments" | "files"> & {
      payments?: RawStaffPayment[];
      files?: JourneyFile[];
    }
  >(`${BASE}/${requestId}`);
  const raw = response.data;
  const payments: JourneyPayment[] = (raw.payments ?? []).map((p) => ({
    id: p.id,
    amount: p.amount,
    method: p.payment_method ?? null,
    reference: p.transaction_reference ?? null,
    status: p.status,
    payment_date: null,
    verified_at: p.verified_at ?? null,
  }));
  return { ...raw, payments, files: raw.files ?? [] };
};

export const decideBookingRequest = async (
  requestId: string,
  data: BookingDecisionInput
): Promise<BookingRequest> => {
  const response = await apiClient.post<BookingRequest>(`${BASE}/${requestId}/decision`, data);
  return response.data;
};

export const extendBookingHold = async (
  requestId: string,
  data: HoldExtensionInput
): Promise<BookingRequest> => {
  const response = await apiClient.post<BookingRequest>(`${BASE}/${requestId}/extend-hold`, data);
  return response.data;
};

export const setPaymentInstructions = async (
  requestId: string,
  instructions: string
): Promise<PaymentInstructionsResult> => {
  const response = await apiClient.put<PaymentInstructionsResult>(
    `${BASE}/${requestId}/payment-instructions`,
    { instructions }
  );
  return response.data;
};

export const prepareAgreement = async (
  requestId: string,
  agreementText: string
): Promise<BookingRequest> => {
  const response = await apiClient.post<BookingRequest>(`${BASE}/${requestId}/agreement`, {
    agreement_text: agreementText,
  });
  return response.data;
};

export const verifyAgreement = async (
  requestId: string,
  data: AgreementVerifyInput
): Promise<BookingRequest> => {
  const response = await apiClient.post<BookingRequest>(`${BASE}/${requestId}/agreement/verify`, data);
  return response.data;
};

export const finalConfirmBooking = async (requestId: string): Promise<FinalConfirmResult> => {
  const response = await apiClient.post<FinalConfirmResult>(`${BASE}/${requestId}/final-confirm`);
  return response.data;
};

/* ─── Best-effort context lookups for the staff views ───
 * The workflow payload only carries ids (property_id, site_visit_id). These calls use existing
 * staff endpoints to show names; every one is optional and a failure simply leaves the field blank.
 */

export interface StaffRequestContext {
  propertyName: string | null;
  propertyPrice: number | null;
  propertyCity: string | null;
  customerName: string | null;
  requirementSummary: string | null;
}

interface PropertyLite {
  name: string;
  price: number | string;
  city?: string | null;
  unit_number?: string | null;
}
interface VisitLite {
  property_match_id: string;
}
interface MatchLite {
  id: string;
  buyer_requirement_id: string;
}
interface RequirementLite {
  contact_id?: string | null;
  lead_id?: string | null;
  requirement_type?: string;
  property_type?: string;
  preferred_city?: string | null;
}
interface PersonLite {
  full_name?: string | null;
  name?: string | null;
}

export const resolveStaffRequestContext = async (
  request: Pick<BookingRequest, "property_id" | "site_visit_id">
): Promise<StaffRequestContext> => {
  const context: StaffRequestContext = {
    propertyName: null,
    propertyPrice: null,
    propertyCity: null,
    customerName: null,
    requirementSummary: null,
  };

  const propertyPromise = apiClient
    .get<PropertyLite>(`/api/v1/properties/${request.property_id}`)
    .then((r) => {
      const p = r.data;
      context.propertyName = p.unit_number ? `${p.name} (Unit ${p.unit_number})` : p.name;
      const price = Number(p.price);
      context.propertyPrice = Number.isFinite(price) ? price : null;
      context.propertyCity = p.city ?? null;
    })
    .catch(() => undefined);

  const customerPromise = (async () => {
    try {
      const visit = (await apiClient.get<VisitLite>(`/api/v1/site-visits/${request.site_visit_id}`)).data;
      const matches = (
        await apiClient.get<MatchLite[]>(`/api/v1/property-matches/properties/${request.property_id}`)
      ).data;
      const match = matches.find((m) => m.id === visit.property_match_id);
      if (!match) return;
      const requirement = (
        await apiClient.get<RequirementLite>(`/api/v1/buyer-requirements/${match.buyer_requirement_id}`)
      ).data;
      context.requirementSummary = [
        requirement.requirement_type,
        requirement.property_type,
        requirement.preferred_city,
      ]
        .filter(Boolean)
        .join(" · ");
      if (requirement.contact_id) {
        const contact = (await apiClient.get<PersonLite>(`/api/v1/contacts/${requirement.contact_id}`)).data;
        context.customerName = contact.full_name || contact.name || null;
      }
    } catch {
      /* optional */
    }
  })();

  await Promise.all([propertyPromise, customerPromise]);
  return context;
};

/** Property names for the staff list (one request, tenant-scoped by the API). */
export const getPropertyNameMap = async (): Promise<Record<string, string>> => {
  try {
    const response = await apiClient.get<Array<{ id: string; name: string; unit_number?: string | null }>>(
      "/api/v1/properties/",
      { params: { limit: 100 } }
    );
    const map: Record<string, string> = {};
    (Array.isArray(response.data) ? response.data : []).forEach((p) => {
      map[p.id] = p.unit_number ? `${p.name} (Unit ${p.unit_number})` : p.name;
    });
    return map;
  } catch {
    return {};
  }
};
