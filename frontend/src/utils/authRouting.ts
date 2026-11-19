import {
  KNOWN_INDUSTRY_SLUGS,
  tryNormalizeIndustry,
  type SupportedIndustry,
} from "./industryUtils";

export type CrmRoleCategory =
  | "TENANT_ADMIN"
  | "MANAGER"
  | "SALES_USER"
  | "OPERATIONS_USER"
  | "SUPPORT_USER"
  | "AUDITOR";

export const PLATFORM_ROLE_KEYS = new Set<string>([
  "PLATFORM_SUPER_ADMIN",
  "PLATFORM_ADMIN",
  "PLATFORM_MANAGER",
  "PLATFORM_SUPPORT",
  "SALES",
  "BILLING",
  "TECHNICAL",
  "AUDIT",
  "FINANCE",
  "SECURITY_ADMINISTRATOR",
  "ANALYST",
  "TEAM_ADMIN",
  "TEAM_MANAGER",
  "INDUSTRY_SUPPORT",
  "TEAM_AUDITOR",
  "TEAM_FINANCE",
  "TEAM_ANALYST",
  "INDUSTRY_SALES",
]);

const CRM_ROLE_MAP: Record<string, CrmRoleCategory> = {
  TENANT_OWNER: "TENANT_ADMIN",
  TENANT_ADMIN: "TENANT_ADMIN",
  OWNER: "TENANT_ADMIN",
  ADMIN: "TENANT_ADMIN",
  MANAGER: "MANAGER",
  SALES_USER: "SALES_USER",
  OPERATIONS_USER: "OPERATIONS_USER",
  SUPPORT_USER: "SUPPORT_USER",
  READ_ONLY: "AUDITOR",
  READONLY: "AUDITOR",
  AUDITOR: "AUDITOR",
  READ_ONLY_AUDITOR: "AUDITOR",
  READONLY_AUDITOR: "AUDITOR",
};

export const CRM_ADMIN_ONLY_SUFFIXES = [
  "/users",
  "/roles",
  "/permissions",
  "/settings",
] as const;

export const CRM_GLOBAL_ROUTES = new Set<string>([
  "/manager/dashboard",
  "/sales/dashboard",
  "/operations/dashboard",
  "/support/dashboard",
  "/auditor/dashboard",
  "/documents",
  "/help",
  "/empty",
]);

export const CRM_NAKED_MODULE_ROOTS = new Set<string>([
  "leads",
  "contacts",
  "accounts",
  "deals",
  "projects",
  "buildings",
  "properties",
  "buyer-requirements",
  "requirements",
  "estimates",
  "contracts",
  "sprints",
  "software-requirements",
  "software-estimates",
  "software-contracts",
  "software-projects",
  "software-sprints",
  "software-time-tracking",
  "software-delivery-reports",
  "software-invoices",
  "support-tickets",
  "customer-portal",
  "customer-portal-users",
  "time-tracking",
  "delivery-reports",
  "invoices",
  "site-visits",
  "bookings",
  "customer-booking-requests",
  "payments",
  "activities",
  "tasks",
  "reports",
  "forecast",
  "lead-scoring",
  "trash",
  "customer-chat",
  "emails",
  "custom-fields",
  "pipelines",
  "workflows",
  "form-builder",
  "users",
  "roles",
  "permissions",
  "settings",
  "audit-logs",
  "profile",
  "company",
  "mystore",
  "subscription",
  "billing",
]);

export function extractRawRole(
  input: unknown
): string {
  if (typeof input === "string") {
    return input.trim();
  }
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (typeof obj.role === "string") return obj.role.trim();
    if (obj.role && typeof obj.role === "object") {
      const nested = obj.role as Record<string, unknown>;
      if (typeof nested.name === "string") return nested.name.trim();
    }
    if (typeof obj.role_name === "string") return obj.role_name.trim();
    if (typeof obj.name === "string") return obj.name.trim();
  }
  return "";
}

/**
 * Normalizes role strings like "Read-only / Auditor" or "Platform Super Admin"
 * into uppercase underscore tokens such as "READ_ONLY_AUDITOR" / "PLATFORM_SUPER_ADMIN".
 */
