/**
 * Software Company Permission Utilities
 * Aligned with backend permissions:
 * - software_contract.view
 * - software_contract.create
 * - software_contract.update
 * - software_contract.delete
 * - software_invoice.view
 * - software_invoice.create
 * - software_invoice.update
 * - software_payment.record
 * - software_payment.reverse
 * - software_credit_note.create
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
  canReversePayment: boolean;
  canCreateCreditNote: boolean;
  isAdmin: boolean;
  hasPermission: (perm: string) => boolean;
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
      canReversePayment: false,
      canCreateCreditNote: false,
      isAdmin: false,
      hasPermission: () => false,
    };
  }

  try {
    const user = JSON.parse(userStr);
    const rawRole = typeof user.role === "string" ? user.role : user?.role?.name || user?.role_name || "";
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
        canReversePayment: true,
        canCreateCreditNote: true,
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
      // If user has wildcard permissions or no permissions array is restricted
      if (perms.length === 0) return true; // Default fallback to allow access if permissions are not strictly populated on token
      return perms.some((p) => {
        const pName = typeof p === "string" ? p : p?.name || "";
        const lower = pName.toLowerCase();
        return (
          lower === permName.toLowerCase() ||
          lower === "*" ||
          lower === "software.*" ||
          lower === "software_contract.*"
        );
      });
    };

    const viewContract = hasPerm("software_contract.view");
    const createContract = hasPerm("software_contract.create");
    const updateContract = hasPerm("software_contract.update");
    const deleteContract = hasPerm("software_contract.delete");

    const viewInvoice = hasPerm("software_invoice.view");
    const createInvoice = hasPerm("software_invoice.create");
    const updateInvoice = hasPerm("software_invoice.update");
    const recordPayment = hasPerm("software_payment.record") || updateInvoice;
    const reversePayment = hasPerm("software_payment.reverse");
    const createCreditNote = hasPerm("software_credit_note.create");

    return {
      canViewContracts: viewContract,
      canCreateContracts: createContract,
      canUpdateContracts: updateContract,
      canDeleteContracts: deleteContract,
      canMarkMilestoneReady: updateContract,
      canGenerateMilestoneInvoice: createContract,
      canViewInvoices: viewInvoice,
      canCreateInvoices: createInvoice,
      canUpdateInvoices: updateInvoice,
      canRecordPayment: recordPayment,
      canReversePayment: reversePayment,
      canCreateCreditNote: createCreditNote,
      isAdmin: false,
      hasPermission: hasPerm,
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
      canReversePayment: true,
      canCreateCreditNote: true,
      isAdmin: false,
      hasPermission: () => true,
    };
  }
}
