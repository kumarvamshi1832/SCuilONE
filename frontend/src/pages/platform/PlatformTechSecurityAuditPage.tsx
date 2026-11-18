import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangleIcon,
  EyeIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldAlertIcon,
  XIcon,
  ZapIcon,
} from "../../components/common/SupportPortalIcons";
import { Pagination } from "../../components/common/Pagination";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformAuditOverview,
  PlatformErrorLogItem,
  PlatformSecurityEventsResponse,
  PlatformTechnicalIncident,
} from "../../types/platform";
import "./PlatformPages.css";

export type PlatformAuditCategory =
  | "all"
  | "tenants"
  | "employees"
  | "roles"
  | "billing"
  | "security"
  | "config";

export const isPlatformAuditEvent = (log: {
  module?: string;
  action?: string;
  after_data?: any;
  before_data?: any;
  description?: string;
}): boolean => {
  if (!log) return false;
  const mod = (log.module || "").toLowerCase();
  const act = (log.action || "").toUpperCase();

  // 1. Explicit platform module prefix
  if (mod.startsWith("platform_") || mod.startsWith("platform")) return true;

  // 2. Structured scope metadata
  if (
    log.after_data?.role_scope === "platform" ||
    log.before_data?.role_scope === "platform"
  ) {
    return true;
  }

  // 3. Actor role contains platform
  const actorRoleAfter =
    typeof log.after_data?.actor_role === "string"
      ? log.after_data.actor_role.toLowerCase()
      : "";
  const actorRoleBefore =
    typeof log.before_data?.actor_role === "string"
      ? log.before_data.actor_role.toLowerCase()
      : "";
  if (actorRoleAfter.includes("platform") || actorRoleBefore.includes("platform")) {
    return true;
  }

  // 4. Role field contains platform
  const roleAfter =
    typeof log.after_data?.role === "string"
      ? log.after_data.role.toLowerCase()
      : "";
  const roleBefore =
    typeof log.before_data?.role === "string"
      ? log.before_data.role.toLowerCase()
      : "";
  if (roleAfter.includes("platform") || roleBefore.includes("platform")) {
    return true;
  }

  // 5. Known platform administrative actions
  const platformActions = [
    "CREATE_TENANT",
    "UPDATE_TENANT",
    "SUSPEND_TENANT",
    "DELETE_TENANT",
    "ARCHIVE_TENANT",
    "CREATE_PLATFORM_EMPLOYEE",
    "CREATE_EMPLOYEE",
    "UPDATE_EMPLOYEE",
    "UPDATE_PLATFORM_ROLE",
    "UPDATE_PLATFORM_PERMISSION",
    "CREATE_SUBSCRIPTION_PLAN",
    "CREATE_PLAN",
    "UPDATE_PLAN",
    "ASSIGN_SUBSCRIPTION",
    "ACTIVATE_SUBSCRIPTION",
    "CANCEL_SUBSCRIPTION",
    "SUSPEND_SUBSCRIPTION",
    "REACTIVATE_SUBSCRIPTION",
    "GRANT_COMPLIMENTARY_SUBSCRIPTION",
    "VERIFY_PAYMENT",
    "REVIEW_PAYMENT",
    "RECORD_PAYMENT",
    "CREATE_INVOICE",
    "PROCESS_REFUND",
    "REQUEST_REFUND",
    "DECIDE_REFUND",
    "UPDATE_PLATFORM_SETTINGS",
    "UPDATE_PLATFORM_SETTING",
    "UPDATE_PLATFORM_PROFILE",
    "BOOTSTRAP",
    "REVOKE_SESSIONS",
    "EXPORT_PLATFORM_ANALYTICS",
    "CREATE_TECH_INCIDENT",
  ];
  if (platformActions.includes(act)) return true;

  // Explicit exclusion of tenant-level business CRM activities
  const tenantModules = [
    "leads",
    "contacts",
    "accounts",
    "deals",
    "projects",
    "buildings",
    "properties",
    "building_image",
    "property_image",
    "buyer_requirements",
    "property_matches",
    "site_visits",
    "bookings",
    "payments",
    "payment_plans",
    "payment_refunds",
    "documents",
    "workflows",
    "customer_portal",
    "software_projects",
    "software_contracts",
    "software_estimate",
    "software_invoice",
    "software_requirements",
    "software_sprints",
    "software_time_entry",
    "support_tickets",
    "support_ticket_comments",
    "users",
    "industry_config",
  ];
  if (tenantModules.includes(mod)) return false;

  return false;
};

export const getPlatformAuditCategory = (log: {
  module?: string;
  action?: string;
}): { key: PlatformAuditCategory; label: string } => {
  const mod = (log.module || "").toLowerCase();
  const act = (log.action || "").toUpperCase();

  if (mod === "platform_tenants" || act.includes("TENANT")) {
    return { key: "tenants", label: "Tenant Management" };
  }
  if (
    mod === "platform_employees" ||
    mod === "platform_teams" ||
    act.includes("EMPLOYEE") ||
    act.includes("TEAM")
  ) {
    return { key: "employees", label: "Employees & Teams" };
  }
  if (
    mod === "platform_roles" ||
    act.includes("ROLE") ||
    act.includes("PERMISSION")
  ) {
    return { key: "roles", label: "Roles & Permissions" };
  }
  if (
    mod === "platform_billing" ||
    mod === "platform_plans" ||
    mod === "platform_refunds" ||
    act.includes("SUBSCRIPTION") ||
    act.includes("PLAN") ||
    act.includes("PAYMENT") ||
    act.includes("INVOICE") ||
    act.includes("REFUND")
  ) {
    return { key: "billing", label: "Subscriptions & Billing" };
  }
  if (
    mod === "platform_security" ||
    mod === "platform_auth" ||
    act === "BOOTSTRAP" ||
    act.includes("SESSION") ||
    act.includes("SECURITY") ||
    act.includes("LOGIN") ||
    act.includes("MFA")
  ) {
    return { key: "security", label: "Security" };
  }
  return { key: "config", label: "System Configuration" };
};

