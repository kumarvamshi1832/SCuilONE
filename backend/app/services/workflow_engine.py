
import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.models.account import Account
from app.models.activity import Activity
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.lead import Lead
from app.models.lead_assignment_audit import LeadAssignmentAudit
from app.models.notification import Notification
from app.models.user import User
from app.models.workflow import Workflow, WorkflowExecution


logger = logging.getLogger(__name__)


MODULE_FIELDS = {
    "leads": {
        "id", "full_name", "email", "phone", "source", "status",
        "account_id", "assigned_to", "notes", "created_at", "updated_at",
    },
    "contacts": {
        "id", "account_id", "full_name", "email", "phone", "company",
        "job_title", "address", "source", "assigned_to", "notes",
        "created_at", "updated_at",
    },
    "accounts": {
        "id", "name", "email", "phone", "website", "industry", "address",
        "city", "state", "country", "postal_code", "status", "source",
        "assigned_to", "notes", "created_at", "updated_at",
    },
    "deals": {
        "id", "name", "lead_id", "contact_id", "account_id",
        "assigned_to", "amount", "stage", "pipeline_id",
        "pipeline_stage_id", "expected_close_date", "description",
        "created_at", "updated_at",
    },
}


def normalize_module(module_name: str) -> str:
    if not isinstance(module_name, str):
        raise ValueError("Workflow module must be a string")

    value = module_name.strip().lower()
    aliases = {
        "lead": "leads",
        "contact": "contacts",
        "account": "accounts",
        "deal": "deals",
    }
    value = aliases.get(value, value)

    if value not in MODULE_FIELDS:
        raise ValueError(f"Unsupported workflow module: {module_name}")

    return value


def get_record_value(record, field: str, module_name: str):
    module = normalize_module(module_name)

    if field not in MODULE_FIELDS[module]:
        raise ValueError(
            f"Field '{field}' is not allowed for module '{module}'"
        )

    if isinstance(record, dict):
        return record.get(field)

    if not hasattr(record, field):
        raise ValueError(f"Record does not contain field '{field}'")

    return getattr(record, field)


def is_empty(value) -> bool:
    return value is None or value == ""


def compare_values(left, right) -> bool:
    if isinstance(left, str) and isinstance(right, str):
        return left.casefold() == right.casefold()

    if isinstance(left, UUID):
        try:
            return left == UUID(str(right))
        except (ValueError, TypeError, AttributeError):
            return False

    if isinstance(left, Decimal):
        try:
            return left == Decimal(str(right))
        except (InvalidOperation, ValueError, TypeError):
            return False

    if isinstance(left, (datetime, date)):
        if isinstance(right, str):
            try:
                right = (
                    datetime.fromisoformat(right)
                    if isinstance(left, datetime)
                    else date.fromisoformat(right)
                )
            except ValueError:
                return False

        if (
            isinstance(left, datetime)
            and isinstance(right, date)
            and not isinstance(right, datetime)
        ):
            right = datetime.combine(right, datetime.min.time())

        return left == right

    return left == right


def evaluate_condition(record, condition: dict, module_name: str) -> bool:
    field = condition.get("field")
    operator = condition.get("operator")
    expected = condition.get("value")

    if not isinstance(field, str) or not isinstance(operator, str):
        raise ValueError("Each condition needs a field and operator")

    actual = get_record_value(record, field, module_name)
    operator = operator.strip().lower()

    if operator in {"is_empty", "empty"}:
        return is_empty(actual)

    if operator in {"is_not_empty", "not_empty"}:
        return not is_empty(actual)

    if operator in {"equals", "equal", "eq", "is"}:
        return compare_values(actual, expected)

    if operator in {"not_equals", "not_equal", "ne", "neq", "is_not"}:
        return not compare_values(actual, expected)

    if operator in {"contains"}:
        return (
            actual is not None
            and str(expected).casefold() in str(actual).casefold()
        )

    if operator in {"not_contains", "does_not_contain"}:
        return (
            actual is None
            or str(expected).casefold() not in str(actual).casefold()
        )

    if operator == "starts_with":
        return (
            actual is not None
            and str(actual).casefold().startswith(str(expected).casefold())
        )

    if operator == "ends_with":
        return (
            actual is not None
            and str(actual).casefold().endswith(str(expected).casefold())
        )

    if operator in {"in", "not_in"}:
        if not isinstance(expected, list):
            raise ValueError(f"Operator '{operator}' requires a list value")

        matched = any(compare_values(actual, item) for item in expected)
        return matched if operator == "in" else not matched

    numeric_operators = {
        "greater_than", "gt",
        "greater_than_or_equal", "gte",
        "less_than", "lt",
        "less_than_or_equal", "lte",
    }

    if operator in numeric_operators:
        if actual is None or expected is None:
            return False

        try:
            left = Decimal(str(actual))
            right = Decimal(str(expected))
        except (InvalidOperation, ValueError, TypeError):
            raise ValueError(
                f"Operator '{operator}' requires numeric values"
            )

        if operator in {"greater_than", "gt"}:
            return left > right
        if operator in {"greater_than_or_equal", "gte"}:
            return left >= right
        if operator in {"less_than", "lt"}:
            return left < right

        return left <= right

    raise ValueError(f"Unsupported condition operator: {operator}")


