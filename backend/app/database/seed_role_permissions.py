from app.database.connection import SessionLocal
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission


role_permissions = {
    "Tenant Owner": [
        "lead.view", "lead.create", "lead.update", "lead.delete",
        "contact.view", "contact.create", "contact.update", "contact.delete",
        "account.view", "account.create", "account.update", "account.delete",
        "deal.view", "deal.create", "deal.update", "deal.delete",
        "task.view", "task.create", "task.update", "task.delete",
    ],

    "Tenant Admin": [
        "lead.view", "lead.create", "lead.update", "lead.delete",
        "contact.view", "contact.create", "contact.update", "contact.delete",
        "account.view", "account.create", "account.update", "account.delete",
        "deal.view", "deal.create", "deal.update", "deal.delete",
        "task.view", "task.create", "task.update", "task.delete",
    ],

    "Manager": [
        "lead.view", "lead.create", "lead.update", "lead.delete",
        "contact.view", "contact.create", "contact.update", "contact.delete",
        "account.view", "account.create", "account.update", "account.delete",
        "deal.view", "deal.create", "deal.update", "deal.delete",
        "task.view", "task.create", "task.update", "task.delete",
    ],

    "Sales User": [
        "lead.view", "lead.create", "lead.update",
        "contact.view", "contact.create", "contact.update",
        "account.view", "account.create", "account.update",
        "deal.view", "deal.create", "deal.update",
        "task.view", "task.create", "task.update",
    ],

    "Operations User": [
        "lead.view",
        "contact.view", "contact.create", "contact.update",
        "account.view", "account.create", "account.update",
        "deal.view",
        "task.view", "task.create", "task.update", "task.delete",
    ],

    "Support User": [
        "lead.view",
        "contact.view", "contact.create", "contact.update",
        "account.view", "account.create", "account.update",
        "deal.view",
        "task.view", "task.create", "task.update",
    ],

    "Read-only / Auditor": [
        "lead.view",
        "contact.view",
        "account.view",
        "deal.view",
        "task.view",
    ],
}


db = SessionLocal()

for role_name, permission_names in role_permissions.items():

    role = db.query(Role).filter(
        Role.name == role_name
    ).first()

    if not role:
        print(f"Role not found: {role_name}")
        continue

    for permission_name in permission_names:

        permission = db.query(Permission).filter(
            Permission.name == permission_name
        ).first()

        if not permission:
            print(f"Permission not found: {permission_name}")
            continue

        existing = db.query(RolePermission).filter(
            RolePermission.role_id == role.id,
            RolePermission.permission_id == permission.id
        ).first()

        if not existing:
            db.add(
                RolePermission(
                    role_id=role.id,
                    permission_id=permission.id
                )
            )

db.commit()
db.close()

print("Role permissions seeded successfully")