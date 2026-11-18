import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { hasPlatformPermission } from "../../../services/platformApiClient";
import type { NotificationItem } from "../../../services/platformNotificationService";
import NotificationPanel, { type NotificationFilter } from "./NotificationPanel";
import { usePlatformNotifications } from "./usePlatformNotifications";
import "./PlatformNotifications.css";

/**
 * Shared notification bell for every platform dashboard (rendered once, in PlatformLayout).
 * `identityKey` must be the signed-in user's id so state never leaks between sessions.
 */
export default function NotificationBell({ identityKey }: { identityKey: string }) {
  const navigate = useNavigate();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const n = usePlatformNotifications(identityKey, open);

  // A different signed-in user always starts with a closed panel and the default filter.
  useEffect(() => {
    setOpen(false);
    setFilter("all");
  }, [identityKey]);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Click outside + Escape close the panel; listeners exist only while it is open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const unread = n.unread ?? 0;
  const label =
    unread > 0
      ? `Notifications, ${unread} unread`
      : "Notifications, no unread notifications";

  const handleNavigate = (to: string, item: NotificationItem) => {
    void n.markRead(item.id);
    close(false);
    navigate(to);
  };

  return (
    <div className="pnc-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`platform-icon-btn pnc-bell${unread > 0 ? " has-unread" : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={16} aria-hidden="true" />
        {unread > 0 && (
          <span className="pnc-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          ref={panelRef}
          id={panelId}
          items={n.items}
          unread={n.unread}
          total={n.total}
          filter={filter}
          loading={n.loading}
          loadingMore={n.loadingMore}
          hasMore={n.hasMore}
          error={n.error}
          actionError={n.actionError}
          hasPermission={hasPlatformPermission}
          onFilterChange={setFilter}
          onClose={() => close(true)}
          onMarkAllRead={() => void n.markAllRead()}
          onRetry={() => void n.reload()}
          onLoadMore={() => void n.loadMore()}
          onOpenItem={(item) => void n.markRead(item.id)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}
