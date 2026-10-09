from app.database.connection import SessionLocal
from app.models.permission import Permission


permissions = [
    ("lead.view", "View leads"),
    ("lead.create", "Create leads"),
    ("lead.update", "Update leads"),
    ("lead.delete", "Delete leads"),

    ("contact.view", "View contacts"),
    ("contact.create", "Create contacts"),
    ("contact.update", "Update contacts"),
    ("contact.delete", "Delete contacts"),

    ("account.view", "View accounts"),
    ("account.create", "Create accounts"),
    ("account.update", "Update accounts"),
    ("account.delete", "Delete accounts"),

    ("deal.view", "View deals"),
    ("deal.create", "Create deals"),
    ("deal.update", "Update deals"),
    ("deal.delete", "Delete deals"),

    ("activity.view", "View activities"),
    ("activity.create", "Create activities"), 
    ("activity.update", "Update activities"), 
    ("activity.delete", "Delete activities"),

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