
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.workflow import Workflow, WorkflowExecution
from app.services.audit_service import log_audit
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowExecutionResponse,
)


router = APIRouter(
    prefix="/api/v1/workflows",
    tags=["Workflows"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_workflow(
    workflow_id: UUID,
    tenant_id: UUID,
    db: Session,
):
    workflow = db.query(Workflow).filter(
        Workflow.id == workflow_id,
        Workflow.tenant_id == tenant_id,
    ).first()

    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found",
        )

    return workflow


def workflow_audit_data(workflow: Workflow):
    return {
        "name": workflow.name,
        "description": workflow.description,
        "module_name": workflow.module_name,
        "trigger_event": workflow.trigger_event,
        "condition_logic": workflow.condition_logic,
        "conditions": workflow.conditions,
        "actions": workflow.actions,
        "is_active": workflow.is_active,
        "created_by": workflow.created_by,
    }


def validate_workflow_name(
    name: str,
    tenant_id: UUID,
    db: Session,
    exclude_workflow_id: UUID | None = None,
):
    query = db.query(Workflow).filter(
        Workflow.tenant_id == tenant_id,
        Workflow.name == name,
    )

    if exclude_workflow_id is not None:
        query = query.filter(Workflow.id != exclude_workflow_id)

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A workflow with this name already exists",
        )


def serialize_rules(data):
    return [
        item.model_dump(mode="json")
        for item in data
    ]


@router.post(
    "/",
    response_model=WorkflowResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_workflow(
    data: WorkflowCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    name = data.name.strip()

    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Workflow name cannot be empty",
        )

    validate_workflow_name(name, tenant_id, db)

    workflow = Workflow(
        tenant_id=tenant_id,
        created_by=user_id,
        name=name,
        description=data.description,
        module_name=data.module_name,
        trigger_event=data.trigger_event,
        condition_logic=data.condition_logic,
        conditions=serialize_rules(data.conditions),
        actions=serialize_rules(data.actions),
        is_active=False,
    )

    try:
        db.add(workflow)
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="workflows",
            record_id=workflow.id,
            description=f"Created workflow '{workflow.name}'",
            after_data=workflow_audit_data(workflow),
        )

        db.commit()
        db.refresh(workflow)

    except Exception:
        db.rollback()
        raise

    return workflow


@router.get(
    "/",
    response_model=list[WorkflowResponse],
)
def list_workflows(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    return db.query(Workflow).filter(
        Workflow.tenant_id == tenant_id,
    ).order_by(
        Workflow.created_at.desc(),
    ).all()


@router.get(
    "/{workflow_id}",
    response_model=WorkflowResponse,
)
def get_workflow(
    workflow_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    return get_tenant_workflow(
        workflow_id,
        tenant_id,
        db,
    )


@router.put(
    "/{workflow_id}",
    response_model=WorkflowResponse,
)
def update_workflow(
    workflow_id: UUID,
    data: WorkflowUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    workflow = get_tenant_workflow(
        workflow_id,
        tenant_id,
        db,
    )

    before_data = workflow_audit_data(workflow)
    changes = data.model_dump(exclude_unset=True)

    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()

        if not changes["name"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Workflow name cannot be empty",
            )

        validate_workflow_name(
            changes["name"],
            tenant_id,
            db,
            exclude_workflow_id=workflow.id,
        )

    if "conditions" in changes and changes["conditions"] is not None:
        changes["conditions"] = serialize_rules(data.conditions)

    if "actions" in changes and changes["actions"] is not None:
        changes["actions"] = serialize_rules(data.actions)

    for field, value in changes.items():
        setattr(workflow, field, value)

    after_data = workflow_audit_data(workflow)

    changed_fields = [
        field
        for field in changes
        if before_data.get(field) != after_data.get(field)
    ]

    changed_before = {
        field: before_data[field]
        for field in changed_fields
    }

    changed_after = {
        field: after_data[field]
        for field in changed_fields
    }

    try:
        if changed_fields:
            log_audit(
                db=db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="update",
                module="workflows",
                record_id=workflow.id,
                description=f"Updated workflow '{workflow.name}'",
                before_data=changed_before,
                after_data=changed_after,
            )

        db.commit()
        db.refresh(workflow)

    except Exception:
        db.rollback()
        raise

    return workflow


@router.patch(
    "/{workflow_id}/activate",
    response_model=WorkflowResponse,
)
def activate_workflow(
    workflow_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.activate")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    workflow = get_tenant_workflow(
        workflow_id,
        tenant_id,
        db,
    )

    if not workflow.actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add at least one action before activating the workflow",
        )

    if (
        workflow.trigger_event == "field_changed"
        and not workflow.conditions
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Add conditions before activating this workflow",
        )

    was_active = workflow.is_active
    workflow.is_active = True

    try:
        if not was_active:
            log_audit(
                db=db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="activate",
                module="workflows",
                record_id=workflow.id,
                description=f"Activated workflow '{workflow.name}'",
                before_data={"is_active": False},
                after_data={"is_active": True},
            )

        db.commit()
        db.refresh(workflow)

    except Exception:
        db.rollback()
        raise

    return workflow


@router.patch(
    "/{workflow_id}/deactivate",
    response_model=WorkflowResponse,
)
def deactivate_workflow(
    workflow_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.activate")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    workflow = get_tenant_workflow(
        workflow_id,
        tenant_id,
        db,
    )

    was_active = workflow.is_active
    workflow.is_active = False

    try:
        if was_active:
            log_audit(
                db=db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="deactivate",
                module="workflows",
                record_id=workflow.id,
                description=f"Deactivated workflow '{workflow.name}'",
                before_data={"is_active": True},
                after_data={"is_active": False},
            )

        db.commit()
        db.refresh(workflow)

    except Exception:
        db.rollback()
        raise

    return workflow


@router.get(
    "/{workflow_id}/executions",
    response_model=list[WorkflowExecutionResponse],
)
def list_workflow_executions(
    workflow_id: UUID,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.execution.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    get_tenant_workflow(
        workflow_id,
        tenant_id,
        db,
    )

    return db.query(WorkflowExecution).filter(
        WorkflowExecution.tenant_id == tenant_id,
        WorkflowExecution.workflow_id == workflow_id,
    ).order_by(
        WorkflowExecution.started_at.desc(),
    ).offset(offset).limit(limit).all()


@router.delete(
    "/{workflow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_workflow(
    workflow_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("workflow.delete")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    workflow = get_tenant_workflow(
        workflow_id,
        tenant_id,
        db,
    )

    try:
        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="delete",
            module="workflows",
            record_id=workflow.id,
            description=f"Deleted workflow '{workflow.name}'",
            before_data=workflow_audit_data(workflow),
        )

        db.delete(workflow)
        db.commit()

    except Exception:
        db.rollback()
        raise

    return None
