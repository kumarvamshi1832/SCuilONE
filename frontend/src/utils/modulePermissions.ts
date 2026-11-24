/**
 * Centralized CRM module permission resolution (Accounts, Deals).
 *
 * Why this exists
 * ---------------
 * The CRM session is rebuilt from `GET /auth/me` on every verification, and `/auth/me` returns the
 * server-verified role but NOT a permission list. The stored `user` therefore normally has no
 * `permissions` array, which made the per-module helpers deny everything (even for Tenant Owner)
 * while the sidebar (which special-cases the Tenant Owner/Admin role) still showed the menu item.
 *
 * Resolution order
 * ----------------
 * 1. If the stored user carries an explicit permission list, that list is authoritative.
 * 2. Otherwise fall back to the grants the backend seeds for the server-verified role
 *    (backend/app/database/seed_role_permissions.py). View/create/update/delete are granted
 *    individually — no role is granted "everything" by default.
 *
 * This is display/UX gating only. The backend re-checks every request with `require_permission`,
 * so a role that is not actually authorised still receives HTTP 403, which the pages show as-is.
 * Roles are identified from the server-verified role name, never from e-mail addresses.
 */

import { classifyCrmRole, extractRawRole, type CrmRoleCategory } from "./authRouting";

export type ModuleAction = "view" | "create" | "update" | "delete";

