import { portalApiClient } from "./customerPortalAuthService";
import type {
  ActivityTimeline,
  CancellationRequest,
  LifecycleOverview,
  RefundRequest,
  RefundRequestCreate,
  ServiceRequest,
  ServiceRequestCreate,
} from "../types/customerLifecycle";

/**
 * Customer-side cancellation, refund, after-sales and timeline endpoints (portal client, customer token).
 * The backend scopes every call to the signed-in customer's own bookings (journey + booking must match): another
 * customer's id returns 404. Backend: backend/app/routes/customer_portal_lifecycle.py
 *
 *   POST /bookings/{id}/cancellation-requests   { reason (10+) }   only Pending / Confirmed bookings, one Pending request at a time
 *   GET  /cancellation-requests                 all of the customer's cancellation requests
 *   POST /bookings/{id}/refund-requests         { payment_id, amount, reason (10+) }  Verified payment, within the refundable balance,
 *                                               not after the sale is Completed. Staff still review and process it.
 *   GET  /bookings/{id}/refund-requests
 *   POST /bookings/{id}/service-requests        { category, subject, description (10+), priority }  only after the sale is Completed
 *   GET  /service-requests · GET /service-requests/{id}
 *   GET  /activity-timeline?limit= · GET /lifecycle-overview
 */
const BASE = "/api/v1/customer-portal";

export const createCancellationRequest = async (bookingId: string, reason: string): Promise<CancellationRequest> =>
  (await portalApiClient.post<CancellationRequest>(`${BASE}/bookings/${bookingId}/cancellation-requests`, { reason })).data;

export const getCancellationRequests = async (): Promise<CancellationRequest[]> => {
  const response = await portalApiClient.get<CancellationRequest[]>(`${BASE}/cancellation-requests`);
  return Array.isArray(response.data) ? response.data : [];
};

export const createRefundRequest = async (bookingId: string, data: RefundRequestCreate): Promise<RefundRequest> =>
  (await portalApiClient.post<RefundRequest>(`${BASE}/bookings/${bookingId}/refund-requests`, data)).data;

export const getRefundRequests = async (bookingId: string): Promise<RefundRequest[]> => {
  const response = await portalApiClient.get<RefundRequest[]>(`${BASE}/bookings/${bookingId}/refund-requests`);
  return Array.isArray(response.data) ? response.data : [];
};

export const createServiceRequest = async (bookingId: string, data: ServiceRequestCreate): Promise<ServiceRequest> =>
  (await portalApiClient.post<ServiceRequest>(`${BASE}/bookings/${bookingId}/service-requests`, data)).data;

export const getServiceRequests = async (): Promise<ServiceRequest[]> => {
  const response = await portalApiClient.get<ServiceRequest[]>(`${BASE}/service-requests`);
  return Array.isArray(response.data) ? response.data : [];
};

export const getServiceRequest = async (id: string): Promise<ServiceRequest> =>
  (await portalApiClient.get<ServiceRequest>(`${BASE}/service-requests/${id}`)).data;

export const getActivityTimeline = async (limit = 100): Promise<ActivityTimeline> =>
  (await portalApiClient.get<ActivityTimeline>(`${BASE}/activity-timeline`, { params: { limit } })).data;

export const getLifecycleOverview = async (): Promise<LifecycleOverview> =>
  (await portalApiClient.get<LifecycleOverview>(`${BASE}/lifecycle-overview`)).data;
