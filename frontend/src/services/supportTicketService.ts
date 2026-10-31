import { apiClient } from "./authService";
import type {
  SupportTicket,
  SupportTicketCreate,
  SupportTicketUpdate,
  SupportTicketDetailResponse,
  SupportTicketListResponse,
  SupportTicketComment,
  SupportTicketCommentCreate,
  SupportTicketFilterParams,
} from "../types/supportTicket";

const BASE_URL = "/api/v1/support-tickets";

export const getSupportTickets = async (
  params?: SupportTicketFilterParams
): Promise<SupportTicketListResponse> => {
  const query = new URLSearchParams();
  if (params?.status) query.append("status", params.status);
  if (params?.priority) query.append("priority", params.priority);
  if (params?.assigned_to) query.append("assigned_to", params.assigned_to);
  if (params?.account_id) query.append("account_id", params.account_id);
  if (params?.search) query.append("search", params.search);
  if (params?.limit !== undefined) query.append("limit", String(params.limit));
  if (params?.offset !== undefined) query.append("offset", String(params.offset));

  const qs = query.toString();
  const url = qs ? `${BASE_URL}?${qs}` : BASE_URL;
  const response = await apiClient.get<SupportTicketListResponse>(url);
  return response.data;
};

export const getSupportTicket = async (
  ticketId: string
): Promise<SupportTicketDetailResponse> => {
  const response = await apiClient.get<SupportTicketDetailResponse>(
    `${BASE_URL}/${ticketId}`
  );
  return response.data;
};

export const createSupportTicket = async (
  data: SupportTicketCreate
): Promise<SupportTicket> => {
  const response = await apiClient.post<SupportTicket>(BASE_URL, data);
  return response.data;
};

export const updateSupportTicket = async (
  ticketId: string,
  data: SupportTicketUpdate
): Promise<SupportTicket> => {
  const response = await apiClient.patch<SupportTicket>(
    `${BASE_URL}/${ticketId}`,
    data
  );
  return response.data;
};

export const deleteSupportTicket = async (ticketId: string): Promise<void> => {
  await apiClient.delete(`${BASE_URL}/${ticketId}`);
};

export const addSupportTicketComment = async (
  ticketId: string,
  data: SupportTicketCommentCreate
): Promise<SupportTicketComment> => {
  const response = await apiClient.post<SupportTicketComment>(
    `${BASE_URL}/${ticketId}/comments`,
    data
  );
  return response.data;
};

