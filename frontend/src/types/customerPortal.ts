export interface PortalInviteCreate {
  contact_id: string;
}

export interface PortalInviteResponse {
  portal_user_id: string;
  contact_id: string;
  account_id: string;
  email: string;
  status: string;
  invitation_expires_at: string;
}

export interface CustomerPortalUserRow {
  portal_user_id: string;
  contact_id: string;
  contact_name: string;
  account_id: string;
  account_name: string;
  email: string;
  status: "Invited" | "Active" | "Suspended" | string;
  created_at: string;
  activated_at?: string | null;
  last_login_at?: string | null;
}

export interface PortalActivateRequest {
  token: string;
  password: string;
}

export interface PortalLoginRequest {
  tenant_id: string;
  email: string;
  password: string;
}

export interface PortalAuthCustomer {
  id: string;
  email: string;
  tenant_id: string;
  account_id: string;
  contact_id: string;
}

export interface PortalAuthResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in_minutes: number;
  customer?: PortalAuthCustomer;
}

export interface PortalProfileResponse {
  id: string;
  email: string;
  contact: {
    id: string;
    full_name: string;
  } | null;
  account: {
    id: string;
    name: string;
  } | null;
}

export interface PortalTicketCreate {
  subject: string;
  description: string;
  category: string;
  priority: string;
}

export interface PortalCommentCreate {
  body: string;
}

export interface PortalCommentResponse {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_customer_portal_user_id: string | null;
  body: string;
  created_at: string;
}

export interface PortalTicket {
  id: string;
  ticket_number: string;
  subject: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  requester_name: string;
  account_id: string | null;
  contact_id: string | null;
  software_project_id: string | null;
  resolution: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalTicketDetailResponse extends PortalTicket {
  comments: PortalCommentResponse[];
}

export interface PortalTicketListResponse {
  items: PortalTicket[];
  total: number;
  limit: number;
  offset: number;
}

