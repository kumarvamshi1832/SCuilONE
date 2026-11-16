export type BillingCycle = "Monthly" | "Annual";

export interface SubscriptionPlan {
  id: string;
  plan_key: string;
  name: string;
  description: string;
  billing_cycle: string;
  price: string;
  monthly_price: string;
  annual_price: string;
  currency: string;
  global_free_trial_days: number;
  max_users: number;
  max_branches: number;
  storage_limit_gb: number;
  enabled_modules: string[];
  features: string[];
  limits: Record<string, number | string | boolean>;
  is_active: boolean;
}

export interface PlanListResponse {
  global_free_trial_days: number;
  items: SubscriptionPlan[];
  total: number;
}

export interface EffectivePlanResources {
  crm_access_allowed: boolean;
  reason?: string;
  policy_source?: string;
  status: string;
  trial_days?: number;
  plan_key?: string | null;
  plan_name?: string | null;
  max_users: number;
  max_branches: number;
  storage_limit_gb: number;
  storage_limit_bytes: number;
  enabled_modules: string[];
  features: string[];
  limits: {
    leads?: number;
    contacts?: number;
    deals?: number;
    [key: string]: number | string | boolean | undefined;
  };
  usage: {
    active_users: number;
    storage_used_bytes: number;
    leads: number;
    contacts: number;
    deals: number;
  };
}

export interface TenantSubscription {
  subscription_id?: string;
  tenant_id: string;
  company_name: string | null;
  industry?: string | null;
  status: string;
  billing_cycle?: string | null;
  selected_billing_cycle?: string | null;
  auto_renew?: boolean;
  is_complimentary?: boolean;
  is_in_trial?: boolean;
  trial_days?: number;
  trial_days_remaining?: number;
  trial_start_date?: string | null;
  trial_end_date?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  renewal_date?: string | null;
  grace_period_ends_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  activated_at?: string | null;
  crm_access_allowed: boolean;
  access_message?: string | null;
  current_plan: SubscriptionPlan | null;
  selected_plan: SubscriptionPlan | null;
  resources: EffectivePlanResources;
}

export interface SelectedPlanSummary {
  subscription_id: string;
  tenant_id: string;
  status: string;
  current_plan: SubscriptionPlan | null;
  selected_plan: SubscriptionPlan | null;
  selected_billing_cycle?: string | null;
}

export interface PaymentInstructions {
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  ifsc_code?: string;
  upi_id?: string;
  notes?: string;
  [key: string]: string | undefined;
}

export interface BillingInvoice {
  id: string;
  invoice_number: string;
  tenant_id: string;
  company_name: string | null;
  subscription_id: string | null;
  plan_id: string | null;
  plan_name: string | null;
  billing_cycle: string | null;
  invoice_type: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  amount: string;
  tax_amount: string;
  total_amount: string;
  paid_amount: string;
  balance_due: string;
  currency: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  plan_snapshot: Record<string, unknown>;
  payment_instructions: PaymentInstructions;
  created_at: string | null;
}

export interface InvoiceListResponse {
  items: BillingInvoice[];
  total: number;
}

export interface InvoiceDownloadResponse {
  download_ready: boolean;
  document_title: string;
  issuer: string;
  invoice: BillingInvoice;
}

export interface BillingPayment {
  id: string;
  payment_id: string;
  invoice_id: string;
  invoice_number: string | null;
  tenant_id: string;
  company_name: string | null;
  provider: string | null;
  transaction_reference: string;
  amount: string;
  currency: string;
  payment_method: string;
  payment_date: string | null;
  payment_proof_url: string | null;
  payment_proof_filename: string | null;
  status: string;
  submitted_by: string | null;
  submitted_by_name: string | null;
  payment_submitted_at: string | null;
  approved_by: string | null;
  admin_reviewer_name: string | null;
  payment_approved_at: string | null;
  rejection_reason: string | null;
  failure_reason: string | null;
  admin_notes: string | null;
  reconciled: boolean;
  paid_at: string | null;
  created_at: string | null;
}

export interface PaymentListResponse {
  items: BillingPayment[];
  total: number;
}

export interface SelectPlanRequest {
  plan_id?: string;
  plan_key?: string;
  billing_cycle: BillingCycle;
}

export interface SelectPlanResponse {
  message: string;
  subscription: TenantSubscription;
  invoice: BillingInvoice;
  duplicate_prevented: boolean;
}

export interface SubmitManualPaymentRequest {
  invoice_id?: string;
  transaction_reference: string;
  amount: number | string;
  currency?: string;
  payment_method: string;
  payment_date?: string;
  payment_proof_url?: string;
  payment_proof_filename?: string;
  notes?: string;
}

export interface BillingProfile {
  tenant_id: string;
  company_name: string;
  industry?: string | null;
  billing_email: string | null;
  billing_phone: string | null;
  billing_address: string | null;
  gst_number: string | null;
  email_reminders_opt_out: boolean;
}

export interface UpdateBillingProfileRequest {
  company_name?: string;
  billing_email?: string;
  billing_phone?: string;
  billing_address?: string;
  gst_number?: string;
  email_reminders_opt_out?: boolean;
}

export interface CancelSubscriptionRequest {
  reason?: string;
  cancel_immediately: boolean;
}

export interface TenantSupportTicketRequest {
  subject: string;
  description: string;
  category?: string;
  priority?: string;
  requester_name?: string;
  requester_email?: string;
}

export interface TenantSupportTicketResponse {
  message: string;
  ticket_id: string;
  ticket_number: string;
  status: string;
}

export interface SubscriptionEvent {
  id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
}

export interface SubscriptionEventsResponse {
  items: SubscriptionEvent[];
  total: number;
}

export interface UnsubscribeResponse {
  message: string;
  company_name: string;
  email_reminders_opt_out: boolean;
}
