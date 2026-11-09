import re
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db, require_active_user
from app.models.permission import Permission
from app.models.platform import (
    PlatformEmployee,
    PlatformIndustryTeam,
    PlatformSupportTicketMeta,
)
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.support_ticket import SupportTicket
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole

PLATFORM_TENANT_NAME = "SCuilONE Platform"

# 11 Central Platform Roles (from platfrom support (1).pdf pages 1, 2, 4, 8, 10-18)
CENTRAL_PLATFORM_ROLES = [
    {
        "name": "Platform Super Admin",
        "key": "platform_super_admin",
        "responsibility": "Complete platform ownership and control",
        "dashboard_key": "super_admin_dashboard",
        "dashboard_title": "Super Admin Dashboard",
    },
    {
        "name": "Platform Admin",
        "key": "platform_admin",
        "responsibility": "Daily platform administration",
        "dashboard_key": "platform_admin_dashboard",
        "dashboard_title": "Platform Admin Dashboard",
    },
    {
        "name": "Platform Manager",
        "key": "platform_manager",
        "responsibility": "Team and operational management",
        "dashboard_key": "platform_manager_dashboard",
        "dashboard_title": "Platform Manager Dashboard",
    },
    {
        "name": "Platform Support",
        "key": "platform_support",
        "responsibility": "Customer assistance",
        "dashboard_key": "support_dashboard",
        "dashboard_title": "Support Dashboard",
    },
    {
        "name": "Sales",
        "key": "sales",
        "responsibility": "Customer acquisition",
        "dashboard_key": "sales_dashboard",
        "dashboard_title": "Sales Dashboard",
    },
    {
        "name": "Billing",
        "key": "billing",
        "responsibility": "Subscriptions and invoices",
        "dashboard_key": "billing_dashboard",
        "dashboard_title": "Billing Dashboard",
    },
    {
        "name": "Technical",
        "key": "technical",
        "responsibility": "Technical operations",
        "dashboard_key": "technical_dashboard",
        "dashboard_title": "Technical Dashboard",
    },
    {
        "name": "Audit",
        "key": "audit",
        "responsibility": "Independent activity reviews",
        "dashboard_key": "audit_dashboard",
        "dashboard_title": "Audit Dashboard",
    },
    {
        "name": "Finance",
        "key": "finance",
        "responsibility": "Financial reporting and reconciliation",
        "dashboard_key": "finance_dashboard",
        "dashboard_title": "Finance Dashboard",
    },
    {
        "name": "Security Administrator",
        "key": "security_administrator",
        "responsibility": "Security monitoring",
        "dashboard_key": "security_admin_dashboard",
        "dashboard_title": "Security Admin Dashboard",
    },
    {
        "name": "Analyst",
        "key": "analyst",
        "responsibility": "Business intelligence and analytics",
        "dashboard_key": "analyst_dashboard",
        "dashboard_title": "Analyst Dashboard",
    },
]

# 7 Reusable Industry Team Roles (reused across all 10 industries - no 70 separate roles)
REUSABLE_INDUSTRY_ROLES = [
    {
        "name": "Team Admin",
        "key": "team_admin",
        "responsibility": "Manages team members, role assignments, and team configuration",
        "dashboard_key": "industry_team_admin_dashboard",
        "dashboard_title": "Team Admin Dashboard",
    },
    {
        "name": "Team Manager",
        "key": "team_manager",
        "responsibility": "Supervises the team, assigns tickets, manages workload, and handles escalations",
        "dashboard_key": "industry_team_manager_dashboard",
        "dashboard_title": "Team Manager Dashboard",
    },
    {
        "name": "Industry Support",
        "key": "industry_support",
        "responsibility": "Handles customer support tickets and resolves industry-specific issues",
        "dashboard_key": "industry_support_dashboard",
        "dashboard_title": "Industry Support Dashboard",
    },
    {
        "name": "Team Auditor",
        "key": "team_auditor",
        "responsibility": "Reviews tickets, employee activities, SLA compliance, and audit records",
        "dashboard_key": "industry_team_auditor_dashboard",
        "dashboard_title": "Team Auditor Dashboard",
    },
    {
        "name": "Team Finance",
        "key": "team_finance",
        "responsibility": "Manages team expenses, budgets, transactions, and financial reports",
        "dashboard_key": "industry_team_finance_dashboard",
        "dashboard_title": "Team Finance Dashboard",
    },
    {
        "name": "Team Analyst",
        "key": "team_analyst",
        "responsibility": "Analyzes ticket trends, resolution times, team performance, and industry reports",
        "dashboard_key": "industry_team_analyst_dashboard",
        "dashboard_title": "Team Analyst Dashboard",
    },
    {
        "name": "Industry Sales",
        "key": "industry_sales",
        "responsibility": "Manages industry leads, prospects, sales pipelines, follow-ups, and customer onboarding",
        "dashboard_key": "industry_sales_dashboard",
        "dashboard_title": "Industry Sales Dashboard",
    },
]

CENTRAL_ROLE_NAMES = {r["name"] for r in CENTRAL_PLATFORM_ROLES}
INDUSTRY_ROLE_NAMES = {r["name"] for r in REUSABLE_INDUSTRY_ROLES}
ALL_PLATFORM_ROLE_NAMES = CENTRAL_ROLE_NAMES | INDUSTRY_ROLE_NAMES

# Canonical industry identity comes from one registry; support teams are provisioned separately.
from app.core.industry_registry import INDUSTRY_REGISTRY, list_industries, normalize_industry_key

PLATFORM_INDUSTRIES = list_industries()

def classify_ticket_issue_type(category: str | None, subject: str | None = None) -> tuple[str, str]:
    """
    Implements Support Ticket Routing (platfrom support (1).pdf page 9):
    Classifies a ticket into (issue_type, routing_queue):
    - Support (usage questions) -> "Industry Support"
    - Technical (software bugs) -> "Technical"
    - Billing (subscription issues) -> "Billing"
    """
    cat = (category or "").strip().lower()
    subj = (subject or "").strip().lower()
    combined = f"{cat} {subj}"
    tokens = set(re.findall(r"[a-z0-9]+", combined))

    if tokens & {"billing", "invoice", "invoices", "subscription", "subscriptions", "payment", "payments", "refund", "refunds", "plan", "plans", "renewal", "renewals"}:
        return "Billing", "Billing"
    if tokens & {"bug", "bugs", "technical", "outage", "error", "errors", "crash", "api", "exception", "500"}:
        return "Technical", "Technical"
    return "Support", "Industry Support"


