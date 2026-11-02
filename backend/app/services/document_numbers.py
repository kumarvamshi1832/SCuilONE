import uuid
from datetime import date
from typing import Callable

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.document_sequence import DocumentSequence


def next_document_number(
    db: Session,
    tenant_id: uuid.UUID,
    prefix: str,
    year: int | None = None,
) -> str:
    """Return the next running number such as INV-2026-0001.

    The counter row is updated inside the caller's transaction, so two
    requests can never receive the same number, and a rolled-back request
    does not use one up.
    """
    year = year or date.today().year
    key = f"{prefix}-{year}"

    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        statement = (
            pg_insert(DocumentSequence)
            .values(tenant_id=tenant_id, sequence_key=key, last_value=1)
            .on_conflict_do_update(
                index_elements=["tenant_id", "sequence_key"],
                set_={"last_value": DocumentSequence.last_value + 1},
            )
            .returning(DocumentSequence.last_value)
        )
        value = db.execute(statement).scalar_one()
    else:
        row = (
            db.query(DocumentSequence)
            .filter(
                DocumentSequence.tenant_id == tenant_id,
                DocumentSequence.sequence_key == key,
            )
            .with_for_update()
            .first()
        )

        if row is None:
            row = DocumentSequence(
                tenant_id=tenant_id, sequence_key=key, last_value=0
            )
            db.add(row)

        row.last_value += 1
        db.flush()
        value = row.last_value

    return f"{key}-{value:04d}"


def next_unused_number(
    db: Session,
    tenant_id: uuid.UUID,
    prefix: str,
    exists: Callable[[str], bool],
    year: int | None = None,
) -> str:
    """Like next_document_number, but skips numbers someone already typed in
    by hand (for example an old manual 'INV-2026-0003')."""
    for _ in range(100):
        number = next_document_number(db, tenant_id, prefix, year)

        if not exists(number):
            return number

    raise HTTPException(
        status_code=409,
        detail="Could not allocate a free document number. Please try again.",
    )
