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
  tenant_id?: string;
  email: string;
  password: string;
}

export interface PortalForgotPasswordRequest {
  email: string;
  tenant_id?: string;
}

export interface PortalResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface PortalChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface PortalSwitchWorkspaceRequest {
  tenant_id: string;
}

export interface PortalWorkspace {
  tenant_id: string;
  tenant_name: string;
  account_id: string;
  account_name: string;
  is_current: boolean;
}

export interface PortalWorkspacesResponse {
  current_tenant_id: string;
  workspaces: PortalWorkspace[];
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
  workspace?: {
    tenant_id: string;
    tenant_name: string;
  };
}

export interface PortalSwitchWorkspaceResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in_minutes: number;
  customer: PortalAuthCustomer;
  workspace: {
    tenant_id: string;
    tenant_name: string;
  };
}

export interface PortalProfileResponse {
  id: string;
  email: string;
  tenant?: {
    id: string;
    name: string;
    industry?: string;
  } | null;
  contact: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string | null;
    job_title?: string | null;
    address?: string | null;
  } | null;
  account: {
    id: string;
    name: string;
    industry?: string | null;
    website?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  } | null;
}

export interface PortalProfileUpdateRequest {
  full_name?: string | null;
  phone?: string | null;
  job_title?: string | null;
  address?: string | null;
}

/* ─── Dashboard Unified Response ─── */
export interface PortalDashboardResponse {
  support: {
    total_tickets: number;
    open_tickets: number;
    waiting_on_customer: number;
    resolved_or_closed_tickets: number;
  };
  commercial_and_delivery: {
    total_estimates: number;
    pending_approval_estimates: number;
    total_contracts: number;
    pending_signature_contracts: number;
    active_contracts: number;
    total_projects: number;
    active_projects: number;
  };
  billing: {
    total_invoices: number;
    overdue_invoices: number;
    total_invoiced: string;
    total_paid: string;
    outstanding_balance: string;
  };
  real_estate: {
    total_bookings: number;
    active_bookings: number;
  };
  documents: {
    shared_documents: number;
  };
}

/* ─── Support Tickets ─── */
export interface PortalTicketCreate {
  subject: string;
  description: string;
  category: string;
  priority: string;
  software_project_id?: string | null;
}

export interface PortalTicketDecisionRequest {
  comment?: string | null;
}

export interface PortalCommentCreate {
  body: string;
}

