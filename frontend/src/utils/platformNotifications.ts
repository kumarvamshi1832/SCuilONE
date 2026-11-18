import type { NotificationItem } from "../services/notificationService";

/**
 * Presentation helpers for platform notifications.
 *
 * Categories are derived ONLY from the `notification_type` / `related_module` values the backend
 * actually emits for platform recipients:
 *   security_alert, security  (related_module platform_security)  -> Security & Audit
 *   technical_incident_*      (related_module platform_technical) -> Support & Operations
 *   platform_onboarding                                           -> Platform Governance
 * Anything else is shown under "General" rather than being forced into a category.
 */

export type NotificationCategory =
  | "Security & Audit"
  | "Support & Operations"
  | "Platform Governance"
  | "General";

export type NotificationIconKey = "security" | "operations" | "governance" | "general";

export interface NotificationDestination {
  to: string;
  label: string;
}

export function classifyNotification(item: Pick<NotificationItem, "notification_type" | "related_module">): {
  category: NotificationCategory;
  icon: NotificationIconKey;
} {
  const type = (item.notification_type || "").toLowerCase();
  const module = (item.related_module || "").toLowerCase();

  if (module === "platform_security" || type === "security" || type.startsWith("security_")) {
    return { category: "Security & Audit", icon: "security" };
  }
  if (module === "platform_technical" || type.startsWith("technical_incident")) {
    return { category: "Support & Operations", icon: "operations" };
  }
  if (type === "platform_onboarding") {
    return { category: "Platform Governance", icon: "governance" };
  }
  return { category: "General", icon: "general" };
}

/**
 * Existing page a notification can open, or null. A destination is offered only when the session
 * holds the permission that page requires; this never grants access (the page and API still enforce it).
 */
export function resolveNotificationDestination(
  item: Pick<NotificationItem, "notification_type" | "related_module">,
  hasPermission: (permission: string) => boolean
): NotificationDestination | null {
  const { icon } = classifyNotification(item);
  if (icon === "security" && hasPermission("platform.security.view")) {
    return { to: "/platform/operations?tab=security", label: "Open security events" };
  }
  if (icon === "operations" && hasPermission("platform.technical.view")) {
    return { to: "/platform/operations", label: "Open technical operations" };
  }
  if (icon === "governance") {
    return { to: "/platform/profile", label: "Open my profile" };
  }
  return null;
}

export function formatNotificationTime(iso: string): { relative: string; absolute: string } {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { relative: "", absolute: iso };
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  let relative: string;
  if (mins < 1) relative = "Just now";
  else if (mins < 60) relative = `${mins}m ago`;
  else if (mins < 1440) relative = `${Math.round(mins / 60)}h ago`;
  else if (mins < 10080) relative = `${Math.round(mins / 1440)}d ago`;
  else relative = date.toLocaleDateString();
  return { relative, absolute: date.toLocaleString() };
}
