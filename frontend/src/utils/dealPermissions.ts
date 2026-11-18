import { resolveModulePermissions } from "./modulePermissions";

/** Deal (Deals & Bookings in Real Estate) permissions for the signed-in user. */
export const getDealPermissions = () => resolveModulePermissions("deal");