export interface PortalCommentResponse {
  id: string;
  ticket_id: string;
  author_type: "customer" | "support" | string;
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

/* ─── Estimates ─── */
export interface PortalEstimateItem {
  id: string;
  item_name: string;
  description: string | null;
  quantity: number | string;
  unit_price: number | string;
  discount_percent: number | string;
  tax_percent: number | string;
  line_subtotal: number | string;
  line_discount: number | string;
  line_tax: number | string;
  line_total: number | string;
  sort_order: number;
}

export interface PortalEstimate {
  id: string;
  estimate_number: string;
  revision_number: number;
  title: string;
  description: string | null;
  billing_type: string;
  hourly_rate: number | string | null;
  currency: string;
  issue_date: string;
  expiry_date: string | null;
  subtotal: number | string;
  discount_amount: number | string;
  tax_amount: number | string;
  total_amount: number | string;
  status: string;
  terms_and_conditions: string | null;
  created_at: string;
  updated_at: string;
  items: PortalEstimateItem[];
}

export interface PortalEstimateDecisionRequest {
  notes?: string | null;
}

/* ─── Contracts ─── */
export interface PortalContractMilestone {
  id: string;
  sequence: number;
  name: string;
  percentage: number | string;
  amount: number | string;
  trigger_description: string | null;
  status: string;
  invoice_id: string | null;
}

export interface PortalContract {
  id: string;
  contract_number: string;
  software_estimate_id: string;
  title: string;
  description: string | null;
  currency: string;
  billing_type: string;
  hourly_rate: number | string | null;
  contract_value: number | string;
  issue_date: string;
  start_date: string | null;
  end_date: string | null;
  signed_date: string | null;
  status: string;
  scope_of_work: string;
  deliverables: string;
  exclusions: string | null;
  assumptions: string | null;
  acceptance_criteria: string | null;
  payment_terms: string | null;
  milestone_billing_mode: string;
  terms_and_conditions: string | null;
  created_at: string;
  updated_at: string;
  payment_milestones: PortalContractMilestone[];
}

export interface PortalContractSignRequest {
  signer_name: string;
  signer_title?: string | null;
  notes?: string | null;
}

/* ─── Projects & Sprints ─── */
export interface PortalSprint {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  start_date: string;
  end_date: string;
}

export interface PortalProject {
  id: string;
  project_number: string;
  software_contract_id: string;
  name: string;
  description: string | null;
  scope_of_work: string;
  deliverables: string;
  status: string;
  priority: string;
  currency: string;
  start_date: string | null;
  target_end_date: string | null;
  actual_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalProjectDetailResponse extends PortalProject {
  sprints: PortalSprint[];
}

/* ─── Invoices & Billing ─── */
export interface PortalInvoiceItem {
  id: string;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  tax_percent: number | string;
  line_subtotal: number | string;
  line_tax: number | string;
  line_total: number | string;
}

export interface PortalInvoicePayment {
  id: string;
  amount: number | string;
  payment_method: string;
  transaction_reference: string | null;
  payment_date: string;
  status: string;
  created_at: string;
}

export interface PortalCreditNote {
  id: string;
  credit_note_number: string;
  issue_date: string;
  amount: number | string;
  reason: string;
  created_at: string;
}

export interface PortalInvoice {
  id: string;
  project_id: string;
  software_contract_id: string;
  invoice_number: string;
  currency: string;
  issue_date: string;
  due_date: string | null;
  status: string;
  subtotal: number | string;
  tax_total: number | string;
  total_amount: number | string;
  amount_paid: number | string;
  credited_amount: number | string;
  balance_due: number | string;
  is_overdue: boolean;
  days_overdue: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  items: PortalInvoiceItem[];
  payments: PortalInvoicePayment[];
  credit_notes: PortalCreditNote[];
}

/* ─── Documents ─── */
export interface PortalDocument {
  id: string;
  title: string;
  filename: string;
  document_type: string;
  file_url: string;
  content_type: string;
  file_size: number;
  description: string | null;
  version_number: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/* ─── Real Estate ─── */
export interface PortalBookingProperty {
  id: string;
  name: string;
  property_type?: string;
  listing_type?: string;
  unit_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  area?: string | null;
  area_unit?: string | null;
  currency?: string | null;
}

export interface PortalInstallment {
  id: string;
  sequence: number;
  name: string;
  amount: string;
  due_date: string;
  status: string;
}

export interface PortalPaymentPlan {
  id: string;
  total_amount: string;
  status: string;
  installments: PortalInstallment[];
}

export interface PortalPayment {
  id: string;
  amount: string;
  payment_method: string;
  transaction_reference?: string | null;
  status: string;
  payment_date?: string | null;
  verified_at?: string | null;
}

export interface PortalBooking {
  id: string;
  booking_number?: string;
  property_id?: string;
  property_title?: string;
  status: string;
  booking_date?: string;
  buyer_name?: string;
  buyer_email?: string;
  buyer_phone?: string;
  payment_preference?: string;
  booking_amount?: string;
  agreed_price?: string;
  verified_paid_amount?: string;
  remaining_balance?: string;
  refund_amount?: string;
  cancellation_reason?: string | null;
  property?: PortalBookingProperty | null;
  payment_plan?: PortalPaymentPlan | null;
  payments?: PortalPayment[];
  total_amount?: number | string;
  created_at?: string;
}

export interface PortalSiteVisitProperty {
  id: string;
  name: string;
  property_type?: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

export interface PortalSiteVisit {
  id: string;
  property_id?: string;
  property_title?: string;
  scheduled_at?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  status: string;
  property?: PortalSiteVisitProperty | null;
  created_at?: string;
}
