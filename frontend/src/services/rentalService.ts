import { apiClient } from "./authService";
import type {
  DepositLedger,
  RentalAgreement,
  RentalAgreementCreate,
  RentalAgreementStatus,
  RentalAgreementType,
  RentalDashboardSummary,
  RentalExitRequest,
  RentalInspection,
  RentalPayment,
  RentalPaymentCreate,
  RentalReceipt,
  RentalRenewal,
  RentalScheduleItem,
  RentalSettlement,
} from "../types/rental";
import type { RentalBookingRequest, RentalBookingRequestDecision, RentalBookingRequestWalkInCreate } from "../types/rentalBookingRequest";

/**
 * Staff rentals and leases (authenticated CRM client). Backend: /api/v1/rentals (routes/rentals.py), gated by the
 * "properties" module and the booking.* permissions:
 *   booking.view            GET endpoints
 *   booking.create          create an agreement
 *   booking.update          sign / activate / cancel, schedule, exit, inspections, settlement, renewals, deposit entries
 *   booking.payment.create  record a payment, collect a settlement amount
 *   booking.payment.verify  verify / reject a payment
 * All data comes from the API; errors are propagated so the UI shows the server's message.
 */
const BASE = "/api/v1/rentals";

/* ─── dashboard & agreements ─── */

export const getRentalDashboardSummary = async (): Promise<RentalDashboardSummary> =>
  (await apiClient.get<RentalDashboardSummary>(`${BASE}/dashboard/summary`)).data;

export const listRentalAgreements = async (params?: {
  status?: RentalAgreementStatus | string;
  agreement_type?: RentalAgreementType | string;
  property_id?: string;
}): Promise<RentalAgreement[]> => {
  const response = await apiClient.get<RentalAgreement[]>(`${BASE}/agreements`, { params });
  return Array.isArray(response.data) ? response.data : [];
};

export const getRentalAgreement = async (id: string): Promise<RentalAgreement> =>
  (await apiClient.get<RentalAgreement>(`${BASE}/agreements/${id}`)).data;

export const createRentalAgreement = async (data: RentalAgreementCreate): Promise<RentalAgreement> =>
  (await apiClient.post<RentalAgreement>(`${BASE}/agreements`, data)).data;

export const updateRentalAgreementDraft = async (
  id: string,
  data: Partial<RentalAgreementCreate>
): Promise<RentalAgreement> =>
  (await apiClient.patch<RentalAgreement>(`${BASE}/agreements/${id}`, data)).data;

export const sendRentalAgreementForSignature = async (id: string, agreement_document_url: string): Promise<RentalAgreement> =>
  (await apiClient.post<RentalAgreement>(`${BASE}/agreements/${id}/send-for-signature`, { agreement_document_url })).data;

export const recordWalkInSignature = async (
  id: string,
  data: { signer_name: string; signed_document_url: string; witnessed: boolean }
): Promise<RentalAgreement> => (await apiClient.post<RentalAgreement>(`${BASE}/agreements/${id}/record-walk-in-signature`, data)).data;

export const cancelRentalAgreement = async (id: string, reason: string): Promise<{ agreement_id: string; status: string }> =>
  (await apiClient.post<{ agreement_id: string; status: string }>(`${BASE}/agreements/${id}/cancel`, { reason })).data;

export const activateRentalAgreement = async (
  id: string,
  data: { signed_at?: string | null; agreement_document_url?: string | null; confirm_deposit_received?: boolean }
): Promise<RentalAgreement> => (await apiClient.post<RentalAgreement>(`${BASE}/agreements/${id}/activate`, data)).data;

/* ─── schedule ─── */

export const generateRentalSchedule = async (id: string, through_date?: string | null) =>
  (await apiClient.post<{ agreement_id: string; created_count: number; through_date: string }>(`${BASE}/agreements/${id}/generate-schedule`, { through_date: through_date || null })).data;

export const listRentalSchedule = async (id: string): Promise<RentalScheduleItem[]> => {
  const response = await apiClient.get<RentalScheduleItem[]>(`${BASE}/agreements/${id}/schedule`);
  return Array.isArray(response.data) ? response.data : [];
};