# Exact Sidebar Modules per Role (from platfrom support (1).pdf pages 10-25)
ROLE_SIDEBAR_MODULES: dict[str, list[dict[str, str]]] = {
    "Platform Super Admin": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows total companies, platform employees, active subscriptions, revenue, open tickets and overall platform performance."},
        {"key": "tenants", "label": "Tenants / Companies", "purpose": "View registered companies, company details, industry, subscription plan and status. Activate or suspend companies."},
        {"key": "platform_employees", "label": "Platform Employees", "purpose": "Add, edit, activate or deactivate internal SCuilONE employees and assign their roles and industry teams."},
        {"key": "industry_teams", "label": "Industry Teams", "purpose": "View all 10 industry teams, team members, managers, vacancies and workloads."},
        {"key": "roles_permissions", "label": "Roles & Permissions", "purpose": "Manage platform and industry-team roles and control which actions each role can perform."},
        {"key": "industry_management", "label": "Industry Management", "purpose": "Add, edit or deactivate supported industries and configure their associated teams."},
        {"key": "subscription_plans", "label": "Subscription Plans", "purpose": "Create and manage subscription tiers, prices, features, usage limits and trial periods."},
        {"key": "billing_invoices", "label": "Billing & Invoices", "purpose": "View customer invoices, payments, renewals, outstanding balances and billing status."},
        {"key": "support_tickets", "label": "Support Tickets", "purpose": "Monitor customer issues across industries, assign tickets and track escalations and resolution."},
        {"key": "analytics_reports", "label": "Analytics & Reports", "purpose": "View company growth, revenue trends, industry performance, user activity and platform usage."},
        {"key": "audit_logs", "label": "Audit Logs", "purpose": "Review who performed sensitive actions, what changed and when."},
        {"key": "security_login_activity", "label": "Security & Login Activity", "purpose": "Monitor failed logins, suspicious activity, account access and security alerts."},
        {"key": "notifications", "label": "Notifications", "purpose": "View platform alerts, important announcements, billing events and operational updates."},
        {"key": "platform_settings", "label": "Platform Settings", "purpose": "Configure global platform settings, email services, security policies and system defaults."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manage your owner account, personal details, password and MFA settings."},
    ],
    "Platform Admin": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows operational statistics, pending tasks, company registrations and support activity."},
        {"key": "tenants", "label": "Tenants / Companies", "purpose": "Review company records and perform permitted administrative actions."},
        {"key": "platform_employees", "label": "Platform Employees", "purpose": "Create and manage employees within assigned permissions."},
        {"key": "industry_teams", "label": "Industry Teams", "purpose": "View team membership, workload and staffing information."},
        {"key": "roles_permissions", "label": "Roles & Permissions", "purpose": "View or assign authorized roles and permissions; sensitive role changes may require approval."},
        {"key": "industry_management", "label": "Industry Management", "purpose": "Manage supported industries within the scope granted by the Super Admin."},
        {"key": "support_tickets", "label": "Support Tickets", "purpose": "Monitor and coordinate customer issues and escalations."},
        {"key": "subscription_plans", "label": "Subscription Plans", "purpose": "View plans and manage plan-related tasks only when authorized."},
        {"key": "billing_overview", "label": "Billing Overview", "purpose": "See payment status, overdue invoices and subscription issues without automatically gaining refund privileges."},
        {"key": "analytics_reports", "label": "Analytics & Reports", "purpose": "Review operational performance and administrative activity."},
        {"key": "notifications", "label": "Notifications", "purpose": "Receive operational alerts, pending approvals and platform announcements."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Update personal details and account security settings."},
    ],
    "Platform Manager": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows assigned team performance, open tickets, overdue tasks and escalations."},
        {"key": "my_team", "label": "My Team", "purpose": "Displays the teams the manager supervises."},
        {"key": "industry_teams", "label": "Industry Teams", "purpose": "Shows industry teams, their workloads and operational status."},
        {"key": "team_members", "label": "Team Members", "purpose": "View team members, roles, availability and assigned workload."},
        {"key": "support_tickets", "label": "Support Tickets", "purpose": "Monitor tickets handled by the manager's teams."},
        {"key": "ticket_assignments", "label": "Ticket Assignments", "purpose": "Assign or reassign tickets to authorized employees."},
        {"key": "escalations", "label": "Escalations", "purpose": "Review high-priority, overdue or unresolved issues."},
        {"key": "team_performance", "label": "Team Performance", "purpose": "Track resolution time, workload, SLA compliance and employee performance."},
        {"key": "analytics_reports", "label": "Analytics & Reports", "purpose": "Generate operational reports for the manager's scope."},
        {"key": "notifications", "label": "Notifications", "purpose": "Receive assignment updates, escalations and performance alerts."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manage personal information and account settings."},
    ],
    "Platform Support": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows assigned tickets, open issues, priorities and resolution statistics."},
        {"key": "my_tickets", "label": "My Tickets", "purpose": "Lists tickets assigned to the logged-in support employee."},
        {"key": "all_assigned_tickets", "label": "All Assigned Tickets", "purpose": "Shows tickets assigned to the employee or support queue they are authorized to access."},
        {"key": "customer_lookup", "label": "Customer / Tenant Lookup", "purpose": "Find a customer company and view the minimum information required to provide assistance."},
        {"key": "ticket_escalations", "label": "Ticket Escalations", "purpose": "Send complex issues to the appropriate manager, industry team, Technical or Billing team."},
        {"key": "knowledge_base", "label": "Knowledge Base", "purpose": "Access troubleshooting guides, FAQs and support procedures."},
        {"key": "ticket_history", "label": "Ticket History", "purpose": "Review previous messages, status changes and actions related to a ticket."},
        {"key": "notifications", "label": "Notifications", "purpose": "Receive new assignments, customer replies and SLA warnings."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Update personal details and security settings."},
    ],
    "Sales": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows sales targets, new prospects, conversions and upcoming follow-ups."},
        {"key": "sales_leads", "label": "Sales Leads", "purpose": "Store and manage potential customers interested in SCuilONE."},
        {"key": "prospects", "label": "Prospects", "purpose": "Track qualified potential customers, their needs and interest level."},
        {"key": "companies_tenants", "label": "Companies / Tenants", "purpose": "View authorized company records and onboarding status."},
        {"key": "sales_pipeline", "label": "Sales Pipeline", "purpose": "Track opportunities through stages such as New, Qualified, Demo, Negotiation and Won/Lost."},
        {"key": "followups_activities", "label": "Follow-ups & Activities", "purpose": "Schedule calls, meetings, demonstrations and reminders."},
        {"key": "demonstrations", "label": "Demonstrations", "purpose": "Schedule and track product demos for prospective customers."},
        {"key": "onboarding", "label": "Onboarding", "purpose": "Track new customer setup, initial configuration and handover to support."},
        {"key": "sales_reports", "label": "Sales Reports", "purpose": "Measure conversion rates, revenue attributed to sales and sales performance."},
        {"key": "notifications", "label": "Notifications", "purpose": "Receive follow-up reminders, lead assignments and sales updates."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manage personal and account details."},
    ],
    "Billing": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows recurring revenue, overdue invoices, failed payments and renewals."},
        {"key": "subscription_overview", "label": "Subscription Overview", "purpose": "View each customer's subscription, status, billing cycle and renewal date."},
        {"key": "subscription_plans", "label": "Subscription Plans", "purpose": "View available plans and make authorized plan or pricing changes."},
        {"key": "invoices", "label": "Invoices", "purpose": "Create or view invoices, track due dates and record invoice status."},
        {"key": "payments", "label": "Payments", "purpose": "View payment records and transaction statuses from the payment provider."},
        {"key": "renewals", "label": "Renewals", "purpose": "Monitor upcoming renewals, expirations and renewal failures."},
        {"key": "failed_payments", "label": "Failed Payments", "purpose": "Investigate unsuccessful payments and track retry or follow-up actions."},
        {"key": "refund_requests", "label": "Refund Requests", "purpose": "Review, approve or process refunds according to assigned permissions."},
        {"key": "billing_reports", "label": "Billing Reports", "purpose": "Generate invoice, collection, overdue balance and subscription reports."},
        {"key": "notifications", "label": "Notifications", "purpose": "Receive payment failures, upcoming renewals and billing alerts."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manage personal details and account security."},
    ],
    "Technical": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows service availability, active incidents, errors and system health."},
        {"key": "system_health", "label": "System Health", "purpose": "Monitors backend performance, database health, resource usage and application status."},
        {"key": "service_status", "label": "Service Status", "purpose": "Shows the availability of individual services and dependencies."},
        {"key": "error_logs", "label": "Error Logs", "purpose": "Helps authorized engineers investigate application failures and exceptions."},
        {"key": "technical_support_tickets", "label": "Technical Support Tickets", "purpose": "Tracks software bugs and technical issues escalated from support teams."},
        {"key": "api_monitoring", "label": "API Monitoring", "purpose": "Monitors API response times, errors, latency and availability."},
        {"key": "integration_status", "label": "Integration Status", "purpose": "Checks connections to email, payment, storage and other external services."},
        {"key": "deployment_history", "label": "Deployment History", "purpose": "Tracks releases, deployment outcomes and changes to application versions."},
        {"key": "incident_management", "label": "Incident Management", "purpose": "Records outages, assigns incident owners and tracks recovery actions."},
        {"key": "notifications", "label": "Notifications", "purpose": "Sends alerts about outages, failures and technical incidents."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal information and account security."},
    ],
    "Audit": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows audit activity, critical findings and pending reviews."},
        {"key": "audit_logs", "label": "Audit Logs", "purpose": "Search historical records of important platform actions."},
        {"key": "employee_activity", "label": "Employee Activity", "purpose": "Review authorized records of employee actions and administrative changes."},
        {"key": "tenant_activity", "label": "Tenant Activity", "purpose": "Review significant company account changes, suspensions and configuration events."},
        {"key": "role_permission_changes", "label": "Role & Permission Changes", "purpose": "Track who granted, revoked or modified access permissions."},
        {"key": "security_events", "label": "Security Events", "purpose": "Review recorded security incidents and access-related events."},
        {"key": "billing_audit", "label": "Billing Audit", "purpose": "Check subscription, invoice, payment and refund actions for irregularities."},
        {"key": "support_ticket_audit", "label": "Support Ticket Audit", "purpose": "Review ticket handling, escalations, resolution records and SLA compliance."},
        {"key": "compliance_reports", "label": "Compliance Reports", "purpose": "Prepare reports demonstrating adherence to internal policies and applicable requirements."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manage personal details and account security."},
    ],
    "Finance": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows revenue, expenses, profit estimates and reconciliation status."},
        {"key": "revenue_overview", "label": "Revenue Overview", "purpose": "Summarizes subscription income and other platform revenue."},
        {"key": "expenses", "label": "Expenses", "purpose": "Records and categorizes company operating expenses."},
        {"key": "transactions", "label": "Transactions", "purpose": "Displays authorized financial transaction records and statuses."},
        {"key": "reconciliation", "label": "Reconciliation", "purpose": "Compares payment-provider records, invoices and internal financial records."},
        {"key": "refunds_adjustments", "label": "Refunds & Adjustments", "purpose": "Reviews financial effects of refunds, credits and adjustments."},
        {"key": "financial_reports", "label": "Financial Reports", "purpose": "Generates revenue, expense, profitability and cash-flow reports."},
        {"key": "monthly_statements", "label": "Monthly Statements", "purpose": "Produces monthly financial summaries and transaction statements."},
        {"key": "notifications", "label": "Notifications", "purpose": "Highlights reconciliation discrepancies and financial reporting deadlines."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal and account settings."},
    ],
    "Security Administrator": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows security alerts, failed logins, suspicious events and unresolved incidents."},
        {"key": "login_activity", "label": "Login Activity", "purpose": "Reviews successful login history, timestamps and relevant access details."},
        {"key": "failed_login_attempts", "label": "Failed Login Attempts", "purpose": "Detects repeated unsuccessful sign-in attempts and potential brute-force activity."},
        {"key": "suspicious_activity", "label": "Suspicious Activity", "purpose": "Investigates unusual login patterns or potentially unauthorized actions."},
        {"key": "security_incidents", "label": "Security Incidents", "purpose": "Records incidents, severity, investigation status and remediation steps."},
        {"key": "user_access_reviews", "label": "User Access Reviews", "purpose": "Reviews whether employees still need their assigned access."},
        {"key": "roles_permissions_review", "label": "Roles & Permissions Review", "purpose": "Checks for excessive permissions and improper role assignments."},
        {"key": "sessions_devices", "label": "Sessions & Devices", "purpose": "Reviews active sessions and supports authorized session revocation."},
        {"key": "security_reports", "label": "Security Reports", "purpose": "Summarizes incidents, security trends and remediation progress."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal details and security settings."},
    ],
    "Analyst": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Summarizes platform growth, usage, revenue trends and support performance."},
        {"key": "platform_overview", "label": "Platform Overview", "purpose": "Shows high-level platform adoption and operational metrics."},
        {"key": "tenant_analytics", "label": "Tenant Analytics", "purpose": "Analyzes company registrations, active tenants and customer retention."},
        {"key": "industry_analytics", "label": "Industry Analytics", "purpose": "Compares adoption, growth and performance across the 10 industries."},
        {"key": "user_employee_analytics", "label": "User & Employee Analytics", "purpose": "Tracks authorized, preferably aggregated, user adoption and platform workforce metrics."},
        {"key": "subscription_analytics", "label": "Subscription Analytics", "purpose": "Analyzes plan distribution, upgrades, downgrades and subscription churn."},
        {"key": "revenue_analytics", "label": "Revenue Analytics", "purpose": "Studies recurring revenue, revenue growth and revenue by subscription plan."},
        {"key": "support_analytics", "label": "Support Analytics", "purpose": "Measures ticket volume, resolution time, common issues and SLA performance."},
        {"key": "growth_retention", "label": "Growth & Retention", "purpose": "Identifies growth patterns, customer retention and churn trends."},
        {"key": "custom_reports", "label": "Custom Reports", "purpose": "Allows users to combine approved metrics and reporting filters."},
        {"key": "export_reports", "label": "Export Reports", "purpose": "Exports authorized reports in supported formats."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal details and account settings."},
    ],
    # 7 Reusable Industry Team Roles (pages 19-26)
    "Team Admin": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows team members, open tickets, workload, pending tasks, and team performance."},
        {"key": "team_members", "label": "Team Members", "purpose": "View team employees, their details, status, and assigned responsibilities."},
        {"key": "team_manager", "label": "Team Manager", "purpose": "View the team's manager and management details."},
        {"key": "role_assignments", "label": "Role Assignments", "purpose": "Assign or change team roles within authorized permissions."},
        {"key": "team_configuration", "label": "Team Configuration", "purpose": "Manage team settings, working arrangements, and team-specific configuration."},
        {"key": "support_tickets", "label": "Support Tickets", "purpose": "View tickets belonging to the industry team."},
        {"key": "ticket_assignments", "label": "Ticket Assignments", "purpose": "Assign tickets to appropriate support employees."},
        {"key": "team_performance", "label": "Team Performance", "purpose": "Monitor ticket resolution, workload, and employee performance."},
        {"key": "audit_activity_history", "label": "Audit / Activity History", "purpose": "Review team-related actions and changes."},
        {"key": "notifications", "label": "Notifications", "purpose": "Receive team updates, new assignments, and important alerts."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manage personal details, password, and security settings."},
    ],
    "Team Manager": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Displays ticket totals, overdue issues, team workload, and performance indicators."},
        {"key": "my_team", "label": "My Team", "purpose": "Shows the team or teams the manager supervises."},
        {"key": "team_members", "label": "Team Members", "purpose": "View employee assignments, availability, and workload."},
        {"key": "all_team_tickets", "label": "All Team Tickets", "purpose": "View tickets assigned to the manager's authorized team."},
        {"key": "ticket_assignments", "label": "Ticket Assignments", "purpose": "Distribute and reassign tickets based on workload and expertise."},
        {"key": "escalations", "label": "Escalations", "purpose": "Handle complex, urgent, or overdue issues."},
        {"key": "workload_management", "label": "Workload Management", "purpose": "Balance ticket assignments across team members."},
        {"key": "sla_monitoring", "label": "SLA Monitoring", "purpose": "Track whether support issues are handled within agreed response and resolution times."},
        {"key": "team_performance", "label": "Team Performance", "purpose": "Compare resolution times, ticket volumes, and team performance."},
        {"key": "reports", "label": "Reports", "purpose": "Generate operational and team-performance reports."},
        {"key": "notifications", "label": "Notifications", "purpose": "Receive escalations, overdue-ticket alerts, and team updates."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manage personal and account details."},
    ],
    "Industry Support": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows assigned tickets, priorities, unresolved issues, and today's workload."},
        {"key": "my_tickets", "label": "My Tickets", "purpose": "Lists tickets assigned to the logged-in support employee."},
        {"key": "team_tickets", "label": "Team Tickets", "purpose": "Shows tickets accessible to the employee within their industry team."},
        {"key": "new_open_tickets", "label": "New / Open Tickets", "purpose": "Displays issues awaiting investigation or action."},
        {"key": "in_progress", "label": "In Progress", "purpose": "Tracks issues currently being investigated or resolved."},
        {"key": "waiting_for_customer", "label": "Waiting for Customer", "purpose": "Lists issues requiring additional information from the customer."},
        {"key": "resolved_tickets", "label": "Resolved Tickets", "purpose": "Shows issues marked as resolved and their resolution details."},
        {"key": "customer_lookup", "label": "Customer Lookup", "purpose": "Finds the customer company and displays information necessary to resolve its issue."},
        {"key": "knowledge_base", "label": "Knowledge Base", "purpose": "Provides troubleshooting guides, FAQs, and internal support documentation."},
        {"key": "escalations", "label": "Escalations", "purpose": "Transfers issues to a Team Manager, central Technical team, or Billing team when necessary."},
        {"key": "notifications", "label": "Notifications", "purpose": "Alerts employees about new tickets, customer replies, and approaching deadlines."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal details and account security."},
    ],
    "Team Auditor": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows audit activity, pending reviews, findings, and compliance indicators."},
        {"key": "audit_overview", "label": "Audit Overview", "purpose": "Summarizes the team's audit status and review progress."},
        {"key": "ticket_audit", "label": "Ticket Audit", "purpose": "Reviews ticket assignments, communications, status changes, and resolutions."},
        {"key": "resolution_reviews", "label": "Resolution Reviews", "purpose": "Checks whether issues were resolved appropriately and documented properly."},
        {"key": "sla_compliance", "label": "SLA Compliance", "purpose": "Reviews adherence to response and resolution targets."},
        {"key": "employee_activity", "label": "Employee Activity", "purpose": "Reviews authorized records of employee actions."},
        {"key": "role_change_history", "label": "Role Change History", "purpose": "Tracks changes to employee roles and permissions."},
        {"key": "compliance_reports", "label": "Compliance Reports", "purpose": "Generates reports about process adherence and identified issues."},
        {"key": "audit_findings", "label": "Audit Findings", "purpose": "Records problems found during reviews, recommendations, and follow-up actions."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal details and account security."},
    ],
    "Team Finance": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows team budget, expenses, pending expense requests, and financial summaries."},
        {"key": "finance_overview", "label": "Finance Overview", "purpose": "Provides a summary of the team's financial position."},
        {"key": "team_expenses", "label": "Team Expenses", "purpose": "Lists expenses incurred by the team."},
        {"key": "expense_requests", "label": "Expense Requests", "purpose": "Reviews requests for team-related expenditure."},
        {"key": "budget_overview", "label": "Budget Overview", "purpose": "Displays allocated budgets, spending, and remaining balances."},
        {"key": "transactions", "label": "Transactions", "purpose": "Shows authorized records of financial transactions."},
        {"key": "financial_reports", "label": "Financial Reports", "purpose": "Generates expense, budget, and financial summary reports."},
        {"key": "reconciliation", "label": "Reconciliation", "purpose": "Compares relevant financial records to identify discrepancies."},
        {"key": "notifications", "label": "Notifications", "purpose": "Alerts employees about expense approvals, budget limits, and financial tasks."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal details and account settings."},
    ],
    "Team Analyst": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows industry-team KPIs, ticket trends, resolution performance, and customer issue patterns."},
        {"key": "industry_overview", "label": "Industry Overview", "purpose": "Summarizes activity and performance for the assigned industry."},
        {"key": "ticket_analytics", "label": "Ticket Analytics", "purpose": "Analyzes ticket volume, categories, priorities, and status distribution."},
        {"key": "resolution_time_analysis", "label": "Resolution Time Analysis", "purpose": "Measures average resolution times and identifies delays."},
        {"key": "sla_performance", "label": "SLA Performance", "purpose": "Analyzes compliance with response and resolution targets."},
        {"key": "customer_issue_trends", "label": "Customer Issue Trends", "purpose": "Identifies common problems reported by companies in the industry."},
        {"key": "team_performance", "label": "Team Performance", "purpose": "Analyzes workload, productivity, and ticket outcomes."},
        {"key": "industry_reports", "label": "Industry Reports", "purpose": "Generates reports specific to the assigned industry."},
        {"key": "custom_reports", "label": "Custom Reports", "purpose": "Builds reports using approved metrics and filters."},
        {"key": "export_reports", "label": "Export Reports", "purpose": "Exports authorized reports for review and planning."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal details and account settings."},
    ],
    "Industry Sales": [
        {"key": "dashboard", "label": "Dashboard", "purpose": "Shows industry leads, prospects, conversions, sales targets, and follow-ups."},
        {"key": "industry_leads", "label": "Industry Leads", "purpose": "Stores potential customers associated with the assigned industry."},
        {"key": "prospects", "label": "Prospects", "purpose": "Tracks qualified companies interested in SCuilONE."},
        {"key": "companies_tenants", "label": "Companies / Tenants", "purpose": "Views authorized customer company details and onboarding status."},
        {"key": "sales_pipeline", "label": "Sales Pipeline", "purpose": "Tracks opportunities through stages such as New, Qualified, Demo, Negotiation, and Won/Lost."},
        {"key": "followups_activities", "label": "Follow-ups & Activities", "purpose": "Schedules calls, meetings, reminders, and sales activities."},
        {"key": "demonstrations", "label": "Demonstrations", "purpose": "Schedules product demonstrations and records their outcomes."},
        {"key": "onboarding", "label": "Onboarding", "purpose": "Tracks the handover and initial setup of newly registered customers."},
        {"key": "sales_performance", "label": "Sales Performance", "purpose": "Measures conversions, pipeline value, and sales target progress."},
        {"key": "industry_reports", "label": "Industry Reports", "purpose": "Reports on leads, conversions, and customer acquisition for the assigned industry."},
        {"key": "notifications", "label": "Notifications", "purpose": "Provides follow-up reminders, new lead assignments, and sales updates."},
        {"key": "my_profile", "label": "My Profile", "purpose": "Manages personal details and account settings."},
    ],
}

