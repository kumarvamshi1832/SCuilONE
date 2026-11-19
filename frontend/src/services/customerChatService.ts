import { apiClient } from "./authService";
import type {
  ChatAssignmentHistoryItem,
  ChatConversation,
  ChatConversationDetail,
  ChatEligibleStaff,
  ChatListParams,
  ChatMessage,
  ChatParticipant,
} from "../types/customerChat";

/**
 * Staff side of customer chat. Uses the CRM `apiClient` (staff access token) only.
 *
 *   GET    /customer-chat/staff                                   customer_chat.manage
 *   GET    /customer-chat/conversations?status&limit&offset       customer_chat.access (limit <= 100)
 *   GET    /customer-chat/conversations/{id}                      customer_chat.access (marks read for participants)
 *   POST   /customer-chat/conversations/{id}/messages             customer_chat.access  { content }
 *   PATCH  /customer-chat/conversations/{id}/assignment           customer_chat.manage  { user_id, reason? }
 *   POST   /customer-chat/conversations/{id}/participants         customer_chat.manage  { user_id }
 *   DELETE /customer-chat/conversations/{id}/participants/{uid}   customer_chat.manage
 *   GET    /customer-chat/conversations/{id}/participants         customer_chat.access
 *   GET    /customer-chat/conversations/{id}/assignment-history   customer_chat.manage
 *   POST   /customer-chat/conversations/{id}/read                 customer_chat.access
 *   PATCH  /customer-chat/conversations/{id}/status               customer_chat.manage  { status: Open|Closed }
 */

const BASE = "/api/v1/customer-chat";

export const getEligibleChatStaff = async (signal?: AbortSignal): Promise<ChatEligibleStaff[]> => {
  const response = await apiClient.get<ChatEligibleStaff[]>(`${BASE}/staff`, { signal });
  return Array.isArray(response.data) ? response.data : [];
};

export const getChatConversations = async (
  params: ChatListParams = {},
  signal?: AbortSignal
): Promise<ChatConversation[]> => {
  const response = await apiClient.get<ChatConversation[]>(`${BASE}/conversations`, {
    params: {
      status: params.status || undefined,
      limit: Math.min(Math.max(params.limit ?? 50, 1), 100),
      offset: Math.max(params.offset ?? 0, 0),
    },
    signal,
  });
  return Array.isArray(response.data) ? response.data : [];
};

export const getChatConversation = async (
  conversationId: string,
  signal?: AbortSignal
): Promise<ChatConversationDetail> => {
  const response = await apiClient.get<ChatConversationDetail>(
    `${BASE}/conversations/${conversationId}`,
    { signal }
  );
  return { ...response.data, messages: response.data.messages ?? [] };
};

export const sendChatMessage = async (conversationId: string, content: string): Promise<ChatMessage> => {
  const response = await apiClient.post<ChatMessage>(`${BASE}/conversations/${conversationId}/messages`, {
    content,
  });
  return response.data;
};

export const markChatConversationRead = async (conversationId: string): Promise<void> => {
  await apiClient.post(`${BASE}/conversations/${conversationId}/read`);
};

export const getChatParticipants = async (
  conversationId: string,
  signal?: AbortSignal
): Promise<ChatParticipant[]> => {
  const response = await apiClient.get<ChatParticipant[]>(
    `${BASE}/conversations/${conversationId}/participants`,
    { signal }
  );
  return Array.isArray(response.data) ? response.data : [];
};

export const getChatAssignmentHistory = async (
  conversationId: string,
  signal?: AbortSignal
): Promise<ChatAssignmentHistoryItem[]> => {
  const response = await apiClient.get<ChatAssignmentHistoryItem[]>(
    `${BASE}/conversations/${conversationId}/assignment-history`,
    { signal }
  );
  return Array.isArray(response.data) ? response.data : [];
};

export const assignChatPrimary = async (
  conversationId: string,
  userId: string,
  reason?: string
): Promise<{ message: string; primary_assignee_user_id: string }> => {
  const trimmed = reason?.trim();
  const response = await apiClient.patch<{ message: string; primary_assignee_user_id: string }>(
    `${BASE}/conversations/${conversationId}/assignment`,
    { user_id: userId, ...(trimmed ? { reason: trimmed } : {}) }
  );
  return response.data;
};

export const addChatParticipant = async (
  conversationId: string,
  userId: string
): Promise<{ message: string; user_id: string }> => {
  const response = await apiClient.post<{ message: string; user_id: string }>(
    `${BASE}/conversations/${conversationId}/participants`,
    { user_id: userId }
  );
  return response.data;
};

export const removeChatParticipant = async (conversationId: string, userId: string): Promise<void> => {
  await apiClient.delete(`${BASE}/conversations/${conversationId}/participants/${userId}`);
};

export const setChatConversationStatus = async (
  conversationId: string,
  status: "Open" | "Closed"
): Promise<{ id: string; status: string }> => {
  const response = await apiClient.patch<{ id: string; status: string }>(
    `${BASE}/conversations/${conversationId}/status`,
    { status }
  );
  return response.data;
};
