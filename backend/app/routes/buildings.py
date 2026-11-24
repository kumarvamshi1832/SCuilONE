import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.industry_modules import require_enabled_module
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.building import Building
from app.models.property import Property
from app.models.project import Project
from app.schemas.building import (
    BuildingCreate,
    BuildingResponse,
    BuildingUpdate,
)
from app.services.audit_service import log_audit


router = APIRouter(
    prefix="/api/v1/buildings",
    tags=["Buildings"],
    dependencies=[
        Depends(require_enabled_module("buildings")),
    ],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        tenant_id = UUID(str(current_user["tenant_id"]))
        user_id = UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user or tenant context.",
        )

    return tenant_id, user_id


def building_snapshot(building: Building) -> dict:
    return {
        "project_id": str(building.project_id),
        "name": building.name,
        "building_code": building.building_code,
        "building_type": building.building_type,
        "description": building.description,
        "total_floors": building.total_floors,
        "total_units": building.total_units,
        "construction_status": building.construction_status,
        "start_date": (
            building.start_date.isoformat() if building.start_date else None
        ),
        "expected_completion_date": (
            building.expected_completion_date.isoformat()
            if building.expected_completion_date
            else None
        ),
        "status": building.status,
    }


def get_project_or_404(
    db: Session,
    project_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> Project:
    project = (
        db.query(Project)
        .filter(
            Project.id == project_id,
            Project.tenant_id == tenant_id,
        )
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project


def get_building_or_404(
    db: Session,
    building_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> Building:
    building = (
        db.query(Building)
        .filter(
            Building.id == building_id,
            Building.tenant_id == tenant_id,
        )
        .first()
    )

    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Building not found",
        )

    return building


@router.post(
    "/",
    response_model=BuildingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_building(
    payload: BuildingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    get_project_or_404(db, payload.project_id, tenant_id)

    building = Building(
        tenant_id=tenant_id,
        created_by=user_id,
        **payload.model_dump(),
    )

    try:
        db.add(building)
        db.flush()

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="buildings",
            record_id=str(building.id),
            description=f"Created building: {building.name}",
            after_data=building_snapshot(building),
        )

        db.commit()
        db.refresh(building)
        return building

    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[BuildingResponse])
def list_buildings(
    project_id: uuid.UUID | None = None,
    city: str | None = None,
    building_type: str | None = None,
    construction_status: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.view")),
):
    tenant_id, _user_id = get_tenant_and_user(current_user)

    query = (
        db.query(Building)
        .join(Project, Building.project_id == Project.id)
        .filter(
            Building.tenant_id == tenant_id,
            Project.tenant_id == tenant_id,
        )
    )

    if project_id:
        query = query.filter(Building.project_id == project_id)

    if city:
        query = query.filter(Project.city.ilike(f"%{city.strip()}%"))

    if building_type:
        query = query.filter(Building.building_type == building_type)

    if construction_status:
        query = query.filter(
            Building.construction_status == construction_status
        )

    if status_filter:
        query = query.filter(Building.status == status_filter)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Building.name.ilike(term),
                Building.building_code.ilike(term),
                Project.name.ilike(term),
            )
        )

    return (
        query.order_by(Building.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{building_id}", response_model=BuildingResponse)
def get_building(
    building_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.view")),
):
    tenant_id, _user_id = get_tenant_and_user(current_user)

    building = get_building_or_404(db, building_id, tenant_id)
    get_project_or_404(db, building.project_id, tenant_id)

    return building


@router.patch("/{building_id}", response_model=BuildingResponse)
def update_building(
    building_id: uuid.UUID,
    payload: BuildingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.update")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    building = get_building_or_404(db, building_id, tenant_id)
    before_data = building_snapshot(building)
    changes = payload.model_dump(exclude_unset=True)

    if "project_id" in changes:
        if changes["project_id"] is None:
            raise HTTPException(
                status_code=422,
                detail="project_id cannot be null",
            )

        get_project_or_404(db, changes["project_id"], tenant_id)

    for field, value in changes.items():
        setattr(building, field, value)

    # Validate date consistency against the complete updated record.
    start_date = building.start_date
    completion_date = building.expected_completion_date

    if start_date and completion_date and completion_date < start_date:
        raise HTTPException(
            status_code=422,
            detail="Expected completion date cannot be before the start date",
        )

    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="update",
            module="buildings",
            record_id=str(building.id),
            description=f"Updated building: {building.name}",
            before_data=before_data,
            after_data=building_snapshot(building),
        )

        db.commit()
        db.refresh(building)
        return building

    except Exception:
        db.rollback()
        raise


@router.delete("/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(
    building_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.delete")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    building = get_building_or_404(db, building_id, tenant_id)
    before_data = building_snapshot(building)

    property_count = db.query(Property).filter(
        Property.tenant_id == tenant_id,
        Property.building_id == building.id,
    ).count()

    if property_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This building has {property_count} propert"
                f"{'y' if property_count == 1 else 'ies'} and cannot be "
                "deleted. Delete or move its properties first."
            ),
        )

    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="delete",
            module="buildings",
            record_id=str(building.id),
            description=f"Deleted building: {building.name}",
            before_data=before_data,
        )

        db.delete(building)
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This record is still referenced by other records "
                "and cannot be deleted."
            ),
        )
    except Exception:
        db.rollback()
        raise