PLATFORM_PERMISSIONS = [
    ("platform.owner.manage", "Full platform ownership and Super Admin control"),
    ("platform.dashboard.view", "View authorized platform or industry team dashboard"),
    ("platform.tenants.view", "View customer company / tenant records"),
    ("platform.tenants.manage", "Create, activate, suspend, and provision tenants"),
    ("platform.employees.view", "View platform and industry team employees"),
    ("platform.employees.manage", "Create, edit, activate, or deactivate platform employees"),
    ("platform.teams.view", "View industry teams, members, and workloads"),
    ("platform.teams.manage", "Configure industry teams, roles, and budgets"),
    ("platform.roles.view", "View platform and industry team roles and permissions"),
    ("platform.roles.manage", "Manage role permissions and assignments"),
    ("platform.industries.view", "View supported platform industries"),
    ("platform.industries.manage", "Add, edit, or deactivate supported industries"),
    ("platform.plans.view", "View subscription plans and limits"),
    ("platform.plans.manage", "Create and update subscription plans"),
    ("platform.billing.view", "View subscriptions, invoices, payments, and renewals"),
    ("platform.billing.manage", "Create invoices, record payments, and manage subscriptions"),
    ("platform.refunds.manage", "Approve, reject, or process customer refund requests"),
    ("platform.tickets.view", "View support tickets within authorized scope"),
    ("platform.tickets.manage", "Update, resolve, and comment on support tickets"),
    ("platform.tickets.assign", "Assign or reassign support tickets"),
    ("platform.tickets.escalate", "Escalate support tickets to managers, Technical, or Billing"),
    ("platform.kb.view", "View knowledge base articles and troubleshooting guides"),
    ("platform.kb.manage", "Create and update knowledge base articles"),
    ("platform.sales.view", "View sales leads, prospects, pipeline, demos, and onboarding"),
    ("platform.sales.manage", "Create and update sales leads, prospects, demos, and onboarding"),
    ("platform.technical.view", "View system health, service status, error logs, and API metrics"),
    ("platform.technical.manage", "Manage technical incidents, deployments, and bug escalations"),
    ("platform.audit.view", "Read-only access to audit logs, compliance, and activity reviews"),
    ("platform.audit.findings.create", "Record independent audit findings and review notes"),
    ("platform.finance.view", "View revenue, expenses, budgets, transactions, and statements"),
    ("platform.finance.manage", "Create/approve expenses, budgets, and financial reconciliation"),
    ("platform.security.view", "View login activity, failed logins, security events, and sessions"),
    ("platform.security.manage", "Manage security incidents, access reviews, and revoke sessions"),
    ("platform.analytics.view", "View aggregate platform and industry business intelligence metrics"),
    ("platform.analytics.export", "Export analytical and custom reports"),
    ("platform.settings.manage", "Configure global platform settings and security policies"),
]

