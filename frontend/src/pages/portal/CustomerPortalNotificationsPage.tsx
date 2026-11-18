import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CheckCheckIcon,
  InboxIcon,
  SearchIcon,
  RefreshIcon,
  CheckIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  XIcon,
  AlertCircleIcon,
} from '../../components/common/SupportPortalIcons';
import {
  getCategoryIcon,
  formatRelativeTime,
} from '../../components/portal/CustomerPortalNotifications';
import {
  PortalNotification,
  NotificationCategory,
} from '../../types/customerPortalNotifications';
import {
  CustomerPortalNotificationService,
  PORTAL_NOTIFICATIONS_UPDATED_EVENT,
} from '../../services/customerPortalNotificationService';
import { getApiErrorMessage } from '../../utils/apiError';
import './CustomerPortalNotificationsPage.css';

type PageFilterTab = 'all' | 'unread' | 'read';

const PAGE_LIMIT = 100; // backend maximum per request

const CATEGORY_LABELS: Record<Exclude<NotificationCategory, 'all'>, string> = {
  estimates: 'Estimates & Proposals',
  contracts: 'Contracts',
  projects: 'Software Projects',
  invoices: 'Invoices & Billing',
  support: 'Support & Tickets',
  documents: 'Documents',
  bookings: 'Bookings',
  visits: 'Site Visits',
};

