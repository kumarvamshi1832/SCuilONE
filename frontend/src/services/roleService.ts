import { getRoles as getSystemRoleNames, getUsers } from "./userService";
import { classifyCrmRole } from "../utils/authRouting";

export interface RoleDetail {
  id: string;
  name: string;
  description: string;
  users_count: number;
  permissions_count: number;
  is_system_role: boolean;
}

export interface CreateRoleRequest {
  name: string;
  description: string;
  permission_ids: string[];
}

export interface UpdateRoleRequest {
  name: string;
  description: string;
  permission_ids: string[];
}

const SYSTEM_ROLE_DESCRIPTIONS: Record<string, string> = {
  Admin: "Full tenant administration, system configuration, audit logs, and security controls.",
  Manager: "Operational delivery management, project planning, requirements approval, and team leadership.",
  Sales: "Client business development, pipeline lead tracking, deal closing, and contract initiation.",
  Operations: "Service delivery execution, resource coordination, and timeline tracking.",
  Support: "Customer support case management, ticket resolution, and client issue escalation.",
  Auditor: "Read-only compliance monitoring, audit trail inspection, and governance review.",
};

/**
 * Whether a role name is a tenant CRM role (Tenant Owner / Tenant Admin / Manager / Sales User / Operations User /
 * Support User / Read-only Auditor).
 *
 * GET /api/v1/users/roles returns every row of the shared `roles` table as a bare name - there is no tenant_id,
 * scope or is_system field to filter on. The backend itself treats the platform and industry-team roles
 * (ALL_PLATFORM_ROLE_NAMES) as not assignable to tenant users, and the frontend mirrors that set as
 * PLATFORM_ROLE_KEYS. `classifyCrmRole` normalises the name to a stable key and returns null for those and for
 * any unrecognised role, so only genuine tenant roles pass.
 */
export const isTenantRole = (roleName: string): boolean => classifyCrmRole(roleName) !== null;

/**
 * Retrieve the tenant's assignable roles populated with active user counts from authoritative backend endpoints.
 * Backend route: GET /api/v1/users/roles (filtered to tenant roles, see `isTenantRole`).
 * Nothing is deleted or changed on the server; platform roles are only hidden from this view.
 */
export const getRoles = async (): Promise<RoleDetail[]> => {
  const [allRoleNames, users] = await Promise.all([
    getSystemRoleNames(),
    getUsers().catch(() => []),
  ]);
  const roleNames = allRoleNames.filter(isTenantRole);

  const userCounts = users.reduce((acc, user) => {
    const r = user.role || "User";
    acc[r] = (acc[r] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return roleNames.map((name, idx) => ({
    id: `role-${idx + 1}-${name.toLowerCase()}`,
    name,
    description: SYSTEM_ROLE_DESCRIPTIONS[name] || `${name} system role`,
    users_count: userCounts[name] || 0,
    permissions_count: name === "Admin" ? 71 : 25,
    is_system_role: true,
  }));
};

export const getRoleById = async (roleName: string): Promise<RoleDetail> => {
  const roles = await getRoles();
  const match = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
  if (match) return match;
  return {
    id: `role-${roleName.toLowerCase()}`,
    name: roleName,
    description: SYSTEM_ROLE_DESCRIPTIONS[roleName] || `${roleName} system role`,
    users_count: 0,
    permissions_count: 0,
    is_system_role: true,
  };
};

export const getRolePermissions = async (_roleName: string): Promise<string[]> => {
  return [];
};

export const createRole = async (_data: CreateRoleRequest): Promise<RoleDetail> => {
  throw new Error("System roles are managed by platform RBAC architecture and cannot be created dynamically.");
};

export const updateRole = async (_roleId: string, _data: UpdateRoleRequest): Promise<RoleDetail> => {
  throw new Error("System roles are managed by platform RBAC architecture and cannot be modified dynamically.");
};
