import type { ActivityStatus, ActivityType } from "../types/activity";

/**
 * Backend Task Status Transitions:
 * - Pending -> In Progress, Cancelled (or Pending if unchanged)
 * - In Progress -> Pending, Completed, Cancelled (or In Progress if unchanged)
 * - Completed -> terminal (no transitions)
 * - Cancelled -> terminal (no transitions)
 */
export const TASK_ALLOWED_TRANSITIONS: Record<ActivityStatus, Set<ActivityStatus>> = {
  Pending: new Set<ActivityStatus>(["Pending", "In Progress", "Cancelled"]),
  "In Progress": new Set<ActivityStatus>(["In Progress", "Pending", "Completed", "Cancelled"]),
  Completed: new Set<ActivityStatus>(["Completed"]),
  Cancelled: new Set<ActivityStatus>(["Cancelled"]),
};

export const ALL_ACTIVITY_STATUSES: ActivityStatus[] = [
  "Pending",
  "In Progress",
  "Completed",
  "Cancelled",
];

export function getAllowedStatuses(
  activityType: ActivityType,
  currentStatus?: ActivityStatus | null,
  isEdit = false
): ActivityStatus[] {
  // If not a Task (i.e. Call or Meeting), all statuses are freely selectable
  if (activityType !== "Task") {
    return ALL_ACTIVITY_STATUSES;
  }

  // If creating a new Task, allow selecting from all statuses (usually starting with Pending)
  if (!isEdit || !currentStatus) {
    return ALL_ACTIVITY_STATUSES;
  }

  const allowedSet = TASK_ALLOWED_TRANSITIONS[currentStatus];
  if (!allowedSet) {
    return ALL_ACTIVITY_STATUSES;
  }

  return ALL_ACTIVITY_STATUSES.filter((st) => allowedSet.has(st));
}

export function isStatusTransitionAllowed(
  activityType: ActivityType,
  fromStatus: ActivityStatus,
  toStatus: ActivityStatus
): boolean {
  if (activityType !== "Task") return true;
  if (fromStatus === toStatus) return true;

  const allowedSet = TASK_ALLOWED_TRANSITIONS[fromStatus];
  return allowedSet ? allowedSet.has(toStatus) : true;
}

export function isTaskTerminal(status: ActivityStatus): boolean {
  return status === "Completed" || status === "Cancelled";
}

