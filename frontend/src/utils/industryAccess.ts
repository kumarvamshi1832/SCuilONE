import { classifyCrmRole, normalizeRoleKey } from "./authRouting";

/**
 * UI-side access check for Industry & Module Settings.
 *
 * This only decides whether the editing controls are shown. The server remains the authority:
 * PATCH /api/v1/industry/config requires `industry_config.update` and always operates on the
 * tenant carried by the caller's access token.
 */

export const INDUSTRY_CONFIG_UPDATE_PERMISSION = "industry_config.update";

type UserRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UserRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readStoredUser(): UserRecord | null {
  try {
    const raw = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Role name from `role` (string or { name }) or `role_name`. */
export function getUserRoleName(user: UserRecord | null): string {
  if (!user) return "";
  if (typeof user.role === "string") return user.role;
  if (isRecord(user.role) && typeof user.role.name === "string") return user.role.name;
  if (typeof user.role_name === "string") return user.role_name;
  return "";
}

function permissionName(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (isRecord(entry)) {
    for (const field of ["name", "permission", "permission_name", "code", "key"]) {
      const value = entry[field];
      if (typeof value === "string") return value;
    }
  }
  return "";
}

/** Union of every permission list the session may carry, as lower-cased strings. */
export function getUserPermissionNames(user: UserRecord | null): string[] {
  if (!user) return [];
  const sources: unknown[] = [
    user.permissions,
    isRecord(user.role) ? user.role.permissions : undefined,
    user.role_permissions,
  ];
  const names = new Set<string>();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const entry of source) {
      const name = permissionName(entry).trim().toLowerCase();
      if (name) names.add(name);
    }
  }
  return Array.from(names);
}

export function userHasPermission(user: UserRecord | null, permission: string): boolean {
  const target = permission.trim().toLowerCase();
  const prefix = target.split(".")[0];
  return getUserPermissionNames(user).some(
    (name) => name === target || name === "*" || name === "all" || name === `${prefix}.*`
  );
}

/**
 * Who sees editable controls:
 *  - an explicit `industry_config.update` grant (or wildcard) on the session, or
 *  - a tenant Owner/Admin role (TENANT_OWNER, TENANT_ADMIN, OWNER, ADMIN — case/space/hyphen
 *    insensitive), which the backend seeds with `industry_config.update`, or
 *  - a Platform Super Admin / explicit super-user flag.
 * Manager, Sales, Operations, Support and Auditor roles stay read-only unless the session lists the
 * permission explicitly.
 */
export function canManageIndustryConfig(user: UserRecord | null = readStoredUser()): boolean {
  if (!user) return false;
  if (userHasPermission(user, INDUSTRY_CONFIG_UPDATE_PERMISSION)) return true;
  if (user.is_super_admin === true || user.is_superuser === true) return true;

  const roleName = getUserRoleName(user);
  if (classifyCrmRole(roleName) === "TENANT_ADMIN") return true;
  return normalizeRoleKey(roleName) === "PLATFORM_SUPER_ADMIN";
}