/* ─── payments ─── */

export const createRentalPayment = async (id: string, data: RentalPaymentCreate): Promise<RentalPayment> =>
  (await apiClient.post<RentalPayment>(`${BASE}/agreements/${id}/payments`, data)).data;

export const listRentalPayments = async (id: string): Promise<RentalPayment[]> => {
  const response = await apiClient.get<RentalPayment[]>(`${BASE}/agreements/${id}/payments`);
  return Array.isArray(response.data) ? response.data : [];
};

export const decideRentalPayment = async (paymentId: string, decision: "Verified" | "Rejected", notes?: string | null): Promise<RentalPayment> =>
  (await apiClient.post<RentalPayment>(`${BASE}/payments/${paymentId}/decision`, { decision, notes: notes || null })).data;

export const getRentalPaymentReceipt = async (paymentId: string): Promise<RentalReceipt> =>
  (await apiClient.get<RentalReceipt>(`${BASE}/payments/${paymentId}/receipt`)).data;

/* ─── deposit ─── */

export const getDepositLedger = async (id: string): Promise<DepositLedger> =>
  (await apiClient.get<DepositLedger>(`${BASE}/agreements/${id}/deposit`)).data;

export const createDepositTransaction = async (
  id: string,
  data: {
    direction: "Credit" | "Debit";
    transaction_type: "Deposit Adjustment" | "Refund" | "Damage Deduction" | "Utility Deduction" | "Other Deduction";
    amount: number;
    description: string;
    reference?: string | null;
  }
) => (await apiClient.post<{ id: string; balance: string | number }>(`${BASE}/agreements/${id}/deposit-transactions`, data)).data;

/* ─── exit, inspection, settlement, renewal ─── */

export const listRentalExitRequests = async (status?: string): Promise<RentalExitRequest[]> => {
  const response = await apiClient.get<RentalExitRequest[]>(`${BASE}/exit-requests`, { params: status ? { status } : undefined });
  return Array.isArray(response.data) ? response.data : [];
};

export const createRentalExitRequest = async (
  id: string,
  data: { requested_vacate_date: string; notice_served_date?: string | null; reason: string }
) => (await apiClient.post<Record<string, unknown>>(`${BASE}/agreements/${id}/exit-requests`, data)).data;

export const decideRentalExitRequest = async (
  exitId: string,
  data: {
    decision: "Approved" | "Rejected";
    early_exit_approved?: boolean;
    early_exit_charge?: number;
    notice_period_waived?: boolean;
    notice_shortfall_charge?: number;
    decision_notes?: string | null;
  }
) => (await apiClient.post<Record<string, unknown>>(`${BASE}/exit-requests/${exitId}/decision`, data)).data;

export const completeRentalHandover = async (exitId: string) =>
  (await apiClient.post<Record<string, unknown>>(`${BASE}/exit-requests/${exitId}/complete-handover`)).data;

export const listRentalInspections = async (id: string): Promise<RentalInspection[]> => {
  const response = await apiClient.get<RentalInspection[]>(`${BASE}/agreements/${id}/inspections`);
  return Array.isArray(response.data) ? response.data : [];
};

export const createRentalInspection = async (
  id: string,
  data: {
    exit_request_id?: string | null;
    inspection_type: "Move In" | "Move Out" | "Periodic";
    condition: "Excellent" | "Good" | "Fair" | "Damaged";
    damage_details?: string | null;
    damage_amount?: number;
    notes?: string | null;
  }
) => (await apiClient.post<RentalInspection>(`${BASE}/agreements/${id}/inspections`, data)).data;

export const listRentalSettlements = async (status?: string): Promise<RentalSettlement[]> => {
  const response = await apiClient.get<RentalSettlement[]>(`${BASE}/settlements`, { params: status ? { status } : undefined });
  return Array.isArray(response.data) ? response.data : [];
};