def evaluate_conditions(
    record,
    conditions: list[dict],
    condition_logic: str,
    module_name: str,
) -> bool:
    if not conditions:
        return True

    if not isinstance(condition_logic, str):
        raise ValueError("Condition logic must be AND or OR")

    logic = condition_logic.strip().upper()

    if logic not in {"AND", "OR"}:
        raise ValueError("Condition logic must be AND or OR")

    results = [
        evaluate_condition(record, condition, module_name)
        for condition in conditions
    ]

    return all(results) if logic == "AND" else any(results)


UPDATABLE_FIELDS = {
    "leads": {
        "full_name", "email", "phone", "source", "status", "notes",
    },
    "contacts": {
        "full_name", "email", "phone", "company", "job_title",
        "address", "source", "notes",
    },
    "accounts": {
        "name", "email", "phone", "website", "industry", "address",
        "city", "state", "country", "postal_code", "status", "source",
        "notes",
    },
    "deals": {
        "name", "amount", "stage", "expected_close_date", "description",
    },
}


RECORD_MODELS = {
    "leads": Lead,
    "contacts": Contact,
    "accounts": Account,
    "deals": Deal,
}


ACTIVE_LEAD_STATUSES = {"New", "Contacted", "Qualified"}
MAX_ACTIVE_LEADS = 5


def action_data(action):
    if isinstance(action, dict):
        return action

    if hasattr(action, "model_dump"):
        return action.model_dump(exclude_none=True)

    raise ValueError("Invalid workflow action")


def get_active_tenant_user(db, user_id, tenant_id):
    if not user_id:
        raise ValueError("A user must be selected for this action")

    user = (
        db.query(User)
        .filter(
            User.id == UUID(str(user_id)),
            User.tenant_id == tenant_id,
            User.status == "Active",
        )
        .first()
    )

    if not user:
        raise ValueError("The selected user is not active in this tenant")

    return user


def enforce_lead_capacity(db, lead, target_user):
    if lead.assigned_to == target_user.id:
        return

    if lead.status not in ACTIVE_LEAD_STATUSES:
        return

    active_count = (
        db.query(func.count(Lead.id))
        .filter(
            Lead.tenant_id == lead.tenant_id,
            Lead.assigned_to == target_user.id,
            Lead.status.in_(ACTIVE_LEAD_STATUSES),
        )
        .scalar()
    )

    if active_count >= MAX_ACTIVE_LEADS:
        raise ValueError(
            f"Assignment rejected: the selected user already has "
            f"{active_count} active leads. The limit is {MAX_ACTIVE_LEADS}. "
            "Use the existing authorized capacity-override process if appropriate."
        )


