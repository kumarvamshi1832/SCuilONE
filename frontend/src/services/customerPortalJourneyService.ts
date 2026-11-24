import { portalApiClient } from "./customerPortalAuthService";
import type {
  AgreementAcknowledgeInput,
  AgreementAcknowledgeResult,
  BookingPaymentInput,
  BookingPaymentResult,
  BookingRequest,
  BookingRequestDetail,
  BookingRequestInput,
  BuyerDetailsInput,
  BuyerDetailsResult,
  JourneyFile,
  JourneyFileDownload,
  JourneyFilePurpose,
  JourneyFileUploadResult,
  JourneyPayment,
  PortalHandover,
  VisitFeedbackInput,
  VisitFeedbackResult,
} from "../types/customerBookingJourney";

/**
 * Customer-side booking journey. Uses portalApiClient (customer authentication) only - never the
 * staff CRM client. Tenant and customer ownership always come from the portal token.
 *
 *   POST /api/v1/customer-portal/site-visits/{id}/feedback
 *   POST /api/v1/customer-portal/site-visits/{id}/booking-requests
 *   GET  /api/v1/customer-portal/booking-requests
 *   GET  /api/v1/customer-portal/booking-requests/{id}
 *   PUT  /api/v1/customer-portal/booking-requests/{id}/buyer-details   (buyer + nominees; required before payment)
 *   POST /api/v1/customer-portal/booking-requests/{id}/agreement/acknowledge
 *   POST /api/v1/customer-portal/booking-requests/{id}/payments
 *   POST /api/v1/customer-portal/booking-requests/{id}/files            (multipart)
 *   GET  /api/v1/customer-portal/booking-requests/{id}/files/{file}/download
 */

const SITE_VISITS = "/api/v1/customer-portal/site-visits";
const REQUESTS = "/api/v1/customer-portal/booking-requests";

export const submitSiteVisitFeedback = async (
  siteVisitId: string,
  data: VisitFeedbackInput
): Promise<VisitFeedbackResult> => {
  const response = await portalApiClient.post<VisitFeedbackResult>(
    `${SITE_VISITS}/${siteVisitId}/feedback`,
    data
  );
  return response.data;
};

/**
 * Creates (or, for an expired/rejected/cancelled request, re-opens) the booking request for a
 * completed site visit. The backend returns the existing request instead of a duplicate.
 */
export const requestBooking = async (
  siteVisitId: string,
  data: BookingRequestInput
): Promise<BookingRequest> => {
  const response = await portalApiClient.post<BookingRequest>(
    `${SITE_VISITS}/${siteVisitId}/booking-requests`,
    data
  );
  return response.data;
};

export const getBookingRequests = async (): Promise<BookingRequest[]> => {
  const response = await portalApiClient.get<BookingRequest[]>(REQUESTS);
  return Array.isArray(response.data) ? response.data : [];
};

interface RawCustomerPayment {
  id: string;
  amount: string;
  method?: string | null;
  reference?: string | null;
  status: string;
  payment_date?: string | null;
  verified_at?: string | null;
}

export const getBookingRequest = async (requestId: string): Promise<BookingRequestDetail> => {
  const response = await portalApiClient.get<
    Omit<BookingRequestDetail, "payments" | "files"> & {
      payments?: RawCustomerPayment[];
      files?: JourneyFile[];
    }
  >(`${REQUESTS}/${requestId}`);
  const raw = response.data;
  const payments: JourneyPayment[] = (raw.payments ?? []).map((p) => ({
    id: p.id,
    amount: p.amount,
    method: p.method ?? null,
    reference: p.reference ?? null,
    status: p.status,
    payment_date: p.payment_date ?? null,
    verified_at: p.verified_at ?? null,
  }));
  return { ...raw, payments, files: raw.files ?? [] };
};

/**
 * Replaces the buyer details and the complete nominee list of the booking behind an approved request.
 * 409 when the request is not Approved, the hold expired, the booking is no longer pending, or a payment
 * has already been submitted (the details are then locked).
 */
export const submitBuyerDetails = async (
  requestId: string,
  data: BuyerDetailsInput
): Promise<BuyerDetailsResult> => {
  const response = await portalApiClient.put<BuyerDetailsResult>(`${REQUESTS}/${requestId}/buyer-details`, data);
  return response.data;
};

export const acknowledgeAgreement = async (
  requestId: string,
  data: AgreementAcknowledgeInput
): Promise<AgreementAcknowledgeResult> => {
  const response = await portalApiClient.post<AgreementAcknowledgeResult>(
    `${REQUESTS}/${requestId}/agreement/acknowledge`,
    data
  );
  return response.data;
};

export const submitBookingPayment = async (
  requestId: string,
  data: BookingPaymentInput
): Promise<BookingPaymentResult> => {
  const response = await portalApiClient.post<BookingPaymentResult>(
    `${REQUESTS}/${requestId}/payments`,
    data
  );
  return response.data;
};

/** Accepted by the backend: PDF, JPG, JPEG, PNG up to 5 MB. */
export const JOURNEY_FILE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
export const JOURNEY_FILE_MAX_BYTES = 5 * 1024 * 1024;

/** Upload endpoint template, used for diagnostics. */
export const BOOKING_FILE_UPLOAD_ENDPOINT = `POST ${REQUESTS}/{request_id}/files`;

/**
 * POST /api/v1/customer-portal/booking-requests/{request_id}/files (multipart/form-data)
 *   file        - the document (field name required by the backend)
 *   purpose     - "Signed Agreement" | "Payment Proof"
 *   payment_id  - required for "Payment Proof" only
 * Uses the customer portal client (customer bearer token added by its interceptor). The multipart
 * Content-Type is NOT set manually so the browser/axios generates it with the correct boundary.
 */
export const uploadBookingFile = async (
  requestId: string,
  file: File,
  purpose: JourneyFilePurpose,
  paymentId?: string,
  onProgress?: (percent: number) => void
): Promise<JourneyFileUploadResult> => {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("purpose", purpose);
  if (purpose === "Payment Proof" && paymentId) form.append("payment_id", paymentId);
  const response = await portalApiClient.post<JourneyFileUploadResult>(
    `${REQUESTS}/${requestId}/files`,
    form,
    {
      // Drop the client's default JSON Content-Type so the multipart boundary is generated for FormData.
      headers: { "Content-Type": undefined },
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      },
    }
  );
  return response.data;
};

/** GET /api/v1/customer-portal/bookings/{booking_id}/handover - 404 means no handover has been scheduled yet. */
export const getBookingHandover = async (bookingId: string): Promise<PortalHandover | null> => {
  try {
    const response = await portalApiClient.get<PortalHandover>(`/api/v1/customer-portal/bookings/${bookingId}/handover`);
    return response.data;
  } catch (err) {
    if ((err as { response?: { status?: number } })?.response?.status === 404) return null;
    throw err;
  }
};

export const getBookingFileDownload = async (
  requestId: string,
  fileId: string
): Promise<JourneyFileDownload> => {
  const response = await portalApiClient.get<JourneyFileDownload>(
    `${REQUESTS}/${requestId}/files/${fileId}/download`
  );
  return response.data;
};

/** POST /api/v1/customer-portal/handovers/{id}/acknowledge - the customer confirms possession. */
export const acknowledgeHandover = async (
  handoverId: string,
  data: { confirm_possession: boolean; notes?: string | null }
): Promise<PortalHandover> => {
  const response = await portalApiClient.post<PortalHandover>(
    `/api/v1/customer-portal/handovers/${handoverId}/acknowledge`,
    data
  );
  return response.data;
};
