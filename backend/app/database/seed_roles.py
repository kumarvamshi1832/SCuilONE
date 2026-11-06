from app.database.connection import SessionLocal
from app.models.role import Role


roles = [
    "Platform Super Admin",
    "Platform Support",
    "Tenant Owner",
    "Tenant Admin",
    "Manager",
    "Sales User",
    "Operations User",
    "Support User",
    "Read-only / Auditor"
]


db = SessionLocal()

for role_name in roles:
    existing_role = db.query(Role).filter(
        Role.name == role_name
    ).first()

    if not existing_role:
        db.add(Role(name=role_name))

db.commit()
db.close()

print("Roles created successfully")