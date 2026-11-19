import { portalApiClient } from "./customerPortalAuthService";
import type { ChatConversationDetail, ChatMessage } from "../types/customerChat";

/**
 * Customer side of chat. Uses `portalApiClient` (customer portal token) only - never the staff client.
 * Tenant and customer ownership always come from the portal token.
 *
 *   GET  /api/v1/customer-portal/chat/conversation   404 until staff set the conversation up; marks it read
 *   POST /api/v1/customer-portal/chat/messages       { content }; 409 when closed or the contact person is being reassigned
 *   POST /api/v1/customer-portal/chat/read
 */

const BASE = "/api/v1/customer-portal/chat";

export const getPortalChatConversation = async (signal?: AbortSignal): Promise<ChatConversationDetail> => {
  const response = await portalApiClient.get<ChatConversationDetail>(`${BASE}/conversation`, { signal });
  return { ...response.data, messages: response.data.messages ?? [] };
};

export const sendPortalChatMessage = async (content: string): Promise<ChatMessage> => {
  const response = await portalApiClient.post<ChatMessage>(`${BASE}/messages`, { content });
  return response.data;
};

export const markPortalChatRead = async (): Promise<void> => {
  await portalApiClient.post(`${BASE}/read`);
};