PLATFORM_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "Platform Super Admin": [p[0] for p in PLATFORM_PERMISSIONS],
    "Platform Admin": [
        "platform.dashboard.view",
        "platform.tenants.view",
        "platform.tenants.manage",
        "platform.employees.view",
        "platform.employees.manage",
        "platform.teams.view",
        "platform.teams.manage",
        "platform.roles.view",
        "platform.roles.manage",
        "platform.industries.view",
        "platform.industries.manage",
        "platform.plans.view",
        "platform.billing.view",
        "platform.billing.manage",
        "platform.audit.view",
        "platform.tickets.view",
        "platform.tickets.manage",
        "platform.tickets.assign",
        "platform.tickets.escalate",
        "platform.kb.view",
        "platform.kb.manage",
        "platform.analytics.view",
    ],
    "Platform Manager": [
        "platform.dashboard.view",
        "platform.employees.view",
        "platform.teams.view",
        "platform.tickets.view",
        "platform.tickets.manage",
        "platform.tickets.assign",
        "platform.tickets.escalate",
        "platform.kb.view",
        "platform.analytics.view",
    ],
    "Platform Support": [
        "platform.dashboard.view",
        "platform.tenants.view",
        "platform.tickets.view",
        "platform.tickets.manage",
        "platform.tickets.escalate",
        "platform.kb.view",
    ],
    "Sales": [
        "platform.dashboard.view",
        "platform.tenants.view",
        "platform.plans.view",
        "platform.sales.view",
        "platform.sales.manage",
        "platform.analytics.view",
    ],
    "Billing": [
        "platform.dashboard.view",
        "platform.tenants.view",
        "platform.plans.view",
        "platform.plans.manage",
        "platform.billing.view",
        "platform.billing.manage",
        "platform.refunds.manage",
        "platform.tickets.view",
        "platform.tickets.manage",
    ],
    "Technical": [
        "platform.dashboard.view",
        "platform.technical.view",
        "platform.technical.manage",
        "platform.tickets.view",
        "platform.tickets.manage",
        "platform.kb.view",
        "platform.kb.manage",
    ],
    "Audit": [
        "platform.dashboard.view",
        "platform.audit.view",
        "platform.audit.findings.create",
        "platform.tenants.view",
        "platform.employees.view",
        "platform.roles.view",
        "platform.billing.view",
        "platform.tickets.view",
        "platform.security.view",
    ],
    "Finance": [
        "platform.dashboard.view",
        "platform.finance.view",
        "platform.finance.manage",
        "platform.billing.view",
        "platform.plans.view",
        "platform.analytics.view",
        "platform.analytics.export",
    ],
    "Security Administrator": [
        "platform.dashboard.view",
        "platform.security.view",
        "platform.security.manage",
        "platform.employees.view",
        "platform.roles.view",
        "platform.audit.view",
    ],
    "Analyst": [
        "platform.dashboard.view",
        "platform.analytics.view",
        "platform.analytics.export",
    ],
    # 7 Reusable Industry Team Roles
    "Team Admin": [
        "platform.dashboard.view",
        "platform.employees.view",
        "platform.employees.manage",
        "platform.teams.view",
        "platform.teams.manage",
        "platform.roles.view",
        "platform.tickets.view",
        "platform.tickets.manage",
        "platform.tickets.assign",
        "platform.tickets.escalate",
        "platform.audit.view",
        "platform.kb.view",
    ],
    "Team Manager": [
        "platform.dashboard.view",
        "platform.employees.view",
        "platform.teams.view",
        "platform.tickets.view",
        "platform.tickets.manage",
        "platform.tickets.assign",
        "platform.tickets.escalate",
        "platform.kb.view",
        "platform.analytics.view",
    ],
    "Industry Support": [
        "platform.dashboard.view",
        "platform.tenants.view",
        "platform.tickets.view",
        "platform.tickets.manage",
        "platform.tickets.escalate",
        "platform.kb.view",
    ],
    "Team Auditor": [
        "platform.dashboard.view",
        "platform.audit.view",
        "platform.audit.findings.create",
        "platform.employees.view",
        "platform.roles.view",
        "platform.tickets.view",
    ],
    "Team Finance": [
        "platform.dashboard.view",
        "platform.finance.view",
        "platform.finance.manage",
        "platform.teams.view",
    ],
    "Team Analyst": [
        "platform.dashboard.view",
        "platform.analytics.view",
        "platform.analytics.export",
        "platform.teams.view",
    ],
    "Industry Sales": [
        "platform.dashboard.view",
        "platform.tenants.view",
        "platform.plans.view",
        "platform.sales.view",
        "platform.sales.manage",
    ],
}


