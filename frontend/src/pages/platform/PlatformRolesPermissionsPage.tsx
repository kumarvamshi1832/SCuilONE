import { useMemo, useState, useEffect } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BriefcaseIcon,
  BuildingIcon,
  CheckCircleIcon,
  CheckIcon,
  CodeIcon,
  CoinsIcon,
  CreditCardIcon,
  FileTextIcon,
  LayersIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  LockIcon,
  RefreshIcon,
  SearchIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TrendingUpIcon,
  UsersIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformPermissionMeta,
  PlatformRoleDefinition,
} from "../../types/platform";
import "./PlatformPages.css";

// ============================================================================
// 11 Permission Categories Specification (Section D)
// Maps all 36 platform capabilities to clean functional domains
// ============================================================================
interface CategoryPermissionDef {
  key: string;
  action: "VIEW" | "MANAGE" | "CREATE" | "UPDATE" | "EXPORT" | "DELETE";
  label: string;
  description: string;
}

interface PermissionCategoryDef {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{
    size?: number;
    color?: string;
    className?: string;
    style?: React.CSSProperties;
  }>;
  permissions: CategoryPermissionDef[];
}

const PERMISSION_CATEGORIES: PermissionCategoryDef[] = [
  {
    id: "dashboard",
    title: "Dashboard Access",
    description: "Core dashboard observability and aggregate operational telemetry",
    icon: LayoutDashboardIcon,
    permissions: [
      {
        key: "platform.dashboard.view",
        action: "VIEW",
        label: "Platform Telemetry Dashboard",
        description: "View central platform aggregate KPIs, system health, and cross-industry overview telemetry.",
      },
    ],
  },
  {
    id: "tenants",
    title: "Tenant Management",
    description: "Multi-tenant company provisioning, subscription tiers, and isolation controls",
    icon: BuildingIcon,
    permissions: [
      {
        key: "platform.tenants.view",
        action: "VIEW",
        label: "View Tenant Directory",
        description: "Browse registered tenant organizations, subscription tier statuses, and onboarding health.",
      },
      {
        key: "platform.tenants.manage",
        action: "MANAGE",
        label: "Manage Tenant Organizations",
        description: "Provision new tenants, edit company parameters, suspend access, and reactivate organizations.",
      },
    ],
  },
  {
    id: "employees",
    title: "Employee Management",
    description: "Internal platform staff directory, role assignments, and workforce governance",
    icon: UsersIcon,
    permissions: [
      {
        key: "platform.employees.view",
        action: "VIEW",
        label: "View Platform Workforce",
        description: "Inspect central platform and industry staff profiles, employment status, and assignments.",
      },
      {
        key: "platform.employees.manage",
        action: "MANAGE",
        label: "Manage Staff & Assignments",
        description: "Create employee profiles, assign platform roles, update statuses, and offboard personnel.",
      },
    ],
  },
  {
    id: "industry_teams",
    title: "Industry & Teams",
    description: "Industry verticals, specialized team topologies, and cross-industry templates",
    icon: LayersIcon,
    permissions: [
      {
        key: "platform.industries.view",
        action: "VIEW",
        label: "View Industry Verticals",
        description: "Explore configured vertical templates (Healthcare, Real Estate, Manufacturing, Tech).",
      },
      {
        key: "platform.industries.manage",
        action: "MANAGE",
        label: "Manage Industry Configurations",
        description: "Create, configure, and maintain domain-specific workflows and industry presets.",
      },
      {
        key: "platform.teams.view",
        action: "VIEW",
        label: "View Industry Teams",
        description: "Inspect cross-functional industry team rosters, coverage matrices, and ticket loads.",
      },
      {
        key: "platform.teams.manage",
        action: "MANAGE",
        label: "Manage Team Allocations",
        description: "Form new functional teams, balance ticket capacity, and assign staff leads.",
      },
    ],
  },
  {
    id: "roles_permissions",
    title: "Roles & Permissions",
    description: "Role-based access control, security boundary definitions, and root ownership",
    icon: ShieldCheckIcon,
    permissions: [
      {
        key: "platform.roles.view",
        action: "VIEW",
        label: "View Roles & Permission Matrix",
        description: "Inspect platform role assignments, capability grants, and granular RBAC matrices.",
      },
      {
        key: "platform.roles.manage",
        action: "MANAGE",
        label: "Manage Role Permissions",
        description: "Assign or revoke platform capabilities, modify role permissions, and enforce policies.",
      },
      {
        key: "platform.owner.manage",
        action: "MANAGE",
        label: "Platform Root Ownership",
        description: "Execute root ownership operations, manage core credentials, and handle master keys.",
      },
    ],
  },
  {
    id: "subscription_billing",
    title: "Subscription & Billing",
    description: "Monetization plans, tenant billing lifecycles, payments, and refunds",
    icon: CreditCardIcon,
    permissions: [
      {
        key: "platform.plans.view",
        action: "VIEW",
        label: "View Subscription Plans",
        description: "Browse commercial subscription plans, pricing tiers, and entitlement packages.",
      },
      {
        key: "platform.plans.manage",
        action: "MANAGE",
        label: "Manage Pricing & Plans",
        description: "Create new plans, adjust quotas, update pricing, and publish plan revisions.",
      },
      {
        key: "platform.billing.view",
        action: "VIEW",
        label: "View Billing & Invoices",
        description: "Inspect tenant billing ledgers, payment receipts, invoice history, and gateways.",
      },
      {
        key: "platform.billing.manage",
        action: "MANAGE",
        label: "Manage Billing Transactions",
        description: "Issue manual invoices, record offline payments, verify gateway deposits, and reconcile.",
      },
      {
        key: "platform.refunds.manage",
        action: "MANAGE",
        label: "Process Billing Refunds",
        description: "Authorize, reject, and process financial refunds and disputed credit requests.",
      },
    ],
  },
  {
    id: "support_management",
    title: "Support Management",
    description: "Multi-tenant helpdesk, SLA governance, escalation routing, and knowledge base",
    icon: LifeBuoyIcon,
    permissions: [
      {
        key: "platform.tickets.view",
        action: "VIEW",
        label: "View Support Tickets",
        description: "Monitor tenant support queues, open tickets, priority levels, and SLA countdowns.",
      },
      {
        key: "platform.tickets.manage",
        action: "MANAGE",
        label: "Manage Support Tickets",
        description: "Respond to customer inquiries, update status pipelines, and resolve support requests.",
      },
      {
        key: "platform.tickets.assign",
        action: "UPDATE",
        label: "Assign Support Tickets",
        description: "Dispatch and reassign support tickets to specialized industry team members.",
      },
      {
        key: "platform.tickets.escalate",
        action: "UPDATE",
        label: "Escalate Critical Tickets",
        description: "Trigger urgent SLA escalation alerts to platform senior engineers and directors.",
      },
      {
        key: "platform.kb.view",
        action: "VIEW",
        label: "View Knowledge Base",
        description: "Access troubleshooting articles, product playbooks, and standardized answers.",
      },
      {
        key: "platform.kb.manage",
        action: "MANAGE",
        label: "Manage Knowledge Base",
        description: "Author, update, and publish official knowledge articles and solution guides.",
      },
    ],
  },
  {
    id: "sales_finance",
    title: "Sales & Finance",
    description: "Sales pipelines, deal forecasts, revenue ledgers, and financial records",
    icon: TrendingUpIcon,
    permissions: [
      {
        key: "platform.sales.view",
        action: "VIEW",
        label: "View Sales Pipeline",
        description: "Review enterprise sales deals, stage funnels, conversion rates, and MRR forecasts.",
      },
      {
        key: "platform.sales.manage",
        action: "MANAGE",
        label: "Manage Sales Opportunities",
        description: "Create prospect accounts, progress deal stages, and negotiate enterprise terms.",
      },
      {
        key: "platform.finance.view",
        action: "VIEW",
        label: "View Financial Reports",
        description: "Inspect cash flow statements, recognized revenue, expense audits, and gross margin.",
      },
      {
        key: "platform.finance.manage",
        action: "MANAGE",
        label: "Manage Financial Ledgers",
        description: "Record fiscal entries, approve financial expenses, and log journal adjustments.",
      },
    ],
  },
  {
    id: "technical_security",
    title: "Technical & Security",
    description: "System health, diagnostics, maintenance, and security enforcement policies",
    icon: CodeIcon,
    permissions: [
      {
        key: "platform.technical.view",
        action: "VIEW",
        label: "View System Telemetry",
        description: "Inspect server resources, database query latencies, background tasks, and error logs.",
      },
      {
        key: "platform.technical.manage",
        action: "MANAGE",
        label: "System Maintenance & Ops",
        description: "Trigger system diagnostics, purge cached assets, and execute maintenance protocols.",
      },
      {
        key: "platform.security.view",
        action: "VIEW",
        label: "View Security Telemetry",
        description: "Monitor login attempts, IP anomaly reports, brute-force alerts, and MFA compliance.",
      },
      {
        key: "platform.security.manage",
        action: "MANAGE",
        label: "Manage Security Policies",
        description: "Configure IP allowlists, force MFA enrollment, revoke tokens, and block malicious traffic.",
      },
    ],
  },
  {
    id: "audit_analytics",
    title: "Audit & Analytics",
    description: "Immutable platform audit trail, compliance findings, and enterprise analytics",
    icon: FileTextIcon,
    permissions: [
      {
        key: "platform.audit.view",
        action: "VIEW",
        label: "View Platform Audit Logs",
        description: "Inspect immutable tamper-evident logs of all administrative and tenant events.",
      },
      {
        key: "platform.audit.findings.create",
        action: "CREATE",
        label: "Create Audit Findings",
        description: "Document compliance observations, vulnerability flags, and investigation notes.",
      },
      {
        key: "platform.analytics.view",
        action: "VIEW",
        label: "View Platform Analytics",
        description: "Access cross-tenant usage metrics, feature adoption curves, and cohort retention.",
      },
      {
        key: "platform.analytics.export",
        action: "EXPORT",
        label: "Export Analytics & Reports",
        description: "Export compliance records, financial ledgers, and raw telemetry datasets.",
      },
    ],
  },
  {
    id: "platform_settings",
    title: "Platform Settings",
    description: "Global platform configuration, tenant limits, and branding parameters",
    icon: BriefcaseIcon,
    permissions: [
      {
        key: "platform.settings.manage",
        action: "MANAGE",
        label: "Manage Global Settings",
        description: "Configure platform system parameters, global email SMTP, and default preferences.",
      },
    ],
  },
];

