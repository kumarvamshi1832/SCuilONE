export interface PlatformUserSummary {
  id: string;
  user_id?: string;
  employee_id?: string;
  employee_code?: string;
  full_name?: string;
  name?: string;
  email: string;
  phone?: string | null;
  job_title?: string | null;
  status: string;
  availability_status?: string;
  role: string;
  role_key?: string;
  role_scope?: "platform" | "industry_team" | string;
  industry_type?: string | null;
  industry_key?: string | null;
  department?: string | null;
  max_ticket_load?: number;
  current_ticket_load?: number;
  manager_user_id?: string | null;
  must_change_password?: boolean;
  profile_completed?: boolean;
  mfa_enabled?: boolean;
  last_login_at?: string | null;
  created_at?: string | null;
}

export interface PlatformLoginResponse {
  message: string;
  account_type?: "platform";
  mfa_required: boolean;
  mfa_setup_required: boolean;
  mfa_token: string;
  next_step: "mfa_enrollment" | "mfa_verification" | string;
  must_change_password: boolean;
  user: PlatformUserSummary;
  role: string;
  employee?: PlatformEmployee;
}

export interface PlatformMfaEnrollStartResponse {
  message: string;
  secret: string;
  otpauth_url: string;
  issuer: string;
  account: string;
  dev_code?: string;
}

export interface PlatformMfaVerifyResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: PlatformUserSummary;
  tenant?: any;
  role: string;
  permissions: string[];
  recovery_codes?: string[];
}

export interface PlatformSidebarModuleItem {
  key: string;
  label: string;
  purpose?: string;
}

export type PlatformSidebarModule = PlatformSidebarModuleItem | string;

export interface PlatformFirstPasswordResponse {
  message: string;
  access_token: string;
  token_type: string;
  must_change_password: boolean;
  next_step: string;
  employee: PlatformEmployee;
  dashboard: PlatformDashboardPayload;
  sidebar_modules: PlatformSidebarModule[];
  permissions: string[];
}

export interface PlatformEmployee {
  id?: string;
  employee_id?: string;
  user_id: string;
  employee_code: string;
  full_name: string;
  email: string;
  phone?: string | null;
  job_title?: string | null;
  role: string;
  role_scope: "platform" | "industry_team" | string;
  industry_key?: string | null;
  industry_type?: string | null;
  department?: string | null;
  status: "Active" | "Inactive" | "Suspended" | string;
  availability_status: "Available" | "Busy" | "Offline" | "On Leave" | string;
  max_ticket_load: number;
  active_ticket_load?: number;
  current_ticket_load?: number;
  industry_team_id?: string | null;
  industry_team_name?: string | null;
  is_platform_owner?: boolean;
  manager_user_id?: string | null;
  must_change_password?: boolean;
  mfa_enabled?: boolean;
  dashboard?: {
    dashboard_key: string;
    dashboard_title: string;
    dashboard_category?: string;
  };
  last_login_at?: string | null;
  created_at?: string | null;
  permissions?: string[];
}

export interface PlatformMeResponse {
  employee: PlatformEmployee;
  dashboard: PlatformDashboardPayload;
  sidebar_modules: PlatformSidebarModule[];
  permissions: string[];
}

export interface PlatformRoleDefinition {
  key: string;
  name: string;
  responsibility: string;
  dashboard_key: string;
  dashboard_title: string;
  role_scope: "platform" | "industry_team" | string;
  reused_across_industries?: string[];
  permissions: string[];
  sidebar_modules: PlatformSidebarModule[];
}

export interface PlatformPermissionMeta {
  name: string;
  description: string;
}

export interface PlatformRolesResponse {
  central_platform_roles: PlatformRoleDefinition[];
  reusable_industry_roles: PlatformRoleDefinition[];
  available_permissions: PlatformPermissionMeta[];
}

export interface PlatformIndustryMeta {
  industry_key: string;
  name: string;
  description?: string;
}

export interface PlatformIndustryRoleSlot {
  role_name: string;
  role_key?: string;
  filled?: boolean;
  is_vacant?: boolean;
  employee_count?: number;
  members?: Array<{
    user_id: string;
    employee_code?: string;
    full_name: string;
    email: string;
    status: string;
    availability_status?: string;
  }>;
}