def get_dashboard_metadata(role_name: str, industry_key: str | None = None) -> dict:
    for r in CENTRAL_PLATFORM_ROLES:
        if r["name"] == role_name:
            return {
                "dashboard_key": r["dashboard_key"],
                "dashboard_title": r["dashboard_title"],
                "dashboard_category": "central_platform",
                "role_scope": "platform",
                "role_name": role_name,
                "industry_key": None,
                "sidebar_modules": ROLE_SIDEBAR_MODULES.get(role_name, []),
            }
    for r in REUSABLE_INDUSTRY_ROLES:
        if r["name"] == role_name:
            return {
                "dashboard_key": r["dashboard_key"],
                "dashboard_title": f"{r['dashboard_title']} ({industry_key or 'Industry'})",
                "dashboard_category": "reusable_industry",
                "role_scope": "industry_team",
                "role_name": role_name,
                "industry_key": industry_key,
                "sidebar_modules": ROLE_SIDEBAR_MODULES.get(role_name, []),
            }
    return {
        "dashboard_key": "tenant_crm_dashboard",
        "dashboard_title": "CRM Dashboard",
        "dashboard_category": "tenant_crm",
        "role_scope": "tenant",
        "role_name": role_name,
        "industry_key": industry_key,
        "sidebar_modules": [],
    }


