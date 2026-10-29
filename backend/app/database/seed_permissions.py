from app.database.connection import SessionLocal
from app.models.permission import Permission


permissions = [
    ("industry_config.update", "Update this tenant industry configuration"),
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
    ("booking.payment_plan.edit", "Edit booking payment plans"),
    ("booking.payment_plan.cancel", "Cancel booking payment plans"),

    ("booking.refund.manage", "Manage booking refunds"),
    ("booking.sale.complete", "Complete property sales"),

    ("software_requirement.view", "View software requirements"),
    ("software_requirement.create", "Create software requirements"),
    ("software_requirement.update", "Update software requirements"),
    ("software_requirement.delete", "Delete software requirements"),

    ("software_estimate.view", "View software estimates"),
    ("software_estimate.create", "Create software estimates"),
    ("software_estimate.update", "Update software estimates"),
    ("software_estimate.delete", "Delete software estimates"),

    ("software_contract.view", "View software contracts"),
    ("software_contract.create", "Create software contracts"),
    ("software_contract.update", "Update software contracts"),
    ("software_contract.delete", "Delete software contracts"),

    ("software_project.view", "View software projects"),
    ("software_project.create", "Create software projects"),
    ("software_project.update", "Update software projects"),
    ("software_project.delete", "Delete software projects"),

   
    ("software_sprint.view", "View software sprints"),
    ("software_sprint.create", "Create software sprints"),
    ("software_sprint.update", "Update software sprints"),
    ("software_sprint.delete", "Delete software sprints"),
    ("software_sprint.manage_tasks", "Add or remove tasks from software sprints"),
    ("software_sprint.start", "Start software sprints"),
    ("software_sprint.complete", "Complete software sprints"),

    ("software_time.view", "View software time entries and time reports"),
    ("software_time.create", "Create manual time entries and start timers"),
    ("software_time.update", "Update or stop own time entries"),
    ("software_time.delete", "Delete software time entries"),
    ("software_time.approve", "Approve or reject time entries for billing"),

    
    ("software_invoice.view", "View software invoices"),
    ("software_invoice.create", "Create software invoices"),
    ("software_invoice.update", "Update draft software invoices"),
    ("software_invoice.delete", "Delete eligible draft software invoices"),
    ("software_invoice.send", "Mark invoices as sent"),
    ("software_invoice.payment.view", "View invoice payment records"),
    ("software_invoice.payment.create", "Record invoice payments"),
    ("software_invoice.cancel", "Cancel eligible software invoices"),

    



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
