import type { Activity } from "../types/activity";

/**
 * Normalizes any raw status string into one of the CRM task status categories:
 * - "completed"
 * - "in_progress"
 * - "cancelled"
 * - "pending"
 */
export const normalizeTaskStatus = (
  rawStatus?: string | null
): "completed" | "in_progress" | "cancelled" | "pending" => {
  if (!rawStatus) return "pending";
  const s = rawStatus.trim().toLowerCase();

  if (s === "completed" || s === "complete" || s === "done" || s === "finished" || s === "closed") {
    return "completed";
  }
  if (s === "cancelled" || s === "canceled") {
    return "cancelled";
  }
  if (s === "in progress" || s === "in-progress" || s === "in_progress") {
    return "in_progress";
  }
  return "pending";
};

/**
 * Checks whether an activity record represents a "Task" (as opposed to a "Meeting", "Call", etc.).
 */
export const isTask = (activity?: { activity_type?: string | null } | null): boolean => {
  if (!activity || !activity.activity_type) return false;
  return activity.activity_type.trim().toLowerCase() === "task";
};

/**
 * Checks whether a task or status is completed.
 */
export const isTaskCompleted = (
  target?: { status?: string | null } | string | null
): boolean => {
  if (!target) return false;
  const statusStr = typeof target === "string" ? target : target.status;
  return normalizeTaskStatus(statusStr) === "completed";
};

/**
 * Important Overdue Rule:
 * A task is considered overdue ONLY when:
 * 1. It is not completed (and not cancelled), AND
 * 2. Its due date/time has already passed.
 *
 * A completed task should NEVER simultaneously be counted as overdue.
 */
export const isTaskOverdue = (
  target?: { status?: string | null; due_date?: string | null } | null,
  referenceDate: Date = new Date()
): boolean => {
  if (!target || !target.due_date) return false;

  const status = normalizeTaskStatus(target.status);
  if (status === "completed" || status === "cancelled") {
    return false;
  }

  const dueDate = new Date(target.due_date);
  if (isNaN(dueDate.getTime())) return false;

  return dueDate.getTime() < referenceDate.getTime();
};

export type TaskStatusBucket = "completed" | "overdue" | "pending" | "cancelled";

/**
 * Evaluates the primary bucket for dashboard charts and filtering:
 * 
 * Conceptually:
 * if completed:
 *     Completed
 * else if dueDate < currentDateTime:
 *     Overdue
 * else:
 *     Pending
 */
export const getNormalizedTaskBucket = (
  target?: { status?: string | null; due_date?: string | null } | null,
  referenceDate: Date = new Date()
): TaskStatusBucket => {
  if (!target) return "pending";

  const status = normalizeTaskStatus(target.status);
  if (status === "completed") {
    return "completed";
  }
  if (status === "cancelled") {
    return "cancelled";
  }
  if (isTaskOverdue(target, referenceDate)) {
    return "overdue";
  }
  return "pending";
};

export interface TaskSummaryStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
}

/**
 * Calculates dashboard and task overview statistics across an activity array.
 * Ensures consistent filtering (only tasks of type 'Task') and mutual exclusivity
 * between completed, pending, and overdue.
 */
export const calculateTaskSummary = (
  activities: (Activity | { activity_type?: string | null; status?: string | null; due_date?: string | null })[],
  referenceDate: Date = new Date()
): TaskSummaryStats => {
  let completed = 0;
  let pending = 0;
  let overdue = 0;

  for (const item of activities) {
    if (!isTask(item)) continue;

    const bucket = getNormalizedTaskBucket(item, referenceDate);
    if (bucket === "completed") {
      completed++;
    } else if (bucket === "overdue") {
      overdue++;
    } else if (bucket === "pending") {
      pending++;
    }
  }

  return {
    total: completed + pending + overdue,
    completed,
    pending,
    overdue,
  };
};

/**
 * Filters a task list by a status bucket query param (e.g. "completed", "pending", "overdue").
 */
export const matchesStatusFilter = (
  task: Activity,
  filterValue: string,
  referenceDate: Date = new Date()
): boolean => {
  if (!filterValue) return true;
  const f = filterValue.trim().toLowerCase();

  if (f === "overdue") {
    return getNormalizedTaskBucket(task, referenceDate) === "overdue";
  }
  if (f === "completed") {
    return getNormalizedTaskBucket(task, referenceDate) === "completed";
  }
  if (f === "pending") {
    return getNormalizedTaskBucket(task, referenceDate) === "pending";
  }
  if (f === "in progress" || f === "in-progress" || f === "in_progress") {
    return normalizeTaskStatus(task.status) === "in_progress";
  }
  if (f === "cancelled" || f === "canceled") {
    return normalizeTaskStatus(task.status) === "cancelled";
  }

  return normalizeTaskStatus(task.status) === normalizeTaskStatus(filterValue);
};