def execute_action(
    db,
    workflow,
    record,
    module_name,
    tenant_id,
    action,
):
    module = normalize_module(module_name)
    data = action_data(action)
    action_type = data.get("action_type")

    if not isinstance(record, RECORD_MODELS[module]):
        raise ValueError("Record type does not match the workflow module")

    if record.tenant_id != tenant_id:
        raise ValueError("Cross-tenant record access is not allowed")

    if action_type == "assign_owner":
        target_user = get_active_tenant_user(
            db, data.get("user_id"), tenant_id
        )
        previous_owner = record.assigned_to

        if module == "leads":
            enforce_lead_capacity(db, record, target_user)

        record.assigned_to = target_user.id

        if module == "leads" and previous_owner != target_user.id:
            db.add(
                LeadAssignmentAudit(
                    tenant_id=tenant_id,
                    lead_id=record.id,
                    previous_assigned_to=previous_owner,
                    new_assigned_to=target_user.id,
                    reason=f"Assigned by workflow: {workflow.name}",
                    action="workflow_assignment",
                )
            )

        db.flush()

        return {
            "action_type": action_type,
            "status": "success",
            "message": f"Record assigned to {target_user.full_name}",
            "user_id": str(target_user.id),
        }

    if action_type == "update_field":
        field = data.get("field")

        if field not in UPDATABLE_FIELDS[module]:
            raise ValueError(
                f"Field '{field}' cannot be updated by a workflow "
                f"for module '{module}'"
            )

        value = data.get("value")

        if module == "deals" and field == "amount":
            value = Decimal(str(value))

        if module == "deals" and field == "expected_close_date":
            if isinstance(value, str) and value:
                value = date.fromisoformat(value)

        setattr(record, field, value)
        db.flush()

        return {
            "action_type": action_type,
            "status": "success",
            "message": f"Updated field '{field}'",
            "field": field,
        }

    if action_type == "create_task":
        title = str(data.get("title") or "").strip()

        if not title:
            raise ValueError("Task title is required")

        assigned_user_id = (
            data.get("user_id") or getattr(record, "assigned_to", None)
        )

        if assigned_user_id:
            assigned_user = get_active_tenant_user(
                db, assigned_user_id, tenant_id
            )
            assigned_user_id = assigned_user.id

        due_in_days = int(data.get("due_in_days") or 0)

        if not 0 <= due_in_days <= 365:
            raise ValueError("Task due_in_days must be between 0 and 365")

        task = Activity(
            tenant_id=tenant_id,
            title=title,
            description=data.get("description"),
            activity_type="Task",
            status="Pending",
            priority=data.get("priority") or "Medium",
            due_date=(
                datetime.utcnow() + timedelta(days=due_in_days)
                if due_in_days
                else None
            ),
            assigned_to=assigned_user_id,
            lead_id=record.id if module == "leads" else None,
            contact_id=record.id if module == "contacts" else None,
            account_id=record.id if module == "accounts" else None,
            deal_id=record.id if module == "deals" else None,
        )

        db.add(task)
        db.flush()

        return {
            "action_type": action_type,
            "status": "success",
            "message": "Task created",
            "task_id": str(task.id),
        }

    if action_type == "send_notification":
        message = str(data.get("message") or "").strip()

        if not message:
            raise ValueError("Notification message is required")

        explicit_user_id = data.get("user_id")
        recipient_type = data.get("recipient")

        if explicit_user_id:
            recipient_id = explicit_user_id
        elif recipient_type == "assigned_user":
            recipient_id = getattr(record, "assigned_to", None)
        elif recipient_type == "record_creator":
            recipient_id = getattr(record, "created_by", None)
        elif recipient_type == "workflow_creator":
            recipient_id = workflow.created_by
        elif recipient_type is None:
            recipient_id = (
                getattr(record, "assigned_to", None)
                or workflow.created_by
            )
        else:
            raise ValueError(
                f"Unsupported notification recipient: {recipient_type}"
            )

        if not recipient_id:
            raise ValueError(
                f"No user is available for recipient type: "
                f"{recipient_type or 'default'}"
            )

        recipient = get_active_tenant_user(db, recipient_id, tenant_id)

        notification = Notification(
            tenant_id=tenant_id,
            recipient_user_id=recipient.id,
            workflow_id=workflow.id,
            title=(data.get("title") or workflow.name)[:200],
            message=message,
            notification_type="workflow",
            related_module=module,
            related_record_id=record.id,
            is_read=False,
        )

        db.add(notification)
        db.flush()

        return {
            "action_type": action_type,
            "status": "success",
            "message": "In-app notification created",
            "notification_id": str(notification.id),
            "recipient_user_id": str(recipient.id),
        }

    raise ValueError(f"Unsupported workflow action: {action_type}")