export interface PlatformIndustryTeam {
  id: string;
  industry_key: string;
  name: string;
  description: string;
  is_active: boolean;
  max_members: number;
  active_members_count: number;
  vacancies_count: number;
  vacant_roles: string[];
  role_slots: PlatformIndustryRoleSlot[] | Record<string, any>;
  members: Array<{
    user_id: string;
    employee_code?: string;
    full_name: string;
    email: string;
    role: string;
    status: string;
    availability_status?: string;
  }>;
  manager_user_id?: string | null;
  team_admin_user_id?: string | null;
  sla_response_minutes: number;
  sla_resolution_hours: number;
  allocated_budget: string;
  spent_budget: string;
  remaining_budget: string;
  open_tickets_workload: number;
  registered_companies_count: number;
  config_json: Record<string, any>;
}

export interface PlatformTenantSubscriptionSummary {
  subscription_id: string;
  plan_key: string;
  plan_name: string;
  selected_plan_id?: string | null;
  status: string;
  billing_cycle: string;
  price: string;
  trial_start_date?: string | null;
  trial_end_date?: string | null;
  renewal_date?: string | null;
}

export interface PlatformTenantCompany {
  id: string;
  name: string;
  industry: string;
  industry_key: string;
  status: "Active" | "Suspended" | "Inactive" | "Trial" | string;
  users_count: number;
  open_tickets_count: number;
  subscription: PlatformTenantSubscriptionSummary | null;
  created_at?: string | null;
}

export interface PlatformCustomerLookupItem {
  tenant_id: string;
  company_name: string;
  industry: string;
  industry_key: string;
  status: string;
  subscription_plan: string;
  subscription_status: string;
  open_tickets_count: number;
}

export interface PlatformDashboardKPIs {
  total_companies: number;
  active_companies: number;
  platform_employees: number;
  active_subscriptions: number;
  trialing_tenants: number;
  expired_subscriptions: number;
  pending_payment_verifications: number;
  total_revenue: string;
  overdue_invoices: number;
  failed_payments: number;
  pending_refunds: number;
  open_tickets: number;
  resolved_tickets: number;
  my_assigned_tickets: number;
  escalated_tickets: number;
  sla_breached_tickets: number;
  sales_prospects: number;
  sales_conversions: number;
  pipeline_estimated_mrr: string;
  total_expenses: string;
  pending_expense_requests: number;
  net_profit_estimate: string;
  active_technical_incidents: number;
  failed_login_attempts: number;
  open_security_incidents: number;
  total_audit_events: number;
}

export interface PlatformDashboardPayload {
  /** GET /dashboards/me returns the role as `role_name` (e.g. "Platform Admin"). */
  role_name?: string;
  /** Present on the per-role dashboard listings; not sent by /dashboards/me. */
  role?: string;
  role_key?: string;
  industry_key?: string | null;
  dashboard_key: string;
  dashboard_title: string;
  dashboard_category?: string;
  sidebar_modules: PlatformSidebarModule[];
  kpis: PlatformDashboardKPIs;
}

export interface PlatformDashboardsCatalog {
  central_platform_dashboards: Array<{
    role: string;
    role_key: string;
    dashboard_key: string;
    dashboard_title: string;
    responsibility: string;
    sidebar_modules: PlatformSidebarModule[];
  }>;
  reusable_industry_dashboards: Array<{
    role: string;
    role_key: string;
    dashboard_key: string;
    dashboard_title: string;
    responsibility: string;
    reused_across_industries: string[];
    sidebar_modules: PlatformSidebarModule[];
  }>;
  industries: PlatformIndustryMeta[];
}

