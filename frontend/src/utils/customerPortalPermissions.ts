/**
 * Customer Portal Internal Management Permissions
 * Aligned with backend permissions:
 * - customer_portal.invite (list invitations, send invitations)
 * - customer_portal.manage (patch user status Active / Suspended)
 */

export interface CustomerPortalPermissions {
  canInvite: boolean;
  canManage: boolean;
  isAdmin: boolean;
  hasPermission: (perm: string) => boolean;
}

export function getCustomerPortalPermissions(): CustomerPortalPermissions {
  const userStr =
    sessionStorage.getItem("user") || localStorage.getItem("user");
  if (!userStr) {
    return {
      canInvite: false,
      canManage: false,
      isAdmin: false,
      hasPermission: () => false,
    };
  }

  try {
    const user = JSON.parse(userStr);
    const rawRole =
      typeof user.role === "string"
        ? user.role
        : user?.role?.name || user?.role_name || "";
    const role = String(rawRole).trim().toUpperCase();
    const isAdmin =
      user.is_superuser === true ||
      user.is_admin === true ||
      role === "ADMIN" ||
      role === "SUPERADMIN" ||
      role === "TENANT_ADMIN" ||
      role === "TENANT ADMIN" ||
      role === "TENANT_OWNER" ||
      role === "TENANT OWNER" ||
      role === "OWNER" ||
      role.includes("OWNER") ||
      role.includes("ADMIN");

    if (isAdmin) {
      return {
        canInvite: true,
        canManage: true,
        isAdmin: true,
        hasPermission: () => true,
      };
    }

    let perms: any[] = [];
    if (Array.isArray(user.permissions)) {
      perms = user.permissions;
    } else if (user.role && Array.isArray(user.role.permissions)) {
      perms = user.role.permissions;
    } else if (Array.isArray(user.role_permissions)) {
      perms = user.role_permissions;
    }

    const hasPerm = (permName: string): boolean => {
      if (!Array.isArray(perms) || perms.length === 0) return false;
      return perms.some((p) => {
        const pName = typeof p === "string" ? p : p?.name || "";
        const lower = pName.toLowerCase().trim();
        const target = permName.toLowerCase().trim();
        return (
          lower === target ||
          lower === "all" ||
          lower === "*" ||
          lower.startsWith(target.split(".")[0] + ".*")
        );
      });
    };

    return {
      canInvite: hasPerm("customer_portal.invite"),
      canManage: hasPerm("customer_portal.manage"),
      isAdmin: false,
      hasPermission: hasPerm,
    };
  } catch {
    return {
      canInvite: false,
      canManage: false,
      isAdmin: false,
      hasPermission: () => false,
    };
  }
}

