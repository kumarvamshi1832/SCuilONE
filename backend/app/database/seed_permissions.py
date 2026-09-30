from app.database.connection import SessionLocal
from app.models.permission import Permission


permissions = [
    # Leads
    ("leads.view", "View leads"),
    ("leads.create", "Create leads"),
    ("leads.update", "Update leads"),
    ("leads.delete", "Delete leads"),

    # Contacts
    ("contacts.view", "View contacts"),
    ("contacts.create", "Create contacts"),
    ("contacts.update", "Update contacts"),
    ("contacts.delete", "Delete contacts"),

    # Deals
    ("deals.view", "View deals"),
    ("deals.create", "Create deals"),
    ("deals.update", "Update deals"),
    ("deals.delete", "Delete deals"),

    # Activities
    ("activities.view", "View activities"),
    ("activities.create", "Create activities"),
    ("activities.update", "Update activities"),
    ("activities.delete", "Delete activities"),

    # Reports
    ("reports.view", "View reports"),
    ("reports.export", "Export reports"),

    # Users
    ("users.view", "View users"),
    ("users.create", "Create users"),
    ("users.update", "Update users"),
    ("users.delete", "Delete users"),

    # Roles
    ("roles.view", "View roles"),
    ("roles.create", "Create roles"),
    ("roles.update", "Update roles"),
    ("roles.delete", "Delete roles"),

    # Permissions
    ("permissions.view", "View permissions"),
    ("permissions.update", "Update permissions"),

    # Backward-compatibility singular aliases
    ("lead.view", "View leads"),
    ("lead.create", "Create leads"),
    ("lead.update", "Update leads"),
    ("lead.delete", "Delete leads"),
    ("contact.view", "View contacts"),
    ("contact.create", "Create contacts"),
    ("contact.update", "Update contacts"),
    ("contact.delete", "Delete contacts"),
    ("deal.view", "View deals"),
    ("deal.create", "Create deals"),
    ("deal.update", "Update deals"),
    ("deal.delete", "Delete deals"),
    ("task.view", "View tasks"),
    ("task.create", "Create tasks"),
    ("task.update", "Update tasks"),
    ("task.delete", "Delete tasks"),
]


db = SessionLocal()

for name, description in permissions:
    existing_permission = db.query(Permission).filter(
        Permission.name == name
    ).first()

    if not existing_permission:
        permission = Permission(
            name=name,
            description=description
        )

        db.add(permission)

db.commit()
db.close()

print("Permissions seeded successfully")