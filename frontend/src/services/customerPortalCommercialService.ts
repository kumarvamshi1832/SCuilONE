import { portalApiClient } from "./customerPortalAuthService";
import type {
  PortalEstimate,
  PortalEstimateDecisionRequest,
  PortalContract,
  PortalContractSignRequest,
  PortalProject,
  PortalProjectDetailResponse,
  PortalInvoice,
  PortalDocument,
  PortalBooking,
  PortalSiteVisit,
} from "../types/customerPortal";

/* ─── Estimates ─── */
export const getPortalEstimates = async (
  status?: string
): Promise<PortalEstimate[]> => {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await portalApiClient.get<PortalEstimate[]>(
    `/api/v1/customer-portal/estimates${params}`
  );
  return response.data;
};

export const getPortalEstimate = async (
  estimateId: string
): Promise<PortalEstimate> => {
  const response = await portalApiClient.get<PortalEstimate>(
    `/api/v1/customer-portal/estimates/${estimateId}`
  );
  return response.data;
};

export const acceptPortalEstimate = async (
  estimateId: string,
  notes?: string | null
): Promise<PortalEstimate> => {
  const payload: PortalEstimateDecisionRequest = notes ? { notes } : {};
  const response = await portalApiClient.post<PortalEstimate>(
    `/api/v1/customer-portal/estimates/${estimateId}/accept`,
    payload
  );
  return response.data;
};

export const rejectPortalEstimate = async (
  estimateId: string,
  notes?: string | null
): Promise<PortalEstimate> => {
  const payload: PortalEstimateDecisionRequest = notes ? { notes } : {};
  const response = await portalApiClient.post<PortalEstimate>(
    `/api/v1/customer-portal/estimates/${estimateId}/reject`,
    payload
  );
  return response.data;
};

/* ─── Contracts ─── */
export const getPortalContracts = async (): Promise<PortalContract[]> => {
  const response = await portalApiClient.get<PortalContract[]>(
    "/api/v1/customer-portal/contracts"
  );
  return response.data;
};

export const getPortalContract = async (
  contractId: string
): Promise<PortalContract> => {
  const response = await portalApiClient.get<PortalContract>(
    `/api/v1/customer-portal/contracts/${contractId}`
  );
  return response.data;
};

export const signPortalContract = async (
  contractId: string,
  data: PortalContractSignRequest
): Promise<PortalContract> => {
  const response = await portalApiClient.post<PortalContract>(
    `/api/v1/customer-portal/contracts/${contractId}/sign`,
    data
  );
  return response.data;
};

/* ─── Projects & Sprints ─── */
export const getPortalProjects = async (): Promise<PortalProject[]> => {
  const response = await portalApiClient.get<PortalProject[]>(
    "/api/v1/customer-portal/projects"
  );
  return response.data;
};

export const getPortalProject = async (
  projectId: string
): Promise<PortalProjectDetailResponse> => {
  const response = await portalApiClient.get<PortalProjectDetailResponse>(
    `/api/v1/customer-portal/projects/${projectId}`
  );
  return response.data;
};

/* ─── Invoices & Billing ─── */
export const getPortalInvoices = async (): Promise<PortalInvoice[]> => {
  const response = await portalApiClient.get<PortalInvoice[]>(
    "/api/v1/customer-portal/invoices"
  );
  return response.data;
};

export const getPortalInvoice = async (
  invoiceId: string
): Promise<PortalInvoice> => {
  const response = await portalApiClient.get<PortalInvoice>(
    `/api/v1/customer-portal/invoices/${invoiceId}`
  );
  return response.data;
};

/* ─── Documents ─── */
export const getPortalDocuments = async (): Promise<PortalDocument[]> => {
  const response = await portalApiClient.get<PortalDocument[]>(
    "/api/v1/customer-portal/documents"
  );
  return response.data;
};

/* ─── Real Estate ─── */
export const getPortalBookings = async (): Promise<PortalBooking[]> => {
  const response = await portalApiClient.get<PortalBooking[]>(
    "/api/v1/customer-portal/bookings"
  );
  return response.data;
};

export const getPortalBooking = async (
  bookingId: string
): Promise<PortalBooking> => {
  const response = await portalApiClient.get<PortalBooking>(
    `/api/v1/customer-portal/bookings/${bookingId}`
  );
  return response.data;
};

export const getPortalSiteVisits = async (): Promise<PortalSiteVisit[]> => {
  const response = await portalApiClient.get<PortalSiteVisit[]>(
    "/api/v1/customer-portal/site-visits"
  );
  return response.data;
};