from decimal import Decimal
from pydantic import BaseModel, Field, model_validator


class BuildingGenerateUnitsIn(BaseModel):
    start_floor: int = Field(default=1, ge=1, le=200)
    end_floor: int | None = Field(default=None, ge=1, le=200)
    units_per_floor: int = Field(default=2, ge=1, le=50)
    prefix: str | None = Field(default=None, max_length=20)
    property_type: str = Field(default="Apartment", max_length=50)
    listing_type: str = Field(default="Sale", max_length=20)

    @model_validator(mode="after")
    def check_floors(self):
        if self.end_floor is not None and self.end_floor < self.start_floor:
            raise ValueError("end_floor cannot be less than start_floor.")
        return self


class BuildingReleaseForSaleIn(BaseModel):
    mark_building_completed: bool = False


def _compute_building_summary(db: Session, tenant_id: UUID, building: Building) -> dict:
    from app.models.booking import Booking
    from app.models.payment import Payment
    from app.models.payment_refund import PaymentRefund
    from app.models.rental import RentalAgreement, RentalPayment

    props = (
        db.query(Property)
        .filter(Property.tenant_id == tenant_id, Property.building_id == building.id)
        .all()
    )
    prop_ids = [p.id for p in props]

    counts = {
        "available": 0,
        "reserved": 0,
        "booked": 0,
        "sold": 0,
        "rented_or_leased": 0,
        "inactive": 0,
    }
    for p in props:
        st = (p.status or "").strip()
        if st == "Available":
            counts["available"] += 1
        elif st == "Reserved":
            counts["reserved"] += 1
        elif st == "Booked":
            counts["booked"] += 1
        elif st == "Sold":
            counts["sold"] += 1
        elif st in ("Rented", "Leased"):
            counts["rented_or_leased"] += 1
        else:
            counts["inactive"] += 1

    agreed_total = Decimal("0.00")
    sale_collected = Decimal("0.00")
    rental_collected = Decimal("0.00")

    if prop_ids:
        bookings = (
            db.query(Booking)
            .filter(
                Booking.tenant_id == tenant_id,
                Booking.property_id.in_(prop_ids),
                Booking.status.in_(("Confirmed", "Completed")),
            )
            .all()
        )
        agreed_total = sum(
            (Decimal(str(b.agreed_price or b.booking_amount or 0)) for b in bookings),
            Decimal("0.00"),
        )
        booking_ids = [b.id for b in bookings]
        if booking_ids:
            verified_payments = (
                db.query(Payment)
                .filter(
                    Payment.tenant_id == tenant_id,
                    Payment.booking_id.in_(booking_ids),
                    Payment.status == "Verified",
                )
                .all()
            )
            gross_sale = sum((Decimal(str(p.amount or 0)) for p in verified_payments), Decimal("0.00"))
            pay_ids = [p.id for p in verified_payments]
            refunds = (
                db.query(PaymentRefund)
                .filter(
                    PaymentRefund.tenant_id == tenant_id,
                    PaymentRefund.payment_id.in_(pay_ids),
                    PaymentRefund.status == "Processed",
                )
                .all()
                if pay_ids
                else []
            )
            refund_total = sum((Decimal(str(r.amount or 0)) for r in refunds), Decimal("0.00"))
            sale_collected = max(Decimal("0.00"), gross_sale - refund_total)

        agreements = (
            db.query(RentalAgreement.id)
            .filter(RentalAgreement.tenant_id == tenant_id, RentalAgreement.property_id.in_(prop_ids))
            .all()
        )
        ag_ids = [a[0] for a in agreements]
        if ag_ids:
            r_payments = (
                db.query(RentalPayment)
                .filter(
                    RentalPayment.tenant_id == tenant_id,
                    RentalPayment.agreement_id.in_(ag_ids),
                    RentalPayment.status == "Verified",
                )
                .all()
            )
            rental_collected = sum((Decimal(str(rp.amount or 0)) for rp in r_payments), Decimal("0.00"))

    total_earned = sale_collected + rental_collected
    return {
        "building_id": str(building.id),
        "project_id": str(building.project_id),
        "building_name": building.name,
        "building_code": building.building_code,
        "construction_status": building.construction_status,
        "total_floors": building.total_floors,
        "total_units": len(props),
        **counts,
        "total_agreed_value": f"{agreed_total:.2f}",
        "verified_sale_collected": f"{sale_collected:.2f}",
        "verified_rental_collected": f"{rental_collected:.2f}",
        "total_earned": f"{total_earned:.2f}",
    }