export const calculateRentalSettlement = async (
  id: string,
  data: { exit_request_id: string; utility_charges?: number; notice_shortfall_charge?: number; other_charges?: number; notes?: string | null }
): Promise<RentalSettlement> => (await apiClient.post<RentalSettlement>(`${BASE}/agreements/${id}/settlement/calculate`, data)).data;

export const approveRentalSettlement = async (settlementId: string): Promise<RentalSettlement> =>
  (await apiClient.post<RentalSettlement>(`${BASE}/settlements/${settlementId}/approve`)).data;

export const recordRentalRefund = async (settlementId: string, data: { amount: number; reference: string; notes?: string | null }): Promise<RentalSettlement> =>
  (await apiClient.post<RentalSettlement>(`${BASE}/settlements/${settlementId}/refund`, data)).data;

export const collectRentalSettlement = async (
  settlementId: string,
  data: { amount: number; payment_method: RentalPaymentCreate["payment_method"]; transaction_reference?: string | null; notes?: string | null }
): Promise<RentalPayment> => (await apiClient.post<RentalPayment>(`${BASE}/settlements/${settlementId}/collect`, data)).data;

export const listRentalRenewals = async (status?: string): Promise<RentalRenewal[]> => {
  const response = await apiClient.get<RentalRenewal[]>(`${BASE}/renewals`, { params: status ? { status } : undefined });
  return Array.isArray(response.data) ? response.data : [];
};

export const requestRentalRenewal = async (id: string, data: { new_end_date: string; new_rent_amount: number; reason?: string | null }): Promise<RentalRenewal> =>
  (await apiClient.post<RentalRenewal>(`${BASE}/agreements/${id}/renewals`, data)).data;

export const decideRentalRenewal = async (revisionId: string, decision: "Approved" | "Rejected", notes?: string | null) =>
  (await apiClient.post<Record<string, unknown>>(`${BASE}/renewals/${revisionId}/decision`, { decision, notes: notes || null })).data;

/* ─── rent / lease BOOKING REQUESTS (a separate lifecycle from agreements) ───
 *   GET  /booking-requests                       booking.view   filters: status, booking_type, channel, property_id
 *   GET  /booking-requests/{id}                  booking.view
 *   POST /booking-requests                       booking.create walk-in request + temporary property hold
 *   POST /booking-requests/{id}/decision         booking.update Approve (commercial terms) | Reject; only while "Requested"
 *   POST /booking-requests/{id}/create-agreement booking.create only from an "Approved" request that has no agreement yet
 *   POST /booking-requests/{id}/cancel           booking.update { reason }; blocked once verified payments / an active agreement exist
 */
export const listRentalBookingRequests = async (filters?: { status?: string; booking_type?: string; channel?: string; property_id?: string }): Promise<RentalBookingRequest[]> => {
  const response = await apiClient.get<RentalBookingRequest[]>(`${BASE}/booking-requests`, { params: filters });
  return Array.isArray(response.data) ? response.data : [];
};

export const getRentalBookingRequest = async (id: string): Promise<RentalBookingRequest> =>
  (await apiClient.get<RentalBookingRequest>(`${BASE}/booking-requests/${id}`)).data;

export const createWalkInRentalBookingRequest = async (data: RentalBookingRequestWalkInCreate): Promise<RentalBookingRequest> =>
  (await apiClient.post<RentalBookingRequest>(`${BASE}/booking-requests`, data)).data;

export const decideRentalBookingRequest = async (id: string, data: RentalBookingRequestDecision): Promise<RentalBookingRequest> =>
  (await apiClient.post<RentalBookingRequest>(`${BASE}/booking-requests/${id}/decision`, data)).data;

export const createAgreementFromRentalBookingRequest = async (id: string): Promise<RentalAgreement> =>
  (await apiClient.post<RentalAgreement>(`${BASE}/booking-requests/${id}/create-agreement`)).data;

export const cancelRentalBookingRequest = async (id: string, reason: string): Promise<RentalBookingRequest> =>
  (await apiClient.post<RentalBookingRequest>(`${BASE}/booking-requests/${id}/cancel`, { reason })).data;