export function normalizeRoleKey(rawRole?: string | null): string {
  if (!rawRole || typeof rawRole !== "string") return "";
  return rawRole
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isPlatformRole(rawRole?: string | null): boolean {
  const key = normalizeRoleKey(rawRole);
  return Boolean(key && PLATFORM_ROLE_KEYS.has(key));
}

export function classifyCrmRole(rawRole?: string | null): CrmRoleCategory | null {
  const key = normalizeRoleKey(rawRole);
  if (!key || PLATFORM_ROLE_KEYS.has(key)) {
    return null;
  }
  return CRM_ROLE_MAP[key] ?? null;
}

export function isPlatformTenantMetadata(
  tenant?: { name?: string | null; industry?: string | null; is_platform?: boolean } | null
): boolean {
  if (!tenant) return false;
  if (tenant.is_platform === true) return true;
  const nameNorm = (tenant.name || "").trim().toLowerCase();
  if (nameNorm === "scuilone platform") return true;
  const indNorm = (tenant.industry || "").trim().toLowerCase();
  if (indNorm === "platform operations") return true;
  return false;
}

export function isPlatformIdentity(params: {
  role?: string | null;
  tenant?: { name?: string | null; industry?: string | null; is_platform?: boolean } | null;
  accountType?: string | null;
}): boolean {
  if (params.accountType?.trim().toLowerCase() === "platform") return true;
  if (isPlatformRole(params.role)) return true;
  if (isPlatformTenantMetadata(params.tenant)) return true;
  return false;
}

export type DestinationResolution =
  | {
      ok: true;
      destination: string;
      crmRole: CrmRoleCategory;
      industrySlug: SupportedIndustry | null;
    }
  | {
      ok: false;
      reason: "MISSING_OR_INVALID_ROLE" | "INVALID_INDUSTRY";
      message: string;
    };

export function resolveCrmDashboardDestination(
  rawRole?: string | null,
  rawIndustry?: string | null
): DestinationResolution {
  const crmRole = classifyCrmRole(rawRole);
  if (!crmRole) {
    return {
      ok: false,
      reason: "MISSING_OR_INVALID_ROLE",
      message:
        "Your account does not have a valid assigned role. Access is denied — please contact your administrator.",
    };
  }

  const hasRawIndustry =
    typeof rawIndustry === "string" && rawIndustry.trim().length > 0;
  const industrySlug = tryNormalizeIndustry(rawIndustry);

  if (crmRole === "TENANT_ADMIN") {
    if (!industrySlug) {
      return {
        ok: false,
        reason: "INVALID_INDUSTRY",
        message: hasRawIndustry
          ? `Your organization's industry ("${rawIndustry?.trim()}") is not recognized or configured for CRM access. Please contact support.`
          : "Your organization's industry is missing or unconfigured. Please contact support.",
      };
    }
    return {
      ok: true,
      destination: `/${industrySlug}/dashboard`,
      crmRole,
      industrySlug,
    };
  }

  if (hasRawIndustry && !industrySlug) {
    return {
      ok: false,
      reason: "INVALID_INDUSTRY",
      message: `Your organization's industry ("${rawIndustry?.trim()}") is not recognized or configured for CRM access. Please contact support.`,
    };
  }

  switch (crmRole) {
    case "MANAGER":
      return {
        ok: true,
        destination: "/manager/dashboard",
        crmRole,
        industrySlug,
      };
    case "SALES_USER":
      return {
        ok: true,
        destination: "/sales/dashboard",
        crmRole,
        industrySlug,
      };
    case "OPERATIONS_USER":
      return {
        ok: true,
        destination: "/operations/dashboard",
        crmRole,
        industrySlug,
      };
    case "SUPPORT_USER":
      return {
        ok: true,
        destination: "/support/dashboard",
        crmRole,
        industrySlug,
      };
    case "AUDITOR":
      return {
        ok: true,
        destination: "/auditor/dashboard",
        crmRole,
        industrySlug,
      };
  }
}

export function clearCrmAuthStorage(options?: { keepMfaTemp?: boolean }): void {
  const authKeys = [
    "access_token",
    "refresh_token",
    "user",
    "tenant",
    "tenant_id",
    "onboarding_token",
    "onboarding_email",
    "onboarding_full_name",
    "recovery_codes",
  ];
  const mfaKeys = [
    "mfa_token",
    "mfa_temp_token",
    "mfa_email",
    "mfa_setup_required",
    "otp_flow",
  ];
  const keys = options?.keepMfaTemp ? authKeys : [...authKeys, ...mfaKeys];
  for (const key of keys) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  }
}

export function isKnownIndustrySegment(segment: string): boolean {
  return (KNOWN_INDUSTRY_SLUGS as readonly string[]).includes(segment);
}

