/**
 * Customer chat. Mirrors backend/app/routes/customer_chat.py.
 *   Staff CRM  : /api/v1/customer-chat            (staff access token)
 *   Customer   : /api/v1/customer-portal/chat     (customer portal token)
 */

/** Statuses written by the backend. "Needs Reassignment" is set when a customer writes to a conversation without an active owner. */
export const CHAT_STATUS_FILTERS = ["Open", "Closed"] as const;
export type ChatStatusFilter = (typeof CHAT_STATUS_FILTERS)[number];
export type ChatConversationStatus = ChatStatusFilter | "Needs Reassignment" | string;

export type ChatSenderType = "Customer" | "Staff" | string;

export interface ChatMessage {
  id: string;
  sender_type: ChatSenderType;
  sender_user_id: string | null;
  sender_portal_user_id: string | null;
  content: string;
  created_at: string;
  edited_at: string | null;
}

export interface ChatPrimaryAssignee {
  id: string;
  name: string;
}

/** Item of GET /conversations and the base of GET /conversations/{id}. */
export interface ChatConversation {
  id: string;
  tenant_id: string;
  portal_user_id: string;
  customer_name: string | null;
  customer_email: string | null;
  account_id: string;
  account_name: string | null;
  original_inviter_user_id: string | null;
  primary_assignee: ChatPrimaryAssignee | null;
  status: ChatConversationStatus;
  last_message_at: string | null;
  created_at: string;
  /** Present on the staff list only. */
  unread_count?: number;
}

export interface ChatConversationDetail extends ChatConversation {
  messages: ChatMessage[];
}

/** Item of GET /staff (customer_chat.manage). */
export interface ChatEligibleStaff {
  id: string;
  full_name: string;
  email: string;
}

/** Item of GET /conversations/{id}/participants. */
export interface ChatParticipant {
  user_id: string;
  full_name: string;
  email: string;
  is_inviter: boolean;
  is_primary: boolean;
  status: string;
}

/** Item of GET /conversations/{id}/assignment-history (customer_chat.manage). */
export interface ChatAssignmentHistoryItem {
  id: string;
  previous_assignee_user_id: string | null;
  new_assignee_user_id: string | null;
  changed_by_user_id: string | null;
  reason: string | null;
  created_at: string;
}

export interface ChatListParams {
  status?: ChatStatusFilter | "Needs Reassignment";
  limit?: number;
  offset?: number;
}

export const CHAT_MESSAGE_MAX_LENGTH = 10000;
export const CHAT_ASSIGNMENT_REASON_MAX_LENGTH = 500;
