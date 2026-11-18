import { forwardRef, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  ChevronDown,
  CircleAlert,
  Loader2,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import type { NotificationItem } from "../../../services/platformNotificationService";
import {
  classifyNotification,
  formatNotificationTime,
  resolveNotificationDestination,
  type NotificationIconKey,
} from "../../../utils/platformNotifications";

export type NotificationFilter = "all" | "unread" | "read";

const ICONS: Record<NotificationIconKey, typeof Bell> = {
  security: ShieldAlert,
  operations: ServerCog,
  governance: UserPlus,
  general: Bell,
};

const FILTERS: { key: NotificationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "read", label: "Read" },
];

export interface NotificationPanelProps {
  id: string;
  items: NotificationItem[];
  unread: number | null;
  total: number;
  filter: NotificationFilter;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  actionError: string | null;
  hasPermission: (permission: string) => boolean;
  onFilterChange: (filter: NotificationFilter) => void;
  onClose: () => void;
  onMarkAllRead: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onOpenItem: (item: NotificationItem) => void;
  onNavigate: (to: string, item: NotificationItem) => void;
}

const NotificationPanel = forwardRef<HTMLDivElement, NotificationPanelProps>(
  function NotificationPanel(props, ref) {
    const {
      id,
      items,
      unread,
      total,
      filter,
      loading,
      loadingMore,
      hasMore,
      error,
      actionError,
      hasPermission,
      onFilterChange,
      onClose,
      onMarkAllRead,
      onRetry,
      onLoadMore,
      onOpenItem,
      onNavigate,
    } = props;
    const [expandedId, setExpandedId] = useState<string | null>(null);
    // Rows opened while viewing "Unread" stay listed until the filter changes, so a row does not
    // disappear from under the cursor the moment it is marked read.
    const [openedInView, setOpenedInView] = useState<Set<string>>(new Set());
    useEffect(() => setOpenedInView(new Set()), [filter]);

    const visible = items.filter((n) =>
      filter === "unread"
        ? !n.is_read || openedInView.has(n.id)
        : filter === "read"
        ? n.is_read
        : true
    );
    const unreadCount = unread ?? 0;

    const emptyMessage =
      filter === "unread"
        ? "You're all caught up — no unread notifications."
        : filter === "read"
        ? "No read notifications yet."
        : "You have no notifications.";

    return (
      <div
        ref={ref}
        id={id}
        className="pnc-panel"
        role="dialog"
        aria-label="Notifications"
        tabIndex={-1}
      >
        <header className="pnc-head">
          <div className="pnc-title">
            <h2>Notifications</h2>
            <span className="pnc-sub" aria-live="polite">
              {unread === null ? "" : unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </span>
          </div>
          <div className="pnc-head-actions">
            <button
              type="button"
              className="pnc-text-btn"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={14} aria-hidden="true" />
              <span>Mark all as read</span>
            </button>
            <button
              type="button"
              className="pnc-icon-btn"
              onClick={onClose}
              aria-label="Close notifications"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="pnc-filters" role="group" aria-label="Filter notifications">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`pnc-filter${filter === f.key ? " active" : ""}`}
              aria-pressed={filter === f.key}
              onClick={() => onFilterChange(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {actionError && (
          <div className="pnc-banner" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            <span>{actionError}</span>
          </div>
        )}
        {error && items.length > 0 && (
          <div className="pnc-banner" role="alert">
            <CircleAlert size={14} aria-hidden="true" />
            <span>{error}</span>
            <button type="button" className="pnc-banner-retry" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}

        <div className="pnc-body">
          {loading && items.length === 0 ? (
            <div className="pnc-state" aria-busy="true">
              <Loader2 size={20} className="pnc-spin" aria-hidden="true" />
              <p>Loading notifications…</p>
            </div>
          ) : error && items.length === 0 ? (
            <div className="pnc-state" role="alert">
              <CircleAlert size={20} aria-hidden="true" />
              <p>{error}</p>
              <button type="button" className="pnc-text-btn" onClick={onRetry}>
                <RefreshCw size={14} aria-hidden="true" />
                <span>Try again</span>
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="pnc-state">
              <BellOff size={22} aria-hidden="true" />
              <p>{emptyMessage}</p>
            </div>
          ) : (
            <ul className="pnc-list">
              {visible.map((n) => {
                const { category, icon } = classifyNotification(n);
                const Icon = ICONS[icon];
                const time = formatNotificationTime(n.created_at);
                const destination = resolveNotificationDestination(n, hasPermission);
                const expanded = expandedId === n.id;
                return (
                  <li key={n.id} className={`pnc-item${n.is_read ? "" : " unread"}`}>
                    <button
                      type="button"
                      className="pnc-item-main"
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedId(expanded ? null : n.id);
                        if (!n.is_read) {
                          setOpenedInView((prev) => new Set(prev).add(n.id));
                          onOpenItem(n);
                        }
                      }}
                    >
                      <span className={`pnc-item-icon cat-${icon}`} aria-hidden="true">
                        <Icon size={16} />
                      </span>
                      <span className="pnc-item-text">
                        <span className="pnc-item-title">
                          {!n.is_read && <span className="pnc-dot" aria-label="Unread" />}
                          {n.title}
                        </span>
                        <span className={`pnc-item-msg${expanded ? " expanded" : ""}`}>{n.message}</span>
                        <span className="pnc-item-meta">
                          <span className="pnc-cat">{category}</span>
                          <time dateTime={n.created_at} title={time.absolute}>
                            {time.relative}
                          </time>
                          <span className="pnc-status">{n.is_read ? "Read" : "Unread"}</span>
                        </span>
                      </span>
                      <ChevronDown
                        size={15}
                        className={`pnc-chevron${expanded ? " open" : ""}`}
                        aria-hidden="true"
                      />
                    </button>
                    {expanded && (
                      <div className="pnc-item-detail">
                        <span className="pnc-full-time">{time.absolute}</span>
                        {destination && (
                          <button
                            type="button"
                            className="pnc-action"
                            onClick={() => onNavigate(destination.to, n)}
                          >
                            {destination.label}
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {hasMore && !loading && (
            <div className="pnc-more">
              <button
                type="button"
                className="pnc-text-btn"
                onClick={onLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <Loader2 size={14} className="pnc-spin" aria-hidden="true" /> : null}
                <span>{loadingMore ? "Loading…" : `Load more (${items.length} of ${total})`}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

export default NotificationPanel;