export const getFriendlyEventName = (action?: string): string => {
  if (!action) return "Platform Event";
  const act = action.toUpperCase();
  const map: Record<string, string> = {
    CREATE_TENANT: "Create Tenant Company",
    UPDATE_TENANT: "Update Tenant Company",
    SUSPEND_TENANT: "Suspend Tenant Company",
    DELETE_TENANT: "Delete Tenant Company",
    CREATE_PLATFORM_EMPLOYEE: "Create Platform Employee",
    CREATE_EMPLOYEE: "Create Platform Employee",
    UPDATE_EMPLOYEE: "Update Platform Employee",
    UPDATE_PLATFORM_ROLE: "Update Platform Role",
    UPDATE_PLATFORM_PERMISSION: "Update Platform Permission",
    CREATE_SUBSCRIPTION_PLAN: "Create Subscription Plan",
    CREATE_PLAN: "Create Subscription Plan",
    UPDATE_PLAN: "Update Subscription Plan",
    ASSIGN_SUBSCRIPTION: "Assign Subscription",
    ACTIVATE_SUBSCRIPTION: "Activate Subscription",
    CANCEL_SUBSCRIPTION: "Cancel Subscription",
    SUSPEND_SUBSCRIPTION: "Suspend Subscription",
    REACTIVATE_SUBSCRIPTION: "Reactivate Subscription",
    GRANT_COMPLIMENTARY_SUBSCRIPTION: "Grant Complimentary Plan",
    VERIFY_PAYMENT: "Verify Payment",
    REVIEW_PAYMENT: "Review Payment",
    RECORD_PAYMENT: "Record Payment",
    CREATE_INVOICE: "Create Platform Invoice",
    REQUEST_REFUND: "Request Refund",
    DECIDE_REFUND: "Decide Refund",
    PROCESS_REFUND: "Process Refund",
    BOOTSTRAP: "Bootstrap Super Admin",
    REVOKE_SESSIONS: "Revoke Active Sessions",
    UPDATE_PLATFORM_SETTING: "Update Platform Setting",
    UPDATE_PLATFORM_SETTINGS: "Update Platform Settings",
    UPDATE_PLATFORM_PROFILE: "Update Admin Profile",
    EXPORT_PLATFORM_ANALYTICS: "Export Analytics",
    CREATE_TECH_INCIDENT: "Record Technical Incident",
    UPDATE_TECH_INCIDENT: "Update Technical Incident",
    ASSIGN_TICKET: "Assign Platform Ticket",
    ESCALATE_TICKET: "Escalate Platform Ticket",
    UPDATE_TICKET_STATUS: "Update Ticket Status",
  };
  if (map[act]) return map[act];
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const getActorInfo = (log: {
  user_id?: string | null;
  before_data?: any;
  after_data?: any;
  description?: string;
}): { performedBy: string; actorRole: string } => {
  let performedBy = "Platform Super Admin";
  let actorRole = "Platform Super Admin";

  if (log.after_data && typeof log.after_data === "object") {
    if (typeof log.after_data.email === "string" && log.after_data.email) {
      performedBy = log.after_data.email;
    } else if (
      typeof log.after_data.full_name === "string" &&
      log.after_data.full_name
    ) {
      performedBy = log.after_data.full_name;
    }

    if (
      typeof log.after_data.actor_role === "string" &&
      log.after_data.actor_role
    ) {
      actorRole = log.after_data.actor_role;
    } else if (
      typeof log.after_data.role === "string" &&
      log.after_data.role
    ) {
      actorRole = log.after_data.role;
    }
  }

  if (
    actorRole === "Platform Super Admin" &&
    log.before_data &&
    typeof log.before_data === "object"
  ) {
    if (
      typeof log.before_data.actor_role === "string" &&
      log.before_data.actor_role
    ) {
      actorRole = log.before_data.actor_role;
    } else if (
      typeof log.before_data.role === "string" &&
      log.before_data.role
    ) {
      actorRole = log.before_data.role;
    }
  }

  const desc = log.description || "";
  const byMatch = desc.match(/by (Platform [A-Za-z\s]+)/i);
  if (byMatch?.[1]) {
    actorRole = byMatch[1].trim();
    if (performedBy === "Platform Super Admin") {
      performedBy = byMatch[1].trim();
    }
  }

  if (log.user_id && performedBy === "Platform Super Admin") {
    performedBy = `Admin (${log.user_id.slice(0, 8)})`;
  }

  return { performedBy, actorRole };
};

export const getRelatedTenantName = (log: {
  before_data?: any;
  after_data?: any;
  description?: string;
}): string => {
  if (
    log.after_data &&
    typeof log.after_data === "object" &&
    typeof log.after_data.name === "string" &&
    log.after_data.name.trim()
  ) {
    return log.after_data.name.trim();
  }
  if (
    log.before_data &&
    typeof log.before_data === "object" &&
    typeof log.before_data.name === "string" &&
    log.before_data.name.trim()
  ) {
    return log.before_data.name.trim();
  }

  const desc = log.description || "";
  const tenantMatch = desc.match(/tenant ['"]([^'"]+)['"]/i);
  if (tenantMatch?.[1]) return tenantMatch[1].trim();

  const customerMatch = desc.match(/customer company ['"]([^'"]+)['"]/i);
  if (customerMatch?.[1]) return customerMatch[1].trim();

  const toMatch = desc.match(/subscription to ([A-Za-z0-9\s_-]+):/i);
  if (toMatch?.[1]) return toMatch[1].trim();

  return "Global / Central";
};

export const getActionBadgeClass = (action?: string): string => {
  if (!action) return "blue";
  const act = action.toUpperCase();
  if (
    act.includes("CREATE") ||
    act.includes("BOOTSTRAP") ||
    act.includes("ACTIVATE") ||
    act.includes("GRANT") ||
    act.includes("REACTIVATE")
  ) {
    return "green";
  }
  if (
    act.includes("SUSPEND") ||
    act.includes("CANCEL") ||
    act.includes("REVOKE") ||
    act.includes("DELETE")
  ) {
    return "red";
  }
  if (
    act.includes("UPDATE") ||
    act.includes("ASSIGN") ||
    act.includes("REVIEW")
  ) {
    return "yellow";
  }
  return "blue";
};

export const formatAuditDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

// Health API returns the service label under `service`; older shapes used
// `service_name` / `name`. Returns "" when no usable name is present.
const getHealthServiceName = (svc: any): string => {
  for (const key of ["service", "service_name", "name", "label"]) {
    const v = svc?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

type OpsTab =
  | "health"
  | "incidents"
  | "error_logs"
  | "thresholds"
  | "audit"
  | "security";

export default function PlatformTechSecurityAuditPage() {
  const canViewTech = hasPlatformPermission("platform.technical.view");
  const canManageTech = hasPlatformPermission("platform.technical.manage");
  const canViewAudit = hasPlatformPermission("platform.audit.view");
  const canViewSecurity = hasPlatformPermission("platform.security.view");
  const canManageSecurity = hasPlatformPermission("platform.security.manage");

  const defaultTab: OpsTab = canViewTech
    ? "health"
    : canViewSecurity
    ? "security"
    : "audit";

  const [searchParams, setSearchParams] = useSearchParams();
  const resolveOpsTab = (requested: string | null): OpsTab => {
    if (requested === "audit" && canViewAudit) return "audit";
    if (requested === "security" && canViewSecurity) return "security";
    if (
      canViewTech &&
      (requested === "health" ||
        requested === "incidents" ||
        requested === "error_logs" ||
        requested === "thresholds")
    ) {
      return requested;
    }
    return defaultTab;
  };

  const [tab, setTab] = useState<OpsTab>(() =>
    resolveOpsTab(searchParams.get("tab"))
  );

  useEffect(() => {
    const nextTab = resolveOpsTab(searchParams.get("tab"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
  }, [searchParams, canViewTech, canViewSecurity, canViewAudit]);

  const handleSelectTab = (nextTab: OpsTab) => {
    setTab(nextTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", nextTab);
        return next;
      },
      { replace: true }
    );
  };

  // Health & Thresholds
  const [health, setHealth] = useState<any>(null);
  const [thresholds, setThresholds] = useState<Record<string, any>>({});

  // Incidents & Error Logs
  const [incidents, setIncidents] = useState<PlatformTechnicalIncident[]>([]);
  const [incSeverityFilter, setIncSeverityFilter] = useState("");
  const [incStatusFilter, setIncStatusFilter] = useState("");
  const [errorLogs, setErrorLogs] = useState<PlatformErrorLogItem[]>([]);

  // Incident modal
  const [incOpen, setIncOpen] = useState(false);
  const [editInc, setEditInc] = useState<PlatformTechnicalIncident | null>(null);
  const [incTitle, setIncTitle] = useState("");
  const [incType, setIncType] = useState<"Incident" | "Outage" | "ErrorLog" | "Deployment">("Incident");
  const [incService, setIncService] = useState("API Gateway");
  const [incSeverity, setIncSeverity] = useState<"Low" | "Medium" | "High" | "Critical">("Medium");
  const [incStatus, setIncStatus] = useState<"Investigating" | "Identified" | "Monitoring" | "Resolved" | "Deployed">("Investigating");
  const [incDesc, setIncDesc] = useState("");
  const [incRecovery, setIncRecovery] = useState("");

  // Audit & Platform Audit Trail
  const [audit, setAudit] = useState<PlatformAuditOverview | null>(null);
  const [auditCategory, setAuditCategory] = useState<PlatformAuditCategory>("all");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSortOrder, setAuditSortOrder] = useState<"desc" | "asc">("desc");
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 10;
  const [inspectingLog, setInspectingLog] = useState<any | null>(null);
  const [findingOpen, setFindingOpen] = useState(false);
  const [findingTitle, setFindingTitle] = useState("");
  const [findingSeverity, setFindingSeverity] = useState("Warning");
  const [findingDesc, setFindingDesc] = useState("");

  // Security
  const [security, setSecurity] = useState<PlatformSecurityEventsResponse | null>(
    null
  );
  const [secEventTypeFilter, setSecEventTypeFilter] = useState("");
  const [secOpen, setSecOpen] = useState(false);
  const [secTitle, setSecTitle] = useState("");
  const [secType, setSecType] = useState("security_incident");
  const [secSeverity, setSecSeverity] = useState("Warning");
  const [secDesc, setSecDesc] = useState("");
  const [revokeUserId, setRevokeUserId] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTab = async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "health" && canViewTech) {
        const res = await platformService.getTechnicalHealth(true);
        setHealth(res);
      } else if (tab === "incidents" && canViewTech) {
        const res = await platformService.listTechnicalIncidents({
          severity: incSeverityFilter || undefined,
          status: incStatusFilter || undefined,
        });
        setIncidents(res.items || []);
      } else if (tab === "error_logs" && canViewTech) {
        const res = await platformService.listTechnicalErrorLogs();
        setErrorLogs(res.items || []);
      } else if (tab === "thresholds" && canViewTech) {
        const res = await platformService.getTechnicalThresholds();
        setThresholds(res.thresholds || {});
      } else if (tab === "audit" && canViewAudit) {
        const safeGetAudit = async (params?: { module?: string; industry_type?: string }) => {
          try {
            return await platformService.getAuditOverview(params);
          } catch {
            return null;
          }
        };

        const [
          overviewRes,
          tenantsRes,
          billingRes,
          plansRes,
          empRes,
          authRes,
          settingsRes,
          secRes,
          techRes,
          refundRes,
          financeRes,
        ] = await Promise.all([
          safeGetAudit(),
          safeGetAudit({ module: "platform_tenants" }),
          safeGetAudit({ module: "platform_billing" }),
          safeGetAudit({ module: "platform_plans" }),
          safeGetAudit({ module: "platform_employees" }),
          safeGetAudit({ module: "platform_auth" }),
          safeGetAudit({ module: "platform_settings" }),
          safeGetAudit({ module: "platform_security" }),
          safeGetAudit({ module: "platform_technical" }),
          safeGetAudit({ module: "platform_refunds" }),
          safeGetAudit({ module: "platform_finance" }),
        ]);

        const combinedLogsMap = new Map<string, any>();
        const allResponses = [
          overviewRes,
          tenantsRes,
          billingRes,
          plansRes,
          empRes,
          authRes,
          settingsRes,
          secRes,
          techRes,
          refundRes,
          financeRes,
        ];

        for (const res of allResponses) {
          if (res?.audit_logs && Array.isArray(res.audit_logs)) {
            for (const log of res.audit_logs) {
              if (isPlatformAuditEvent(log)) {
                combinedLogsMap.set(log.id, log);
              }
            }
          }
        }

        const platformLogs = Array.from(combinedLogsMap.values());
        const baseOverview = overviewRes || {
          scope: "platform",
          industry_key: null,
          read_only_enforced: true,
          sla_compliance: {
            total_tickets: 0,
            sla_breached_count: 0,
            audit_reviewed_count: 0,
            sla_compliance_percentage: 100,
          },
          audit_findings: [],
          audit_logs: [],
        };

        setAudit({
          ...baseOverview,
          audit_logs: platformLogs,
        });
      } else if (tab === "security" && canViewSecurity) {
        const res = await platformService.listSecurityEvents({
          event_type: secEventTypeFilter || undefined,
        });
        setSecurity(res);
      }
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load operational data."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTab();
  }, [tab, incSeverityFilter, incStatusFilter, secEventTypeFilter]);

  const handleSaveIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      if (editInc) {
        await platformService.updateTechnicalIncident(editInc.id, {
          status: incStatus,
          severity: incSeverity,
          description: incDesc.trim(),
          recovery_actions: incRecovery.trim() || undefined,
        });
        setSuccess(`Updated incident ${editInc.incident_number}.`);
      } else {
        await platformService.createTechnicalIncident({
          title: incTitle.trim(),
          incident_type: incType,
          service_name: incService,
          severity: incSeverity,
          status: incStatus,
          description: incDesc.trim(),
          recovery_actions: incRecovery.trim() || undefined,
        });
        setSuccess("Recorded technical incident.");
      }
      setIncOpen(false);
      setEditInc(null);
      await loadTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to save incident."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveThresholds = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await platformService.updateTechnicalThresholds(thresholds);
      setThresholds(res.thresholds || thresholds);
      setSuccess("Updated live monitoring thresholds.");
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update thresholds."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateFinding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.createAuditFinding({
        event_type: "audit_finding",
        severity: findingSeverity,
        status: "Open",
        title: findingTitle.trim(),
        description: findingDesc.trim(),
      });
      setSuccess("Recorded compliance audit finding.");
      setFindingOpen(false);
      setFindingTitle("");
      setFindingDesc("");
      await loadTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to record audit finding."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSecurityEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.createSecurityEvent({
        event_type: secType,
        severity: secSeverity,
        status: "Open",
        title: secTitle.trim(),
        description: secDesc.trim(),
      });
      setSuccess("Recorded security event.");
      setSecOpen(false);
      setSecTitle("");
      setSecDesc("");
      await loadTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to record security event."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeSessions = async (userId: string) => {
    if (!userId.trim()) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await platformService.revokeUserSessions(userId.trim());
      setSuccess(
        res.message || `Revoked active refresh sessions for user ${userId}.`
      );
      setRevokeUserId("");
      await loadTab();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to revoke sessions."));
    }
  };

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>SRE Telemetry, Security & Audit Governance</h2>
          <p>
            Live system health diagnostics, technical incidents, error logs,
            security incidents, session revocation, and read-only audit logs.
          </p>
        </div>
        <div className="platform-actions-row">
          <button type="button" className="platform-btn" onClick={loadTab}>
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {tab === "health" && canManageTech && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={async () => {
                setLoading(true);
                try {
                  await platformService.runTechnicalChecks();
                  setSuccess("Live health checks executed across services.");
                  await loadTab();
                } catch (err) {
                  setError(
                    extractApiErrorMessage(err, "Failed to run health checks.")
                  );
                } finally {
                  setLoading(false);
                }
              }}
            >
              <ZapIcon size={15} />
              <span>Run Live Checks</span>
            </button>
          )}
          {tab === "incidents" && canManageTech && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => {
                setEditInc(null);
                setIncTitle("");
                setIncDesc("");
                setIncRecovery("");
                setIncSeverity("Medium");
                setIncStatus("Investigating");
                setIncOpen(true);
              }}
            >
              <PlusIcon size={15} />
              <span>Log Incident</span>
            </button>
          )}
          {tab === "audit" && canViewAudit && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => setFindingOpen(true)}
            >
              <PlusIcon size={15} />
              <span>Add Audit Finding</span>
            </button>
          )}
          {tab === "security" && canManageSecurity && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => setSecOpen(true)}
            >
              <PlusIcon size={15} />
              <span>Record Security Event</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      <div className="platform-tabs">
        {canViewTech && (
          <>
            <button
              type="button"
              className={`platform-tab ${tab === "health" ? "active" : ""}`}
              onClick={() => handleSelectTab("health")}
            >
              Live System Health
            </button>
            <button
              type="button"
              className={`platform-tab ${tab === "incidents" ? "active" : ""}`}
              onClick={() => handleSelectTab("incidents")}
            >
              Technical Incidents
            </button>
            <button
              type="button"
              className={`platform-tab ${tab === "error_logs" ? "active" : ""}`}
              onClick={() => handleSelectTab("error_logs")}
            >
              Error Logs
            </button>
            <button
              type="button"
              className={`platform-tab ${tab === "thresholds" ? "active" : ""}`}
              onClick={() => handleSelectTab("thresholds")}
            >
              Monitoring Thresholds
            </button>
          </>
        )}
        {canViewSecurity && (
          <button
            type="button"
            className={`platform-tab ${tab === "security" ? "active" : ""}`}
            onClick={() => handleSelectTab("security")}
          >
            Security & Sessions
          </button>
        )}
        {canViewAudit && (
          <button
            type="button"
            className={`platform-tab ${tab === "audit" ? "active" : ""}`}
            onClick={() => handleSelectTab("audit")}
          >
            Audit & SLA Compliance
          </button>
        )}
      </div>

      {tab === "health" && canViewTech && (
        <div className="platform-card">
          {loading || !health ? (
            <div className="platform-empty">Probing live system health...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="platform-kpi-grid">
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Overall Status</div>
                  <div className="platform-kpi-value">
                    {health.overall_status || health.status || "Operational"}
                  </div>
                  <div className="platform-kpi-sub">
                    Environment: {health.environment || "production"}
                  </div>
                </div>
                {health.system_metrics &&
                  Object.entries(health.system_metrics).map(([k, v]) => (
                    <div key={k} className="platform-kpi-card">
                      <div className="platform-kpi-label">
                        {k.replace(/_/g, " ")}
                      </div>
                      <div className="platform-kpi-value">{String(v)}</div>
                    </div>
                  ))}
              </div>

              {Array.isArray(health.services) && health.services.length > 0 && (
                <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Status</th>
                        <th>Latency / Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.services.map((svc: any, i: number) => (
                        <tr key={getHealthServiceName(svc) || i}>
                          <td>
                            <strong>
                              {getHealthServiceName(svc) || "Unknown Service"}
                            </strong>
                          </td>
                          <td>
                            <span
                              className={`platform-badge ${
                                svc.status === "Healthy" || svc.status === "ok"
                                  ? "green"
                                  : svc.status === "Unavailable"
                                    ? "red"
                                    : "yellow"
                              }`}
                            >
                              {svc.status}
                            </span>
                          </td>
                          <td style={{ fontSize: 12.5 }}>
                            {svc.latency_ms !== undefined
                              ? `${svc.latency_ms} ms`
                              : ""}{" "}
                            {svc.detail || svc.message || svc.error_message || ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <details>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  Raw Health Telemetry Snapshot
                </summary>
                <pre
                  style={{
                    marginTop: 10,
                    padding: 12,
                    borderRadius: 8,
                    background: "var(--plat-surface-alt)",
                    overflowX: "auto",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(health, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}

      {tab === "incidents" && canViewTech && (
        <>
          <div className="platform-filter-bar">
            <select
              className="platform-select"
              value={incSeverityFilter}
              onChange={(e) => setIncSeverityFilter(e.target.value)}
            >
              <option value="">All Severities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
            <select
              className="platform-select"
              value={incStatusFilter}
              onChange={(e) => setIncStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Investigating">Investigating</option>
              <option value="Identified">Identified</option>
              <option value="Monitoring">Monitoring</option>
              <option value="Resolved">Resolved</option>
              <option value="Deployed">Deployed</option>
            </select>
          </div>
          <div className="platform-card">
            {loading ? (
              <div className="platform-empty">Loading incidents...</div>
            ) : incidents.length === 0 ? (
              <div className="platform-empty">No incidents found.</div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Incident</th>
                      <th>Service</th>
                      <th>Severity & Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc) => (
                      <tr key={inc.id}>
                        <td>
                          <strong>{inc.title}</strong>
                          <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                            {inc.incident_number} • {inc.incident_type}
                          </div>
                          <div style={{ fontSize: 12.5, marginTop: 4 }}>
                            {inc.description}
                          </div>
                        </td>
                        <td>{inc.service_name}</td>
                        <td>
                          <span
                            className={`platform-badge ${
                              inc.severity === "Critical" ||
                              inc.severity === "High"
                                ? "red"
                                : "yellow"
                            }`}
                          >
                            {inc.severity}
                          </span>{" "}
                          <span className="platform-badge blue">{inc.status}</span>
                        </td>
                        <td>
                          {canManageTech && (
                            <button
                              type="button"
                              className="platform-btn sm"
                              onClick={() => {
                                setEditInc(inc);
                                setIncTitle(inc.title);
                                setIncSeverity(inc.severity as any);
                                setIncStatus(inc.status as any);
                                setIncDesc(inc.description);
                                setIncRecovery(inc.recovery_actions || "");
                                setIncOpen(true);
                              }}
                            >
                              Update
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "error_logs" && canViewTech && (
        <div className="platform-card">
          {errorLogs.length === 0 ? (
            <div className="platform-empty">No error logs recorded.</div>
          ) : (
            <div className="platform-table-wrap">
              <table className="platform-table">
                <thead>
                  <tr>
                    <th>Code / Endpoint</th>
                    <th>Status / Service</th>
                    <th>Message & Count</th>
                  </tr>
                </thead>
                <tbody>
                  {errorLogs.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <strong>{log.event_code || log.exception_type}</strong>
                        <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                          {log.http_method} {log.endpoint}
                        </div>
                      </td>
                      <td>
                        <span className="platform-badge red">
                          {log.http_status_code || 500}
                        </span>{" "}
                        {log.service_name}
                      </td>
                      <td>
                        <div>{log.safe_message}</div>
                        <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                          Occurrences: {log.occurrence_count} • Last:{" "}
                          {log.last_seen_at}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "thresholds" && canViewTech && (
        <div className="platform-card">
          <div className="platform-card-title">
            <span>Automated Detection & Health Thresholds</span>
          </div>
          <form
            onSubmit={handleSaveThresholds}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div className="platform-form-grid">
              {Object.entries(thresholds).map(([key, val]) => (
                <div key={key} className="platform-field">
                  <label>{key.replace(/_/g, " ")}</label>
                  <input
                    className="platform-input"
                    type={typeof val === "number" ? "number" : "text"}
                    step="any"
                    disabled={!canManageTech}
                    value={val ?? ""}
                    onChange={(e) =>
                      setThresholds((prev) => ({
                        ...prev,
                        [key]:
                          typeof val === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            {canManageTech && (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save Monitoring Thresholds"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {tab === "security" && canViewSecurity && (
        <>
          <div className="platform-kpi-grid">
            <div className="platform-kpi-card">
              <div className="platform-kpi-label">Active Refresh Sessions</div>
              <div className="platform-kpi-value">
                {security?.active_refresh_sessions_count ?? 0}
              </div>
              <div className="platform-kpi-sub">Active sessions across platform</div>
            </div>
            <div className="platform-kpi-card">
              <div className="platform-kpi-label">Security Events Loaded</div>
              <div className="platform-kpi-value">
                {security?.items.length ?? 0}
              </div>
            </div>
          </div>

          {canManageSecurity && (
            <div className="platform-filter-bar">
              <ShieldAlertIcon size={16} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Revoke User Refresh Sessions:
              </span>
              <input
                className="platform-input"
                style={{ minWidth: 260 }}
                placeholder="Target user_id UUID..."
                value={revokeUserId}
                onChange={(e) => setRevokeUserId(e.target.value)}
              />
              <button
                type="button"
                className="platform-btn sm danger"
                onClick={() => handleRevokeSessions(revokeUserId)}
              >
                Revoke All Sessions
              </button>
              <select
                className="platform-select"
                style={{ marginLeft: "auto" }}
                value={secEventTypeFilter}
                onChange={(e) => setSecEventTypeFilter(e.target.value)}
              >
                <option value="">All Event Types</option>
                <option value="login_failed">Failed Logins</option>
                <option value="suspicious_activity">Suspicious Activity</option>
                <option value="security_incident">Security Incidents</option>
                <option value="access_review">Access Reviews</option>
                <option value="login_success">Login Success</option>
              </select>
            </div>
          )}

          <div className="platform-card">
            {!security || security.items.length === 0 ? (
              <div className="platform-empty">No security events recorded.</div>
            ) : (
              <div className="platform-table-wrap">
                <table className="platform-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Severity / Type</th>
                      <th>Actor / IP</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {security.items.map((ev) => (
                      <tr key={ev.id}>
                        <td>
                          <strong>{ev.title}</strong>
                          <div style={{ fontSize: 12.5 }}>{ev.description}</div>
                        </td>
                        <td>
                          <span
                            className={`platform-badge ${
                              ev.severity === "Critical" ||
                              ev.severity === "High"
                                ? "red"
                                : "yellow"
                            }`}
                          >
                            {ev.severity}
                          </span>{" "}
                          <span className="platform-badge">{ev.event_type}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <div>{ev.email || ev.user_id || "—"}</div>
                          <div style={{ color: "var(--plat-muted)" }}>
                            {ev.ip_address || ""}
                          </div>
                        </td>
                        <td>
                          {canManageSecurity && ev.user_id && (
                            <button
                              type="button"
                              className="platform-btn sm danger"
                              onClick={() => handleRevokeSessions(ev.user_id!)}
                            >
                              Revoke Sessions
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "audit" && canViewAudit && (() => {
        const allPlatformLogs = audit?.audit_logs || [];

        // Category counts
        const categoryCounts: Record<PlatformAuditCategory, number> = {
          all: allPlatformLogs.length,
          tenants: 0,
          employees: 0,
          roles: 0,
          billing: 0,
          security: 0,
          config: 0,
        };

        for (const log of allPlatformLogs) {
          const cat = getPlatformAuditCategory(log).key;
          if (categoryCounts[cat] !== undefined) {
            categoryCounts[cat]++;
          }
        }

        const filteredLogs = allPlatformLogs.filter((log) => {
          // Category filter
          if (auditCategory !== "all") {
            const cat = getPlatformAuditCategory(log).key;
            if (cat !== auditCategory) return false;
          }

          // Search text
          if (auditSearch.trim()) {
            const q = auditSearch.toLowerCase().trim();
            const friendlyName = getFriendlyEventName(log.action).toLowerCase();
            const act = (log.action || "").toLowerCase();
            const mod = (log.module || "").toLowerCase();
            const desc = (log.description || "").toLowerCase();
            const tenant = getRelatedTenantName(log).toLowerCase();
            const actor = getActorInfo(log);
            const performed = actor.performedBy.toLowerCase();
            const role = actor.actorRole.toLowerCase();

            const matches =
              friendlyName.includes(q) ||
              act.includes(q) ||
              mod.includes(q) ||
              desc.includes(q) ||
              tenant.includes(q) ||
              performed.includes(q) ||
              role.includes(q) ||
              (log.record_id && log.record_id.toLowerCase().includes(q));

            if (!matches) return false;
          }

          return true;
        });

        filteredLogs.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return auditSortOrder === "asc" ? dateA - dateB : dateB - dateA;
        });

        const pagedLogs = filteredLogs.slice(
          (auditPage - 1) * auditPageSize,
          auditPage * auditPageSize
        );

        return (
          <>
            {audit && (
              <div className="platform-kpi-grid">
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Platform Audit Events</div>
                  <div className="platform-kpi-value">{allPlatformLogs.length}</div>
                  <div className="platform-kpi-sub">Central platform-level operations</div>
                </div>
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">SLA Compliance</div>
                  <div className="platform-kpi-value">
                    {audit.sla_compliance.sla_compliance_percentage}%
                  </div>
                  <div className="platform-kpi-sub">
                    {audit.sla_compliance.sla_breached_count} breached /{" "}
                    {audit.sla_compliance.total_tickets} total tickets
                  </div>
                </div>
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Audit Reviewed Tickets</div>
                  <div className="platform-kpi-value">
                    {audit.sla_compliance.audit_reviewed_count}
                  </div>
                  <div className="platform-kpi-sub">Audited support incidents</div>
                </div>
                <div className="platform-kpi-card">
                  <div className="platform-kpi-label">Compliance Findings</div>
                  <div className="platform-kpi-value">
                    {audit.audit_findings.length}
                  </div>
                  <div className="platform-kpi-sub">
                    Read-only enforced: {audit.read_only_enforced ? "Yes" : "No"}
                  </div>
                </div>
              </div>
            )}

            {/* Platform Audit Trail Card */}
            <div className="platform-card" style={{ marginTop: 14 }}>
              <div className="platform-card-title">
                <div>
                  <span style={{ fontSize: 17, fontWeight: 700 }}>Platform Audit Trail</span>
                  <div style={{ fontSize: 12.5, fontWeight: 400, color: "var(--plat-muted)", marginTop: 2 }}>
                    Central immutable audit trail of administrative operations across SCuilONE Platform
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="platform-badge violet">
                    {filteredLogs.length} of {allPlatformLogs.length} Platform Events
                  </span>
                  <button
                    type="button"
                    className="platform-btn sm"
                    onClick={() => loadTab()}
                    title="Reload audit records from server"
                  >
                    <RefreshIcon size={14} />
                    <span>Refresh Trail</span>
                  </button>
                </div>
              </div>

              {/* Toolbar: Category Pills & Search & Sort */}
              <div className="platform-audit-toolbar">
                <div className="platform-audit-pills">
                  {(
                    [
                      { key: "all", label: "All Platform Events" },
                      { key: "tenants", label: "Tenant Management" },
                      { key: "employees", label: "Employees & Teams" },
                      { key: "roles", label: "Roles & Permissions" },
                      { key: "billing", label: "Subscriptions & Billing" },
                      { key: "security", label: "Security" },
                      { key: "config", label: "System Configuration" },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      className={`platform-audit-pill ${auditCategory === cat.key ? "active" : ""}`}
                      onClick={() => {
                        setAuditCategory(cat.key);
                        setAuditPage(1);
                      }}
                    >
                      <span>{cat.label}</span>
                      <span className="platform-audit-pill-badge">
                        {categoryCounts[cat.key] || 0}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="platform-audit-controls">
                  <div className="platform-audit-search-wrap">
                    <SearchIcon size={15} />
                    <input
                      type="text"
                      className="platform-input platform-audit-search-input"
                      placeholder="Search event name, module, actor, tenant, or description..."
                      value={auditSearch}
                      onChange={(e) => {
                        setAuditSearch(e.target.value);
                        setAuditPage(1);
                      }}
                    />
                    {auditSearch && (
                      <button
                        type="button"
                        style={{
                          position: "absolute",
                          right: 10,
                          background: "none",
                          border: "none",
                          color: "var(--plat-muted)",
                          cursor: "pointer",
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                        onClick={() => {
                          setAuditSearch("");
                          setAuditPage(1);
                        }}
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  <select
                    className="platform-select"
                    style={{ minWidth: 160 }}
                    value={auditSortOrder}
                    onChange={(e) => setAuditSortOrder(e.target.value as "desc" | "asc")}
                  >
                    <option value="desc">Date: Newest First</option>
                    <option value="asc">Date: Oldest First</option>
                  </select>

                  {(auditCategory !== "all" || auditSearch.trim()) && (
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={() => {
                        setAuditCategory("all");
                        setAuditSearch("");
                        setAuditPage(1);
                      }}
                    >
                      Reset Filters
                    </button>
                  )}
                </div>
              </div>

              {/* Table or Empty State */}
              {loading ? (
                <div className="platform-empty">Loading platform audit events...</div>
              ) : filteredLogs.length === 0 ? (
                <div className="platform-empty">
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--plat-text)", marginBottom: 4 }}>
                    No platform audit events found
                  </div>
                  <div style={{ fontSize: 13, color: "var(--plat-muted)", marginBottom: 12 }}>
                    {auditCategory !== "all" || auditSearch.trim()
                      ? "No platform-level records match the selected category or search keyword."
                      : "No platform-level administrative events have been recorded yet."}
                  </div>
                  {(auditCategory !== "all" || auditSearch.trim()) && (
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={() => {
                        setAuditCategory("all");
                        setAuditSearch("");
                        setAuditPage(1);
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div className="platform-table-wrap">
                    <table className="platform-table">
                      <thead>
                        <tr>
                          <th>Event Name & Action</th>
                          <th>Module / Category</th>
                          <th>Performed By</th>
                          <th>Actor Role</th>
                          <th>Related Tenant</th>
                          <th>Event Date & Time</th>
                          <th>Event Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedLogs.map((log) => {
                          const actor = getActorInfo(log);
                          const category = getPlatformAuditCategory(log);
                          const friendlyName = getFriendlyEventName(log.action);
                          const tenantName = getRelatedTenantName(log);
                          const badgeClass = getActionBadgeClass(log.action);
                          const hasPayload = Boolean(log.before_data || log.after_data);

                          return (
                            <tr key={log.id}>
                              <td>
                                <div style={{ fontWeight: 600, color: "var(--plat-text)", fontSize: 13.5 }}>
                                  {friendlyName}
                                </div>
                                <div style={{ marginTop: 3 }}>
                                  <span className={`platform-badge ${badgeClass}`}>
                                    {log.action}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                                  {category.label}
                                </div>
                                <div style={{ fontSize: 11.5, color: "var(--plat-muted)", marginTop: 2 }}>
                                  {log.module}
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>
                                  {actor.performedBy}
                                </div>
                                {log.user_id && (
                                  <div style={{ fontSize: 11, color: "var(--plat-muted)", marginTop: 2 }}>
                                    ID: {log.user_id.slice(0, 8)}...
                                  </div>
                                )}
                              </td>
                              <td>
                                <span className="platform-badge violet" style={{ fontSize: 11 }}>
                                  {actor.actorRole}
                                </span>
                              </td>
                              <td>
                                {tenantName === "Global / Central" ? (
                                  <span style={{ color: "var(--plat-muted)", fontSize: 12.5 }}>
                                    Central / Global
                                  </span>
                                ) : (
                                  <span className="platform-badge blue" style={{ fontSize: 12 }}>
                                    {tenantName}
                                  </span>
                                )}
                              </td>
                              <td style={{ whiteSpace: "nowrap", fontSize: 12.5 }}>
                                {formatAuditDateTime(log.created_at)}
                              </td>
                              <td>
                                <div
                                  style={{
                                    fontSize: 12.5,
                                    color: "var(--plat-muted)",
                                    maxWidth: 300,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={log.description}
                                >
                                  {log.description || "—"}
                                </div>
                                <button
                                  type="button"
                                  className="platform-btn sm"
                                  style={{ marginTop: 4, padding: "2px 8px", fontSize: 11 }}
                                  onClick={() => setInspectingLog(log)}
                                >
                                  <EyeIcon size={12} />
                                  <span>{hasPayload ? "View Diff / Details" : "View Details"}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    currentPage={auditPage}
                    totalItems={filteredLogs.length}
                    pageSize={auditPageSize}
                    onPageChange={setAuditPage}
                    entityName="platform events"
                  />
                </>
              )}
            </div>

            {/* Compliance Findings Card */}
            <div className="platform-card" style={{ marginTop: 14 }}>
              <div className="platform-card-title">
                <div>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    Compliance Findings ({audit?.audit_findings.length ?? 0})
                  </span>
                  <div style={{ fontSize: 12.5, fontWeight: 400, color: "var(--plat-muted)", marginTop: 2 }}>
                    Formal compliance findings, auditor notes, and remediation tracking
                  </div>
                </div>
                <button
                  type="button"
                  className="platform-btn sm primary"
                  onClick={() => setFindingOpen(true)}
                >
                  <PlusIcon size={14} />
                  <span>Record Finding</span>
                </button>
              </div>

              {audit?.audit_findings.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {audit.audit_findings.map((f) => (
                    <div
                      key={f.id}
                      style={{
                        padding: "12px 14px",
                        background: "var(--plat-surface-alt)",
                        borderRadius: 8,
                        border: "1px solid var(--plat-border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 13.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <AlertTriangleIcon size={14} color="#f59e0b" /> {f.title}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <span
                            className={`platform-badge ${
                              f.severity === "Critical" || f.severity === "High"
                                ? "red"
                                : f.severity === "Warning"
                                ? "yellow"
                                : "blue"
                            }`}
                          >
                            {f.severity}
                          </span>
                          <span className="platform-badge">{f.status}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, marginTop: 6, color: "var(--plat-text)" }}>
                        {f.description}
                      </div>
                      {f.remediation_steps && (
                        <div style={{ fontSize: 12, marginTop: 4, color: "var(--plat-muted)" }}>
                          <strong>Remediation:</strong> {f.remediation_steps}
                        </div>
                      )}
                      <div style={{ fontSize: 11.5, color: "var(--plat-muted)", marginTop: 6 }}>
                        Recorded: {formatAuditDateTime(f.created_at)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="platform-empty">No compliance findings recorded.</div>
              )}
            </div>
          </>
        );
      })()}

      {/* Incident Modal */}
      {incOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>{editInc ? "Update Technical Incident" : "Record Technical Incident"}</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setIncOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleSaveIncident}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              {!editInc && (
                <div className="platform-form-grid">
                  <div className="platform-field">
                    <label>Title</label>
                    <input
                      className="platform-input"
                      required
                      value={incTitle}
                      onChange={(e) => setIncTitle(e.target.value)}
                    />
                  </div>
                  <div className="platform-field">
                    <label>Type</label>
                    <select
                      className="platform-select"
                      value={incType}
                      onChange={(e) => setIncType(e.target.value as any)}
                    >
                      <option value="Incident">Incident</option>
                      <option value="Outage">Outage</option>
                      <option value="ErrorLog">ErrorLog</option>
                      <option value="Deployment">Deployment</option>
                    </select>
                  </div>
                  <div className="platform-field">
                    <label>Service Name</label>
                    <input
                      className="platform-input"
                      value={incService}
                      onChange={(e) => setIncService(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Severity</label>
                  <select
                    className="platform-select"
                    value={incSeverity}
                    onChange={(e) => setIncSeverity(e.target.value as any)}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div className="platform-field">
                  <label>Status</label>
                  <select
                    className="platform-select"
                    value={incStatus}
                    onChange={(e) => setIncStatus(e.target.value as any)}
                  >
                    <option value="Investigating">Investigating</option>
                    <option value="Identified">Identified</option>
                    <option value="Monitoring">Monitoring</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Deployed">Deployed</option>
                  </select>
                </div>
              </div>
              <div className="platform-field">
                <label>Description</label>
                <textarea
                  className="platform-textarea"
                  required
                  minLength={3}
                  rows={3}
                  value={incDesc}
                  onChange={(e) => setIncDesc(e.target.value)}
                />
              </div>
              <div className="platform-field">
                <label>Recovery Actions</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={incRecovery}
                  onChange={(e) => setIncRecovery(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setIncOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  Save Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Finding Modal */}
      {findingOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Add Compliance Audit Finding</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setFindingOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreateFinding}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Finding Title</label>
                <input
                  className="platform-input"
                  required
                  minLength={2}
                  value={findingTitle}
                  onChange={(e) => setFindingTitle(e.target.value)}
                />
              </div>
              <div className="platform-field">
                <label>Severity</label>
                <select
                  className="platform-select"
                  value={findingSeverity}
                  onChange={(e) => setFindingSeverity(e.target.value)}
                >
                  <option value="Info">Info</option>
                  <option value="Warning">Warning</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div className="platform-field">
                <label>Description</label>
                <textarea
                  className="platform-textarea"
                  rows={3}
                  value={findingDesc}
                  onChange={(e) => setFindingDesc(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setFindingOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  Record Finding
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Security Event Modal */}
      {secOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Record Security Event</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setSecOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreateSecurityEvent}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Event Type</label>
                  <select
                    className="platform-select"
                    value={secType}
                    onChange={(e) => setSecType(e.target.value)}
                  >
                    <option value="security_incident">security_incident</option>
                    <option value="suspicious_activity">suspicious_activity</option>
                    <option value="access_review">access_review</option>
                  </select>
                </div>
                <div className="platform-field">
                  <label>Severity</label>
                  <select
                    className="platform-select"
                    value={secSeverity}
                    onChange={(e) => setSecSeverity(e.target.value)}
                  >
                    <option value="Info">Info</option>
                    <option value="Warning">Warning</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>
              <div className="platform-field">
                <label>Title</label>
                <input
                  className="platform-input"
                  required
                  value={secTitle}
                  onChange={(e) => setSecTitle(e.target.value)}
                />
              </div>
              <div className="platform-field">
                <label>Description</label>
                <textarea
                  className="platform-textarea"
                  rows={3}
                  value={secDesc}
                  onChange={(e) => setSecDesc(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setSecOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Platform Audit Event Modal */}
      {inspectingLog && (
        <div className="platform-modal-overlay">
          <div className="platform-modal" style={{ maxWidth: 720 }}>
            <div className="platform-modal-header">
              <div>
                <h3 style={{ margin: 0 }}>Platform Audit Event Details</h3>
                <span style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                  Event ID: {inspectingLog.id}
                </span>
              </div>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setInspectingLog(null)}
              >
                <XIcon size={15} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="platform-form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                <div className="platform-field">
                  <label>Event Name</label>
                  <div style={{ fontWeight: 600, color: "var(--plat-text)" }}>
                    {getFriendlyEventName(inspectingLog.action)}
                  </div>
                </div>
                <div className="platform-field">
                  <label>Action & Category</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className={`platform-badge ${getActionBadgeClass(inspectingLog.action)}`}>
                      {inspectingLog.action}
                    </span>
                    <span style={{ fontSize: 12.5, color: "var(--plat-muted)" }}>
                      {getPlatformAuditCategory(inspectingLog).label}
                    </span>
                  </div>
                </div>
                <div className="platform-field">
                  <label>Performed By</label>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {getActorInfo(inspectingLog).performedBy}
                  </div>
                </div>
                <div className="platform-field">
                  <label>Actor Role</label>
                  <div>
                    <span className="platform-badge violet" style={{ fontSize: 11.5 }}>
                      {getActorInfo(inspectingLog).actorRole}
                    </span>
                  </div>
                </div>
                <div className="platform-field">
                  <label>Related Tenant</label>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {getRelatedTenantName(inspectingLog)}
                  </div>
                </div>
                <div className="platform-field">
                  <label>Event Date & Time</label>
                  <div style={{ fontSize: 12.5, color: "var(--plat-text)" }}>
                    {formatAuditDateTime(inspectingLog.created_at)}
                  </div>
                </div>
              </div>

              <div className="platform-field">
                <label>Event Description</label>
                <div
                  style={{
                    padding: "10px 12px",
                    background: "var(--plat-surface-alt)",
                    borderRadius: 8,
                    fontSize: 13,
                    border: "1px solid var(--plat-border)",
                    lineHeight: 1.5,
                  }}
                >
                  {inspectingLog.description || "No description recorded"}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  className="platform-btn sm primary"
                  onClick={() => setInspectingLog(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
