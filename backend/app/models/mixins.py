"""Shared model mixins: soft delete and custom fields.

Soft delete: rows are never removed by the normal delete endpoints. They get
``deleted_at`` set and are hidden from every ORM SELECT automatically (via the
``do_orm_execute`` hook below), so existing queries, dashboards, search and
exports keep working without edits. To see deleted rows (trash/restore) pass
``.execution_options(include_deleted=True)`` on the query.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, event
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, Session, mapped_column, with_loader_criteria


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, index=True
    )
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )


class CustomFieldsMixin:
    """Tenant-defined extra fields; keys/types are governed by CustomFieldDefinition."""

    custom_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


@event.listens_for(Session, "do_orm_execute")
def _hide_soft_deleted_rows(state) -> None:
    if not state.is_select:
        return
    if state.execution_options.get("include_deleted", False):
        return
    state.statement = state.statement.options(
        with_loader_criteria(
            SoftDeleteMixin,
            lambda cls: cls.deleted_at.is_(None),
            include_aliases=True,
        )
    )


def soft_delete_record(obj, user_id=None) -> None:
    obj.deleted_at = datetime.utcnow()
    obj.deleted_by = uuid.UUID(str(user_id)) if user_id else None


def restore_record(obj) -> None:
    obj.deleted_at = None
    obj.deleted_by = None
