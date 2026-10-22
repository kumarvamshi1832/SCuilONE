
export type WorkflowModule = "leads" | "contacts" | "accounts" | "deals";

export type WorkflowTrigger =
  | "record_created"
  | "record_updated"
  | "field_changed";

export type ConditionLogic = "AND" | "OR";

export type ConditionOperator =
  | "is"
  | "is_not"
  | "contains"
  | "does_not_contain"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "is_empty"
  | "is_not_empty";

export type WorkflowActionType =
  | "assign_owner"
  | "update_field"
  | "create_task"
  | "send_notification";

export type WorkflowRecipient =
  | "assigned_user"
  | "record_creator"
  | "workflow_creator";

export type TaskPriority = "Low" | "Medium" | "High";

export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
}

export interface WorkflowAction {
  action_type: WorkflowActionType;
  user_id?: string | null;
  recipient?: WorkflowRecipient | null;
  field?: string | null;
  value?: unknown;
  title?: string | null;
  description?: string | null;
  priority?: TaskPriority;
  due_in_days?: number | null;
  message?: string | null;
}

export interface Workflow {
  id: string;
  tenant_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  module_name: WorkflowModule;
  trigger_event: WorkflowTrigger;
  condition_logic: ConditionLogic;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCreateRequest {
  name: string;
  description?: string | null;
  module_name: WorkflowModule;
  trigger_event: WorkflowTrigger;
  condition_logic: ConditionLogic;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active?: boolean;
}

export type WorkflowUpdateRequest = Partial<
  Omit<WorkflowCreateRequest, "is_active">
>;

export interface WorkflowExecution {
  id: string;
  tenant_id: string;
  workflow_id: string | null;
  workflow_name: string;
  module_name: string;
  record_id: string;
  trigger_event: string;
  status: string;
  conditions_matched: boolean | null;
  action_results: Record<string, unknown>[];
  error_message: string | null;
  idempotency_key: string | null;
  started_at: string;
  completed_at: string | null;
}
