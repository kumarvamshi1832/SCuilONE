from app.database.connection import SessionLocal
from app.models.role import Role
from app.models.permission import Permission
from app.models.role_permission import RolePermission


role_permissions = {
    "Tenant Owner": [
        "lead.view", "lead.create", "lead.update", "lead.delete","lead.assignment.override",
        "contact.view", "contact.create", "contact.update", "contact.delete",
        "account.view", "account.create", "account.update", "account.delete",
        "deal.view", "deal.create", "deal.update", "deal.delete",
        "task.view", "task.create", "task.update", "task.delete",
        "activity.view", "activity.create", "activity.update", "activity.delete",
        "pipeline.view", "pipeline.create", "pipeline.update", "pipeline.delete",
        "user.view", "user.create", "user.update", "user.delete",
        "workflow.view","workflow.create","workflow.update","workflow.delete","workflow.activate",
        "workflow.execution.view",
        "document.view","document.create","document.delete",
        "audit.view",
        "property.view","property.create","property.update","property.delete",
        "project.view","project.create","project.update","project.delete",
        "building.view","building.create","building.update","building.delete",
        "buyer_requirement.create","buyer_requirement.view","buyer_requirement.update","buyer_requirement.delete",
        "property_match.view","property_match.create","property_match.update","property_match.delete",
        "site_visit.view", "site_visit.create", "site_visit.update", "site_visit.delete",

        "booking.view", "booking.create", "booking.update", "booking.cancel",
        "booking.payment.view", "booking.payment.create", "booking.payment.verify",
        "booking.payment_plan.view", "booking.payment_plan.create",
        "booking.refund.manage", "booking.sale.complete",




    ],

    "Tenant Admin": [
        "lead.view", "lead.create", "lead.update", "lead.delete","lead.assignment.override",
        "contact.view", "contact.create", "contact.update", "contact.delete",
        "account.view", "account.create", "account.update", "account.delete",
        "deal.view", "deal.create", "deal.update", "deal.delete",
        "task.view", "task.create", "task.update", "task.delete",
        "activity.view", "activity.create", "activity.update", "activity.delete",
        "pipeline.view", "pipeline.create", "pipeline.update", "pipeline.delete",
        "user.view", "user.create", "user.update", "user.delete",
        "workflow.view","workflow.create","workflow.update","workflow.delete","workflow.activate",
        "workflow.execution.view",
        "document.view","document.create","document.delete",
        "audit.view",
        "property.view","property.create","property.update","property.delete",
        "project.view","project.create","project.update","project.delete",
        "building.view","building.create","building.update","building.delete",
        "buyer_requirement.create","buyer_requirement.view","buyer_requirement.update","buyer_requirement.delete",
        "property_match.view","property_match.create","property_match.update","property_match.delete",
        "site_visit.view", "site_visit.create", "site_visit.update", "site_visit.delete",

        "booking.view", "booking.create", "booking.update", "booking.cancel",
        "booking.payment.view", "booking.payment.create", "booking.payment.verify",
        "booking.payment_plan.view", "booking.payment_plan.create",
        "booking.refund.manage", "booking.sale.complete",


    ],

    "Manager": [
        "lead.view", "lead.create", "lead.update", "lead.delete","lead.assignment.override",
        "contact.view", "contact.create", "contact.update", "contact.delete",
        "account.view", "account.create", "account.update", "account.delete",
        "deal.view", "deal.create", "deal.update", "deal.delete",
        "task.view", "task.create", "task.update", "task.delete",
        "activity.view", "activity.create", "activity.update", "activity.delete",
        "pipeline.view", "pipeline.create", "pipeline.update", "pipeline.delete",
        "user.view",
        "workflow.view","workflow.create","workflow.update","workflow.delete","workflow.activate",
        "workflow.execution.view",
        "document.view","document.create","document.delete",
        "audit.view",
        "property.view","property.create","property.update","property.delete",
        "project.view","project.create","project.update","project.delete",
        "building.view","building.create","building.update","building.delete",
        "buyer_requirement.create","buyer_requirement.view","buyer_requirement.update","buyer_requirement.delete",
        "property_match.view","property_match.create","property_match.update","property_match.delete",
        "site_visit.view", "site_visit.create", "site_visit.update", "site_visit.delete",

        "booking.view", "booking.create", "booking.update", "booking.cancel",
        "booking.payment.view", "booking.payment.create", "booking.payment.verify",
        "booking.payment_plan.view", "booking.payment_plan.create",
        "booking.refund.manage", "booking.sale.complete",



    ],

    "Sales User": [
        "lead.view", "lead.create", "lead.update",
        "contact.view", "contact.create", "contact.update",
        "account.view", "account.create", "account.update",
        "deal.view", "deal.create", "deal.update",
        "task.view", "task.create", "task.update",
        "activity.view", "activity.create", "activity.update",
        "pipeline.view",
        "user.view",
        "document.view","document.create",
        "property.view","property.create","property.update",
        "project.view","project.create","project.update",
        "building.view","building.create","building.update",
        "buyer_requirement.create","buyer_requirement.view","buyer_requirement.update",
        "property_match.view","property_match.create","property_match.update",
        "site_visit.view", "site_visit.create", "site_visit.update",

        "booking.view", "booking.create", "booking.update",
        "booking.payment.view", "booking.payment.create", "booking.payment_plan.view", "booking.payment_plan.create",



    ],

    "Operations User": [
        "lead.view",
        "contact.view", "contact.create", "contact.update",
        "account.view", "account.create", "account.update",
        "deal.view",
        "task.view", "task.create", "task.update", "task.delete",
        "activity.view", "activity.create", "activity.update", "activity.delete",
        "pipeline.view",
        "user.view",
        "document.view","document.create",
        "property.view","property.create","property.update",
        "project.view","project.create","project.update",
        "building.view","building.create","building.update",
        "buyer_requirement.view",
        "property_match.view","property_match.create",
        "site_visit.view", "site_visit.create",

        "booking.view", "booking.update", "booking.cancel",
        "booking.payment.view", "booking.payment.verify",
        "booking.payment_plan.view", "booking.payment_plan.create",
        "booking.refund.manage", "booking.sale.complete",


    ],

    "Support User": [
        "lead.view",
        "contact.view", "contact.create", "contact.update",
        "account.view", "account.create", "account.update",
        "deal.view",
        "task.view", "task.create", "task.update",
        "activity.view", "activity.create", "activity.update",
        "pipeline.view",
        "user.view",
        "document.view","document.create",
        "property.view",
        "project.view",
        "building.view",
        "buyer_requirement.view",
        "property_match.view",
        "site_visit.view",
        "booking.view", "booking.payment.view", "booking.payment_plan.view",
    ],

    "Read-only / Auditor": [
        "lead.view",
        "contact.view",
        "account.view",
        "deal.view",
        "task.view",
        "activity.view",
        "pipeline.view",
        "user.view",
        "document.view",
        "audit.view",
        "property.view",
        "project.view",
        "building.view",
        "buyer_requirement.view",
        "property_match.view",
        "site_visit.view",
        "booking.view", "booking.payment.view", "booking.payment_plan.view",
    ],
}


db = SessionLocal()

try:
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
    print("Role permissions seeded successfully")

except Exception:
    db.rollback()
    raise

finally:
    db.close()
