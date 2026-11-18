import axios from "axios";
import { platformApiClient, PLATFORM_API_BASE_URL } from "./platformApiClient";
import type {
  PlatformAnalyticsOverview,
  PlatformAuditOverview,
  PlatformCustomerLookupItem,
  PlatformDashboardPayload,
  PlatformDashboardsCatalog,
  PlatformEmployee,
  PlatformErrorLogItem,
  PlatformFinanceOverview,
  PlatformFirstPasswordResponse,
  PlatformIndustryTeam,
  PlatformInvoiceItem,
  PlatformKnowledgeArticle,
  PlatformLoginResponse,
  PlatformMeResponse,
  PlatformMfaEnrollStartResponse,
  PlatformMfaVerifyResponse,
  PlatformPaymentItem,
  PlatformPlan,
  PlatformRefundItem,
  PlatformReminderCampaign,
  PlatformRolesResponse,
  PlatformSalesProspect,
  PlatformSecurityEventsResponse,
  PlatformSettingItem,
  PlatformSubscriptionEventItem,
  PlatformSubscriptionItem,
  PlatformSupportTicket,
  PlatformTechnicalIncident,
  PlatformTenantCompany,
} from "../types/platform";

const BASE = "/api/v1/platform";

export const platformService = {
  // =========================================================================
  // AUTH, BOOTSTRAP, MFA & FIRST PASSWORD CHANGE
  // =========================================================================
  async bootstrapSuperAdmin(
    payload: {
      full_name: string;
      email: string;
      password: string;
      confirm_password: string;
    },
    bootstrapToken?: string
  ): Promise<PlatformLoginResponse> {
    const trimmedToken = bootstrapToken?.trim();
    const res = await platformApiClient.post(
      `${BASE}/auth/bootstrap-super-admin`,
      payload,
      trimmedToken
        ? { headers: { "X-Platform-Bootstrap-Token": trimmedToken } }
        : undefined
    );
    if (!res?.data || typeof res.data !== "object" || !res.data.mfa_token) {
      throw new Error(
        "Unexpected response from bootstrap endpoint. Verify backend API URL and proxy settings."
      );
    }
    return res.data;
  },

  async login(payload: {
    email: string;
    password: string;
  }): Promise<PlatformLoginResponse> {
    const res = await platformApiClient.post(`${BASE}/auth/login`, payload);
    return res.data;
  },

  async startMfaEnrollment(
    mfa_token: string,
    reset = false
  ): Promise<PlatformMfaEnrollStartResponse> {
    const res = await platformApiClient.post("/api/v1/auth/mfa/enroll/start", {
      mfa_token,
      reset,
    });
    return res.data;
  },

  async verifyMfaEnrollment(
    mfa_token: string,
    code: string
  ): Promise<PlatformMfaVerifyResponse> {
    const res = await platformApiClient.post("/api/v1/auth/mfa/enroll/verify", {
      mfa_token,
      code,
    });
    return res.data;
  },

  async verifyMfa(
    mfa_token: string,
    code: string
  ): Promise<PlatformMfaVerifyResponse> {
    const res = await platformApiClient.post("/api/v1/auth/mfa/verify", {
      mfa_token,
      code,
    });
    return res.data;
  },

  async changeFirstPassword(payload: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }): Promise<PlatformFirstPasswordResponse> {
    const res = await platformApiClient.post(
      `${BASE}/auth/change-first-password`,
      payload
    );
    return res.data;
  },

  async getMe(): Promise<PlatformMeResponse> {
    const res = await platformApiClient.get(`${BASE}/auth/me`);
    return res.data;
  },

  async getMeWithToken(token: string): Promise<PlatformMeResponse> {
    const res = await axios.get<PlatformMeResponse>(
      `${PLATFORM_API_BASE_URL}/api/v1/platform/auth/me`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return res.data;
  },

  async updateProfile(payload: {
    full_name: string;
    phone?: string | null;
    job_title?: string | null;
  }): Promise<{ message: string; user: any }> {
    const res = await platformApiClient.patch(`${BASE}/profile`, payload);
    return res.data;
  },

  // =========================================================================
  // DASHBOARDS ENGINE
  // =========================================================================
  async getDashboardsCatalog(): Promise<PlatformDashboardsCatalog> {
    const res = await platformApiClient.get(`${BASE}/dashboards/catalog`);
    return res.data;
  },

  async getMyDashboard(): Promise<PlatformDashboardPayload> {
    const res = await platformApiClient.get(`${BASE}/dashboards/me`);
    return res.data;
  },

  async getPlatformRoleDashboard(
    roleKey: string
  ): Promise<PlatformDashboardPayload> {
    const res = await platformApiClient.get(
      `${BASE}/dashboards/platform/${encodeURIComponent(roleKey)}`
    );
    return res.data;
  },

  async getIndustryRoleDashboard(
    industryKey: string,
    roleKey: string
  ): Promise<PlatformDashboardPayload> {
    const res = await platformApiClient.get(
      `${BASE}/dashboards/industry/${encodeURIComponent(industryKey)}/${encodeURIComponent(roleKey)}`
    );
    return res.data;
  },

  // =========================================================================
  // EMPLOYEES & INDUSTRY TEAMS & ROLES
  // =========================================================================
  async listEmployees(params?: {
    role_scope?: string;
    industry_type?: string;
    role?: string;
    status?: string;
    search?: string;
  }): Promise<{ items: PlatformEmployee[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/employees`, { params });
    return res.data;
  },

  async getEmployee(employeeId: string): Promise<PlatformEmployee> {
    const res = await platformApiClient.get(`${BASE}/employees/${employeeId}`);
    return res.data;
  },

  async createEmployee(payload: {
    employee_name?: string;
    full_name?: string;
    email: string;
    temporary_password: string;
    industry_type?: string | null;
    role: string;
    phone?: string | null;
    department?: string | null;
    max_ticket_load?: number;
  }): Promise<PlatformEmployee> {
    const res = await platformApiClient.post(`${BASE}/employees`, payload);
    return res.data;
  },

  async updateEmployee(
    employeeId: string,
    payload: {
      full_name?: string;
      role?: string;
      industry_type?: string | null;
      status?: string;
      availability_status?: string;
      max_ticket_load?: number;
      manager_user_id?: string | null;
      department?: string | null;
    }
  ): Promise<PlatformEmployee> {
    const res = await platformApiClient.patch(
      `${BASE}/employees/${employeeId}`,
      payload
    );
    return res.data;
  },

  async listIndustryTeams(params?: {
    industry_type?: string;
  }): Promise<{
    items: PlatformIndustryTeam[];
    total: number;
    reusable_industry_roles: any[];
  }> {
    const res = await platformApiClient.get(`${BASE}/industry-teams`, {
      params,
    });
    return res.data;
  },

  async getIndustryTeam(industryKey: string): Promise<PlatformIndustryTeam> {
    const res = await platformApiClient.get(
      `${BASE}/industry-teams/${encodeURIComponent(industryKey)}`
    );
    return res.data;
  },

  async createIndustryTeam(payload: {
    industry_key?: string;
    name: string;
    description?: string;
    is_active?: boolean;
    max_members?: number;
    sla_response_minutes?: number;
    sla_resolution_hours?: number;
    allocated_budget?: number;
    manager_user_id?: string | null;
    team_admin_user_id?: string | null;
    config_json?: Record<string, any>;
  }): Promise<PlatformIndustryTeam> {
    const res = await platformApiClient.post(`${BASE}/industry-teams`, payload);
    return res.data;
  },

  async updateIndustryTeam(
    industryKey: string,
    payload: {
      name?: string;
      description?: string;
      is_active?: boolean;
      max_members?: number;
      sla_response_minutes?: number;
      sla_resolution_hours?: number;
      allocated_budget?: number;
      manager_user_id?: string | null;
      team_admin_user_id?: string | null;
      config_json?: Record<string, any>;
    }
  ): Promise<PlatformIndustryTeam> {
    const res = await platformApiClient.patch(
      `${BASE}/industry-teams/${encodeURIComponent(industryKey)}`,
      payload
    );
    return res.data;
  },

  async listRoles(): Promise<PlatformRolesResponse> {
    const res = await platformApiClient.get(`${BASE}/roles`);
    return res.data;
  },

  async updateRolePermissions(
    roleName: string,
    permissions: string[]
  ): Promise<{ role: string; permissions: string[] }> {
    const res = await platformApiClient.put(
      `${BASE}/roles/${encodeURIComponent(roleName)}/permissions`,
      { permissions }
    );
    return res.data;
  },

  // =========================================================================
  // TENANTS & CUSTOMER LOOKUP
  // =========================================================================
  async listTenants(params?: {
    industry_type?: string;
    status?: string;
    search?: string;
  }): Promise<{ items: PlatformTenantCompany[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/tenants`, { params });
    return res.data;
  },

  async getTenant(tenantId: string): Promise<PlatformTenantCompany> {
    const res = await platformApiClient.get(`${BASE}/tenants/${tenantId}`);
    return res.data;
  },

  async createTenant(payload: {
    name: string;
    industry: string;
    plan_key?: string;
    owner_full_name?: string;
    owner_email?: string;
    owner_password?: string;
  }): Promise<PlatformTenantCompany> {
    const res = await platformApiClient.post(`${BASE}/tenants`, payload);
    return res.data;
  },

  async updateTenant(
    tenantId: string,
    payload: {
      name?: string;
      industry?: string;
      status?: string;
    }
  ): Promise<PlatformTenantCompany> {
    const res = await platformApiClient.patch(
      `${BASE}/tenants/${tenantId}`,
      payload
    );
    return res.data;
  },

  async customerLookup(q = ""): Promise<{
    items: PlatformCustomerLookupItem[];
    total: number;
  }> {
    const res = await platformApiClient.get(`${BASE}/customer-lookup`, {
      params: { q },
    });
    return res.data;
  },

  // =========================================================================
  // SUPPORT TICKETS & KNOWLEDGE BASE
  // =========================================================================
  async listSupportTickets(params?: {
    view?: string;
    industry_type?: string;
    issue_type?: string;
    status?: string;
    priority?: string;
  }): Promise<{ items: PlatformSupportTicket[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/support-tickets`, {
      params,
    });
    return res.data;
  },

  async getSupportTicket(ticketId: string): Promise<PlatformSupportTicket> {
    const res = await platformApiClient.get(
      `${BASE}/support-tickets/${ticketId}`
    );
    return res.data;
  },

  async assignSupportTicket(
    ticketId: string,
    payload: {
      assigned_employee_user_id: string;
      routing_queue?: string;
      notes?: string;
    }
  ): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/support-tickets/${ticketId}/assign`,
      payload
    );
    return res.data;
  },

  async escalateSupportTicket(
    ticketId: string,
    payload: {
      escalation_target: string;
      escalation_reason: string;
      assigned_employee_user_id?: string | null;
    }
  ): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/support-tickets/${ticketId}/escalate`,
      payload
    );
    return res.data;
  },

  async updateSupportTicketStatus(
    ticketId: string,
    statusValue: string,
    resolution?: string
  ): Promise<any> {
    const res = await platformApiClient.patch(
      `${BASE}/support-tickets/${ticketId}/status`,
      undefined,
      {
        params: {
          status: statusValue,
          ...(resolution ? { resolution } : {}),
        },
      }
    );
    return res.data;
  },

  async auditReviewSupportTicket(
    ticketId: string,
    payload: { audit_reviewed: boolean; audit_review_notes: string }
  ): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/support-tickets/${ticketId}/audit-review`,
      payload
    );
    return res.data;
  },

  async listKnowledgeBase(params?: {
    industry_type?: string;
    category?: string;
    search?: string;
  }): Promise<{ items: PlatformKnowledgeArticle[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/knowledge-base`, {
      params,
    });
    return res.data;
  },

  async createKnowledgeArticle(payload: {
    slug: string;
    title: string;
    category: string;
    industry_type?: string | null;
    content: string;
    tags_json: string[];
    is_published: boolean;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/knowledge-base`, payload);
    return res.data;
  },

  // =========================================================================
  // PLANS, SUBSCRIPTIONS, BILLING, PAYMENTS, REFUNDS & REMINDERS
  // =========================================================================
  async listPlans(): Promise<{ items: PlatformPlan[] }> {
    const res = await platformApiClient.get(`${BASE}/plans`);
    return res.data;
  },

  async createPlan(payload: {
    plan_key: string;
    name: string;
    description?: string;
    billing_cycle: "Monthly" | "Annual";
    price: number;
    currency?: string;
    trial_days?: number;
    max_users?: number;
    max_branches?: number;
    storage_limit_gb?: number;
    features_json?: string[];
    limits_json?: Record<string, any>;
    is_active?: boolean;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/plans`, payload);
    return res.data;
  },

  async updatePlan(
    planId: string,
    payload: {
      name?: string;
      description?: string;
      billing_cycle?: "Monthly" | "Annual";
      price?: number;
      trial_days?: number;
      max_users?: number;
      max_branches?: number;
      storage_limit_gb?: number;
      features_json?: string[];
      limits_json?: Record<string, any>;
      is_active?: boolean;
    }
  ): Promise<any> {
    const res = await platformApiClient.patch(`${BASE}/plans/${planId}`, payload);
    return res.data;
  },

  async listSubscriptions(params?: {
    status?: string;
  }): Promise<{ items: PlatformSubscriptionItem[] }> {
    const res = await platformApiClient.get(`${BASE}/subscriptions`, { params });
    return res.data;
  },

  async listTrialingSubscriptions(): Promise<{
    items: PlatformSubscriptionItem[];
    total: number;
  }> {
    const res = await platformApiClient.get(`${BASE}/subscriptions/trialing`);
    return res.data;
  },

  async listExpiredTrialSubscriptions(): Promise<{
    items: PlatformSubscriptionItem[];
    total: number;
  }> {
    const res = await platformApiClient.get(
      `${BASE}/subscriptions/expired-trials`
    );
    return res.data;
  },

  async listPendingPaymentSubscriptions(): Promise<{
    items: PlatformPaymentItem[];
    total: number;
  }> {
    const res = await platformApiClient.get(
      `${BASE}/subscriptions/pending-payments`
    );
    return res.data;
  },

  async listUpcomingRenewals(
    withinDays = 30
  ): Promise<{ items: PlatformSubscriptionItem[]; total: number }> {
    const res = await platformApiClient.get(
      `${BASE}/subscriptions/upcoming-renewals`,
      { params: { within_days: withinDays } }
    );
    return res.data;
  },

  async listExpiredSubscriptions(): Promise<{
    items: PlatformSubscriptionItem[];
    total: number;
  }> {
    const res = await platformApiClient.get(`${BASE}/subscriptions/expired`);
    return res.data;
  },

  async assignSubscription(payload: {
    tenant_id: string;
    plan_id: string;
    status: string;
    billing_cycle: "Monthly" | "Annual";
    auto_renew: boolean;
    renewal_date?: string | null;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/subscriptions`, payload);
    return res.data;
  },

  async grantComplimentarySubscription(payload: {
    tenant_id: string;
    plan_id?: string | null;
    plan_key?: string | null;
    billing_cycle?: "Monthly" | "Annual";
    duration_days: number;
    reason: string;
  }): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/subscriptions/complimentary`,
      payload
    );
    return res.data;
  },

  async suspendSubscription(
    subscriptionId: string,
    reason: string
  ): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/subscriptions/${subscriptionId}/suspend`,
      { reason }
    );
    return res.data;
  },

  async reactivateSubscription(
    subscriptionId: string,
    payload?: { reason?: string; extend_days?: number }
  ): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/subscriptions/${subscriptionId}/reactivate`,
      payload || {}
    );
    return res.data;
  },

  async cancelSubscription(
    subscriptionId: string,
    reason: string
  ): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/subscriptions/${subscriptionId}/cancel`,
      { reason }
    );
    return res.data;
  },

  async listSubscriptionAuditHistory(params?: {
    tenant_id?: string;
    event_type?: string;
  }): Promise<{ items: PlatformSubscriptionEventItem[]; total: number }> {
    const res = await platformApiClient.get(
      `${BASE}/subscriptions/audit-history`,
      { params }
    );
    return res.data;
  },

  async getSubscriptionEvents(
    subscriptionId: string
  ): Promise<{ items: PlatformSubscriptionEventItem[]; total: number }> {
    const res = await platformApiClient.get(
      `${BASE}/subscriptions/${subscriptionId}/events`
    );
    return res.data;
  },

  async listInvoices(params?: {
    status?: string;
  }): Promise<{ items: PlatformInvoiceItem[] }> {
    const res = await platformApiClient.get(`${BASE}/billing/invoices`, {
      params,
    });
    return res.data;
  },

  async listOverdueInvoices(): Promise<{
    items: PlatformInvoiceItem[];
    total: number;
  }> {
    const res = await platformApiClient.get(`${BASE}/billing/invoices/overdue`);
    return res.data;
  },

  async createInvoice(payload: {
    tenant_id: string;
    subscription_id?: string | null;
    amount: number;
    tax_amount?: number;
    currency?: string;
    due_date?: string | null;
    notes?: string | null;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/billing/invoices`, payload);
    return res.data;
  },

  async listPayments(params?: {
    status?: string;
  }): Promise<{ items: PlatformPaymentItem[] }> {
    const res = await platformApiClient.get(`${BASE}/billing/payments`, {
      params,
    });
    return res.data;
  },

  async listSubmittedPayments(): Promise<{
    items: PlatformPaymentItem[];
    total: number;
  }> {
    const res = await platformApiClient.get(
      `${BASE}/billing/payments/submitted`
    );
    return res.data;
  },

  async recordPayment(payload: {
    invoice_id: string;
    provider?: string;
    transaction_reference: string;
    amount: number;
    payment_method?: string;
    status?: "Succeeded" | "Failed" | "Pending";
    failure_reason?: string | null;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/billing/payments`, payload);
    return res.data;
  },

  async reviewPayment(paymentId: string, admin_notes?: string): Promise<any> {
    const res = await platformApiClient.patch(
      `${BASE}/billing/payments/${paymentId}/review`,
      admin_notes ? { admin_notes } : {}
    );
    return res.data;
  },

  async approvePayment(paymentId: string, admin_notes?: string): Promise<any> {
    const res = await platformApiClient.patch(
      `${BASE}/billing/payments/${paymentId}/approve`,
      admin_notes ? { admin_notes } : {}
    );
    return res.data;
  },

  async rejectPayment(
    paymentId: string,
    rejection_reason: string,
    admin_notes?: string
  ): Promise<any> {
    const res = await platformApiClient.patch(
      `${BASE}/billing/payments/${paymentId}/reject`,
      { rejection_reason, ...(admin_notes ? { admin_notes } : {}) }
    );
    return res.data;
  },

  async listRefunds(): Promise<{ items: PlatformRefundItem[] }> {
    const res = await platformApiClient.get(`${BASE}/billing/refunds`);
    return res.data;
  },

  async createRefund(payload: {
    invoice_id: string;
    payment_id?: string | null;
    amount: number;
    reason: string;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/billing/refunds`, payload);
    return res.data;
  },

  async decideRefund(
    refundId: string,
    payload: {
      status: "Approved" | "Rejected" | "Processed";
      resolution_notes?: string;
    }
  ): Promise<any> {
    const res = await platformApiClient.patch(
      `${BASE}/billing/refunds/${refundId}`,
      payload
    );
    return res.data;
  },

  async listReminderCampaigns(params?: {
    campaign_status?: string;
  }): Promise<{ items: PlatformReminderCampaign[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/reminders/campaigns`, {
      params,
    });
    return res.data;
  },

  async runReminders(params?: {
    reference_date?: string;
    force_retry?: boolean;
  }): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/reminders/run`,
      undefined,
      { params }
    );
    return res.data;
  },

  async generateRenewalInvoices(params?: {
    reference_date?: string;
    lead_days?: number;
  }): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/renewals/generate-invoices`,
      undefined,
      { params }
    );
    return res.data;
  },

  // =========================================================================
  // SALES & FINANCE
  // =========================================================================
  async listSalesProspects(params?: {
    industry_type?: string;
    pipeline_stage?: string;
    onboarding_status?: string;
  }): Promise<{ items: PlatformSalesProspect[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/sales/prospects`, {
      params,
    });
    return res.data;
  },

  async createSalesProspect(payload: {
    company_name: string;
    contact_name: string;
    contact_email: string;
    contact_phone?: string | null;
    industry_type: string;
    lead_status?: string;
    pipeline_stage?: string;
    interest_level?: string;
    estimated_mrr?: number;
    recommended_plan?: string | null;
    assigned_to?: string | null;
    demo_scheduled_at?: string | null;
    next_follow_up_at?: string | null;
    notes?: string | null;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/sales/prospects`, payload);
    return res.data;
  },

  async updateSalesProspect(
    prospectId: string,
    payload: {
      lead_status?: string;
      pipeline_stage?: string;
      interest_level?: string;
      estimated_mrr?: number;
      recommended_plan?: string | null;
      assigned_to?: string | null;
      demo_scheduled_at?: string | null;
      demo_outcome?: string | null;
      next_follow_up_at?: string | null;
      onboarding_status?: string;
      notes?: string | null;
    }
  ): Promise<any> {
    const res = await platformApiClient.patch(
      `${BASE}/sales/prospects/${prospectId}`,
      payload
    );
    return res.data;
  },

  async getFinanceOverview(params?: {
    industry_type?: string;
  }): Promise<PlatformFinanceOverview> {
    const res = await platformApiClient.get(`${BASE}/finance/overview`, {
      params,
    });
    return res.data;
  },

  async createExpense(payload: {
    title: string;
    category?: string;
    industry_type?: string | null;
    amount: number;
    currency?: string;
    expense_date?: string | null;
    description?: string | null;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/finance/expenses`, payload);
    return res.data;
  },

  async decideExpense(
    expenseId: string,
    payload: {
      status: "Approved" | "Rejected" | "Paid" | "Reconciled";
      reconciled?: boolean;
    }
  ): Promise<any> {
    const res = await platformApiClient.patch(
      `${BASE}/finance/expenses/${expenseId}`,
      payload
    );
    return res.data;
  },

  async reconcilePayment(paymentId: string): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/finance/reconcile-payment/${paymentId}`
    );
    return res.data;
  },

  // =========================================================================
  // TECHNICAL, AUDIT & SECURITY
  // =========================================================================
  async getTechnicalHealth(runLiveChecks = true): Promise<any> {
    const res = await platformApiClient.get(`${BASE}/technical/health`, {
      params: { run_live_checks: runLiveChecks },
    });
    return res.data;
  },

  async runTechnicalChecks(): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/technical/run-checks`);
    return res.data;
  },

  async listTechnicalIncidents(params?: {
    status?: string;
    severity?: string;
    service_name?: string;
    detection_source?: string;
    environment?: string;
  }): Promise<{ items: PlatformTechnicalIncident[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/technical/incidents`, {
      params,
    });
    return res.data;
  },

  async createTechnicalIncident(payload: {
    title: string;
    incident_type?: "Incident" | "Outage" | "ErrorLog" | "Deployment";
    service_name?: string;
    severity?: "Low" | "Medium" | "High" | "Critical";
    status?: "Investigating" | "Identified" | "Monitoring" | "Resolved" | "Deployed";
    environment?: string;
    version_tag?: string | null;
    description: string;
    recovery_actions?: string | null;
    affected_endpoint?: string | null;
  }): Promise<PlatformTechnicalIncident> {
    const res = await platformApiClient.post(
      `${BASE}/technical/incidents`,
      payload
    );
    return res.data;
  },

  async updateTechnicalIncident(
    incidentId: string,
    payload: {
      status?: string;
      severity?: string;
      description?: string;
      recovery_actions?: string;
      owner_user_id?: string | null;
    }
  ): Promise<PlatformTechnicalIncident> {
    const res = await platformApiClient.patch(
      `${BASE}/technical/incidents/${incidentId}`,
      payload
    );
    return res.data;
  },

  async listTechnicalErrorLogs(params?: {
    service_name?: string;
    http_status_code?: number;
    environment?: string;
    correlation_id?: string;
  }): Promise<{ items: PlatformErrorLogItem[]; total: number }> {
    const res = await platformApiClient.get(`${BASE}/technical/error-logs`, {
      params,
    });
    return res.data;
  },

  async getTechnicalThresholds(): Promise<{ thresholds: Record<string, any> }> {
    const res = await platformApiClient.get(`${BASE}/technical/thresholds`);
    return res.data;
  },

  async updateTechnicalThresholds(
    payload: Record<string, any>
  ): Promise<{ thresholds: Record<string, any> }> {
    const res = await platformApiClient.put(
      `${BASE}/technical/thresholds`,
      payload
    );
    return res.data;
  },

  async getAuditOverview(params?: {
    module?: string;
    industry_type?: string;
  }): Promise<PlatformAuditOverview> {
    const res = await platformApiClient.get(`${BASE}/audit/overview`, {
      params,
    });
    return res.data;
  },

  async createAuditFinding(payload: {
    event_type?: string;
    severity?: string;
    status?: string;
    industry_type?: string | null;
    title: string;
    description?: string;
    remediation_steps?: string | null;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/audit/findings`, payload);
    return res.data;
  },

  async listSecurityEvents(params?: {
    event_type?: string;
  }): Promise<PlatformSecurityEventsResponse> {
    const res = await platformApiClient.get(`${BASE}/security/events`, {
      params,
    });
    return res.data;
  },

  async createSecurityEvent(payload: {
    event_type?: string;
    severity?: string;
    status?: string;
    user_id?: string | null;
    email?: string | null;
    ip_address?: string | null;
    industry_type?: string | null;
    title: string;
    description?: string;
    remediation_steps?: string | null;
  }): Promise<any> {
    const res = await platformApiClient.post(`${BASE}/security/events`, payload);
    return res.data;
  },

  async revokeUserSessions(targetUserId: string): Promise<any> {
    const res = await platformApiClient.post(
      `${BASE}/security/revoke-user-sessions/${targetUserId}`
    );
    return res.data;
  },

  // =========================================================================
  // ANALYTICS & SETTINGS
  // =========================================================================
  async getAnalyticsOverview(params?: {
    industry_type?: string;
  }): Promise<PlatformAnalyticsOverview> {
    const res = await platformApiClient.get(`${BASE}/analytics/overview`, {
      params,
    });
    return res.data;
  },

  async exportAnalyticsReport(params: {
    industry_type?: string;
    format: "json" | "csv" | "pdf";
  }): Promise<{ blob: Blob; filename: string }> {
    const res = await platformApiClient.get(`${BASE}/analytics/export`, {
      params,
      responseType: "blob",
    });
    const disposition = String(res.headers["content-disposition"] || "");
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename =
      match?.[1] || `scuilone_platform_analytics.${params.format}`;
    return { blob: res.data, filename };
  },

  async listSettings(): Promise<{ items: PlatformSettingItem[] }> {
    const res = await platformApiClient.get(`${BASE}/settings`);
    return res.data;
  },

  async updateSetting(
    settingKey: string,
    payload: {
      category: string;
      value_json: Record<string, any>;
      description: string;
    }
  ): Promise<PlatformSettingItem> {
    const res = await platformApiClient.put(
      `${BASE}/settings/${encodeURIComponent(settingKey)}`,
      payload
    );
    return res.data;
  },
};

export function extractApiErrorMessage(err: any, fallback = "Operation failed"): string {
  const data = err?.response?.data;
  const detail = data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((d: any) => {
        if (typeof d?.msg === "string") {
          const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
          return field && field !== "body" ? `${field}: ${d.msg}` : d.msg;
        }
        return typeof d === "string" ? d : JSON.stringify(d);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object" && detail.message) {
    return String(detail.message);
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }
  if (typeof data === "string" && data.trim() && !data.trimStart().startsWith("<")) {
    return data.trim();
  }
  if (typeof err?.message === "string" && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