export default function CustomerPortalNotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [serverUnread, setServerUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<PageFilterTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await CustomerPortalNotificationService.getNotifications(PAGE_LIMIT, 0);
      setNotifications(result.items);
      setTotal(result.total);
      setServerUnread(result.unreadCount);
      setSelectedIds(new Set());
    } catch (err) {
      // Keep whatever was loaded before; just surface the failure.
      setError(getApiErrorMessage(err, 'Failed to load your notifications.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();

    const handleChanged = () => {
      void loadNotifications();
    };
    window.addEventListener(PORTAL_NOTIFICATIONS_UPDATED_EVENT, handleChanged);
    window.addEventListener('portal:workspace-switched', handleChanged);
    return () => {
      window.removeEventListener(PORTAL_NOTIFICATIONS_UPDATED_EVENT, handleChanged);
      window.removeEventListener('portal:workspace-switched', handleChanged);
    };
  }, [loadNotifications]);

  const categories = useMemo(() => {
    const present = Array.from(new Set(notifications.map((n) => n.category)));
    return [
      { label: 'All Categories', value: 'all' as const },
      ...present.map((value) => ({ label: CATEGORY_LABELS[value] ?? value, value })),
    ];
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (activeTab === 'unread' && item.read) return false;
      if (activeTab === 'read' && !item.read) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          item.title?.toLowerCase().includes(q) ||
          item.message?.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [notifications, activeTab, selectedCategory, search]);

  const loadedUnread = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const unreadCount = serverUnread || loadedUnread;

  const runAction = async (action: () => Promise<unknown>, failure: string) => {
    setActionBusy(true);
    setError(null);
    try {
      await action();
      await loadNotifications();
    } catch (err) {
      setError(getApiErrorMessage(err, failure));
    } finally {
      setActionBusy(false);
    }
  };

  const handleMarkAllRead = () =>
    runAction(() => CustomerPortalNotificationService.markAllAsRead(), 'Could not mark all notifications as read.');

  const handleMarkSelectedRead = () => {
    const ids = Array.from(selectedIds).filter((id) => notifications.find((n) => n.id === id && !n.read));
    if (ids.length === 0) {
      setSelectedIds(new Set());
      return;
    }
    return runAction(
      () => Promise.all(ids.map((id) => CustomerPortalNotificationService.markAsRead(id))),
      'Could not mark the selected notifications as read.'
    );
  };

  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredNotifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
    }
  };

  const handleNotificationClick = async (item: PortalNotification) => {
    if (!item.read) {
      try {
        await CustomerPortalNotificationService.markAsRead(item.id);
      } catch (err) {
        setError(getApiErrorMessage(err, 'Could not mark the notification as read.'));
      }
    }
    const link = await CustomerPortalNotificationService.resolveLink(item);
    if (link) navigate(link);
  };

  return (
    <div className="cp-notif-page">
      {/* Page Header */}
      <div className="cp-notif-page-header">
        <div className="cp-notif-page-title-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <Link to="/portal/dashboard" className="cp-notif-page-btn" style={{ padding: '6px 10px' }}>
              <ArrowLeftIcon size={16} />
              <span>Dashboard</span>
            </Link>
            <h1 style={{ margin: 0 }}>Notifications Center</h1>
            {unreadCount > 0 && (
              <span className="cp-notif-badge" style={{ background: 'var(--cp-primary)', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="cp-notif-page-subtitle">
            Updates from your sales team about your site visits, booking requests, payments and agreements.
          </p>
        </div>

        <div className="cp-notif-page-actions">
          <button
            type="button"
            className="cp-notif-page-btn"
            onClick={() => void loadNotifications()}
            disabled={loading || actionBusy}
            title="Refresh notifications"
          >
            <RefreshIcon size={15} />
            <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              className="cp-notif-page-btn primary"
              onClick={() => void handleMarkAllRead()}
              disabled={actionBusy}
            >
              <CheckCheckIcon size={15} />
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="support-alert error" role="alert" style={{ marginBottom: 12 }}>
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button type="button" className="cp-notif-page-btn" style={{ marginLeft: 'auto' }} onClick={() => void loadNotifications()}>
            Retry
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="cp-notif-filter-bar">
        <div className="cp-notif-filter-top-row">
          <div className="cp-notif-search-box">
            <SearchIcon size={16} className="cp-notif-search-icon" />
            <input
              type="text"
              className="cp-notif-search-input"
              placeholder="Search notifications by title or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--cp-text-muted)',
                }}
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          <div className="cp-notif-read-tabs">
            <button
              type="button"
              className={`cp-notif-read-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All ({total || notifications.length})
            </button>
            <button
              type="button"
              className={`cp-notif-read-tab ${activeTab === 'unread' ? 'active' : ''}`}
              onClick={() => setActiveTab('unread')}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              className={`cp-notif-read-tab ${activeTab === 'read' ? 'active' : ''}`}
              onClick={() => setActiveTab('read')}
            >
              Read ({Math.max(0, (total || notifications.length) - unreadCount)})
            </button>
          </div>
        </div>

        {/* Category Chips (only categories present in the customer's notifications) */}
        {categories.length > 2 && (
          <div className="cp-notif-category-chips">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                className={`cp-notif-chip ${selectedCategory === cat.value ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.value)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Bulk Selection Actions */}
        {selectedIds.size > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--cp-surface-2)',
              borderRadius: 8,
              border: '1px solid var(--cp-border)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {selectedIds.size} of {filteredNotifications.length} selected
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="cp-notif-page-btn" onClick={handleSelectAll}>
                <span>{selectedIds.size === filteredNotifications.length ? 'Deselect All' : 'Select All'}</span>
              </button>
              <button
                type="button"
                className="cp-notif-page-btn"
                onClick={() => void handleMarkSelectedRead()}
                disabled={actionBusy}
              >
                <CheckIcon size={14} />
                <span>Mark Selected as Read</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="cp-notif-page-list" aria-busy={loading}>
        {loading && notifications.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'var(--cp-card-bg)',
              borderRadius: 12,
              border: '1px solid var(--cp-border)',
              color: 'var(--cp-text-muted)',
            }}
          >
            Loading notifications…
          </div>
        ) : filteredNotifications.length === 0 ? (
          !error && (
            <div
              style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: 'var(--cp-card-bg)',
                borderRadius: 12,
                border: '1px solid var(--cp-border)',
              }}
            >
              <InboxIcon size={44} style={{ color: 'var(--cp-text-muted)', marginBottom: 12, opacity: 0.6 }} />
              <h3 style={{ margin: '0 0 6px 0', fontSize: 18, color: 'var(--cp-text)' }}>
                {notifications.length === 0 ? 'No notifications yet' : 'No notifications found'}
              </h3>
              <p style={{ margin: 0, color: 'var(--cp-text-muted)', fontSize: 14 }}>
                {search || selectedCategory !== 'all' || activeTab !== 'all'
                  ? 'Try adjusting your filters or search keywords.'
                  : 'Updates about your site visits and booking requests will appear here.'}
              </p>
            </div>
          )
        ) : (
          filteredNotifications.map((item) => {
            const clickable = Boolean(
              item.related_module && ['customer_booking_requests', 'bookings', 'site_visits'].includes(item.related_module)
            );
            return (
              <div
                key={item.id}
                className={`cp-notif-card ${!item.read ? 'unread' : ''}`}
                onClick={() => void handleNotificationClick(item)}
                style={{ cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(item.id)}
                  onClick={(e) => handleToggleSelect(item.id, e)}
                  onChange={() => {}}
                  aria-label={`Select notification ${item.title}`}
                  style={{ marginTop: 12, cursor: 'pointer' }}
                />

                <div
                  className="cp-notif-card-avatar"
                  style={{
                    background: 'rgba(50, 133, 246, 0.12)',
                    color: 'var(--cp-primary)',
                  }}
                >
                  {getCategoryIcon(item.category, 20)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: item.read ? 600 : 700, color: 'var(--cp-text)' }}>
                        {item.title}
                      </h3>
                      {!item.read && (
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--cp-primary)',
                            display: 'inline-block',
                          }}
                        />
                      )}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--cp-text-muted)', whiteSpace: 'nowrap' }}>
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>

                  <p style={{ margin: '0 0 8px 0', fontSize: 13.5, color: 'var(--cp-text-muted)', lineHeight: 1.45 }}>
                    {item.message}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'var(--cp-surface-2)',
                        color: 'var(--cp-text-muted)',
                      }}
                    >
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>

                    {clickable && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--cp-primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <span>{item.actionText || 'View Details'}</span>
                        <ExternalLinkIcon size={12} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {total > notifications.length && (
        <p style={{ textAlign: 'center', color: 'var(--cp-text-muted)', fontSize: 13, marginTop: 12 }}>
          Showing the latest {notifications.length} of {total} notifications.
        </p>
      )}
    </div>
  );
}
