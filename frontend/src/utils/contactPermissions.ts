export const getContactPermissions = () => {
  const userStr = sessionStorage.getItem("user");
 
  if (!userStr) {
    return {
      view: false,
      create: false,
      update: false,
      delete: false,
    };
  }
 
  try {
    const user = JSON.parse(userStr);
 
    let perms: string[] = [];
 
    if (Array.isArray(user.permissions)) {
      perms = user.permissions;
    } else if (user.role && Array.isArray(user.role.permissions)) {
      perms = user.role.permissions;
    } else if (Array.isArray(user.role_permissions)) {
      perms = user.role_permissions;
    }
 
    if (perms.length > 0) {
      const hasPerm = (permName: string) => {
        return perms.some((p: any) => {
          if (typeof p === "string") {
            return p.toLowerCase() === permName.toLowerCase();
          }
 
          if (p && typeof p === "object" && p.name) {
            return p.name.toLowerCase() === permName.toLowerCase();
          }
 
          return false;
        });
      };
 
      return {
        view: hasPerm("contact.view"),
        create: hasPerm("contact.create"),
        update: hasPerm("contact.update"),
        delete: hasPerm("contact.delete"),
      };
    }
 
    const role =
      typeof user.role === "string"
        ? user.role
        : user.role?.name;
 
    const rolePermissions: Record<string, string[]> = {
      "Tenant Owner": [
        "contact.view",
        "contact.create",
        "contact.update",
        "contact.delete",
      ],
 
      "Tenant Admin": [
        "contact.view",
        "contact.create",
        "contact.update",
        "contact.delete",
      ],
 
      "Manager": [
        "contact.view",
        "contact.create",
        "contact.update",
        "contact.delete",
      ],
 
      "Sales User": [
        "contact.view",
        "contact.create",
        "contact.update",
      ],
 
      "Operations User": [
        "contact.view",
        "contact.create",
        "contact.update",
      ],
 
      "Support User": [
        "contact.view",
        "contact.create",
        "contact.update",
      ],
 
      "Read-only / Auditor": [
        "contact.view",
      ],
 
      "Read Only": [
        "contact.view",
      ],
    };
 
    perms = rolePermissions[role] || [];
 
    return {
      view: perms.includes("contact.view"),
      create: perms.includes("contact.create"),
      update: perms.includes("contact.update"),
      delete: perms.includes("contact.delete"),
    };
  } catch {
    return {
      view: false,
      create: false,
      update: false,
      delete: false,
    };
  }
};
 