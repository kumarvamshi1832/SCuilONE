import { apiClient } from "./authService";
import type {
  EmailDetail,
  EmailListParams,
  EmailLinks,
  EmailLogInput,
  EmailSendInput,
  EmailSummary,
  EmailWebhookInfo,
} from "../types/emailLog";

/**
 * E-mail management. Backend: /api/v1/emails (staff access token).
 *   GET    /emails                  email.view    filters: lead_id, contact_id, account_id, deal_id, direction, unlinked, q, skip, limit<=100
 *   GET    /emails/threads/{id}     email.view    oldest first
 *   GET    /emails/{id}             email.view
 *   POST   /emails/log              email.create  record an e-mail sent/received outside the CRM
 *   POST   /emails/send             email.create  real SMTP send; a failure returns 502 and stores a "Failed" e-mail
 *   PUT    /emails/{id}/link        email.create  replaces all four links (omitted = cleared)
 *   DELETE /emails/{id}             email.delete  204
 *   GET    /emails/webhook-info     email.manage  contains a secret token
 */

const BASE = "/api/v1/emails";

let backendEmailsAvailable: boolean | null = null;

export const isEmailsSupported = (): boolean => backendEmailsAvailable !== false;

/** Drops empty values so optional filters/links are not sent as empty strings (the API expects UUIDs). */
const compactLinks = (links: EmailLinks): Record<string, string> => {
  const out: Record<string, string> = {};
  (["lead_id", "contact_id", "account_id", "deal_id"] as const).forEach((key) => {
    const value = links[key];
    if (value) out[key] = value;
  });
  return out;
};

export const getEmails = async (params: EmailListParams = {}, signal?: AbortSignal): Promise<EmailSummary[]> => {
  if (backendEmailsAvailable === false) {
    return [];
  }
  try {
    const response = await apiClient.get<EmailSummary[]>(BASE, {
      params: {
        ...compactLinks(params),
        direction: params.direction || undefined,
        unlinked: params.unlinked ? true : undefined,
        q: params.q?.trim() || undefined,
        skip: Math.max(params.skip ?? 0, 0),
        limit: Math.min(Math.max(params.limit ?? 25, 1), 100),
      },
      signal,
    });
    backendEmailsAvailable = true;
    return Array.isArray(response.data) ? response.data : [];
  } catch (err: any) {
    if (err?.response?.status === 404) {
      backendEmailsAvailable = false;
      return [];
    }
    throw err;
  }
};

export const getEmail = async (emailId: string, signal?: AbortSignal): Promise<EmailDetail> => {
  if (backendEmailsAvailable === false) {
    throw new Error("Email service is currently not registered on the backend.");
  }
  const response = await apiClient.get<EmailDetail>(`${BASE}/${emailId}`, { signal });
  return response.data;
};

export const getEmailThread = async (threadId: string, signal?: AbortSignal): Promise<EmailDetail[]> => {
  if (backendEmailsAvailable === false) {
    return [];
  }
  try {
    const response = await apiClient.get<EmailDetail[]>(`${BASE}/threads/${encodeURIComponent(threadId)}`, { signal });
    return Array.isArray(response.data) ? response.data : [];
  } catch (err: any) {
    if (err?.response?.status === 404) {
      backendEmailsAvailable = false;
      return [];
    }
    throw err;
  }
};

export const sendEmail = async (input: EmailSendInput): Promise<EmailDetail> => {
  if (backendEmailsAvailable === false) {
    throw new Error("Email integration is currently not enabled on this server.");
  }
  const response = await apiClient.post<EmailDetail>(`${BASE}/send`, {
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    body: input.body,
    in_reply_to_email_id: input.in_reply_to_email_id || undefined,
    ...compactLinks(input),
  });
  return response.data;
};

export const logEmail = async (input: EmailLogInput): Promise<EmailDetail> => {
  if (backendEmailsAvailable === false) {
    throw new Error("Email integration is currently not enabled on this server.");
  }
  const response = await apiClient.post<EmailDetail>(`${BASE}/log`, {
    direction: input.direction,
    subject: input.subject,
    body_text: input.body_text,
    from_email: input.from_email?.trim() || undefined,
    to_emails: input.to_emails,
    cc_emails: input.cc_emails,
    message_id: input.message_id?.trim() || undefined,
    in_reply_to: input.in_reply_to?.trim() || undefined,
    occurred_at: input.occurred_at || undefined,
    ...compactLinks(input),
  });
  return response.data;
};

/** Replaces every link of the e-mail: a link that is not passed is removed. */
export const relinkEmail = async (emailId: string, links: EmailLinks): Promise<EmailSummary> => {
  const response = await apiClient.put<EmailSummary>(`${BASE}/${emailId}/link`, compactLinks(links));
  return response.data;
};

export const deleteEmail = async (emailId: string): Promise<void> => {
  await apiClient.delete(`${BASE}/${emailId}`);
};

export const getEmailWebhookInfo = async (): Promise<EmailWebhookInfo> => {
  const response = await apiClient.get<EmailWebhookInfo>(`${BASE}/webhook-info`);
  return response.data;
};

/** True when a send failed on the mail server side. The backend still stored the e-mail as "Failed". */
export const isSmtpFailure = (err: unknown): boolean =>
  (err as { response?: { status?: number } })?.response?.status === 502;