def require_platform_employee(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> dict:
    """Require a real active platform employee in the dedicated platform tenant."""
    user_id = UUID(str(current_user["user_id"]))
    emp = db.query(PlatformEmployee).filter(PlatformEmployee.user_id == user_id).first()
    if not emp:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform employee access required. Customer tenant users cannot access platform administration.",
        )

    platform_tenant = (
        db.query(Tenant.id)
        .filter((Tenant.is_platform.is_(True)) | (Tenant.name == PLATFORM_TENANT_NAME))
        .first()
    )
    if not platform_tenant or str(current_user.get("tenant_id")) != str(platform_tenant[0]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform employee account is not associated with the platform tenant.",
        )

    if emp.role_name not in ALL_PLATFORM_ROLE_NAMES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid platform role assignment.")
    if (emp.role_name == "Platform Super Admin") != bool(emp.is_platform_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform ownership and Super Admin role are inconsistent. Contact another Super Admin.")
    expected_scope = "industry_team" if emp.role_name in INDUSTRY_ROLE_NAMES else "platform"
    if emp.role_scope != expected_scope:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform role scope is inconsistent with the assigned role.")
    if emp.role_scope == "industry_team" and not normalize_industry_key(emp.industry_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Industry team employee has no valid industry scope.")

    return {
        **current_user,
        "role": emp.role_name,
        "role_scope": emp.role_scope,
        "industry_key": emp.industry_key,
        "industry_team_id": str(emp.industry_team_id) if emp.industry_team_id else None,
        "is_platform_owner": bool(emp.is_platform_owner),
        "employee_id": str(emp.id),
        "employee_code": emp.employee_code,
    }


def get_role_permission_names(db: Session, role_name: str | None) -> list[str]:
    """Return platform permissions granted to a role in the database."""
    if not role_name:
        return []
    platform_permission_names = [name for name, _ in PLATFORM_PERMISSIONS]
    if role_name == "Platform Super Admin":
        return platform_permission_names
    rows = (
        db.query(Permission.name)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .filter(Role.name == role_name, Permission.name.in_(platform_permission_names))
        .all()
    )
    return sorted({row[0] for row in rows})


def require_platform_permission(permission_name: str):
    """Enforce DB-backed platform RBAC; no hard-coded permission fallback."""
    def checker(
        platform_user: dict = Depends(require_platform_employee),
        db: Session = Depends(get_db),
    ) -> dict:
        if platform_user.get("role") == "Platform Super Admin" and platform_user.get("is_platform_owner"):
            return platform_user
        granted = get_role_permission_names(db, platform_user.get("role"))
        if permission_name not in granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{platform_user.get('role')}' does not have permission '{permission_name}'.",
            )
        return platform_user
    return checker


def enforce_target_industry_scope(platform_user: dict, target_industry: str | None) -> None:
    """Deny industry-scoped staff access to records outside their assigned industry."""
    if platform_user.get("role_scope") != "industry_team":
        return
    own = normalize_industry_key(platform_user.get("industry_key"))
    target = normalize_industry_key(target_industry) if target_industry else None
    if not own or not target or target != own:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: this record is outside your industry scope.",
        )


