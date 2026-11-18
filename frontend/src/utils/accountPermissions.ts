import { resolveModulePermissions } from "./modulePermissions";

/** Account (Owners & Builders in Real Estate) permissions for the signed-in user. */
export const getAccountPermissions = () => resolveModulePermissions("account");
