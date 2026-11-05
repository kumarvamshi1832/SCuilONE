from app.database.connection import SessionLocal
from app.models.role import Role


roles = [
    # 11 Central Platform Roles
    "Platform Super Admin",
    "Platform Admin",
    "Platform Manager",
    "Platform Support",
    "Sales",
    "Billing",
    "Technical",
    "Audit",
    "Finance",
    "Security Administrator",
    "Analyst",
    # 7 Reusable Industry Team Roles (reused across all 10 industries)
    "Team Admin",
    "Team Manager",
    "Industry Support",
    "Team Auditor",
    "Team Finance",
    "Team Analyst",
    "Industry Sales",
    # Customer Tenant CRM Roles
    "Tenant Owner",
    "Tenant Admin",
    "Manager",
    "Sales User",
    "Operations User",
    "Support User",
    "Read-only / Auditor",
]


if __name__ == "__main__":
    db = SessionLocal()
    for role_name in roles:
        existing_role = db.query(Role).filter(Role.name == role_name).first()
        if not existing_role:
            db.add(Role(name=role_name))
    db.commit()
    db.close()
    print("Roles created successfully")