export type TicketStatus =
  | "Open"
  | "In Progress"
  | "Waiting on Customer"
  | "Resolved"
  | "Closed";

export type TicketPriority = "Low" | "Medium" | "High" | "Urgent";

export type TicketSource =
  | "CRM"
  | "Email"
  | "Phone"
  | "Client Portal"
  | "Other";

export type TicketCategory =
  | "General"
  | "Bug"
  | "Technical Support"
  | "Billing"
  | "Feature Request"
  | "Account Access"
  | "Other";

export interface SupportTicketComment {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_customer_portal_user_id?: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface SupportTicketCommentCreate {
  body: string;
  is_internal?: boolean;
}

export interface SupportTicket {
  id: string;
  tenant_id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  requester_name: string;
  requester_email: string | null;
  account_id: string | null;
  contact_id: string | null;
  software_project_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  resolution: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketCreate {
  subject: string;
  description: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  source?: TicketSource;
  requester_name: string;
  requester_email?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  software_project_id?: string | null;
  assigned_to?: string | null;
}

export interface SupportTicketUpdate {
  subject?: string;
  description?: string;
  category?: TicketCategory;
  status?: TicketStatus;
  priority?: TicketPriority;
  source?: TicketSource;
  requester_name?: string;
  requester_email?: string | null;
  account_id?: string | null;
  contact_id?: string | null;
  software_project_id?: string | null;
  assigned_to?: string | null;
  resolution?: string | null;
}

export interface SupportTicketDetailResponse extends SupportTicket {
  comments: SupportTicketComment[];
}

export interface SupportTicketListResponse {
  items: SupportTicket[];
  total: number;
  limit: number;
  offset: number;
}

export interface SupportTicketFilterParams {
  status?: string;
  priority?: string;
  assigned_to?: string;
  account_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

