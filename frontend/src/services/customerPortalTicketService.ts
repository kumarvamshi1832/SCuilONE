import { portalApiClient } from "./customerPortalAuthService";
import type {
  PortalTicket,
  PortalTicketCreate,
  PortalTicketDetailResponse,
  PortalTicketListResponse,
  PortalCommentCreate,
  PortalCommentResponse,
} from "../types/customerPortal";

const BASE_URL = "/api/v1/customer-portal/tickets";

export interface PortalTicketQueryParams {
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const getPortalTickets = async (
  params?: PortalTicketQueryParams
): Promise<PortalTicketListResponse> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.priority) query.append("priority", params.priority);
  if (params?.category) query.append("category", params.category);
  if (params?.search) query.append("search", params.search);
  if (params?.limit !== undefined) query.append("limit", String(params.limit));
  if (params?.offset !== undefined) query.append("offset", String(params.offset));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;
  const response = await portalApiClient.get<PortalTicketListResponse>(url);
  return response.data;
};

export const getPortalTicket = async (
  ticketId: string
): Promise<PortalTicketDetailResponse> => {
  const response = await portalApiClient.get<PortalTicketDetailResponse>(
    `${BASE_URL}/${ticketId}`
  );
  return response.data;
};

export const createPortalTicket = async (
  data: PortalTicketCreate
): Promise<PortalTicket> => {
  const response = await portalApiClient.post<PortalTicket>(BASE_URL, data);
  return response.data;
};

export const getPortalTicketComments = async (
  ticketId: string
): Promise<PortalCommentResponse[]> => {
  const response = await portalApiClient.get<PortalCommentResponse[]>(
    `${BASE_URL}/${ticketId}/comments`
  );
  return response.data;
};

export const addPortalTicketComment = async (
  ticketId: string,
  data: PortalCommentCreate
): Promise<PortalCommentResponse> => {
  const response = await portalApiClient.post<PortalCommentResponse>(
    `${BASE_URL}/${ticketId}/comments`,
    data
  );
  return response.data;
};

export const closePortalTicket = async (
  ticketId: string,
  comment?: string | null
): Promise<PortalTicket> => {
  const response = await portalApiClient.post<PortalTicket>(
    `${BASE_URL}/${ticketId}/close`,
    comment ? { comment } : {}
  );
  return response.data;
};

export const reopenPortalTicket = async (
  ticketId: string,
  comment: string
): Promise<PortalTicket> => {
  const response = await portalApiClient.post<PortalTicket>(
    `${BASE_URL}/${ticketId}/reopen`,
    { comment }
  );
  return response.data;
};