export interface PlatformSupportTicket {
  id: string;
  ticket_number?: string;
  subject: string;
  description?: string | null;
  tenant_id: string;
  company_name?: string;
  industry_key?: string;
  issue_type?: "Support" | "Technical" | "Billing" | string;
  routing_queue?: string | null;
  status: "Open" | "In Progress" | "Waiting on Customer" | "Resolved" | "Closed" | string;
  priority: "Low" | "Medium" | "High" | "Urgent" | "Critical" | string;
  assigned_employee_user_id?: string | null;
  assigned_to?: string | null;
  assigned_employee_name?: string | null;
  is_escalated?: boolean;
  escalation_target?: string | null;
  escalation_reason?: string | null;
  sla_breached?: boolean;
  sla_due_at?: string | null;
  audit_reviewed?: boolean;
  audit_review_notes?: string | null;
  resolution?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  comments?: Array<{
    id: string;
    body: string;
    is_internal: boolean;
    author_user_id: string | null;
    created_at: string | null;
  }>;
}

export interface PlatformKnowledgeArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  industry_key: string | null;
  content: string;
  tags: string[];
  created_at: string | null;
}

export interface PlatformPlan {
  id: string;
  plan_key: string;
  name: string;
  description: string;
  billing_cycle: "Monthly" | "Annual" | string;
  price: string;
  currency: string;
  trial_days: number;
  max_users: number;
  max_branches: number;
  storage_limit_gb: number;
  features: string[];
  limits: Record<string, any>;
  is_active: boolean;
}

export interface PlatformSubscriptionItem {
  subscription_id?: string;
  id?: string;
  tenant_id: string;
  company_name?: string;
  industry?: string;
  plan_id?: string;
  plan_key?: string;
  plan_name?: string;
  price?: string;
  billing_cycle?: string;
  selected_billing_cycle?: string | null;
  status: string;
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
  activated_at?: string | null;
  suspended_at?: string | null;
  suspension_reason?: string | null;
  expired_at?: string | null;
  cancelled_at?: string | null;
  current_plan?: {
    id?: string;
    plan_key?: string;
    name?: string;
    price?: string | number;
    billing_cycle?: string;
  } | null;
  selected_plan?: {
    id?: string;
    plan_key?: string;
    name?: string;
    price?: string | number;
    billing_cycle?: string;
  } | null;
  plan?: {
    id?: string;
    plan_key?: string;
    name?: string;
    price?: string | number;
    billing_cycle?: string;
    max_users?: number;
    max_branches?: number;
    storage_limit_gb?: number;
  };
}

export interface PlatformInvoiceItem {
  id: string;
  invoice_number: string;
  tenant_id: string;
  company_name?: string;
  subscription_id?: string | null;
  amount: string | number;
  tax_amount: string | number;
  total_amount: string | number;
  paid_amount: string | number;
  balance_due?: string | number;
  currency: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  notes?: string | null;
}

export interface PlatformPaymentItem {
  id: string;
  payment_id?: string;
  invoice_id: string;
  invoice_number?: string | null;
  tenant_id: string;
  company_name?: string;
  provider: string;
  transaction_reference: string;
  amount: string | number;
  currency: string;
  payment_method: string;
  status: string;
  failure_reason?: string | null;
  rejection_reason?: string | null;
  admin_notes?: string | null;
  payment_proof_url?: string | null;
  payment_proof_filename?: string | null;
  proof_file_url?: string | null;
  proof_original_name?: string | null;
  submitted_by_name?: string | null;
  retry_count?: number;
  reconciled?: boolean;
  paid_at?: string | null;
  payment_submitted_at?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
}

export interface PlatformRefundItem {
  id: string;
  invoice_id: string;
  tenant_id: string;
  amount: string;
  currency: string;
  reason: string;
  status: string;
  resolution_notes: string | null;
  created_at: string | null;
}

