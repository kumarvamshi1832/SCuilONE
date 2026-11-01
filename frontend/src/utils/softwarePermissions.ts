/**
 * Software Company Permission Utilities
 * Aligned with backend permissions:
 * - software_contract.view
 * - software_contract.create
 * - software_contract.update
 * - software_contract.delete
 */

export interface SoftwarePermissions {
  canViewContracts: boolean;
  canCreateContracts: boolean;
  canUpdateContracts: boolean;
  canDeleteContracts: boolean;
  canMarkMilestoneReady: boolean;
  canGenerateMilestoneInvoice: boolean;
  canViewInvoices: boolean;
  canCreateInvoices: boolean;
  canUpdateInvoices: boolean;
  canRecordPayment: boolean;
  isAdmin: boolean;
}

export function getSoftwarePermissions(): SoftwarePermissions {
  const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
  if (!userStr) {
    return {
      canViewContracts: false,
      canCreateContracts: false,
      canUpdateContracts: false,
      canDeleteContracts: false,
      canMarkMilestoneReady: false,
      canGenerateMilestoneInvoice: false,
      canViewInvoices: false,
      canCreateInvoices: false,
      canUpdateInvoices: false,
      canRecordPayment: false,
      isAdmin: false,
    };
  }

  try {
    const user = JSON.parse(userStr);
    const role = (user.role || "").toUpperCase();
    const isAdmin =
      role === "ADMIN" ||
      role === "SUPERADMIN" ||
      role === "TENANT_ADMIN" ||
      role === "OWNER";

    // If tenant admin or superadmin, grant full permissions by default
    if (isAdmin) {
      return {
        canViewContracts: true,
        canCreateContracts: true,
        canUpdateContracts: true,
        canDeleteContracts: true,
        canMarkMilestoneReady: true,
        canGenerateMilestoneInvoice: true,
        canViewInvoices: true,
        canCreateInvoices: true,
        canUpdateInvoices: true,
        canRecordPayment: true,
        isAdmin: true,
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

    const hasPerm = (permName: string) => {
      // If user has wildcard permissions or no permissions array is restricted
      if (perms.length === 0) return true; // Default fallback to allow access if permissions are not strictly populated on token
      return perms.some((p) => {
        if (typeof p === "string") return p.toLowerCase() === permName.toLowerCase();
        if (p && typeof p === "object" && p.name) return p.name.toLowerCase() === permName.toLowerCase();
        return false;
      });
    };

    const viewContract = hasPerm("software_contract.view");
    const createContract = hasPerm("software_contract.create");
    const updateContract = hasPerm("software_contract.update");
    const deleteContract = hasPerm("software_contract.delete");

    return {
      canViewContracts: viewContract,
      canCreateContracts: createContract,
      canUpdateContracts: updateContract,
      canDeleteContracts: deleteContract,
      canMarkMilestoneReady: updateContract,
      canGenerateMilestoneInvoice: createContract,
      canViewInvoices: viewContract,
      canCreateInvoices: createContract,
      canUpdateInvoices: updateContract,
      canRecordPayment: updateContract,
      isAdmin: false,
    };
  } catch {
    return {
      canViewContracts: true,
      canCreateContracts: true,
      canUpdateContracts: true,
      canDeleteContracts: true,
      canMarkMilestoneReady: true,
      canGenerateMilestoneInvoice: true,
      canViewInvoices: true,
      canCreateInvoices: true,
      canUpdateInvoices: true,
      canRecordPayment: true,
      isAdmin: false,
    };
  }
}

