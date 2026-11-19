/**
 * E-mail logs. Mirrors backend/app/routes/email_logs.py and services/email_log_service.py.
 * Timestamps are naive UTC - format them with utils/messageTime.ts.
 */

export const EMAIL_DIRECTIONS = ["Inbound", "Outbound"] as const;
export type EmailDirection = (typeof EMAIL_DIRECTIONS)[number];

/** Sent / Failed come from the SMTP send endpoint, Logged from manual logging, Received from the inbound webhook. */
export type EmailStatus = "Sent" | "Failed" | "Logged" | "Received" | string;
export type EmailSource = "smtp" | "manual" | "webhook" | string;

export const EMAIL_LINK_ENTITIES = ["lead", "contact", "account", "deal"] as const;
export type EmailLinkEntity = (typeof EMAIL_LINK_ENTITIES)[number];

export interface EmailLinks {
  lead_id?: string | null;
  contact_id?: string | null;
  account_id?: string | null;
  deal_id?: string | null;
}

/** Item of GET /api/v1/emails. */
export interface EmailSummary extends EmailLinks {
  id: string;
  direction: EmailDirection | string;
  status: EmailStatus;
  source: EmailSource;
  subject: string;
  body_preview: string;
  from_email: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  thread_id: string;
  occurred_at: string;
  sent_by: string | null;
}

/** GET /emails/{id}, GET /emails/threads/{thread_id}, POST /emails/send and POST /emails/log. */
export interface EmailDetail extends EmailSummary {
  body_text: string;
  message_id: string | null;
  in_reply_to: string | null;
  error_message: string | null;
}

export interface EmailListParams extends EmailLinks {
  direction?: EmailDirection;
  unlinked?: boolean;
  q?: string;
  skip?: number;
  limit?: number;
}

/** POST /emails/send */
export interface EmailSendInput extends EmailLinks {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  in_reply_to_email_id?: string | null;
}

/** POST /emails/log */
export interface EmailLogInput extends EmailLinks {
  direction: EmailDirection;
  subject: string;
  body_text: string;
  from_email?: string | null;
  to_emails: string[];
  cc_emails: string[];
  message_id?: string | null;
  in_reply_to?: string | null;
  occurred_at?: string | null;
}

/** GET /emails/webhook-info (email.manage). Contains a secret token - never shown to ordinary users. */
export interface EmailWebhookInfo {
  method: string;
  path: string;
  auth_header: string;
  token: string;
  payload_example: Record<string, unknown>;
}

/** Backend limits, used for client-side validation. */
export const EMAIL_LIMITS = {
  sendRecipients: 10,
  logRecipients: 20,
  subjectSend: 200,
  subjectLog: 500,
  bodySend: 20_000,
  bodyLog: 100_000,
  messageId: 255,
} as const;
