from app.database.connection import SessionLocal
from app.models.permission import Permission


permissions = [
    ("lead.view", "View leads"),
    ("lead.create", "Create leads"),
    ("lead.update", "Update leads"),
    ("lead.delete", "Delete leads"),
    ("lead.assignment.override", "Override salesperson lead capacity"),

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

    ("pipeline.view", "View pipelines"),
    ("pipeline.create", "Create pipelines"),
    ("pipeline.update", "Update pipelines"),
    ("pipeline.delete", "Delete pipelines"),

    ("user.view", "View users"),
    ("user.create", "Create users"),
    ("user.update", "Update users"),
    ("user.delete", "Deactivate users"),

    ("workflow.view", "View workflows"),
    ("workflow.create", "Create workflows"),
    ("workflow.update", "Update workflows"),
    ("workflow.delete", "Delete workflows"),
    ("workflow.activate", "Activate and deactivate workflows"),
    ("workflow.execution.view", "View workflow execution history"),
]


db = SessionLocal()

try:
    for name, description in permissions:
        existing_permission = db.query(Permission).filter(
            Permission.name == name
        ).first()

        if not existing_permission:
            db.add(
                Permission(
                    name=name,
                    description=description
                )
            )

    db.commit()
    print("Permissions seeded successfully")

except Exception:
    db.rollback()
    raise

finally:
    db.close()