export interface ModulePermissions {
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export type PermissionModule = "account" | "deal" | "building" | "property" | "site_visit";

const ALL: ModuleAction[] = ["view", "create", "update", "delete"];
const CRU: ModuleAction[] = ["view", "create", "update"];
const VC: ModuleAction[] = ["view", "create"];
const VIEW: ModuleAction[] = ["view"];

/** Mirrors backend seed_role_permissions.py for the account.*, deal.*, building.*, property.* and site_visit.* permissions. */
const ROLE_DEFAULTS: Record<PermissionModule, Record<CrmRoleCategory, ModuleAction[]>> = {
  account: {
    TENANT_ADMIN: ALL,
    MANAGER: ALL,
    SALES_USER: CRU,
    OPERATIONS_USER: CRU,
    SUPPORT_USER: CRU,
    AUDITOR: VIEW,
  },
  deal: {
    TENANT_ADMIN: ALL,
    MANAGER: ALL,
    SALES_USER: CRU,
    OPERATIONS_USER: VIEW,
    SUPPORT_USER: VIEW,
    AUDITOR: VIEW,
  },
  building: {
    TENANT_ADMIN: ALL,
    MANAGER: ALL,
    SALES_USER: CRU,
    OPERATIONS_USER: CRU,
    SUPPORT_USER: VIEW,
    AUDITOR: VIEW,
  },
  property: {
    TENANT_ADMIN: ALL,
    MANAGER: ALL,
    SALES_USER: CRU,
    OPERATIONS_USER: CRU,
    SUPPORT_USER: VIEW,
    AUDITOR: VIEW,
  },
  // seed_role_permissions.py: Operations User holds site_visit.view + site_visit.create only.
  site_visit: {
    TENANT_ADMIN: ALL,
    MANAGER: ALL,
    SALES_USER: CRU,
    OPERATIONS_USER: VC,
    SUPPORT_USER: VIEW,
    AUDITOR: VIEW,
  },
};

/**
 * Feature-level permissions that are not plain view/create/update/delete modules.
 * Mirrors backend/app/database/seed_role_permissions.py (forecast.view, trash.*, pipeline.update,
 * lead.view, lead.update). Used only for showing/hiding UI; the backend re-checks every request.
 */
const ALL_ROLES: CrmRoleCategory[] = [
  "TENANT_ADMIN",
  "MANAGER",
  "SALES_USER",
  "OPERATIONS_USER",
  "SUPPORT_USER",
  "AUDITOR",
];

const FEATURE_ROLE_DEFAULTS: Record<string, CrmRoleCategory[]> = {
  "trash.view": ["TENANT_ADMIN", "MANAGER"],
  "trash.restore": ["TENANT_ADMIN", "MANAGER"],
  "trash.purge": ["TENANT_ADMIN"],
  "forecast.view": ["TENANT_ADMIN", "MANAGER"],
  "pipeline.update": ["TENANT_ADMIN", "MANAGER"],
  "lead.view": ALL_ROLES,
  "lead.update": ["TENANT_ADMIN", "MANAGER", "SALES_USER"],
  // Customer chat, e-mail logs and custom fields (seed_role_permissions.py). Tenant Owner/Admin hold
  // every grant; Manager holds chat access+manage, email.view/create, custom_field.view; Sales User holds
  // email.view/create + custom_field.view + chat access; Operations/Support hold chat access only.
  "customer_chat.access": ["TENANT_ADMIN", "MANAGER", "SALES_USER", "OPERATIONS_USER", "SUPPORT_USER"],
  "customer_chat.manage": ["TENANT_ADMIN", "MANAGER"],
  "email.view": ["TENANT_ADMIN", "MANAGER", "SALES_USER"],
  "email.create": ["TENANT_ADMIN", "MANAGER", "SALES_USER"],
  "email.delete": ["TENANT_ADMIN"],
  "email.manage": ["TENANT_ADMIN"],
  "custom_field.view": ["TENANT_ADMIN", "MANAGER", "SALES_USER"],
  "custom_field.manage": ["TENANT_ADMIN"],
  // Customer booking workflow (booking.view / .create / .update in seed_role_permissions.py).
  "booking.view": ALL_ROLES,
  "booking.create": ["TENANT_ADMIN", "MANAGER", "SALES_USER"],
  "booking.update": ["TENANT_ADMIN", "MANAGER", "SALES_USER", "OPERATIONS_USER"],
  // Booking payments and buyer-requirement offers (seed_role_permissions.py): used by the rentals screens and the
  // price negotiation panel. Owner is classified as TENANT_ADMIN.
  "booking.payment.view": ALL_ROLES,
  "booking.payment.create": ["TENANT_ADMIN", "MANAGER", "SALES_USER"],
  "booking.payment.verify": ["TENANT_ADMIN", "MANAGER", "OPERATIONS_USER"],
  "buyer_requirement.view": ALL_ROLES,
  "buyer_requirement.update": ["TENANT_ADMIN", "MANAGER", "SALES_USER"],
};

const NO_ACCESS: ModulePermissions = { view: false, create: false, update: false, delete: false };

function readStoredUser(): Record<string, unknown> | null {
  try {
    // The CRM session lives in sessionStorage, or localStorage for persistent logins.
    const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function extractPermissionNames(user: Record<string, unknown>): string[] {
  const role = user.role;
  const list: unknown[] = Array.isArray(user.permissions)
    ? user.permissions
    : role && typeof role === "object" && Array.isArray((role as Record<string, unknown>).permissions)
    ? ((role as Record<string, unknown>).permissions as unknown[])
    : Array.isArray(user.role_permissions)
    ? (user.role_permissions as unknown[])
    : [];

  return list
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && typeof (item as { name?: unknown }).name === "string") {
        return (item as { name: string }).name;
      }
      return "";
    })
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

function listAllows(names: string[], permission: string): boolean {
  const target = permission.trim().toLowerCase();
  const resource = target.split(".")[0];
  return names.some((n) => n === target || n === "*" || n === "all" || n === `${resource}.*`);
}

/**
 * Role-based fallback for a single permission string such as "account.view".
 * Returns null when the permission is not covered by this helper.
 */
export function roleFallbackAllows(permission: string, rawRole?: string | null): boolean | null {
  const featureKey = permission.trim().toLowerCase();
  const featureRoles = FEATURE_ROLE_DEFAULTS[featureKey];
  if (featureRoles) {
    const featureCategory = classifyCrmRole(rawRole);
    return featureCategory ? featureRoles.includes(featureCategory) : false;
  }
  const [resource, action] = permission.trim().toLowerCase().split(".");
  if (resource !== "account" && resource !== "deal") return null;
  if (!ALL.includes(action as ModuleAction)) return null;
  const category = classifyCrmRole(rawRole);
  if (!category) return false;
  return ROLE_DEFAULTS[resource][category].includes(action as ModuleAction);
}

/** Resolve view/create/update/delete for a module for the currently signed-in CRM user. */
export function resolveModulePermissions(module: PermissionModule): ModulePermissions {
  const user = readStoredUser();
  if (!user) return { ...NO_ACCESS };

  const names = extractPermissionNames(user);
  if (names.length > 0) {
    return {
      view: listAllows(names, `${module}.view`),
      create: listAllows(names, `${module}.create`),
      update: listAllows(names, `${module}.update`),
      delete: listAllows(names, `${module}.delete`),
    };
  }

  const category = classifyCrmRole(extractRawRole(user));
  if (!category) return { ...NO_ACCESS };
  const granted = ROLE_DEFAULTS[module][category];
  return {
    view: granted.includes("view"),
    create: granted.includes("create"),
    update: granted.includes("update"),
    delete: granted.includes("delete"),
  };
}

/**
 * Whether the signed-in CRM user holds a feature permission such as "trash.purge".
 * An explicit permission list on the stored user is authoritative; otherwise the role's seeded
 * grants are used. Unknown permissions are denied.
 */
export function hasFeaturePermission(permission: string): boolean {
  const user = readStoredUser();
  if (!user) return false;

  const names = extractPermissionNames(user);
  if (names.length > 0) return listAllows(names, permission);

  const allowed = roleFallbackAllows(permission, extractRawRole(user));
  return allowed === true;
}