export interface PlatformReminderCampaign {
  id: string;
  tenant_id: string;
  company_name?: string;
  subscription_id?: string | null;
  campaign_type?: string;
  campaign_status: string;
  emails_sent_count?: number;
  last_sent_at?: string | null;
  next_send_at?: string | null;
  unsubscribed?: boolean;
  stopped_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface PlatformSubscriptionEventItem {
  id: string;
  tenant_id?: string;
  subscription_id?: string | null;
  invoice_id?: string | null;
  payment_id?: string | null;
  actor_user_id?: string | null;
  event_type: string;
  previous_status?: string | null;
  new_status?: string | null;
  description: string;
  metadata?: Record<string, any>;
  created_at: string | null;
}

export interface PlatformSalesProspect {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  industry_key: string;
  lead_status: string;
  pipeline_stage: string;
  interest_level: string;
  estimated_mrr: string;
  recommended_plan: string | null;
  assigned_to: string | null;
  demo_scheduled_at: string | null;
  demo_outcome: string | null;
  next_follow_up_at: string | null;
  onboarding_status: string;
  notes: string | null;
  created_at: string | null;
}

export interface PlatformExpenseItem {
  id: string;
  expense_number: string;
  title: string;
  category: string;
  industry_key: string | null;
  amount: string;
  currency: string;
  status: string;
  reconciled: boolean;
  expense_date: string | null;
}

export interface PlatformFinanceOverview {
  scope: string;
  industry_key: string | null;
  allocated_budget: string;
  spent_budget: string;
  remaining_budget: string;
  approved_expenses_total: string;
  pending_expenses_total: string;
  subscription_revenue_total: string | null;
  net_position: string | null;
  unreconciled_payments_count: number | null;
  expenses: PlatformExpenseItem[];
}

export interface PlatformTechnicalIncident {
  id: string;
  incident_number: string;
  title: string;
  incident_type: string;
  service_name: string;
  severity: string;
  status: string;
  environment?: string;
  error_fingerprint?: string | null;
  detection_source?: string;
  version_tag?: string | null;
  description: string;
  recovery_actions?: string | null;
  occurrence_count?: number;
  affected_endpoint?: string | null;
  affected_tenant_count?: number;
  owner_user_id?: string | null;
  related_ticket_id?: string | null;
  first_occurrence_at?: string | null;
  last_occurrence_at?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
}

export interface PlatformErrorLogItem {
  id: string;
  event_code: string | null;
  service_name: string;
  environment: string;
  endpoint: string | null;
  http_method: string | null;
  http_status_code: number | null;
  exception_type: string | null;
  error_fingerprint: string | null;
  safe_message: string;
  redacted_stack_trace: string | null;
  correlation_id: string | null;
  tenant_id: string | null;
  user_id: string | null;
  occurrence_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  related_incident_id: string | null;
  metadata: Record<string, any>;
}

export interface PlatformAuditOverview {
  scope: string;
  industry_key: string | null;
  read_only_enforced: boolean;
  sla_compliance: {
    total_tickets: number;
    sla_breached_count: number;
    audit_reviewed_count: number;
    sla_compliance_percentage: number;
  };
  audit_findings: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    industry_key: string | null;
    description: string;
    remediation_steps: string | null;
    created_at: string | null;
  }>;
  audit_logs: Array<{
    id: string;
    user_id: string | null;
    action: string;
    module: string;
    record_id: string | null;
    description: string;
    before_data: any;
    after_data: any;
    created_at: string | null;
  }>;
}

export interface PlatformSecurityEventsResponse {
  active_refresh_sessions_count: number;
  items: Array<{
    id: string;
    event_type: string;
    severity: string;
    status: string;
    user_id: string | null;
    email: string | null;
    ip_address: string | null;
    title: string;
    description: string;
    remediation_steps: string | null;
    created_at: string | null;
  }>;
}

export interface PlatformAnalyticsOverview {
  report_title: string;
  company_name: string;
  generated_at: string;
  scope: string;
  industry_key: string | null;
  aggregate_only: boolean;
  industries_count: number;
  totals: {
    registered_companies: number;
    active_companies: number;
    total_tickets: number;
    open_tickets: number;
    resolved_tickets: number;
    sla_breached_tickets: number;
    sales_prospects: number;
    sla_compliance_pct: number;
  };
  industry_analytics: Array<{
    industry_key: string;
    industry_name: string;
    registered_companies: number;
    active_companies: number;
    total_tickets: number;
    open_tickets: number;
    resolved_tickets: number;
    sla_breached_tickets: number;
    sla_compliance_pct: number;
    sales_prospects: number;
  }>;
}

export interface PlatformSettingItem {
  setting_key: string;
  category: string;
  value_json: Record<string, any>;
  description: string;
  updated_at: string | null;
}
