export interface PermissionDetail {
  id: string;
  name: string;
  module: string;
  action: string;
  description: string;
}

/**
 * Authoritative system permissions catalog aligned with backend RBAC definitions
 * (app/database/seed_permissions.py & app/core/permissions.py).
 */
export const SYSTEM_PERMISSIONS: PermissionDetail[] = [
  // Industry Config
  { id: "p1", name: "industry_config.update", module: "Industry Configuration", action: "Update", description: "Update tenant industry configuration and module enablement" },

  // Leads
  { id: "p2", name: "lead.view", module: "Leads", action: "View", description: "View leads" },
  { id: "p3", name: "lead.create", module: "Leads", action: "Create", description: "Create leads" },
  { id: "p4", name: "lead.update", module: "Leads", action: "Update", description: "Update leads" },
  { id: "p5", name: "lead.delete", module: "Leads", action: "Delete", description: "Delete leads" },
  { id: "p6", name: "lead.assignment.override", module: "Leads", action: "Override", description: "Override salesperson lead capacity" },

  // Contacts & Accounts
  { id: "p7", name: "contact.view", module: "Contacts", action: "View", description: "View contacts" },
  { id: "p8", name: "contact.create", module: "Contacts", action: "Create", description: "Create contacts" },
  { id: "p9", name: "contact.update", module: "Contacts", action: "Update", description: "Update contacts" },
  { id: "p10", name: "contact.delete", module: "Contacts", action: "Delete", description: "Delete contacts" },
  { id: "p11", name: "account.view", module: "Accounts", action: "View", description: "View accounts" },
  { id: "p12", name: "account.create", module: "Accounts", action: "Create", description: "Create accounts" },
  { id: "p13", name: "account.update", module: "Accounts", action: "Update", description: "Update accounts" },
  { id: "p14", name: "account.delete", module: "Accounts", action: "Delete", description: "Delete accounts" },

  // Deals & Pipelines
  { id: "p15", name: "deal.view", module: "Deals", action: "View", description: "View deals" },
  { id: "p16", name: "deal.create", module: "Deals", action: "Create", description: "Create deals" },
  { id: "p17", name: "deal.update", module: "Deals", action: "Update", description: "Update deals" },
  { id: "p18", name: "deal.delete", module: "Deals", action: "Delete", description: "Delete deals" },
  { id: "p19", name: "pipeline.view", module: "Pipelines", action: "View", description: "View pipelines" },
  { id: "p20", name: "pipeline.create", module: "Pipelines", action: "Create", description: "Create pipelines" },
  { id: "p21", name: "pipeline.update", module: "Pipelines", action: "Update", description: "Update pipelines" },
  { id: "p22", name: "pipeline.delete", module: "Pipelines", action: "Delete", description: "Delete pipelines" },

  // Activities & Tasks
  { id: "p23", name: "activity.view", module: "Activities", action: "View", description: "View activities" },
  { id: "p24", name: "activity.create", module: "Activities", action: "Create", description: "Create activities" },
  { id: "p25", name: "activity.update", module: "Activities", action: "Update", description: "Update activities" },
  { id: "p26", name: "activity.delete", module: "Activities", action: "Delete", description: "Delete activities" },
  { id: "p27", name: "task.view", module: "Tasks", action: "View", description: "View tasks" },
  { id: "p28", name: "task.create", module: "Tasks", action: "Create", description: "Create tasks" },
  { id: "p29", name: "task.update", module: "Tasks", action: "Update", description: "Update tasks" },
  { id: "p30", name: "task.delete", module: "Tasks", action: "Delete", description: "Delete tasks" },

  // Users & Workflows
  { id: "p31", name: "user.view", module: "Users", action: "View", description: "View users" },
  { id: "p32", name: "user.create", module: "Users", action: "Create", description: "Create users" },
  { id: "p33", name: "user.update", module: "Users", action: "Update", description: "Update users" },
  { id: "p34", name: "user.delete", module: "Users", action: "Delete", description: "Deactivate users" },
  { id: "p35", name: "workflow.view", module: "Workflows", action: "View", description: "View workflows" },
  { id: "p36", name: "workflow.create", module: "Workflows", action: "Create", description: "Create workflows" },
  { id: "p37", name: "workflow.update", module: "Workflows", action: "Update", description: "Update workflows" },
  { id: "p38", name: "workflow.delete", module: "Workflows", action: "Delete", description: "Delete workflows" },
  { id: "p39", name: "workflow.activate", module: "Workflows", action: "Activate", description: "Activate and deactivate workflows" },
  { id: "p40", name: "document.view", module: "Documents", action: "View", description: "View documents" },
  { id: "p41", name: "audit.view", module: "Audit", action: "View", description: "View tenant audit logs" },

  // Software Delivery Modules
  { id: "p42", name: "software_requirement.view", module: "Software Requirements", action: "View", description: "View software requirements" },
  { id: "p43", name: "software_requirement.create", module: "Software Requirements", action: "Create", description: "Create software requirements" },
  { id: "p44", name: "software_requirement.update", module: "Software Requirements", action: "Update", description: "Update software requirements" },
  { id: "p45", name: "software_requirement.delete", module: "Software Requirements", action: "Delete", description: "Delete software requirements" },
  { id: "p46", name: "software_estimate.view", module: "Software Estimates", action: "View", description: "View software estimates" },
  { id: "p47", name: "software_estimate.create", module: "Software Estimates", action: "Create", description: "Create software estimates" },
  { id: "p48", name: "software_estimate.update", module: "Software Estimates", action: "Update", description: "Update software estimates" },
  { id: "p49", name: "software_estimate.delete", module: "Software Estimates", action: "Delete", description: "Delete software estimates" },
  { id: "p50", name: "software_contract.view", module: "Software Contracts", action: "View", description: "View software contracts and payment milestones" },
  { id: "p51", name: "software_contract.create", module: "Software Contracts", action: "Create", description: "Create software contracts and milestones" },
  { id: "p52", name: "software_contract.update", module: "Software Contracts", action: "Update", description: "Update software contracts and milestones" },
  { id: "p53", name: "software_contract.delete", module: "Software Contracts", action: "Delete", description: "Delete software contracts" },
  { id: "p54", name: "software_project.view", module: "Software Projects", action: "View", description: "View software projects and architecture" },
  { id: "p55", name: "software_project.create", module: "Software Projects", action: "Create", description: "Create software projects" },
  { id: "p56", name: "software_project.update", module: "Software Projects", action: "Update", description: "Update software projects" },
  { id: "p57", name: "software_project.delete", module: "Software Projects", action: "Delete", description: "Delete software projects" },
  { id: "p58", name: "software_sprint.view", module: "Software Sprints", action: "View", description: "View sprint boards and delivery goals" },
  { id: "p59", name: "software_sprint.create", module: "Software Sprints", action: "Create", description: "Create delivery sprints" },
  { id: "p60", name: "software_sprint.update", module: "Software Sprints", action: "Update", description: "Update delivery sprints" },
  { id: "p61", name: "software_sprint.delete", module: "Software Sprints", action: "Delete", description: "Delete delivery sprints" },
  { id: "p62", name: "software_invoice.view", module: "Software Invoices", action: "View", description: "View software invoices and billing summaries" },
  { id: "p63", name: "software_invoice.create", module: "Software Invoices", action: "Create", description: "Create software invoices and billing progress" },
  { id: "p64", name: "software_invoice.update", module: "Software Invoices", action: "Update", description: "Update software invoice status (Sent/Void)" },
  { id: "p65", name: "software_payment.record", module: "Software Payments", action: "Record", description: "Record client invoice payment receipts with references" },
  { id: "p66", name: "software_payment.reverse", module: "Software Payments", action: "Reverse", description: "Reverse verified payment receipts with audit reason" },
  { id: "p67", name: "software_credit_note.create", module: "Software Credit Notes", action: "Create", description: "Issue credit note adjustments against active invoices" },

  // Customer Support & Portal
  { id: "p68", name: "support_ticket.view", module: "Customer Support", action: "View", description: "View client support tickets" },
  { id: "p69", name: "support_ticket.create", module: "Customer Support", action: "Create", description: "Create and route support tickets" },
  { id: "p70", name: "support_ticket.update", module: "Customer Support", action: "Update", description: "Update support tickets and SLAs" },
  { id: "p71", name: "customer_portal.manage", module: "Customer Portal", action: "Manage", description: "Manage customer portal access and user invitations" },
];

/**
 * Returns the system permissions catalog.
 */
export const getPermissions = async (): Promise<PermissionDetail[]> => {
  return SYSTEM_PERMISSIONS;
};

/**
 * Returns permissions granted to the currently authenticated session.
 */
export const getAuthenticatedUserPermissions = (): string[] => {
  try {
    const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
    if (!userStr) return [];
    const user = JSON.parse(userStr);
    return user.permissions || [];
  } catch {
    return [];
  }
};
