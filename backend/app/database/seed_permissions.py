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
    ("lead.assignment.override", "Override salesperson lead capacity"),

    ("contact.view", "View contacts"),
    ("contact.create", "Create contacts"),
    ("contact.update", "Update contacts"),
    ("contact.delete", "Delete contacts"),

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

    ("document.view", "View documents"),
    ("document.create", "Upload documents"),
    ("document.delete", "Delete documents"),

    ("audit.view","View tenant audit logs"),

    ("property.view", "View properties"),
    ("property.create", "Create properties"),
    ("property.update", "Update properties"),
    ("property.delete", "Delete properties"),

    ("project.view", "View projects"),
    ("project.create", "Create projects"),
    ("project.update", "Update projects"),
    ("project.delete", "Delete projects"),

    ("building.view", "View buildings"),
    ("building.create", "Create buildings"),
    ("building.update", "Update buildings"),
    ("building.delete", "Delete buildings"),

    ("buyer_requirement.create", "Create buyer requirements"),
    ("buyer_requirement.view", "View buyer requirements"),
    ("buyer_requirement.update", "Update buyer requirements"),
    ("buyer_requirement.delete", "Delete buyer requirements"),

    ("property_match.view", "View property matches"),
    ("property_match.create", "Create property matches"),
    ("property_match.update", "Update property matches"),
    ("property_match.delete", "Delete property matches"),

    ("site_visit.view", "View site visits"),
    ("site_visit.create", "Create site visits"),
    ("site_visit.update", "Update site visits"),
    ("site_visit.delete", "Delete site visits"),


    ("booking.view", "View bookings"),
    ("booking.create", "Create bookings"),
    ("booking.update", "Update bookings"),
    ("booking.cancel", "Cancel bookings"),
    ("booking.payment.view", "View booking payments"),
    ("booking.payment.create", "Record booking payments"),
    ("booking.payment.verify", "Verify booking payments"),
    ("booking.payment_plan.view", "View booking payment plans and collections"),
    ("booking.payment_plan.create", "Create seller-approved booking payment plans"),
    ("booking.refund.manage", "Manage booking refunds"),
    ("booking.sale.complete", "Complete property sales"),



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
