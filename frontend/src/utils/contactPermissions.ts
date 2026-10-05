export const getContactPermissions = () => {
  const userStr = sessionStorage.getItem("user");
  if (!userStr) {
    return { view: false, create: false, update: false, delete: false };
  }

  try {
    const user = JSON.parse(userStr);
    let perms: any[] = [];
    
    if (Array.isArray(user.permissions)) {
      perms = user.permissions;
    } else if (user.role && Array.isArray(user.role.permissions)) {
      perms = user.role.permissions;
    } else if (Array.isArray(user.role_permissions)) {
      perms = user.role_permissions;
    }

    const hasPerm = (permName: string) => {
      return perms.some(p => {
        if (typeof p === 'string') return p.toLowerCase() === permName.toLowerCase();
        if (p && typeof p === 'object' && p.name) return p.name.toLowerCase() === permName.toLowerCase();
        return false;
      });
    };

    return {
      view: hasPerm("contact.view"),
      create: hasPerm("contact.create"),
      update: hasPerm("contact.update"),
      delete: hasPerm("contact.delete"),
    };
  } catch (e) {
    return { view: false, create: false, update: false, delete: false };
  }
};
