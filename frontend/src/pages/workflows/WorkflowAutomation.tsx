import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { getUsers } from "../../services/userService";
import {
  activateWorkflow,
  createWorkflow,
  deactivateWorkflow,
  deleteWorkflow,
  getWorkflowExecutions,
  getWorkflows,
  updateWorkflow,
} from "../../services/workflowService";
import type { User } from "../../types/user";
import type {
  ConditionLogic,
  ConditionOperator,
  Workflow,
  WorkflowAction,
  WorkflowCondition,
  WorkflowCreateRequest,
  WorkflowExecution,
  WorkflowModule,
  WorkflowRecipient,
  WorkflowTrigger,
} from "../../types/workflow";
import "./WorkflowAutomation.css";

type EditorState = "create" | "edit";

const modules: { value: WorkflowModule; label: string }[] = [
  { value: "leads", label: "Leads" },
  { value: "contacts", label: "Contacts" },
  { value: "accounts", label: "Accounts" },
  { value: "deals", label: "Deals" },
];

const triggers: { value: WorkflowTrigger; label: string }[] = [
  { value: "record_created", label: "Record is created" },
  { value: "record_updated", label: "Record is updated" },
  { value: "field_changed", label: "Field changes" },
];

const operators: { value: ConditionOperator; label: string }[] = [
  { value: "is", label: "Is" },
  { value: "is_not", label: "Is not" },
  { value: "contains", label: "Contains" },
  { value: "does_not_contain", label: "Does not contain" },
  { value: "greater_than", label: "Greater than" },
  { value: "greater_than_or_equal", label: "Greater than or equal" },
  { value: "less_than", label: "Less than" },
  { value: "less_than_or_equal", label: "Less than or equal" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

const recipientOptions: { value: WorkflowRecipient; label: string }[] = [
  { value: "assigned_user", label: "Assigned user" },
  { value: "record_creator", label: "Record creator" },
  { value: "workflow_creator", label: "Workflow creator" },
];

const emptyAction = (): WorkflowAction => ({
  action_type: "send_notification",
  recipient: "assigned_user",
  message: "",
});

const emptyForm = (): WorkflowCreateRequest => ({
  name: "",
  description: "",
  module_name: "leads",
  trigger_event: "record_created",
  condition_logic: "AND",
  conditions: [],
  actions: [emptyAction()],
  is_active: false,
});

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as {
      message?: string;
      detail?: unknown;
      response?: { data?: { detail?: unknown; message?: string } };
    };

    const detail = e.response?.data?.detail ?? e.detail;

    if (typeof detail === "string") return detail;

    if (Array.isArray(detail)) {
      return detail
        .map((item) =>
          typeof item === "object" && item !== null && "msg" in item
            ? String((item as { msg: unknown }).msg)
            : String(item)
        )
        .join(", ");
    }

    if (e.response?.data?.message) return e.response.data.message;
    if (e.message) return e.message;
  }

  return "Something went wrong. Please try again.";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function pretty(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function valueForInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

export default function WorkflowAutomation() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WorkflowCreateRequest>(emptyForm());

  const [historyWorkflow, setHistoryWorkflow] = useState<Workflow | null>(null);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");

    try {
      const [workflowData, userData] = await Promise.all([
        getWorkflows(),
        getUsers(),
      ]);

      setWorkflows(workflowData);
      setUsers(userData);
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredWorkflows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return workflows.filter((workflow) => {
      const matchesSearch =
        !term ||
        workflow.name.toLowerCase().includes(term) ||
        (workflow.description ?? "").toLowerCase().includes(term);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && workflow.is_active) ||
        (statusFilter === "inactive" && !workflow.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [workflows, search, statusFilter]);

  const activeCount = workflows.filter((workflow) => workflow.is_active).length;
  const inactiveCount = workflows.length - activeCount;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setEditorState("create");
    setHistoryWorkflow(null);
    setPageError("");
    setNotice("");
  };

  const openEdit = (workflow: Workflow) => {
    setEditingId(workflow.id);

    setForm({
      name: workflow.name,
      description: workflow.description ?? "",
      module_name: workflow.module_name,
      trigger_event: workflow.trigger_event,
      condition_logic: workflow.condition_logic,
      conditions: workflow.conditions.map((condition) => ({ ...condition })),
      actions: workflow.actions.map((action) => ({ ...action })),
      is_active: false,
    });

    setEditorState("edit");
    setHistoryWorkflow(null);
    setPageError("");
    setNotice("");
  };

  const closeEditor = () => {
    setEditorState(null);
    setEditingId(null);
  };

  const updateCondition = (
    index: number,
    changes: Partial<WorkflowCondition>
  ) => {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.map((condition, i) =>
        i === index ? { ...condition, ...changes } : condition
      ),
    }));
  };

  const updateAction = (index: number, changes: Partial<WorkflowAction>) => {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action, i) =>
        i === index ? { ...action, ...changes } : action
      ),
    }));
  };

  const changeActionType = (
    index: number,
    actionType: WorkflowAction["action_type"]
  ) => {
    const action: WorkflowAction =
      actionType === "assign_owner"
        ? { action_type: "assign_owner", user_id: "" }
        : actionType === "update_field"
          ? { action_type: "update_field", field: "", value: "" }
          : actionType === "create_task"
            ? {
                action_type: "create_task",
                title: "",
                description: "",
                priority: "Medium",
                due_in_days: 1,
              }
            : emptyAction();

    updateAction(index, action);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPageError("");
    setNotice("");

    if (!form.name.trim()) {
      setPageError("Enter a workflow name.");
      return;
    }

    if (form.actions.length === 0) {
      setPageError("Add at least one action.");
      return;
    }

    if (
      form.trigger_event === "field_changed" &&
      form.conditions.length === 0
    ) {
      setPageError("Add at least one condition for the Field changes trigger.");
      return;
    }

    const cleanedConditions = form.conditions.map((condition) => ({
      ...condition,
      field: condition.field.trim(),
      value:
        condition.operator === "is_empty" ||
        condition.operator === "is_not_empty"
          ? null
          : condition.value,
    }));

    const cleanedActions = form.actions.map((action) => {
      const result: WorkflowAction = { ...action };

      if (result.action_type === "assign_owner") {
        result.user_id = result.user_id || null;
      }

      if (result.action_type === "update_field") {
        result.field = result.field?.trim();
      }

      if (result.action_type === "create_task") {
        result.title = result.title?.trim();
      }

      if (result.action_type === "send_notification") {
        result.message = result.message?.trim();
        result.recipient = result.recipient ?? "assigned_user";
        result.user_id = null;
      }

      return result;
    });

    const payload: WorkflowCreateRequest = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      module_name: form.module_name,
      trigger_event: form.trigger_event,
      condition_logic: form.condition_logic,
      conditions: cleanedConditions,
      actions: cleanedActions,
      is_active: false,
    };

    const validationError = validateForm(payload);

    if (validationError) {
      setPageError(validationError);
      return;
    }

    setSaving(true);

    try {
      if (editorState === "edit" && editingId) {
        const updatePayload = {
          name: payload.name,
          description: payload.description,
          module_name: payload.module_name,
          trigger_event: payload.trigger_event,
          condition_logic: payload.condition_logic,
          conditions: payload.conditions,
          actions: payload.actions,
        };

        await updateWorkflow(editingId, updatePayload);
        setNotice("Workflow updated. Review it and activate it when ready.");
      } else {
        await createWorkflow(payload);
        setNotice("Workflow created as inactive. Activate it when ready.");
      }

      closeEditor();
      await loadData();
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (workflow: Workflow) => {
    setPageError("");
    setNotice("");

    try {
      if (workflow.is_active) {
        await deactivateWorkflow(workflow.id);
        setNotice(`"${workflow.name}" has been deactivated.`);
      } else {
        await activateWorkflow(workflow.id);
        setNotice(`"${workflow.name}" is now active.`);
      }

      await loadData();
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  };

  const handleDelete = async (workflow: Workflow) => {
    if (!window.confirm(`Delete "${workflow.name}"? This cannot be undone.`)) {
      return;
    }

    setPageError("");
    setNotice("");

    try {
      await deleteWorkflow(workflow.id);
      setNotice(`"${workflow.name}" was deleted.`);

      if (historyWorkflow?.id === workflow.id) {
        setHistoryWorkflow(null);
        setExecutions([]);
      }

      await loadData();
    } catch (error) {
      setPageError(getErrorMessage(error));
    }
  };

  const openHistory = async (workflow: Workflow) => {
    setHistoryWorkflow(workflow);
    setExecutions([]);
    setHistoryError("");
    setHistoryLoading(true);
    setEditorState(null);

    try {
      setExecutions(await getWorkflowExecutions(workflow.id, 50, 0));
    } catch (error) {
      setHistoryError(getErrorMessage(error));
    } finally {
      setHistoryLoading(false);
    }
  };

  function validateForm(payload: WorkflowCreateRequest): string {
  for (const [index, condition] of payload.conditions.entries()) {
    if (!condition) {
      return `Condition ${index + 1} is invalid.`;
    }

    if (!condition.field.trim()) {
      return `Enter a field name for condition ${index + 1}.`;
    }

    const operator = condition.operator;

    if (
      operator !== "is_empty" &&
      operator !== "is_not_empty" &&
      valueForInput(condition.value).trim() === ""
    ) {
      return `Enter a value for condition ${index + 1}.`;
    }
  }

  for (const [index, action] of payload.actions.entries()) {
    if (!action) {
      return `Action ${index + 1} is invalid.`;
    }

    if (action.action_type === "assign_owner" && !action.user_id) {
      return `Select a user for action ${index + 1}.`;
    }

    if (
      action.action_type === "update_field" &&
      (
        !action.field?.trim() ||
        action.value === "" ||
        action.value === null ||
        action.value === undefined
      )
    ) {
      return `Enter the field and value for action ${index + 1}.`;
    }

    if (
      action.action_type === "create_task" &&
      !action.title?.trim()
    ) {
      return `Enter a task title for action ${index + 1}.`;
    }

    if (
      action.action_type === "send_notification" &&
      !action.message?.trim()
    ) {
      return `Enter a notification message for action ${index + 1}.`;
    }
  }

  return "";
}

  return (
    <section className="wa-section">
      <div className="wa-heading">
        <div>
          <div className="wa-eyebrow">AUTOMATION CENTER</div>
          <h2>Workflow Automation</h2>
          <p>Automate record updates, ownership, tasks, and notifications.</p>
        </div>

        <button
          type="button"
          className="wa-primary-button"
          onClick={openCreate}
        >
          <span aria-hidden="true">＋</span> Create workflow
        </button>
      </div>

      {pageError && (
        <div className="wa-alert wa-alert-error" role="alert">
          <span>{pageError}</span>
          <button
            type="button"
            onClick={() => setPageError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="wa-alert wa-alert-success" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <div className="wa-stats">
        <article className="wa-stat-card">
          <span className="wa-stat-icon">⚡</span>
          <div>
            <span>Total workflows</span>
            <strong>{workflows.length}</strong>
          </div>
        </article>

        <article className="wa-stat-card">
          <span className="wa-stat-icon wa-stat-active">✓</span>
          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
        </article>

        <article className="wa-stat-card">
          <span className="wa-stat-icon wa-stat-inactive">Ⅱ</span>
          <div>
            <span>Inactive</span>
            <strong>{inactiveCount}</strong>
          </div>
        </article>
      </div>

      <div className="wa-toolbar">
        <input
          aria-label="Search workflows"
          placeholder="Search workflows..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select
          aria-label="Filter workflow status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>

        <button
          type="button"
          className="wa-secondary-button"
          onClick={() => void loadData()}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "↻ Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="wa-empty">
          <span className="wa-loader" /> Loading workflows...
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="wa-empty">
          <div className="wa-empty-icon">⚙</div>
          <h3>
            {workflows.length ? "No matching workflows" : "No workflows yet"}
          </h3>
          <p>
            {workflows.length
              ? "Try another search or status filter."
              : "Create your first automation to start saving time on repetitive CRM work."}
          </p>

          {!workflows.length && (
            <button
              type="button"
              className="wa-primary-button"
              onClick={openCreate}
            >
              Create your first workflow
            </button>
          )}
        </div>
      ) : (
        <div className="wa-workflow-list">
          {filteredWorkflows.map((workflow) => (
            <article className="wa-workflow-card" key={workflow.id}>
              <div className="wa-card-top">
                <div className="wa-workflow-symbol">⚡</div>

                <div className="wa-workflow-main">
                  <div className="wa-title-line">
                    <h3>{workflow.name}</h3>

                    <span
                      className={`wa-status ${
                        workflow.is_active ? "is-active" : "is-inactive"
                      }`}
                    >
                      <span />
                      {workflow.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <p>{workflow.description || "No description provided."}</p>

                  <div className="wa-tags">
                    <span>{pretty(workflow.module_name)}</span>
                    <span>{pretty(workflow.trigger_event)}</span>
                    <span>
                      {workflow.actions.length} action
                      {workflow.actions.length === 1 ? "" : "s"}
                    </span>

                    {workflow.conditions.length > 0 && (
                      <span>
                        {workflow.conditions.length} condition
                        {workflow.conditions.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="wa-card-footer">
                <span className="wa-updated">
                  Updated {formatDate(workflow.updated_at)}
                </span>

                <div className="wa-card-actions">
                  <button
                    type="button"
                    className="wa-text-button"
                    onClick={() => void openHistory(workflow)}
                  >
                    History
                  </button>

                  <button
                    type="button"
                    className="wa-text-button"
                    onClick={() => openEdit(workflow)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className={`wa-toggle-button ${
                      workflow.is_active ? "deactivate" : "activate"
                    }`}
                    onClick={() => void handleToggle(workflow)}
                  >
                    {workflow.is_active ? "Deactivate" : "Activate"}
                  </button>

                  <button
                    type="button"
                    className="wa-delete-button"
                    onClick={() => void handleDelete(workflow)}
                    aria-label={`Delete ${workflow.name}`}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editorState && (
        <div
          className="wa-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              closeEditor();
            }
          }}
        >
          <section
            className="wa-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-editor-title"
          >
            <div className="wa-modal-heading">
              <div>
                <span className="wa-eyebrow">
                  {editorState === "create"
                    ? "NEW AUTOMATION"
                    : "EDIT AUTOMATION"}
                </span>
                <h2 id="wa-editor-title">
                  {editorState === "create" ? "Create workflow" : "Edit workflow"}
                </h2>
                <p>
                  Define when this workflow runs and which actions it performs.
                </p>
              </div>

              <button
                type="button"
                className="wa-close-button"
                onClick={closeEditor}
                disabled={saving}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="wa-form-body">
                <section className="wa-form-section">
                  <div className="wa-step-heading">
                    <span>1</span>
                    <div>
                      <h3>Workflow details</h3>
                      <p>Give your automation a name and purpose.</p>
                    </div>
                  </div>

                  <div className="wa-form-grid">
                    <label className="wa-field wa-field-full">
                      Workflow name <span>*</span>
                      <input
                        maxLength={150}
                        required
                        value={form.name}
                        onChange={(event) =>
                          setForm({ ...form, name: event.target.value })
                        }
                        placeholder="e.g. Notify owner when a lead is qualified"
                      />
                    </label>

                    <label className="wa-field wa-field-full">
                      Description
                      <textarea
                        maxLength={2000}
                        rows={2}
                        value={form.description ?? ""}
                        onChange={(event) =>
                          setForm({ ...form, description: event.target.value })
                        }
                        placeholder="What should this workflow accomplish?"
                      />
                    </label>

                    <label className="wa-field">
                      CRM module <span>*</span>
                      <select
                        value={form.module_name}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            module_name: event.target.value as WorkflowModule,
                          })
                        }
                      >
                        {modules.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="wa-field">
                      Trigger <span>*</span>
                      <select
                        value={form.trigger_event}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            trigger_event: event.target.value as WorkflowTrigger,
                          })
                        }
                      >
                        {triggers.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="wa-form-section">
                  <div className="wa-step-heading">
                    <span>2</span>
                    <div>
                      <h3>Conditions</h3>
                      <p>
                        Specify when actions should run. Field names must match
                        your CRM record fields.
                      </p>
                    </div>
                  </div>

                  <div className="wa-logic-row">
                    <span>Match</span>
                    <select
                      value={form.condition_logic}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          condition_logic: event.target.value as ConditionLogic,
                        })
                      }
                    >
                      <option value="AND">ALL conditions (AND)</option>
                      <option value="OR">ANY condition (OR)</option>
                    </select>
                  </div>

                  {form.conditions.map((condition, index) => (
                    <div
                      className="wa-condition-row"
                      key={`condition-${index}`}
                    >
                      <label className="wa-field">
                        Field
                        <input
                          maxLength={100}
                          value={condition.field}
                          onChange={(event) =>
                            updateCondition(index, {
                              field: event.target.value,
                            })
                          }
                          placeholder="e.g. status"
                        />
                      </label>

                      <label className="wa-field">
                        Operator
                        <select
                          value={condition.operator}
                          onChange={(event) =>
                            updateCondition(index, {
                              operator: event.target.value as ConditionOperator,
                              value: undefined,
                            })
                          }
                        >
                          {operators.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="wa-field">
                        Value
                        <input
                          disabled={
                            condition.operator === "is_empty" ||
                            condition.operator === "is_not_empty"
                          }
                          value={valueForInput(condition.value)}
                          onChange={(event) =>
                            updateCondition(index, {
                              value: event.target.value,
                            })
                          }
                          placeholder={
                            condition.operator === "is_empty" ||
                            condition.operator === "is_not_empty"
                              ? "Not required"
                              : "Enter value"
                          }
                        />
                      </label>

                      <button
                        type="button"
                        className="wa-remove-button"
                        onClick={() =>
                          setForm({
                            ...form,
                            conditions: form.conditions.filter(
                              (_, i) => i !== index
                            ),
                          })
                        }
                        aria-label={`Remove condition ${index + 1}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="wa-add-button"
                    onClick={() =>
                      setForm({
                        ...form,
                        conditions: [
                          ...form.conditions,
                          { field: "", operator: "is", value: "" },
                        ],
                      })
                    }
                  >
                    ＋ Add condition
                  </button>

                  {form.trigger_event === "field_changed" &&
                    form.conditions.length === 0 && (
                      <p className="wa-inline-warning">
                        This trigger requires at least one condition.
                      </p>
                    )}
                </section>

                <section className="wa-form-section">
                  <div className="wa-step-heading">
                    <span>3</span>
                    <div>
                      <h3>Actions</h3>
                      <p>
                        Actions run in the order listed. Add at least one
                        action.
                      </p>
                    </div>
                  </div>

                  {form.actions.map((action, index) => (
                    <div
                      className="wa-action-card"
                      key={`action-${index}`}
                    >
                      <div className="wa-action-card-heading">
                        <strong>Action {index + 1}</strong>

                        {form.actions.length > 1 && (
                          <button
                            type="button"
                            className="wa-remove-button"
                            onClick={() =>
                              setForm({
                                ...form,
                                actions: form.actions.filter(
                                  (_, i) => i !== index
                                ),
                              })
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <label className="wa-field">
                        Action type
                        <select
                          value={action.action_type}
                          onChange={(event) =>
                            changeActionType(
                              index,
                              event.target.value as WorkflowAction["action_type"]
                            )
                          }
                        >
                          <option value="assign_owner">Assign owner</option>
                          <option value="update_field">Update field</option>
                          <option value="create_task">Create task</option>
                          <option value="send_notification">
                            Send notification
                          </option>
                        </select>
                      </label>

                      {action.action_type === "assign_owner" && (
                        <label className="wa-field">
                          Assign to user <span>*</span>
                          <select
                            value={action.user_id ?? ""}
                            onChange={(event) =>
                              updateAction(index, {
                                user_id: event.target.value,
                              })
                            }
                          >
                            <option value="">Select a user</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.full_name} ({user.email})
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {action.action_type === "update_field" && (
                        <div className="wa-form-grid">
                          <label className="wa-field">
                            Field name <span>*</span>
                            <input
                              maxLength={100}
                              value={action.field ?? ""}
                              onChange={(event) =>
                                updateAction(index, {
                                  field: event.target.value,
                                })
                              }
                              placeholder="e.g. status"
                            />
                          </label>

                          <label className="wa-field">
                            New value <span>*</span>
                            <input
                              value={valueForInput(action.value)}
                              onChange={(event) =>
                                updateAction(index, {
                                  value: event.target.value,
                                })
                              }
                              placeholder="e.g. Qualified"
                            />
                          </label>
                        </div>
                      )}

                      {action.action_type === "create_task" && (
                        <div className="wa-form-grid">
                          <label className="wa-field wa-field-full">
                            Task title <span>*</span>
                            <input
                              maxLength={200}
                              value={action.title ?? ""}
                              onChange={(event) =>
                                updateAction(index, {
                                  title: event.target.value,
                                })
                              }
                              placeholder="e.g. Follow up with customer"
                            />
                          </label>

                          <label className="wa-field wa-field-full">
                            Task description
                            <textarea
                              maxLength={2000}
                              rows={2}
                              value={action.description ?? ""}
                              onChange={(event) =>
                                updateAction(index, {
                                  description: event.target.value,
                                })
                              }
                              placeholder="Add task details"
                            />
                          </label>

                          <label className="wa-field">
                            Priority
                            <select
                              value={action.priority ?? "Medium"}
                              onChange={(event) =>
                                updateAction(index, {
                                  priority: event.target.value as WorkflowAction["priority"],
                                })
                              }
                            >
                              <option value="Low">Low</option>
                              <option value="Medium">Medium</option>
                              <option value="High">High</option>
                            </select>
                          </label>

                          <label className="wa-field">
                            Due in days
                            <input
                              type="number"
                              min={0}
                              max={365}
                              value={action.due_in_days ?? 1}
                              onChange={(event) =>
                                updateAction(index, {
                                  due_in_days: Number(event.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                      )}

                      {action.action_type === "send_notification" && (
                        <div className="wa-form-grid">
                          <label className="wa-field">
                            Recipient
                            <select
                              value={action.recipient ?? "assigned_user"}
                              onChange={(event) =>
                                updateAction(index, {
                                  recipient: event.target.value as WorkflowRecipient,
                                  user_id: null,
                                })
                              }
                            >
                              {recipientOptions.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="wa-field wa-field-full">
                            Notification message <span>*</span>
                            <textarea
                              maxLength={2000}
                              rows={3}
                              value={action.message ?? ""}
                              onChange={(event) =>
                                updateAction(index, {
                                  message: event.target.value,
                                })
                              }
                              placeholder="Write the notification message"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ))}

                  {form.actions.length < 20 && (
                    <button
                      type="button"
                      className="wa-add-button"
                      onClick={() =>
                        setForm({
                          ...form,
                          actions: [...form.actions, emptyAction()],
                        })
                      }
                    >
                      ＋ Add action
                    </button>
                  )}
                </section>

                <div className="wa-inactive-note">
                  <span>ⓘ</span>
                  <p>
                    Workflows are saved as <strong>inactive</strong>. After
                    saving, activate the workflow from the list when you're
                    ready to use it.
                  </p>
                </div>
              </div>

              <div className="wa-modal-footer">
                <button
                  type="button"
                  className="wa-secondary-button"
                  onClick={closeEditor}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="wa-primary-button"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editorState === "create"
                      ? "Create workflow"
                      : "Save changes"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {historyWorkflow && (
        <div
          className="wa-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setHistoryWorkflow(null);
            }
          }}
        >
          <section
            className="wa-modal wa-history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-history-title"
          >
            <div className="wa-modal-heading">
              <div>
                <span className="wa-eyebrow">EXECUTION LOG</span>
                <h2 id="wa-history-title">{historyWorkflow.name}</h2>
                <p>Latest workflow execution records for your tenant.</p>
              </div>

              <button
                type="button"
                className="wa-close-button"
                onClick={() => setHistoryWorkflow(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="wa-history-content">
              {historyLoading ? (
                <div className="wa-empty">
                  <span className="wa-loader" /> Loading execution history...
                </div>
              ) : historyError ? (
                <div className="wa-alert wa-alert-error">{historyError}</div>
              ) : executions.length === 0 ? (
                <div className="wa-empty">
                  <h3>No executions yet</h3>
                  <p>
                    Execution records will appear here when this workflow runs.
                  </p>
                </div>
              ) : (
                <div className="wa-execution-list">
                  {executions.map((execution) => (
                    <article
                      className="wa-execution-card"
                      key={execution.id}
                    >
                      <div className="wa-execution-top">
                        <span
                          className={`wa-execution-status status-${execution.status.toLowerCase()}`}
                        >
                          {pretty(execution.status)}
                        </span>
                        <span>{formatDate(execution.started_at)}</span>
                      </div>

                      <div className="wa-execution-meta">
                        <span>
                          <strong>Module:</strong>{" "}
                          {pretty(execution.module_name)}
                        </span>
                        <span>
                          <strong>Trigger:</strong>{" "}
                          {pretty(execution.trigger_event)}
                        </span>
                        <span>
                          <strong>Record ID:</strong> {execution.record_id}
                        </span>
                      </div>

                      {execution.conditions_matched !== null && (
                        <p className="wa-condition-result">
                          Conditions matched:{" "}
                          <strong>
                            {execution.conditions_matched ? "Yes" : "No"}
                          </strong>
                        </p>
                      )}

                      {execution.error_message && (
                        <div className="wa-alert wa-alert-error">
                          {execution.error_message}
                        </div>
                      )}

                      {execution.action_results?.length > 0 && (
                        <details className="wa-action-results">
                          <summary>
                            Action results ({execution.action_results.length})
                          </summary>
                          <pre>
                            {JSON.stringify(execution.action_results, null, 2)}
                          </pre>
                        </details>
                      )}

                      {execution.completed_at && (
                        <p className="wa-completed">
                          Completed {formatDate(execution.completed_at)}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="wa-modal-footer">
              <button
                type="button"
                className="wa-secondary-button"
                onClick={() => setHistoryWorkflow(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}