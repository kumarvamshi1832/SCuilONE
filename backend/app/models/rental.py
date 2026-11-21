"""Rental and lease lifecycle records. Financial events are append-only ledger rows."""
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer,
    JSON, Numeric, String, Text, UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class RentalBookingRequest(Base):
    """Unified Rent and Lease booking request supporting both Portal and Walk-in channels with temporary holds."""
    __tablename__ = "rental_booking_requests"
    __table_args__ = (
        Index("ix_rental_booking_requests_tenant_status", "tenant_id", "status"),
        Index("ix_rental_booking_requests_tenant_property", "tenant_id", "property_id"),
        Index("ix_rental_booking_requests_hold_expiry", "tenant_id", "status", "hold_expires_at"),
        Index(
            "uq_rental_booking_requests_active_property",
            "tenant_id",
            "property_id",
            unique=True,
            postgresql_where=text("status IN ('Requested', 'Approved', 'Agreement Created')"),
        ),
        CheckConstraint("booking_type IN ('Rent', 'Lease')", name="ck_rental_booking_req_type"),
        CheckConstraint("channel IN ('Portal', 'Walk-in')", name="ck_rental_booking_req_channel"),
        CheckConstraint(
            "status IN ('Requested', 'Approved', 'Agreement Created', 'Activated', 'Rejected', 'Cancelled', 'Expired', 'Expired - Payment Review')",
            name="ck_rental_booking_req_status",
        ),
        CheckConstraint("proposed_rent_amount > 0", name="ck_rental_booking_req_rent_positive"),
        CheckConstraint("approved_rent_amount IS NULL OR approved_rent_amount > 0", name="ck_rental_booking_req_approved_rent_positive"),
        CheckConstraint("proposed_deposit_amount >= 0", name="ck_rental_booking_req_deposit_nonnegative"),
        CheckConstraint("approved_deposit_amount IS NULL OR approved_deposit_amount >= 0", name="ck_rental_booking_req_approved_deposit_nonnegative"),
        CheckConstraint("maintenance_amount >= 0", name="ck_rental_booking_req_maint_nonnegative"),
        CheckConstraint("lock_in_months >= 0 AND notice_period_days >= 0", name="ck_rental_booking_req_terms_nonnegative"),
        CheckConstraint("due_day >= 1 AND due_day <= 28", name="ck_rental_booking_req_due_day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False)
    booking_type: Mapped[str] = mapped_column(String(20), nullable=False)  # 'Rent' | 'Lease'
    channel: Mapped[str] = mapped_column(String(20), nullable=False, default="Portal")  # 'Portal' | 'Walk-in'

    portal_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_portal_users.id", ondelete="SET NULL"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True)
    buyer_requirement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("buyer_requirements.id", ondelete="SET NULL"), nullable=True)
    property_match_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("property_matches.id", ondelete="SET NULL"), nullable=True)
    accepted_offer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("property_offers.id", ondelete="SET NULL"), nullable=True)
    rental_agreement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="SET NULL"), nullable=True)

    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)

    proposed_rent_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    approved_rent_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    rent_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="Monthly")
    proposed_deposit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    approved_deposit_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    maintenance_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    maintenance_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="Monthly")

    desired_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    desired_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    duration_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lock_in_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notice_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    due_day: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    late_fee_type: Mapped[str] = mapped_column(String(12), nullable=False, default="Fixed", server_default="Fixed")
    late_fee_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0")
    late_fee_grace_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Requested")
    hold_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    terms_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    staff_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentalAgreement(Base):
    __tablename__ = "rental_agreements"
    __table_args__ = (
        Index("ix_rental_agreements_tenant_status", "tenant_id", "status"),
        Index("ix_rental_agreements_tenant_property", "tenant_id", "property_id"),
        Index("uq_rental_agreements_one_draft_property", "tenant_id", "property_id", unique=True, postgresql_where=text("status = 'Draft'")),
        Index("ix_rental_agreements_tenant_customer", "tenant_id", "contact_id"),
        Index(
            "uq_rental_agreements_one_active_property",
            "tenant_id", "property_id", unique=True,
            postgresql_where=text("status IN ('Active', 'Termination Requested')"),
        ),
        CheckConstraint("agreement_type IN ('Rent', 'Lease')", name="ck_rental_agreement_type"),
        CheckConstraint("status IN ('Draft', 'Pending Signature', 'Active', 'Termination Requested', 'Expired', 'Terminated', 'Completed', 'Cancelled')", name="ck_rental_agreement_status"),
        CheckConstraint("rent_amount > 0", name="ck_rental_agreement_rent_positive"),
        CheckConstraint("deposit_amount >= 0", name="ck_rental_agreement_deposit_nonnegative"),
        CheckConstraint("lock_in_months >= 0 AND notice_period_days >= 0", name="ck_rental_agreement_terms_nonnegative"),
        CheckConstraint("due_day >= 1 AND due_day <= 28", name="ck_rental_agreement_due_day"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False)
    lead_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="SET NULL"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    buyer_requirement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("buyer_requirements.id", ondelete="SET NULL"), nullable=True)
    property_match_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("property_matches.id", ondelete="SET NULL"), nullable=True)
    accepted_offer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("property_offers.id", ondelete="SET NULL"), nullable=True)
    agreement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Draft")
    customer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    rent_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    rent_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="Monthly")
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    maintenance_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    maintenance_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="Monthly")
    agreement_start: Mapped[date] = mapped_column(Date, nullable=False)
    agreement_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    lock_in_months: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notice_period_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    due_day: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    late_fee_type: Mapped[str] = mapped_column(String(12), nullable=False, default="Fixed", server_default="Fixed")
    late_fee_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0")
    late_fee_grace_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    escalation_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    escalation_interval_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalation_base_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    agreement_document_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    customer_signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    customer_signature_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    customer_signature_method: Mapped[str | None] = mapped_column(String(60), nullable=True)
    customer_signature_document_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_signature_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    customer_signature_user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentalPaymentSchedule(Base):
    __tablename__ = "rental_payment_schedules"
    __table_args__ = (
        UniqueConstraint("tenant_id", "agreement_id", "sequence", name="uq_rental_schedule_sequence"),
        Index("ix_rental_schedule_tenant_due", "tenant_id", "due_date", "status"),
        CheckConstraint("amount > 0", name="ck_rental_schedule_amount_positive"),
        CheckConstraint("status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled')", name="ck_rental_schedule_status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    charge_type: Mapped[str] = mapped_column(String(30), nullable=False, default="Rent")
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    late_fee_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0")
    late_fee_applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentalPayment(Base):
    __tablename__ = "rental_payments"
    __table_args__ = (
        Index("ix_rental_payments_tenant_agreement", "tenant_id", "agreement_id"),
        Index("ix_rental_payments_tenant_status", "tenant_id", "status"),
        UniqueConstraint("tenant_id", "receipt_number", name="uq_rental_payment_receipt_number"),
        CheckConstraint("amount > 0", name="ck_rental_payment_amount_positive"),
        CheckConstraint("payment_type IN ('Rent', 'Deposit', 'Maintenance', 'Other')", name="ck_rental_payment_type"),
        CheckConstraint("status IN ('Pending', 'Under Verification', 'Verified', 'Rejected', 'Failed')", name="ck_rental_payment_status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False)
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_payment_schedules.id", ondelete="SET NULL"), nullable=True)
    settlement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_settlements.id", ondelete="SET NULL"), nullable=True)
    payment_type: Mapped[str] = mapped_column(String(30), nullable=False, default="Rent")
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(30), nullable=False)
    transaction_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    proof_document_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    receipt_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Pending")
    verified_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentalDepositTransaction(Base):
    __tablename__ = "rental_deposit_transactions"
    __table_args__ = (
        Index("ix_rental_deposit_tenant_agreement", "tenant_id", "agreement_id", "created_at"),
        CheckConstraint("amount > 0", name="ck_rental_deposit_amount_positive"),
        CheckConstraint("direction IN ('Credit', 'Debit')", name="ck_rental_deposit_direction"),
        CheckConstraint("status IN ('Pending', 'Posted', 'Reversed')", name="ck_rental_deposit_status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_payments.id", ondelete="SET NULL"), nullable=True)
    settlement_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_settlements.id", ondelete="SET NULL"), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    transaction_type: Mapped[str] = mapped_column(String(40), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Posted")
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class RentalExitRequest(Base):
    __tablename__ = "rental_exit_requests"
    __table_args__ = (
        Index("ix_rental_exit_tenant_status", "tenant_id", "status"),
        Index(
            "uq_rental_exit_one_open_request", "tenant_id", "agreement_id", unique=True,
            postgresql_where=text("status IN ('Requested', 'Under Review', 'Approved', 'Inspection Pending', 'Settlement Pending')"),
        ),
        CheckConstraint("status IN ('Requested', 'Under Review', 'Approved', 'Rejected', 'Withdrawn', 'Inspection Pending', 'Settlement Pending', 'Closed')", name="ck_rental_exit_status"),
        CheckConstraint("early_exit_charge >= 0 AND notice_shortfall_charge >= 0", name="ck_rental_exit_charge_nonnegative"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False)
    requested_vacate_date: Mapped[date] = mapped_column(Date, nullable=False)
    notice_served_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Requested")
    early_exit_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    early_exit_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    notice_period_waived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notice_shortfall_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    decision_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    active_request_key: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentalInspection(Base):
    __tablename__ = "rental_inspections"
    __table_args__ = (
        Index("ix_rental_inspections_tenant_agreement", "tenant_id", "agreement_id", "inspection_type"),
        CheckConstraint("inspection_type IN ('Move In', 'Move Out', 'Periodic')", name="ck_rental_inspection_type"),
        CheckConstraint("damage_amount >= 0", name="ck_rental_inspection_damage_nonnegative"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False)
    exit_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_exit_requests.id", ondelete="SET NULL"), nullable=True)
    inspection_type: Mapped[str] = mapped_column(String(20), nullable=False)
    condition: Mapped[str] = mapped_column(String(30), nullable=False)
    damage_details: Mapped[str | None] = mapped_column(Text, nullable=True)
    damage_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    photographs: Mapped[list | None] = mapped_column(JSON, nullable=True)
    meter_readings: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    inspected_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    inspected_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    tenant_acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tenant_acknowledgement_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    tenant_acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class RentalSettlement(Base):
    __tablename__ = "rental_settlements"
    __table_args__ = (
        UniqueConstraint("tenant_id", "agreement_id", name="uq_rental_settlement_agreement"),
        CheckConstraint("deposit_balance >= 0 AND rent_arrears >= 0 AND utility_charges >= 0 AND damage_charges >= 0 AND early_exit_charge >= 0 AND notice_shortfall_charge >= 0 AND other_charges >= 0", name="ck_rental_settlement_nonnegative"),
        CheckConstraint("refund_amount >= 0 AND amount_due_from_tenant >= 0", name="ck_rental_settlement_result_nonnegative"),
        CheckConstraint("status IN ('Draft', 'Under Review', 'Approved', 'Partially Refunded', 'Refunded', 'Amount Due', 'Partially Collected', 'Collected', 'Cancelled')", name="ck_rental_settlement_status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False)
    exit_request_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_exit_requests.id", ondelete="SET NULL"), nullable=True)
    deposit_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    rent_arrears: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    utility_charges: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    damage_charges: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    early_exit_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    notice_shortfall_charge: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    other_charges: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    deductions_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    refund_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    amount_due_from_tenant: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Draft")
    calculation_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    refund_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class RentalAgreementRevision(Base):
    __tablename__ = "rental_agreement_revisions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "agreement_id", "revision_number", name="uq_rental_agreement_revision_number"),
        Index("ix_rental_agreement_revisions_tenant_agreement", "tenant_id", "agreement_id"),
        CheckConstraint("status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')", name="ck_rental_revision_status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    revision_type: Mapped[str] = mapped_column(String(30), nullable=False, default="Renewal")
    old_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    new_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    old_rent_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    new_rent_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")
    requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