// Helper to select role icons
const getRoleIcon = (roleName: string) => {
  const lower = roleName.toLowerCase();
  if (lower.includes("super admin")) return ShieldAlertIcon;
  if (lower.includes("admin")) return ShieldCheckIcon;
  if (lower.includes("manager")) return UsersIcon;
  if (lower.includes("support")) return LifeBuoyIcon;
  if (lower.includes("sales")) return TrendingUpIcon;
  if (lower.includes("billing")) return CreditCardIcon;
  if (lower.includes("technical")) return CodeIcon;
  if (lower.includes("audit")) return FileTextIcon;
  if (lower.includes("finance")) return CoinsIcon;
  if (lower.includes("security")) return LockIcon;
  if (lower.includes("analyst")) return LayoutDashboardIcon;
  return ShieldIcon;
};

export default function PlatformRolesPermissionsPage() {
  const [centralRoles, setCentralRoles] = useState<PlatformRoleDefinition[]>([]);
  const [industryRoles, setIndustryRoles] = useState<PlatformRoleDefinition[]>([]);
  const [availablePerms, setAvailablePerms] = useState<PlatformPermissionMeta[]>([]);
  const [selectedRole, setSelectedRole] = useState<PlatformRoleDefinition | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"central" | "industry" | "all">("central");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManage = hasPlatformPermission("platform.roles.manage");
  const isSystemProtected = selectedRole?.name === "Platform Super Admin";

  const loadRoles = async (keepSelectedName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await platformService.listRoles();
      const central = res.central_platform_roles || [];
      const ind = res.reusable_industry_roles || [];
      setCentralRoles(central);
      setIndustryRoles(ind);
      setAvailablePerms(res.available_permissions || []);

      const all = [...central, ...ind];
      // Default to "Platform Admin" or previous selection, or first role
      let next: PlatformRoleDefinition | null = null;
      if (keepSelectedName) {
        next = all.find((r) => r.name === keepSelectedName) || null;
      }
      if (!next) {
        next =
          central.find((r) => r.name === "Platform Admin") ||
          all[0] ||
          null;
      }

      setSelectedRole(next);
      setDraftPermissions(next ? [...next.permissions] : []);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load roles and permissions."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const selectRole = (role: PlatformRoleDefinition) => {
    setSelectedRole(role);
    setDraftPermissions([...role.permissions]);
    setError(null);
    setSuccess(null);
  };

  // Has unsaved changes check
  const hasUnsavedChanges = useMemo(() => {
    if (!selectedRole) return false;
    if (selectedRole.permissions.length !== draftPermissions.length) return true;
    const currentSet = new Set(selectedRole.permissions);
    return draftPermissions.some((p) => !currentSet.has(p));
  }, [selectedRole, draftPermissions]);

  const togglePermission = (permKey: string) => {
    if (!canManage || isSystemProtected) return;
    setDraftPermissions((prev) =>
      prev.includes(permKey)
        ? prev.filter((p) => p !== permKey)
        : [...prev, permKey]
    );
  };

  const toggleCategoryPermissions = (category: PermissionCategoryDef) => {
    if (!canManage || isSystemProtected) return;
    const catKeys = category.permissions.map((p) => p.key);
    const allChecked = catKeys.every((k) => draftPermissions.includes(k));

    if (allChecked) {
      // Uncheck all in category
      setDraftPermissions((prev) => prev.filter((p) => !catKeys.includes(p)));
    } else {
      // Check all in category
      setDraftPermissions((prev) => {
        const set = new Set([...prev, ...catKeys]);
        return Array.from(set);
      });
    }
  };

  const handleSelectAll = () => {
    if (!canManage || isSystemProtected) return;
    const allKeys = availablePerms.map((p) => p.name);
    setDraftPermissions(allKeys);
  };

  const handleClearAll = () => {
    if (!canManage || isSystemProtected) return;
    setDraftPermissions([]);
  };

  const handleCancelChanges = () => {
    if (!selectedRole) return;
    setDraftPermissions([...selectedRole.permissions]);
    setError(null);
    setSuccess(null);
  };

  const handleSavePermissions = async () => {
    if (!selectedRole) return;
    if (isSystemProtected) {
      setError("Platform Super Admin is a system-protected root role and its permissions cannot be modified.");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.updateRolePermissions(
        selectedRole.name,
        draftPermissions
      );
      setSuccess(`Permissions successfully updated for role "${selectedRole.name}".`);
      await loadRoles(selectedRole.name);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update role permissions."));
    } finally {
      setSaving(false);
    }
  };

  // Filter roles based on search and scope tab
  const filterRole = (r: PlatformRoleDefinition) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      r.name.toLowerCase().includes(q) ||
      r.key.toLowerCase().includes(q) ||
      (r.dashboard_title && r.dashboard_title.toLowerCase().includes(q)) ||
      (r.responsibility && r.responsibility.toLowerCase().includes(q))
    );
  };

  const visibleCentralRoles = useMemo(
    () => centralRoles.filter(filterRole),
    [centralRoles, searchQuery]
  );
  const visibleIndustryRoles = useMemo(
    () => industryRoles.filter(filterRole),
    [industryRoles, searchQuery]
  );

  const displayedRoles = useMemo(() => {
    if (scopeFilter === "central") return visibleCentralRoles;
    if (scopeFilter === "industry") return visibleIndustryRoles;
    return [...visibleCentralRoles, ...visibleIndustryRoles];
  }, [scopeFilter, visibleCentralRoles, visibleIndustryRoles]);

  // Handle any orphan permissions not defined in static categories
  const uncategorizedPerms = useMemo(() => {
    const categorizedKeys = new Set(
      PERMISSION_CATEGORIES.flatMap((c) => c.permissions.map((p) => p.key))
    );
    return availablePerms.filter((p) => !categorizedKeys.has(p.name));
  }, [availablePerms]);

  const SelectedRoleIcon = selectedRole
    ? getRoleIcon(selectedRole.name)
    : ShieldIcon;

  return (
    <div className="platform-page">
      {/* Top Page Header */}
      <div className="platform-page-header">
        <div>
          <h2>Platform Roles & Permissions</h2>
          <p>
            Central Platform Role Directory, Associated Dashboards & Enterprise RBAC Capability Matrices.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            className="platform-badge"
            style={{
              background: "rgba(124, 58, 237, 0.14)",
              color: "#c4b5fd",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              fontSize: 12,
              padding: "5px 10px",
            }}
          >
            System RBAC • 36 Capabilities
          </span>
          <button
            type="button"
            className="platform-btn"
            onClick={() => loadRoles(selectedRole?.name)}
            disabled={loading || saving}
            title="Reload roles and permissions from server"
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="platform-alert error" style={{ marginBottom: 16 }}>
          <AlertCircleIcon size={16} />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="platform-alert success" style={{ marginBottom: 16 }}>
          <CheckCircleIcon size={16} />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="platform-card platform-empty" style={{ minHeight: 320 }}>
          <RefreshIcon size={24} style={{ animation: "spin 1.5s linear infinite" }} />
          <div style={{ marginTop: 12, fontSize: 14, color: "var(--plat-text)" }}>
            Loading roles and capability matrices...
          </div>
        </div>
      ) : (
        <div className="platform-roles-grid">
          {/* ================================================================= */}
          {/* LEFT PANEL: ROLES DIRECTORY                                       */}
          {/* ================================================================= */}
          <div
            className="platform-card"
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
          >
            {/* Search Input */}
            <div className="platform-role-search-wrap">
              <SearchIcon size={16} />
              <input
                type="text"
                className="platform-input platform-role-search-input"
                placeholder="Search roles or dashboards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: 10,
                    background: "none",
                    border: "none",
                    color: "var(--plat-muted)",
                    cursor: "pointer",
                    padding: 2,
                  }}
                  title="Clear search"
                >
                  <XIcon size={14} />
                </button>
              )}
            </div>

            {/* Scope Filter Tabs */}
            <div className="platform-roles-scope-tabs">
              <button
                type="button"
                className={`platform-roles-scope-btn ${
                  scopeFilter === "central" ? "active" : ""
                }`}
                onClick={() => setScopeFilter("central")}
              >
                Central ({centralRoles.length})
              </button>
              <button
                type="button"
                className={`platform-roles-scope-btn ${
                  scopeFilter === "industry" ? "active" : ""
                }`}
                onClick={() => setScopeFilter("industry")}
              >
                Industry ({industryRoles.length})
              </button>
              <button
                type="button"
                className={`platform-roles-scope-btn ${
                  scopeFilter === "all" ? "active" : ""
                }`}
                onClick={() => setScopeFilter("all")}
              >
                All ({centralRoles.length + industryRoles.length})
              </button>
            </div>

            {/* Roles List */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: "calc(100vh - 280px)",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {displayedRoles.length === 0 ? (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    color: "var(--plat-muted)",
                    fontSize: 13,
                  }}
                >
                  No roles match &quot;{searchQuery}&quot;
                </div>
              ) : (
                displayedRoles.map((role) => {
                  const RoleIcon = getRoleIcon(role.name);
                  const isSelected = selectedRole?.name === role.name;
                  const isSuper = role.name === "Platform Super Admin";

                  return (
                    <button
                      key={role.key}
                      type="button"
                      className={`platform-role-item-btn ${isSelected ? "active" : ""}`}
                      onClick={() => selectRole(role)}
                    >
                      <div className="platform-role-icon-box">
                        <RoleIcon size={18} />
                      </div>
                      <div className="platform-role-item-meta">
                        <div className="platform-role-name-row">
                          <span className="platform-role-name" title={role.name}>
                            {role.name}
                          </span>
                          <span
                            className="platform-role-perm-badge"
                            title={`${role.permissions.length} active permissions`}
                          >
                            {role.permissions.length} perms
                          </span>
                        </div>
                        <div
                          className="platform-role-dash-title"
                          title={role.dashboard_title || "Dashboard"}
                        >
                          {isSuper ? (
                            <span style={{ color: "#c084fc", fontWeight: 600 }}>
                              Root Authority • {role.dashboard_title}
                            </span>
                          ) : (
                            role.dashboard_title || "Assigned Dashboard"
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Enterprise Role Architecture Note */}
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--plat-border)",
                fontSize: 11.5,
                color: "var(--plat-muted)",
                lineHeight: 1.45,
              }}
            >
              <strong style={{ color: "var(--plat-text)", display: "block", marginBottom: 2 }}>
                Enterprise Governance Policy
              </strong>
              Platform and Industry roles are system-defined and managed via centralized RBAC policies. Capability assignments can be configured in real-time.
            </div>
          </div>

          {/* ================================================================= */}
          {/* RIGHT PANEL: ROLE DETAILS & PERMISSION CATEGORIES MATRIX          */}
          {/* ================================================================= */}
          {selectedRole ? (
            <div className="platform-card" style={{ padding: 20 }}>
              {/* Hero Header */}
              <div className="platform-role-hero-header">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <div
                    className="platform-role-icon-box"
                    style={{
                      width: 50,
                      height: 50,
                      minWidth: 50,
                      borderRadius: 12,
                      background: "rgba(124, 58, 237, 0.22)",
                      border: "1px solid #8b5cf6",
                    }}
                  >
                    <SelectedRoleIcon size={24} color="#c4b5fd" />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--plat-text)" }}>
                        {selectedRole.name}
                      </h3>
                      <span className="platform-badge indigo" style={{ textTransform: "capitalize" }}>
                        {selectedRole.role_scope === "platform" ? "Central Platform" : "Reusable Industry Team"}
                      </span>
                      {isSystemProtected && (
                        <span
                          className="platform-badge"
                          style={{
                            background: "rgba(168, 85, 247, 0.18)",
                            color: "#d8b4fe",
                            border: "1px solid rgba(168, 85, 247, 0.4)",
                          }}
                        >
                          Root Super Admin
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        marginTop: 6,
                        flexWrap: "wrap",
                        fontSize: 12.5,
                        color: "var(--plat-muted)",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <LayoutDashboardIcon size={14} color="#8b5cf6" />
                        <strong style={{ color: "var(--plat-text)" }}>Dashboard:</strong>{" "}
                        {selectedRole.dashboard_title || "Standard Platform Dashboard"}
                      </span>
                      <span>•</span>
                      <span>
                        <strong style={{ color: "#a78bfa" }}>{draftPermissions.length}</strong> of{" "}
                        {availablePerms.length || 36} capabilities granted
                      </span>
                    </div>

                    <p
                      style={{
                        margin: "8px 0 0",
                        fontSize: 13,
                        color: "var(--plat-muted)",
                        maxWidth: 720,
                        lineHeight: 1.45,
                      }}
                    >
                      {selectedRole.responsibility}
                    </p>
                  </div>
                </div>

                {/* Right Header Controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {hasUnsavedChanges && (
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={handleCancelChanges}
                      disabled={saving}
                      title="Discard local changes"
                    >
                      <XIcon size={14} />
                      <span>Cancel</span>
                    </button>
                  )}
                  {canManage && !isSystemProtected && (
                    <button
                      type="button"
                      className="platform-btn primary sm"
                      onClick={handleSavePermissions}
                      disabled={saving || !hasUnsavedChanges}
                      title={hasUnsavedChanges ? "Save permission changes to backend" : "No changes to save"}
                    >
                      <CheckCircleIcon size={14} />
                      <span>{saving ? "Saving..." : "Save Changes"}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Unsaved Changes Banner */}
              {hasUnsavedChanges && (
                <div className="platform-unsaved-banner">
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangleIcon size={16} color="#fbbf24" />
                    <span>
                      <strong>Unsaved Changes:</strong> You have modified permissions for &quot;{selectedRole.name}&quot;. Click <strong>Save Changes</strong> to apply or <strong>Cancel</strong> to discard.
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={handleCancelChanges}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="platform-btn primary sm"
                      onClick={handleSavePermissions}
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              )}

              {/* System-Protected Notice */}
              {isSystemProtected && (
                <div className="platform-protected-banner">
                  <ShieldAlertIcon size={18} color="#c084fc" />
                  <div>
                    <strong>System-Protected Role:</strong> Platform Super Admin holds immutable root authority across all 36 platform capabilities. Root permissions cannot be downgraded or modified.
                  </div>
                </div>
              )}

              {/* Read-Only Mode Notice for unauthorized users */}
              {!canManage && (
                <div className="platform-alert warning" style={{ marginBottom: 16 }}>
                  <AlertCircleIcon size={16} />
                  <span>
                    <strong>Read-Only Mode:</strong> You are viewing platform role permissions. The <code>platform.roles.manage</code> permission is required to edit capability assignments.
                  </span>
                </div>
              )}

              {/* Sidebar Modules Overview */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 18,
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "var(--plat-surface-alt)",
                  border: "1px solid var(--plat-border)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--plat-muted)" }}>
                  Navigable Modules ({selectedRole.sidebar_modules.length}):
                </span>
                {selectedRole.sidebar_modules.map((mod, idx) => (
                  <span
                    key={idx}
                    className="platform-badge"
                    style={{
                      background: "rgba(124, 58, 237, 0.12)",
                      color: "#ddd6fe",
                      border: "1px solid rgba(139, 92, 246, 0.25)",
                      fontSize: 11,
                    }}
                  >
                    {typeof mod === "string" ? mod : mod.label}
                  </span>
                ))}
              </div>

              {/* Quick Actions Bar */}
              {canManage && !isSystemProtected && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 16,
                    padding: "8px 12px",
                    background: "rgba(255, 255, 255, 0.02)",
                    borderRadius: 8,
                    border: "1px solid var(--plat-border)",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: 12.5, color: "var(--plat-muted)" }}>
                    Configure capability grants below by toggling individual permissions or entire functional categories.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={handleSelectAll}
                      title="Grant all 36 capabilities"
                    >
                      <CheckIcon size={13} />
                      <span>Select All (36)</span>
                    </button>
                    <button
                      type="button"
                      className="platform-btn sm"
                      onClick={handleClearAll}
                      title="Clear all permissions"
                    >
                      <XIcon size={13} />
                      <span>Clear All</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================= */}
              {/* 11 PERMISSION CATEGORIES MATRIX                                */}
              {/* ============================================================= */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {PERMISSION_CATEGORIES.map((category) => {
                  const CatIcon = category.icon;
                  const activeCount = category.permissions.filter((p) =>
                    draftPermissions.includes(p.key)
                  ).length;
                  const allActive = activeCount === category.permissions.length;
                  const someActive = activeCount > 0 && !allActive;

                  return (
                    <div key={category.id} className="platform-perm-category-card">
                      {/* Category Header */}
                      <div className="platform-perm-category-head">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(124, 58, 237, 0.16)",
                              color: "#c4b5fd",
                              border: "1px solid rgba(139, 92, 246, 0.3)",
                            }}
                          >
                            <CatIcon size={16} />
                          </div>
                          <div>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: 14,
                                color: "var(--plat-text)",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <span>{category.title}</span>
                              <span
                                className={`platform-badge ${
                                  allActive ? "success" : someActive ? "indigo" : ""
                                }`}
                                style={{ fontSize: 11, padding: "2px 8px" }}
                              >
                                {activeCount} / {category.permissions.length} Active
                              </span>
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                              {category.description}
                            </div>
                          </div>
                        </div>

                        {/* Category Bulk Toggle */}
                        {canManage && !isSystemProtected && (
                          <button
                            type="button"
                            className="platform-btn sm"
                            onClick={() => toggleCategoryPermissions(category)}
                            style={{ fontSize: 11.5, padding: "4px 9px" }}
                          >
                            {allActive ? "Deselect Category" : "Select Category"}
                          </button>
                        )}
                      </div>

                      {/* Permissions Grid in this Category */}
                      <div className="platform-perm-grid">
                        {category.permissions.map((perm) => {
                          const isChecked = draftPermissions.includes(perm.key);
                          const isDisabled = !canManage || isSystemProtected;

                          return (
                            <div
                              key={perm.key}
                              className={`platform-perm-item-tile ${
                                isChecked ? "checked" : ""
                              }`}
                              style={{
                                cursor: isDisabled ? "default" : "pointer",
                                opacity: isDisabled && !isChecked ? 0.75 : 1,
                              }}
                              onClick={() => {
                                if (!isDisabled) togglePermission(perm.key);
                              }}
                              role="checkbox"
                              aria-checked={isChecked}
                              tabIndex={isDisabled ? -1 : 0}
                              onKeyDown={(e) => {
                                if ((e.key === " " || e.key === "Enter") && !isDisabled) {
                                  e.preventDefault();
                                  togglePermission(perm.key);
                                }
                              }}
                            >
                              <input
                                type="checkbox"
                                className="platform-perm-checkbox"
                                checked={isChecked}
                                disabled={isDisabled}
                                onChange={() => togglePermission(perm.key)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 6,
                                    marginBottom: 3,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: isChecked ? "#e0e7ff" : "var(--plat-text)",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                    title={perm.key}
                                  >
                                    {perm.key}
                                  </span>
                                  <span
                                    className={`platform-action-badge ${perm.action.toLowerCase()}`}
                                    title={`Action type: ${perm.action}`}
                                  >
                                    {perm.action}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                    color: "var(--plat-text)",
                                    marginBottom: 2,
                                  }}
                                >
                                  {perm.label}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11.5,
                                    color: "var(--plat-muted)",
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {perm.description}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Additional Uncategorized Permissions (if any are returned in future) */}
                {uncategorizedPerms.length > 0 && (
                  <div className="platform-perm-category-card">
                    <div className="platform-perm-category-head">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ShieldIcon size={18} color="#c4b5fd" />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            Additional System Capabilities
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                            Other capabilities registered in the platform authorization schema
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="platform-perm-grid">
                      {uncategorizedPerms.map((perm) => {
                        const isChecked = draftPermissions.includes(perm.name);
                        const isDisabled = !canManage || isSystemProtected;
                        return (
                          <div
                            key={perm.name}
                            className={`platform-perm-item-tile ${isChecked ? "checked" : ""}`}
                            style={{ cursor: isDisabled ? "default" : "pointer" }}
                            onClick={() => {
                              if (!isDisabled) togglePermission(perm.name);
                            }}
                          >
                            <input
                              type="checkbox"
                              className="platform-perm-checkbox"
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => togglePermission(perm.name)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>
                                {perm.name}
                              </div>
                              <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                                {perm.description}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="platform-card platform-empty">
              Select a role from the directory to inspect and manage its permissions.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
