import type { SoftwareTimeEntry, BillingStatus } from "../types/softwareTimeEntry";

export type SoftwareTimeAction = "view" | "approve_billing" | "stop_timer";

export interface TimeEntryActionEligibility {
  canView: boolean;
  canApproveBilling: boolean;
  canStopTimer: boolean;
  isBillable: boolean;
  billingStatus: BillingStatus;
  eligibleActions: SoftwareTimeAction[];
}

export function isEntryBillable(entry: SoftwareTimeEntry | any): boolean {
  if (!entry) return false;
  const val = entry.is_billable !== undefined ? entry.is_billable : entry.billable;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes";
  }
  if (typeof val === "number") return val === 1;
  return Boolean(val);
}

export function normalizeBillingStatus(status: any): BillingStatus {
  const s = String(status || "").trim().toLowerCase();
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";
  return "Unreviewed";
}

export function isEntryActiveTimer(entry: SoftwareTimeEntry | any): boolean {
  if (!entry) return false;
  const src = String(entry.source || "").trim().toLowerCase();
  return src === "timer" && Boolean(entry.started_at) && !entry.stopped_at;
}


export function isEntryCompleted(entry: SoftwareTimeEntry | any): boolean {
  if (!entry) return false;
  return !isEntryActiveTimer(entry);
}

export function getTimeEntryActionEligibility(
  entry: SoftwareTimeEntry | null | undefined,
  currentUserId?: string | null,
  canUpdateContracts: boolean = true
): TimeEntryActionEligibility {
  if (!entry) {
    return {
      canView: false,
      canApproveBilling: false,
      canStopTimer: false,
      isBillable: false,
      billingStatus: "Unreviewed",
      eligibleActions: [],
    };
  }

  const isBillable = isEntryBillable(entry);
  const status = normalizeBillingStatus(entry.billing_status);
  const activeTimer = isEntryActiveTimer(entry);
  const isCompleted = isEntryCompleted(entry);

  if (activeTimer) {
    const isOwner = Boolean(
      currentUserId &&
      String(entry.user_id).trim().toLowerCase() === String(currentUserId).trim().toLowerCase()
    );
    const actions: SoftwareTimeAction[] = ["view"];
    if (isOwner) {
      actions.push("stop_timer");
    }
    return {
      canView: true,
      canApproveBilling: false,
      canStopTimer: isOwner,
      isBillable,
      billingStatus: status,
      eligibleActions: actions,
    };
  }

  if (isBillable && status === "Unreviewed" && isCompleted) {
    const canApprove = Boolean(canUpdateContracts);
    const actions: SoftwareTimeAction[] = ["view"];
    if (canApprove) {
      actions.push("approve_billing");
    }
    return {
      canView: true,
      canApproveBilling: canApprove,
      canStopTimer: false,
      isBillable,
      billingStatus: status,
      eligibleActions: actions,
    };
  }

  return {
    canView: true,
    canApproveBilling: false,
    canStopTimer: false,
    isBillable,
    billingStatus: status,
    eligibleActions: ["view"],
  };
}