@router.post(
    "/{building_id}/generate-units",
    status_code=status.HTTP_201_CREATED,
)
def generate_building_units(
    building_id: UUID,
    payload: BuildingGenerateUnitsIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("building.update")),
):
    """Bulk-create shell Property rows (e.g. A-101, A-102, A-201...) in Inactive status
    so staff can enter room details and pricing manually before releasing the building for sale.
    """
    tenant_id, user_id = get_tenant_and_user(current_user)
    building = get_building_or_404(db, building_id, tenant_id)
    project = get_project_or_404(db, building.project_id, tenant_id)

    end_floor = payload.end_floor if payload.end_floor is not None else max(1, building.total_floors)
    if end_floor < payload.start_floor:
        raise HTTPException(status_code=400, detail="end_floor cannot be less than start_floor.")

    raw_prefix = payload.prefix if payload.prefix is not None else (f"{building.building_code}-" if building.building_code else "")
    prefix = raw_prefix.strip()

    existing_units = {
        row[0]
        for row in db.query(Property.unit_number)
        .filter(Property.tenant_id == tenant_id, Property.building_id == building.id, Property.unit_number.isnot(None))
        .all()
    }

    created = []
    skipped = 0
    for floor in range(payload.start_floor, end_floor + 1):
        for pos in range(1, payload.units_per_floor + 1):
            unit_no = f"{prefix}{floor}{pos:02d}"
            if unit_no in existing_units:
                skipped += 1
                continue
            prop = Property(
                tenant_id=tenant_id,
                created_by=user_id,
                building_id=building.id,
                unit_number=unit_no,
                name=f"{building.name} - {unit_no}",
                property_type=payload.property_type,
                listing_type=payload.listing_type,
                address=project.address,
                city=project.city,
                state=project.state,
                country=project.country or "India",
                postal_code=project.postal_code,
                price=Decimal("0.00"),
                price_frequency="One-time" if payload.listing_type == "Sale" else "Monthly",
                currency="INR",
                area_unit="sqft",
                furnishing="Unfurnished",
                status="Inactive",
                developer_name=project.developer_name,
            )
            db.add(prop)
            db.flush()
            existing_units.add(unit_no)
            created.append({"id": str(prop.id), "unit_number": prop.unit_number, "name": prop.name, "status": prop.status})

    building.total_units = len(existing_units)
    log_audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CREATE",
        module="buildings",
        record_id=str(building.id),
        description=f"Generated {len(created)} shell units for building {building.name} (skipped {skipped} existing).",
    )
    db.commit()
    return {
        "building_id": str(building.id),
        "building_name": building.name,
        "created_count": len(created),
        "skipped_existing_count": skipped,
        "total_building_units": building.total_units,
        "created_units": created,
    }


@router.post("/{building_id}/release-for-sale")
def release_building_for_sale(
    building_id: UUID,
    payload: BuildingReleaseForSaleIn,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("building.update")),
):
    """Release priced Inactive units in this building as Available for Sale/Rent/Lease,
    even while the parent Project is still Under Construction.
    """
    tenant_id, user_id = get_tenant_and_user(current_user)
    building = get_building_or_404(db, building_id, tenant_id)

    inactive_props = (
        db.query(Property)
        .filter(
            Property.tenant_id == tenant_id,
            Property.building_id == building.id,
            Property.status == "Inactive",
        )
        .with_for_update()
        .all()
    )

    released = []
    skipped_unpriced = []
    for p in inactive_props:
        if Decimal(str(p.price or 0)) > Decimal("0.00"):
            p.status = "Available"
            released.append({"id": str(p.id), "unit_number": p.unit_number, "name": p.name, "price": str(p.price)})
        else:
            skipped_unpriced.append({"id": str(p.id), "unit_number": p.unit_number, "name": p.name})

    if payload.mark_building_completed:
        building.construction_status = "Completed"

    log_audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="UPDATE",
        module="buildings",
        record_id=str(building.id),
        description=f"Released {len(released)} units for sale in building {building.name} ({len(skipped_unpriced)} skipped unpriced).",
    )
    db.commit()
    return {
        "building_id": str(building.id),
        "building_name": building.name,
        "construction_status": building.construction_status,
        "released_count": len(released),
        "skipped_unpriced_count": len(skipped_unpriced),
        "released_units": released,
        "skipped_unpriced_units": skipped_unpriced,
    }


@router.get("/{building_id}/summary")
def get_building_summary(
    building_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("building.view")),
):
    """Live inventory counts (available, reserved, booked, sold, rented/leased, inactive) and verified earnings."""
    tenant_id, _ = get_tenant_and_user(current_user)
    building = get_building_or_404(db, building_id, tenant_id)
    return _compute_building_summary(db, tenant_id, building)
