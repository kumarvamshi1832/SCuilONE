/* ─── Lead Permission Helpers ─── */
/* Reuses the same permission-checking pattern as DashboardLayout */

/**
 * Get the current user's role info from sessionStorage.
 * Returns normalized role flags and a permission checker.
 */
export function getLeadPermissions() {
  const userStr = sessionStorage.getItem("user");
  let role = "";
  let perms: any[] = [];

  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      role = (u.role || "").toUpperCase();

      if (Array.isArray(u.permissions)) perms = u.permissions;
      else if (u.role && Array.isArray(u.role.permissions)) perms = u.role.permissions;
      else if (Array.isArray(u.role_permissions)) perms = u.role_permissions;
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
    !isManager && !isSales && !isOps && !isSupport && !isAuditor;

  const hasPerm = (perm: string): boolean => {
    return perms.some((p: any) => {
      if (typeof p === "string") return p.toLowerCase() === perm.toLowerCase();
      if (p && typeof p === "object" && p.name)
        return p.name.toLowerCase() === perm.toLowerCase();
      return false;
    });
  };

  // Tenant Owner/Admin always has full lead access.
  // For other roles, check the actual permissions array.
  const canCreate = isTenantOwnerOrAdmin || isManager || hasPerm("lead.create");
  const canEdit = isTenantOwnerOrAdmin || isManager || hasPerm("lead.edit") || hasPerm("lead.update");
  const canDelete = isTenantOwnerOrAdmin || hasPerm("lead.delete");
  const canAssign = isTenantOwnerOrAdmin || isManager || hasPerm("lead.assign");
  const canView = true; // Everyone who can see the Leads page can view

  return {
    role,
    isTenantOwnerOrAdmin,
    isManager,
    isSales,
    canCreate,
    canEdit,
    canDelete,
    canAssign,
    canView,
    hasPerm,
  };
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
