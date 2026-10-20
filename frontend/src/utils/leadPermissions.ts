/* ─── Lead Permission Helpers ─── */
/* Reuses the same permission-checking pattern as DashboardLayout & activityPermissions */

import type { Lead } from "../types/lead";

export interface LeadUserContext {
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
  canViewAllLeads: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canView: boolean;
  hasPerm: (perm: string) => boolean;
}

/**
 * Get the current user's role info, userId, and tenantId from sessionStorage/token.
 * Returns normalized role flags and permission checkers.
 */
export function getLeadPermissions(): LeadUserContext {
  const userStr = sessionStorage.getItem("user");
  const tenantStr = sessionStorage.getItem("tenant");
  const token = sessionStorage.getItem("access_token");

  let userId = "";
  let tenantId = "";
  let role = "";
  let perms: any[] = [];
  let fullName = "";
  let email = "";

  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      userId = u.id || u.user_id || u.userId || u.uuid || "";
      role = (u.role || "").toUpperCase();
      fullName = u.full_name || u.name || "";
      email = u.email || "";

      if (Array.isArray(u.permissions)) perms = u.permissions;
      else if (u.role && Array.isArray(u.role.permissions)) perms = u.role.permissions;
      else if (Array.isArray(u.role_permissions)) perms = u.role_permissions;
    } catch (e) {}
  }

  if (tenantStr) {
    try {
      const t = JSON.parse(tenantStr);
      tenantId = t.id || t.tenant_id || "";
    } catch (e) {}
  }

  // Backup extraction from JWT token payload if userId, tenantId, or role wasn't found
  if ((!userId || !tenantId || !role) && token) {
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
    } catch (e) {}
  }

  const isManager = role.includes("MANAGER");
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
  const isTenantOwnerOrAdmin =
    role.includes("ADMIN") ||
    role.includes("OWNER") ||
    (!isManager && !isSales && !isOps && !isSupport && !isAuditor);

  const hasPerm = (perm: string): boolean => {
    return perms.some((p: any) => {
      if (typeof p === "string") return p.toLowerCase() === perm.toLowerCase();
      if (p && typeof p === "object" && p.name)
        return p.name.toLowerCase() === perm.toLowerCase();
      return false;
    });
  };

  // Managers, Tenant Admins, Tenant Owners, and Auditors retain team-wide visibility
  const canViewAllLeads =
    isTenantOwnerOrAdmin ||
    isManager ||
    isAuditor ||
    hasPerm("lead.view_all") ||
    hasPerm("leads.view_all");

  const canCreate = isTenantOwnerOrAdmin || isManager || hasPerm("lead.create");
  const canEdit = isTenantOwnerOrAdmin || isManager || hasPerm("lead.edit") || hasPerm("lead.update");
  const canDelete = isTenantOwnerOrAdmin || hasPerm("lead.delete");
  const canAssign = isTenantOwnerOrAdmin || isManager || hasPerm("lead.assign");
  const canView = true;

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
    canViewAllLeads,
    canCreate,
    canEdit,
    canDelete,
    canAssign,
    canView,
    hasPerm,
  };
}

/**
 * Validates whether a lead is visible to the given user context.
 *
 * Rules:
 * 1. Tenant Isolation: leads from another tenant are never visible.
 * 2. Team-wide roles (Manager, Tenant Admin, Tenant Owner, Auditor) can view all leads.
 * 3. Ordinary users (Sales User, Operations User, Support User) only see leads where
 *    lead.assigned_to strictly matches the logged-in user's UUID.
 */
export function isLeadVisibleToUser(
  lead: Lead,
  userId: string,
  canViewAll: boolean,
  tenantId?: string
): boolean {
  if (!lead) return false;

  // 1. Tenant Isolation check
  if (tenantId && lead.tenant_id) {
    if (String(lead.tenant_id).toLowerCase() !== String(tenantId).toLowerCase()) {
      return false;
    }
  }

  // 2. Team-wide visibility
  if (canViewAll) {
    return true;
  }

  // 3. Ordinary user: must be assigned to current user's UUID
  if (!lead.assigned_to || !userId) {
    return false;
  }

  return String(lead.assigned_to).toLowerCase() === String(userId).toLowerCase();
}

/**
 * Translate common backend assignment errors to user-friendly messages.
 */
export function friendlyAssignmentError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (lower.includes("assigned user does not belong to this tenant")) {
    return "The selected user does not belong to your current tenant.";
  }
  if (lower.includes("not found")) {
    return "The selected user could not be found. Please refresh and try again.";
  }
  if (lower.includes("permission") || lower.includes("forbidden") || lower.includes("not allowed")) {
    return "You do not have permission to perform this action.";
  }
  return rawMessage;
}
