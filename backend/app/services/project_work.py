"""Which tasks (and so which time entries) belong to a software project."""
import uuid

from sqlalchemy.orm import Session

from app.models.activity_link import ActivityLink
from app.models.software_sprint import SoftwareSprint


def project_activity_ids(db: Session, tenant_id: uuid.UUID, project_id: uuid.UUID):
    """Subquery of the task ids linked to the project itself or to one of its sprints."""
    direct = db.query(ActivityLink.activity_id.label("activity_id")).filter(
        ActivityLink.tenant_id == tenant_id,
        ActivityLink.module == "software_project",
        ActivityLink.record_id == project_id,
    )
    through_sprints = db.query(ActivityLink.activity_id.label("activity_id")).filter(
        ActivityLink.tenant_id == tenant_id,
        ActivityLink.module == "software_sprint",
        ActivityLink.record_id.in_(
            db.query(SoftwareSprint.id).filter(
                SoftwareSprint.tenant_id == tenant_id,
                SoftwareSprint.software_project_id == project_id,
            )
        ),
    )
    return direct.union(through_sprints).subquery()


def activity_belongs_to_project(
    db: Session, tenant_id: uuid.UUID, activity_id: uuid.UUID, project_id: uuid.UUID
) -> bool:
    ids = project_activity_ids(db, tenant_id, project_id)
    return db.query(ids.c.activity_id).filter(ids.c.activity_id == activity_id).first() is not None
