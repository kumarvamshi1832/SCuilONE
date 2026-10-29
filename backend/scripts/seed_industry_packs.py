
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.models.industry_pack import IndustryPack


COMMON_MODULES = [
    "leads",
    "contacts",
    "accounts",
    "deals",
    "activities",
]

SOFTWARE_MODULES = [
    "software_requirements",
    "software_estimates",
    "software_contracts",
    "software_projects",
    "software_sprints",
]

REAL_ESTATE_MODULES = [
    "properties",
    "buildings",
    "real_estate_projects",
    "buyer_requirements",
    "property_matches",
    "site_visits",
    "bookings",
]


INDUSTRY_PACKS = [
    {
        "pack_key": "software",
        "name": "Software CRM",
        "description": (
            "CRM configuration for software and IT consulting "
            "businesses, including requirements, estimates, "
            "contracts, projects, and sprints."
        ),
        "version": "1.0.0",
        "is_active": True,
        "default_config": {
            "enabled_modules": COMMON_MODULES + SOFTWARE_MODULES,
            "dashboard_widgets": [],
            "report_widgets": [],
        },
    },
    {
        "pack_key": "real_estate",
        "name": "Real Estate CRM",
        "description": (
            "CRM configuration for real estate businesses, "
            "including properties, buildings, projects, buyer "
            "requirements, property matches, site visits, and bookings."
        ),
        "version": "1.0.0",
        "is_active": True,
        "default_config": {
            "enabled_modules": COMMON_MODULES + REAL_ESTATE_MODULES,
            "dashboard_widgets": [],
            "report_widgets": [],
        },
    },
]


def seed_industry_packs(db: Session) -> None:
    created_count = 0
    existing_count = 0

    for pack_data in INDUSTRY_PACKS:
        existing = (
            db.query(IndustryPack)
            .filter(
                IndustryPack.pack_key == pack_data["pack_key"]
            )
            .first()
        )

        if existing:
            existing_count += 1
            print(
                f"Already exists: {existing.pack_key}. "
                "Existing configuration preserved."
            )
            continue

        pack = IndustryPack(**pack_data)
        db.add(pack)
        created_count += 1
        print(f"Prepared pack: {pack_data['pack_key']}")

    db.commit()

    print("\nIndustry pack seeding completed.")
    print(f"Created: {created_count}")
    print(f"Already existed: {existing_count}")


def main() -> None:
    db = SessionLocal()

    try:
        seed_industry_packs(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