def dispatch_workflows(
    db,
    tenant_id,
    module_name,
    trigger_event,
    record,
    event_id=None,
    changed_fields=None,
):
    module = normalize_module(module_name)
    tenant_uuid = UUID(str(tenant_id))
    record_uuid = UUID(str(record.id))

    if record.tenant_id != tenant_uuid:
        raise ValueError("Cross-tenant workflow execution is not allowed")

    if not isinstance(trigger_event, str) or not trigger_event.strip():
        raise ValueError("Trigger event must be a non-empty string")

    event_id = str(event_id or uuid.uuid4())
    results = []

    workflows = (
        db.query(Workflow)
        .filter(
            Workflow.tenant_id == tenant_uuid,
            Workflow.is_active.is_(True),
            Workflow.trigger_event == trigger_event,
        )
        .order_by(Workflow.created_at.asc())
        .all()
    )

    changed_names = {
        str(field).casefold()
        for field in (changed_fields or set())
    }

    workflows = [
        workflow
        for workflow in workflows
        if normalize_module(workflow.module_name) == module
        and (
            trigger_event != "field_changed"
            or (
                bool(changed_names)
                and bool({
                    str(condition.get("field", "")).casefold()
                    for condition in (workflow.conditions or [])
                    if isinstance(condition, dict)
                } & changed_names)
            )
        )
    ]

    for workflow in workflows:
        idempotency_key = f"{workflow.id}:{event_id}"

        existing = (
            db.query(WorkflowExecution)
            .filter(
                WorkflowExecution.tenant_id == tenant_uuid,
                WorkflowExecution.idempotency_key == idempotency_key,
            )
            .first()
        )

        if existing:
            results.append({
                "workflow_id": str(workflow.id),
                "status": "duplicate_ignored",
                "execution_id": str(existing.id),
            })
            continue

        execution = WorkflowExecution(
            tenant_id=tenant_uuid,
            workflow_id=workflow.id,
            workflow_name=workflow.name,
            module_name=module,
            record_id=record_uuid,
            trigger_event=trigger_event,
            status="pending",
            conditions_matched=None,
            action_results=[],
            idempotency_key=idempotency_key,
        )

        try:
            with db.begin_nested():
                db.add(execution)
                db.flush()
        except IntegrityError:
            existing = (
                db.query(WorkflowExecution)
                .filter(
                    WorkflowExecution.tenant_id == tenant_uuid,
                    WorkflowExecution.idempotency_key == idempotency_key,
                )
                .first()
            )

            results.append({
                "workflow_id": str(workflow.id),
                "status": "duplicate_ignored",
                "execution_id": str(existing.id) if existing else None,
            })
            continue

        try:
            matched = evaluate_conditions(
                record,
                workflow.conditions or [],
                workflow.condition_logic,
                module,
            )

            execution.conditions_matched = bool(matched)

            if not matched:
                execution.status = "skipped"
                execution.completed_at = datetime.now(timezone.utc)
                db.flush()

                results.append({
                    "workflow_id": str(workflow.id),
                    "execution_id": str(execution.id),
                    "status": "skipped",
                    "reason": "Conditions did not match",
                })
                continue

            action_results = []

            try:
                with db.begin_nested():
                    for action in workflow.actions or []:
                        action_results.append(
                            execute_action(
                                db=db,
                                workflow=workflow,
                                record=record,
                                module_name=module,
                                tenant_id=tenant_uuid,
                                action=action,
                            )
                        )

            except Exception as action_error:
                logger.exception(
                    "Workflow action failed. Workflow ID: %s",
                    workflow.id,
                )
                execution.status = "failed"
                execution.error_message = str(action_error)[:5000]
                execution.action_results = [{
                    "status": "rolled_back",
                    "message": (
                        "Workflow actions were rolled back because "
                        "an action failed."
                    ),
                }]
            else:
                execution.status = "success"
                execution.action_results = action_results

        except Exception as workflow_error:
            logger.exception(
                "Workflow evaluation failed. Workflow ID: %s",
                workflow.id,
            )
            execution.status = "failed"
            execution.error_message = str(workflow_error)[:5000]
            execution.action_results = []

        execution.completed_at = datetime.now(timezone.utc)
        db.flush()

        results.append({
            "workflow_id": str(workflow.id),
            "execution_id": str(execution.id),
            "status": execution.status,
            "conditions_matched": execution.conditions_matched,
            "action_results": execution.action_results,
            "error": execution.error_message,
        })

    return results
