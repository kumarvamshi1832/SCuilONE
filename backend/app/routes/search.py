
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.models.permission import Permission
from app.models.user_role import UserRole
from app.models.role_permission import RolePermission
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.deal import Deal


router = APIRouter(
    prefix="/api/v1/search",
    tags=["Global Search"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def user_has_permission(db: Session, user_id: UUID, permission_name: str) -> bool:
    return (
        db.query(UserRole)
        .join(
            RolePermission,
            RolePermission.role_id == UserRole.role_id
        )
        .join(
            Permission,
            Permission.id == RolePermission.permission_id
        )
        .filter(
            UserRole.user_id == user_id,
            Permission.name == permission_name
        )
        .first()
        is not None
    )


@router.get("/")
def global_search(
    q: str = Query(..., min_length=2, max_length=150),
    limit: int = Query(10, ge=1, le=25),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])
    term = q.strip()

    if len(term) < 2:
        raise HTTPException(
            status_code=422,
            detail="Search query must contain at least 2 characters"
        )

    pattern = f"%{term}%"
    results = []

    modules = [
        ("leads", "lead.view", Lead, Lead.full_name),
        ("contacts", "contact.view", Contact, Contact.full_name),
        ("accounts", "account.view", Account, Account.name),
        ("deals", "deal.view", Deal, Deal.name),
    ]

    for module_name, permission_name, model, name_column in modules:
        if not user_has_permission(db, user_id, permission_name):
            continue

        filters = [
            model.tenant_id == tenant_id,
            name_column.ilike(pattern)
        ]

        if module_name in {"leads", "contacts", "accounts"}:
            filters = [
                model.tenant_id == tenant_id,
                (
                    name_column.ilike(pattern)
                    | model.email.ilike(pattern)
                    | model.phone.ilike(pattern)
                )
            ]

        records = (
            db.query(model)
            .filter(*filters)
            .order_by(name_column.asc())
            .limit(limit)
            .all()
        )

        for record in records:
            results.append({
                "id": str(record.id),
                "module": module_name,
                "name": getattr(record, "full_name", None)
                or getattr(record, "name", ""),
                "email": getattr(record, "email", None),
                "phone": getattr(record, "phone", None),
            })

    results.sort(key=lambda item: item["name"].lower())

    return {
        "query": term,
        "count": len(results),
        "results": results[:limit]
    }
