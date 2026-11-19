import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  BellIcon,
  CheckCheckIcon,
  InboxIcon,
  CalculatorIcon,
  FileSignatureIcon,
  FolderKanbanIcon,
  ReceiptIcon,
  LifeBuoyIcon,
  FileTextIcon,
  HomeIcon,
  BuildingIcon,
  ArrowRightIcon,
} from '../common/SupportPortalIcons';
import {
  PortalNotification,
  NotificationFilterTab,
} from '../../types/customerPortalNotifications';
import {
  CustomerPortalNotificationService,
  PORTAL_NOTIFICATIONS_UPDATED_EVENT,
} from '../../services/customerPortalNotificationService';
import { parseBackendDate } from '../../utils/bookingJourney';
import { getApiErrorMessage } from '../../utils/apiError';
import './CustomerPortalNotifications.css';

/** Unread badge polling interval (cheap GET /notifications/unread-count). */
const UNREAD_POLL_MS = 60_000;

interface CustomerPortalNotificationsProps {
  currentTenantId?: string;
}

export const getCategoryIcon = (category: PortalNotification['category'], size = 18) => {
  switch (category) {
    case 'estimates':
      return <CalculatorIcon size={size} />;
    case 'contracts':
      return <FileSignatureIcon size={size} />;
    case 'projects':
      return <FolderKanbanIcon size={size} />;
    case 'invoices':
      return <ReceiptIcon size={size} />;
    case 'support':
      return <LifeBuoyIcon size={size} />;
    case 'documents':
      return <FileTextIcon size={size} />;
    case 'bookings':
      return <HomeIcon size={size} />;
    case 'visits':
      return <BuildingIcon size={size} />;
    default:
      return <FileTextIcon size={size} />;
  }
};

export const formatRelativeTime = (isoString: string): string => {
  try {
    // The API returns naive UTC timestamps; parseBackendDate treats them as UTC.
    const timestamp = parseBackendDate(isoString)?.getTime();
    if (timestamp === undefined) return 'Recently';
    const diff = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 172800) return 'Yesterday';
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return 'Recently';
  }
};

