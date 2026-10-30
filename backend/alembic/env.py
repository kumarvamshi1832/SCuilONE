from logging.config import fileConfig

from sqlalchemy import create_engine

from alembic import context

from app.database.connection import Base, settings
from app.models.tenant import Tenant
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.otp import OTPVerification
from app.models.pending_registration import PendingRegistration
from app.models.password_reset import PasswordResetOTP
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.deal import Deal
from app.models.activity import Activity
from app.models.activity_link import ActivityLink
from app.models.pipeline import Pipeline
from app.models.pipeline import PipelineStage
from app.models.user_invitation import UserInvitation
from app.models.form_template import FormTemplate, FormField, CustomFormSubmission
from app.models.lead_assignment_audit import LeadAssignmentAudit
from app.models.workflow import Workflow, WorkflowExecution
from app.models.notification import Notification
from app.models.refresh_session import RefreshSession
from app.models.user_mfa import UserMFA
from app.models.document import Document
from app.models.audit_log import AuditLog
from app.models.property import Property
from app.models.property_image import PropertyImage
from app.models.project import Project
from app.models.building import Building
from app.models.building_image import BuildingImage
from app.models.buyer_requirement import BuyerRequirement
from app.models.property_match import PropertyMatch
from app.models.site_visit import SiteVisit
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.payment_refund import PaymentRefund
from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
from app.models.software_requirement import SoftwareRequirement
from app.models.software_estimate import SoftwareEstimate
from app.models.software_estimate_item import SoftwareEstimateItem
from app.models.software_contract import SoftwareContract
from app.models.software_contract_milestone import SoftwareContractMilestone

from app.models.software_project import SoftwareProject  
from app.models.software_sprint import SoftwareSprint
from app.models.industry_pack import IndustryPack
from app.models.tenant_industry_config import TenantIndustryConfig
from app.models.software_time_entry import SoftwareTimeEntry
from app.models.software_invoice import SoftwareInvoice, SoftwareInvoiceItem, SoftwareInvoicePayment
from app.models.support_ticket import SupportTicket, SupportTicketComment
from app.models.customer_portal import CustomerPortalUser, CustomerPortalInvitation, CustomerPortalSession

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = settings.DATABASE_URL

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(
        settings.DATABASE_URL
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
