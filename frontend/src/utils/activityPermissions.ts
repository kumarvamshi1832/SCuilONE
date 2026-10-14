import type { Activity } from "../types/activity";

export interface ActivityUserContext {
  userId: string;
  tenantId: string;
  role: string;
  fullName: string;
  email: string;
  isManager: boolean;
  isTenantOwnerOrAdmin: boolean;
  isSales: boolean;
  isOps: boolean;
  isSupport: boolean;
  isAuditor: boolean;
  canViewAllActivities: boolean;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  hasPerm: (permName: string) => boolean;
}

/**
 * Extracts and normalizes the authenticated user and tenant context from sessionStorage and JWT.
 */
export const getActivityUserContext = (): ActivityUserContext => {
  const userStr = sessionStorage.getItem("user");
  const tenantStr = sessionStorage.getItem("tenant");
  const token = sessionStorage.getItem("access_token");

  let userId = "";
  let tenantId = "";
  let role = "";
  let permissions: any[] = [];
  let fullName = "";
  let email = "";

  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      userId = u.id || u.user_id || u.userId || u.uuid || "";
      role = (u.role || "").toUpperCase();
      fullName = u.full_name || u.name || "";
      email = u.email || "";

      if (Array.isArray(u.permissions)) {
        permissions = u.permissions;
      } else if (u.role && Array.isArray(u.role.permissions)) {
        permissions = u.role.permissions;
      } else if (Array.isArray(u.role_permissions)) {
        permissions = u.role_permissions;
      }
    } catch (e) {
      console.error("Failed to parse user from sessionStorage:", e);
    }
  }

  if (tenantStr) {
    try {
      const t = JSON.parse(tenantStr);
      tenantId = t.id || t.tenant_id || "";
    } catch (e) {
      console.error("Failed to parse tenant from sessionStorage:", e);
    }
  }

  // Backup extraction from JWT token payload if userId or tenantId was not in user/tenant objects
  if ((!userId || !tenantId) && token) {
    try {
      const parts = token.split(".");
      if (parts.length === 3 && parts[1]) {
        const payload = JSON.parse(atob(parts[1]));
        if (!userId && (payload.user_id || payload.sub)) {
          userId = payload.user_id || payload.sub;
        }
        if (!tenantId && payload.tenant_id) {
          tenantId = payload.tenant_id;
        }
        if (!role && payload.role) {
          role = String(payload.role).toUpperCase();
        }
      }
    } catch (e) {
      console.error("Failed to decode token payload:", e);
    }
  }

  const hasPerm = (permName: string): boolean => {
    return permissions.some((p: any) => {
      if (typeof p === "string") return p.toLowerCase() === permName.toLowerCase();
      if (p && typeof p === "object" && p.name) {
        return p.name.toLowerCase() === permName.toLowerCase();
      }
      return false;
    });
  };

  const isManager = role.includes("MANAGER");
  const isTenantOwnerOrAdmin =
    role.includes("ADMIN") ||
    role.includes("OWNER") ||
    role === "TENANT ADMIN" ||
    role === "TENANT OWNER" ||
    role === "SUPER ADMIN";

  const isSales =
    role === "SALES_USER" ||
    role === "SALES USER" ||
    role.includes("SALES");

  const isOps =
    role === "OPERATIONS_USER" ||
    role === "OPERATIONS USER" ||
    role.includes("OPERATIONS");

  const isSupport =
    role === "SUPPORT_USER" ||
    role === "SUPPORT USER" ||
    role.includes("SUPPORT");

  const isAuditor =
    role === "READ_ONLY" ||
    role === "AUDITOR" ||
    role === "READ ONLY" ||
    role === "READ-ONLY" ||
    role === "READ-ONLY / AUDITOR" ||
    role === "READ ONLY / AUDITOR" ||
    role === "READ_ONLY / AUDITOR" ||
    role.includes("AUDITOR");

  // Manager, Tenant Admin, and Tenant Owner retain team-wide visibility
  const canViewAllActivities =
    isTenantOwnerOrAdmin ||
    isManager ||
    isAuditor ||
    hasPerm("activity.view_all") ||
    hasPerm("activities.view_all");

  return {
    userId,
    tenantId,
    role,
    fullName,
    email,
    isManager,
    isTenantOwnerOrAdmin,
    isSales,
    isOps,
    isSupport,
    isAuditor,
    canViewAllActivities,
    view: hasPerm("activity.view") || isTenantOwnerOrAdmin || isManager || isSales || isOps || isSupport || isAuditor,
    create: hasPerm("activity.create") || isTenantOwnerOrAdmin || isManager || isSales || isOps || isSupport,
    update: hasPerm("activity.update") || isTenantOwnerOrAdmin || isManager || isSales || isOps || isSupport,
    delete: hasPerm("activity.delete") || isTenantOwnerOrAdmin || isManager || isOps,
    hasPerm,
  };
};

/**
 * Validates whether an activity is visible to the user.
 *
 * Rules:
 * 1. Tenant Isolation: activities belonging to another tenant are never visible.
 * 2. Team-wide visibility: Managers, Tenant Admins, Tenant Owners, and Auditors can view all
 *    tenant activities (or switch to "my" tasks mode where they see tasks assigned to them).
 * 3. Ordinary users (Sales User, Operations User, Support User):
 *    - MUST have assigned_to UUID matching the logged-in user's UUID.
 *    - Unassigned activities (assigned_to is null, undefined, or empty) are NOT visible.
 *    - Other users' activities are strictly blocked.
 */
export function isActivityVisibleToUser(
  activity: Activity,
  context: ActivityUserContext,
  viewMode: "all" | "my" = "all"
): boolean {
  if (!activity) return false;

  // 1. Tenant Isolation
  if (context.tenantId && activity.tenant_id) {
    if (String(activity.tenant_id).toLowerCase() !== String(context.tenantId).toLowerCase()) {
      return false;
    }
  }

  // 2. Roles with permitted team-wide visibility (Manager, Tenant Admin, Tenant Owner, Auditor)
  if (context.canViewAllActivities) {
    if (viewMode === "my") {
      // In "My Tasks" mode, show only activities assigned to the current user's UUID
      if (!activity.assigned_to || !context.userId) return false;
      return String(activity.assigned_to).toLowerCase() === String(context.userId).toLowerCase();
    }
    // In "All Activities" mode, show all tenant activities (including unassigned)
    return true;
  }

  // 3. Ordinary users (Sales User, Operations User, Support User)
  // Unassigned activities must not be shown to ordinary users
  if (!activity.assigned_to || !context.userId) {
    return false;
  }

  // Compare UUIDs strictly (case-insensitive string comparison)
  return String(activity.assigned_to).toLowerCase() === String(context.userId).toLowerCase();
}

/**
 * Backward-compatible helper for action permission checks.
 */
export const getActivityPermissions = () => {
  const ctx = getActivityUserContext();
  return {
    view: ctx.view,
    create: ctx.create,
    update: ctx.update,
    delete: ctx.delete,
  };
};