export const CustomerPortalNotifications: React.FC<CustomerPortalNotificationsProps> = ({
  currentTenantId = 'default',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationFilterTab>('all');
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  /** Lightweight refresh of the bell badge only. A failure keeps the previous count. */
  const refreshUnreadCount = useCallback(async () => {
    try {
      setUnreadCount(await CustomerPortalNotificationService.getUnreadCount());
    } catch {
      /* keep the last known count */
    }
  }, []);

  /** Full list refresh (dropdown). A failure keeps the previously loaded list. */
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await CustomerPortalNotificationService.getNotifications(30, 0);
      setNotifications(result.items);
      setUnreadCount(result.unreadCount);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not load notifications.'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Badge: load on mount / workspace change, poll, and refresh on focus or when something changed.
  useEffect(() => {
    void refreshUnreadCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshUnreadCount();
    }, UNREAD_POLL_MS);

    const handleChanged = () => {
      void refreshUnreadCount();
      if (isOpenRef.current) void loadNotifications();
    };
    const handleVisible = () => {
      if (document.visibilityState === 'visible') void refreshUnreadCount();
    };

    window.addEventListener(PORTAL_NOTIFICATIONS_UPDATED_EVENT, handleChanged);
    window.addEventListener('portal:workspace-switched', handleChanged);
    document.addEventListener('visibilitychange', handleVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(PORTAL_NOTIFICATIONS_UPDATED_EVENT, handleChanged);
      window.removeEventListener('portal:workspace-switched', handleChanged);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [currentTenantId, refreshUnreadCount, loadNotifications]);

  // Opening the dropdown always fetches the latest list.
  useEffect(() => {
    if (isOpen) void loadNotifications();
  }, [isOpen, loadNotifications]);

  // Click outside and Escape key handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const filteredNotifications =
    activeTab === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await CustomerPortalNotificationService.markAsRead(id);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not mark the notification as read.'));
    }
  };

  const handleMarkAllAsRead = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await CustomerPortalNotificationService.markAllAsRead();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not mark notifications as read.'));
    }
  };

  const handleItemClick = async (notification: PortalNotification) => {
    setIsOpen(false);
    if (!notification.read) {
      try {
        await CustomerPortalNotificationService.markAsRead(notification.id);
      } catch {
        /* navigation still proceeds; the badge stays accurate on next refresh */
      }
    }
    const link = await CustomerPortalNotificationService.resolveLink(notification);
    if (link) navigate(link);
  };

  return (
    <div className="cp-notif-wrapper" ref={containerRef}>
      {/* Header Notification Bell Button */}
      <button
        type="button"
        className={`cp-notif-bell-btn ${isOpen ? 'active' : ''}`}
        onClick={handleToggle}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'Notifications'}
      >
        <BellIcon size={19} />
        {unreadCount > 0 && (
          <span className="cp-notif-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="cp-notif-dropdown" role="dialog" aria-label="Notifications panel">
          {/* Dropdown Header */}
          <div className="cp-notif-header">
            <div className="cp-notif-title-area">
              <h3 className="cp-notif-title">Notifications</h3>
              {unreadCount > 0 && (
                <span className="cp-notif-count-pill">
                  {unreadCount} new
                </span>
              )}
            </div>
            <button
              type="button"
              className="cp-notif-mark-all-btn"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
              title="Mark all notifications as read"
            >
              <CheckCheckIcon size={14} />
              <span>Mark all read</span>
            </button>
          </div>

          {/* Filter Tabs */}
          <div className="cp-notif-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              className={`cp-notif-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'unread'}
              className={`cp-notif-tab ${activeTab === 'unread' ? 'active' : ''}`}
              onClick={() => setActiveTab('unread')}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notifications List */}
          <div className="cp-notif-list" role="list" aria-busy={loading}>
            {error && (
              <div className="cp-notif-empty" role="alert">
                <h4 className="cp-notif-empty-title">Something went wrong</h4>
                <p className="cp-notif-empty-desc">{error}</p>
                <button type="button" className="cp-notif-mark-all-btn" onClick={() => void loadNotifications()}>
                  <span>Retry</span>
                </button>
              </div>
            )}
            {loading && notifications.length === 0 && !error ? (
              <div className="cp-notif-empty">
                <p className="cp-notif-empty-desc">Loading notifications…</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              !error && (
                <div className="cp-notif-empty">
                  <div className="cp-notif-empty-icon">
                    <InboxIcon size={22} />
                  </div>
                  <h4 className="cp-notif-empty-title">
                    {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                  </h4>
                  <p className="cp-notif-empty-desc">
                    {activeTab === 'unread'
                      ? "You're all caught up! Check the 'All' tab for past activity."
                      : 'Updates about your site visits and booking requests will appear here.'}
                  </p>
                </div>
              )
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`cp-notif-item ${!notif.read ? 'unread' : 'read'}`}
                  onClick={() => handleItemClick(notif)}
                  role="listitem"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleItemClick(notif);
                    }
                  }}
                >
                  {/* Category Icon Avatar */}
                  <div className={`cp-notif-icon-avatar cp-notif-icon-${notif.category}`}>
                    {getCategoryIcon(notif.category, 18)}
                  </div>

                  {/* Notification Content */}
                  <div className="cp-notif-content">
                    <div className="cp-notif-row-top">
                      <h4 className="cp-notif-item-title">{notif.title}</h4>
                      <span className="cp-notif-time">{formatRelativeTime(notif.timestamp)}</span>
                    </div>
                    <p className="cp-notif-message">{notif.message}</p>
                    <div className="cp-notif-row-bottom">
                      <span className="cp-notif-category-tag">{notif.category}</span>
                      {notif.priority && notif.priority !== 'normal' && (
                        <span className={`cp-notif-priority-tag ${notif.priority}`}>
                          {notif.priority}
                        </span>
                      )}
                      {notif.actionText && (
                        <span className="cp-notif-action-indicator">
                          {notif.actionText}
                          <ArrowRightIcon size={12} />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mark as read quick toggle */}
                  {!notif.read && (
                    <button
                      type="button"
                      className="cp-notif-item-dot-btn"
                      onClick={(e) => handleMarkAsRead(notif.id, e)}
                      title="Mark as read"
                      aria-label="Mark as read"
                    >
                      <CheckCheckIcon size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer View All Link */}
          <div className="cp-notif-footer">
            <Link
              to="/portal/notifications"
              className="cp-notif-view-all-btn"
              onClick={() => setIsOpen(false)}
            >
              <span>View all notifications</span>
              <ArrowRightIcon size={13} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerPortalNotifications;

