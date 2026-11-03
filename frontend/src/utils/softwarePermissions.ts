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
 * - software_invoice.delete
 * - software_invoice.send
 * - software_invoice.cancel
 * - software_invoice.payment.view
 * - software_invoice.payment.create
 * - software_invoice.payment.reverse
 * - software_invoice.credit_note.create
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
  canDeleteInvoices: boolean;
  canSendInvoices: boolean;
  canCancelInvoices: boolean;
  canViewInvoicePayments: boolean;
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
      canDeleteInvoices: false,
      canSendInvoices: false,
      canCancelInvoices: false,
      canViewInvoicePayments: false,
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
        canDeleteInvoices: true,
        canSendInvoices: true,
        canCancelInvoices: true,
        canViewInvoicePayments: true,
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
      if (!Array.isArray(perms) || perms.length === 0) return false;
      return perms.some((p) => {
        const pName = typeof p === "string" ? p : p?.name || "";
        const lower = pName.toLowerCase().trim();
        const target = permName.toLowerCase().trim();
        return (
          lower === target ||
          lower === "*" ||
          lower === "software.*" ||
          (target.startsWith("software_contract.") && lower === "software_contract.*") ||
          (target.startsWith("software_invoice.") && lower === "software_invoice.*")
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
    const deleteInvoice = hasPerm("software_invoice.delete");
    const sendInvoice = hasPerm("software_invoice.send");
    const cancelInvoice = hasPerm("software_invoice.cancel");
    const viewInvoicePayments = hasPerm("software_invoice.payment.view");
    const recordPayment = hasPerm("software_invoice.payment.create");
    const reversePayment = hasPerm("software_invoice.payment.reverse");
    const createCreditNote = hasPerm("software_invoice.credit_note.create");

    return {
      canViewContracts: viewContract,
      canCreateContracts: createContract,
      canUpdateContracts: updateContract,
      canDeleteContracts: deleteContract,
      canMarkMilestoneReady: updateContract,
      canGenerateMilestoneInvoice: createInvoice,
      canViewInvoices: viewInvoice,
      canCreateInvoices: createInvoice,
      canUpdateInvoices: updateInvoice,
      canDeleteInvoices: deleteInvoice,
      canSendInvoices: sendInvoice,
      canCancelInvoices: cancelInvoice,
      canViewInvoicePayments: viewInvoicePayments,
      canRecordPayment: recordPayment,
      canReversePayment: reversePayment,
      canCreateCreditNote: createCreditNote,
      isAdmin: false,
      hasPermission: hasPerm,
    };
  } catch {
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
      canDeleteInvoices: false,
      canSendInvoices: false,
      canCancelInvoices: false,
      canViewInvoicePayments: false,
      canRecordPayment: false,
      canReversePayment: false,
      canCreateCreditNote: false,
      isAdmin: false,
      hasPermission: () => false,
    };
  }
}
