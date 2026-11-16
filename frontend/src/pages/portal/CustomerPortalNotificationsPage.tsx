import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  CheckCheckIcon,
  InboxIcon,
  SearchIcon,
  RefreshIcon,
  TrashIcon,
  CheckIcon,
  ArrowLeftIcon,
  ExternalLinkIcon,
  XIcon,
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
  resolvePortalTenantId,
} from '../../services/customerPortalNotificationService';
import { getPortalTenantId } from '../../services/customerPortalAuthService';
import './CustomerPortalNotificationsPage.css';

type PageFilterTab = 'all' | 'unread' | 'read';

const CATEGORIES: { label: string; value: NotificationCategory | 'all' }[] = [
  { label: 'All Categories', value: 'all' },
  { label: 'Estimates & Proposals', value: 'estimates' },
  { label: 'Contracts', value: 'contracts' },
  { label: 'Software Projects', value: 'projects' },
  { label: 'Invoices & Billing', value: 'invoices' },
  { label: 'Support & Tickets', value: 'support' },
  { label: 'Documents', value: 'documents' },
];

export default function CustomerPortalNotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<PortalNotification[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<PageFilterTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const currentTenantId = resolvePortalTenantId(getPortalTenantId() || undefined);

  const loadNotifications = useCallback(() => {
    const list = CustomerPortalNotificationService.getNotifications(currentTenantId);
    setNotifications(list);
  }, [currentTenantId]);

  useEffect(() => {
    loadNotifications();

    const handleNotificationsUpdated = () => {
      loadNotifications();
    };

    const handleWorkspaceSwitched = () => {
      loadNotifications();
    };

    window.addEventListener('portal:notifications-updated', handleNotificationsUpdated);
    window.addEventListener('portal:workspace-switched', handleWorkspaceSwitched);

    return () => {
      window.removeEventListener('portal:notifications-updated', handleNotificationsUpdated);
      window.removeEventListener('portal:workspace-switched', handleWorkspaceSwitched);
    };
  }, [loadNotifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // Read/Unread filter
      if (activeTab === 'unread' && item.read) return false;
      if (activeTab === 'read' && !item.read) return false;

      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;

      // Keyword search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesTitle = item.title?.toLowerCase().includes(q);
        const matchesMsg = item.message?.toLowerCase().includes(q);
        const matchesCat = item.category?.toLowerCase().includes(q);
        const matchesRef = item.metadata?.referenceNumber?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesMsg && !matchesCat && !matchesRef) {
          return false;
        }
      }

      return true;
    });
  }, [notifications, activeTab, selectedCategory, search]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const handleMarkAllRead = () => {
    CustomerPortalNotificationService.markAllAsRead(currentTenantId);
    loadNotifications();
  };

  const handleMarkSelectedRead = () => {
    selectedIds.forEach((id) => {
      CustomerPortalNotificationService.markAsRead(currentTenantId, id);
    });
    setSelectedIds(new Set());
    loadNotifications();
  };

  const handleDeleteSelected = () => {
    selectedIds.forEach((id) => {
      CustomerPortalNotificationService.deleteNotification(currentTenantId, id);
    });
    setSelectedIds(new Set());
    loadNotifications();
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all notifications?')) {
      CustomerPortalNotificationService.clearAll(currentTenantId);
      setSelectedIds(new Set());
      loadNotifications();
    }
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

  const handleNotificationClick = (item: PortalNotification) => {
    if (!item.read) {
      CustomerPortalNotificationService.markAsRead(currentTenantId, item.id);
      loadNotifications();
    }
    if (item.link) {
      navigate(item.link);
    }
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
            Stay informed with real-time alerts regarding software proposals, estimates, signed contracts, sprint delivery, and support tickets.
          </p>
        </div>

        <div className="cp-notif-page-actions">
          <button
            type="button"
            className="cp-notif-page-btn"
            onClick={loadNotifications}
            title="Refresh notifications"
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              className="cp-notif-page-btn primary"
              onClick={handleMarkAllRead}
            >
              <CheckCheckIcon size={15} />
              <span>Mark all as read</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              className="cp-notif-page-btn"
              onClick={handleClearAll}
              style={{ color: '#ef4444' }}
            >
              <TrashIcon size={15} />
              <span>Clear All</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="cp-notif-filter-bar">
        <div className="cp-notif-filter-top-row">
          <div className="cp-notif-search-box">
            <SearchIcon size={16} className="cp-notif-search-icon" />
            <input
              type="text"
              className="cp-notif-search-input"
              placeholder="Search notifications by title, reference, or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
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
              All ({notifications.length})
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
              Read ({notifications.length - unreadCount})
            </button>
          </div>
        </div>

        {/* Category Chips */}
        <div className="cp-notif-category-chips">
          {CATEGORIES.map((cat) => (
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
              <button
                type="button"
                className="cp-notif-page-btn"
                onClick={handleSelectAll}
              >
                <span>{selectedIds.size === filteredNotifications.length ? 'Deselect All' : 'Select All'}</span>
              </button>
              <button
                type="button"
                className="cp-notif-page-btn"
                onClick={handleMarkSelectedRead}
              >
                <CheckIcon size={14} />
                <span>Mark Selected as Read</span>
              </button>
              <button
                type="button"
                className="cp-notif-page-btn"
                onClick={handleDeleteSelected}
                style={{ color: '#ef4444' }}
              >
                <TrashIcon size={14} />
                <span>Delete Selected</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="cp-notif-page-list">
        {filteredNotifications.length === 0 ? (
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
              No notifications found
            </h3>
            <p style={{ margin: 0, color: 'var(--cp-text-muted)', fontSize: 14 }}>
              {search || selectedCategory !== 'all' || activeTab !== 'all'
                ? 'Try adjusting your filters or search keywords.'
                : 'All caught up! You have no new alerts or messages.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => (
            <div
              key={item.id}
              className={`cp-notif-card ${!item.read ? 'unread' : ''}`}
              onClick={() => handleNotificationClick(item)}
              style={{ cursor: item.link ? 'pointer' : 'default' }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onClick={(e) => handleToggleSelect(item.id, e)}
                onChange={() => {}}
                style={{ marginTop: 12, cursor: 'pointer' }}
              />

              <div
                className="cp-notif-card-avatar"
                style={{
                  background: item.category === 'estimates' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(50, 133, 246, 0.12)',
                  color: item.category === 'estimates' ? '#10b981' : 'var(--cp-primary)',
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
                    {item.category}
                  </span>

                  {item.link && (
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
          ))
        )}
      </div>
    </div>
  );
}
