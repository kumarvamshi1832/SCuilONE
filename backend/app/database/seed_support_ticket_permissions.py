from app.database.connection import SessionLocal
from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission


PERMISSIONS = [
    ("support_ticket.view", "View support tickets"),
    ("support_ticket.create", "Create support tickets"),
    ("support_ticket.update", "Update and comment on support tickets"),
    ("support_ticket.delete", "Delete closed support tickets"),
    ("customer_portal.invite", "Invite customer contacts to the portal"),
    ("customer_portal.manage", "Suspend or reactivate customer portal users"),
]

ROLE_ACCESS = {
    "Tenant Owner": {"support_ticket.view", "support_ticket.create", "support_ticket.update", "support_ticket.delete", "customer_portal.invite", "customer_portal.manage"},
    "Tenant Admin": {"support_ticket.view", "support_ticket.create", "support_ticket.update", "support_ticket.delete", "customer_portal.invite", "customer_portal.manage"},
    "Manager": {"support_ticket.view", "support_ticket.create", "support_ticket.update", "support_ticket.delete", "customer_portal.invite", "customer_portal.manage"},
    "Support User": {"support_ticket.view", "support_ticket.create", "support_ticket.update"},
    "Read-only / Auditor": {"support_ticket.view"},
}


db = SessionLocal()
try:
    permission_by_name = {}
    for name, description in PERMISSIONS:
        permission = db.query(Permission).filter(Permission.name == name).first()
        if permission is None:
            permission = Permission(name=name, description=description)
            db.add(permission)
            db.flush()
        permission_by_name[name] = permission

    for role_name, permission_names in ROLE_ACCESS.items():
        role = db.query(Role).filter(Role.name == role_name).first()
        if role is None:
            continue
        existing_ids = {
            row.permission_id
            for row in db.query(RolePermission).filter(RolePermission.role_id == role.id).all()
        }
        for permission_name in permission_names:
            permission = permission_by_name[permission_name]
            if permission.id not in existing_ids:
                db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    db.commit()
    print("Support ticket permissions seeded successfully")
except Exception:
    db.rollback()
    raise
finally:
    db.close()