def enforce_industry_scope(platform_user: dict, requested_industry: str | None = None) -> str | None:
    """
    Enforces Design Rule 2 & 4:
    - If the employee belongs to an Industry Team (7 reusable roles), they can ONLY access data for their assigned industry_key.
    - If they request another industry's data, raise 403 Forbidden.
    - Central Platform roles can view all industries or filter by requested_industry.
    """
    norm_requested = normalize_industry_key(requested_industry) if requested_industry else None
    if platform_user.get("role_scope") == "industry_team":
        emp_industry = normalize_industry_key(platform_user.get("industry_key"))
        if not emp_industry:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Industry team employee has no assigned industry scope.",
            )
        if norm_requested and norm_requested != emp_industry:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cross-industry access denied: your role is scoped to '{emp_industry}' only.",
            )
        return emp_industry
    return norm_requested


def auto_route_support_ticket(
    db: Session,
    ticket: SupportTicket,
    tenant: Tenant | None = None,
    actor_user_id: UUID | None = None,
) -> PlatformSupportTicketMeta:
    """
    Automatically routes a customer company support ticket (Design Rule 4):
    1. Identifies customer company's industry -> maps to one of the 10 Industry Teams.
    2. Checks issue type from category/subject -> Support, Technical, or Billing.
    3. Assigns to least-loaded active Industry Support (or Technical/Billing) employee if not yet assigned.
    4. Sets SLA response and resolution deadlines based on team SLA config.
    """
    existing_meta = (
        db.query(PlatformSupportTicketMeta)
        .filter(PlatformSupportTicketMeta.ticket_id == ticket.id)
        .first()
    )
    if existing_meta:
        return existing_meta

    if tenant is None:
        tenant = db.query(Tenant).filter(Tenant.id == ticket.tenant_id).first()

    from app.services.platform_config import get_platform_config
    routing_config = get_platform_config(db, "platform.ticket_routing")
    industry_key = normalize_industry_key(tenant.industry if tenant else None)
    if not industry_key:
        industry_key = "unmapped"
    team = None
    if routing_config.get("route_by_industry_first", True):
        team = next((candidate for candidate in db.query(PlatformIndustryTeam).all()
                     if normalize_industry_key(candidate.industry_key) == industry_key), None)

    issue_type, routing_queue = classify_ticket_issue_type(ticket.category, ticket.subject)
    if not routing_config.get("route_by_issue_type_second", True):
        issue_type, routing_queue = "Support", "Industry Support"
    now = datetime.utcnow()
    configured_response = int(routing_config.get("default_sla_response_minutes", 60))
    configured_resolution = int(routing_config.get("default_sla_resolution_hours", 24))
    # Explicit team SLA overrides remain authoritative; unchanged seed defaults inherit platform policy.
    sla_resp_mins = team.sla_response_minutes if team and team.sla_response_minutes != 60 else configured_response
    sla_res_hours = team.sla_resolution_hours if team and team.sla_resolution_hours != 24 else configured_resolution
    if ticket.priority == "Urgent":
        sla_resp_mins = max(15, sla_resp_mins // 2)
        sla_res_hours = max(4, sla_res_hours // 2)
    elif ticket.priority == "High":
        sla_resp_mins = max(30, int(sla_resp_mins * 0.75))
        sla_res_hours = max(8, int(sla_res_hours * 0.75))

    def _pick_least_loaded(candidates: list[PlatformEmployee]) -> PlatformEmployee | None:
        if candidates and not routing_config.get("auto_assign_least_loaded", True):
            return candidates[0]
        best_emp = None
        best_load = None
        for emp_cand in candidates:
            active_load = (
                db.query(PlatformSupportTicketMeta)
                .join(SupportTicket, SupportTicket.id == PlatformSupportTicketMeta.ticket_id)
                .filter(
                    PlatformSupportTicketMeta.assigned_employee_user_id == emp_cand.user_id,
                    SupportTicket.status.notin_(["Resolved", "Closed"]),
                )
                .count()
            )
            max_load = emp_cand.max_ticket_load or 25
            if active_load >= max_load:
                continue
            if best_load is None or active_load < best_load:
                best_emp = emp_cand
                best_load = active_load
        return best_emp

    def _industry_role_candidates(role_name: str) -> list[PlatformEmployee]:
        return [candidate for candidate in q.filter(PlatformEmployee.role_name == role_name).all()
                if normalize_industry_key(candidate.industry_key) == industry_key]

    assigned_emp_user_id = ticket.assigned_to
    if not assigned_emp_user_id:
        # Find least-loaded active platform employee for this queue
        q = (
            db.query(PlatformEmployee)
            .join(User, User.id == PlatformEmployee.user_id)
            .filter(
                User.status == "Active",
                PlatformEmployee.availability_status == "Available",
            )
            .order_by(PlatformEmployee.created_at.asc())
        )
        if routing_queue == "Technical":
            candidate = _pick_least_loaded(q.filter(PlatformEmployee.role_name == "Technical").all())
        elif routing_queue == "Billing":
            industry_finance = (
                _industry_role_candidates("Team Finance")
                if routing_config.get("route_by_industry_first", True) else []
            )
            candidate = _pick_least_loaded(industry_finance) or _pick_least_loaded(
                q.filter(PlatformEmployee.role_name == "Billing").all()
            )
        else:
            industry_support = (
                _pick_least_loaded(_industry_role_candidates("Industry Support"))
                or _pick_least_loaded(_industry_role_candidates("Team Manager"))
                if routing_config.get("route_by_industry_first", True) else None
            )
            candidate = industry_support or _pick_least_loaded(
                q.filter(PlatformEmployee.role_name == "Platform Support").all()
            )
        if candidate:
            assigned_emp_user_id = candidate.user_id
            if not ticket.assigned_to:
                ticket.assigned_to = candidate.user_id

    history_entry = {
        "timestamp": now.isoformat(),
        "action": "auto_routed",
        "industry_key": industry_key,
        "issue_type": issue_type,
        "routing_queue": routing_queue,
        "assigned_employee_user_id": str(assigned_emp_user_id) if assigned_emp_user_id else None,
        "actor_user_id": str(actor_user_id) if actor_user_id else None,
    }

    meta = PlatformSupportTicketMeta(
        ticket_id=ticket.id,
        tenant_id=ticket.tenant_id,
        industry_key=industry_key,
        industry_team_id=team.id if team else None,
        issue_type=issue_type,
        routing_queue=routing_queue,
        assigned_employee_user_id=assigned_emp_user_id,
        sla_response_due_at=now + timedelta(minutes=sla_resp_mins),
        sla_resolution_due_at=now + timedelta(hours=sla_res_hours),
        history_json=[history_entry],
    )
    db.add(meta)
    db.flush()
    return meta
