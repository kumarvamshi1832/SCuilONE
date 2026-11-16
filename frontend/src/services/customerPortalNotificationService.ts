import { PortalNotification } from '../types/customerPortalNotifications';

const NOTIFICATIONS_STORAGE_KEY_PREFIX = 'scuilone_cp_notifications_';
const NOTIFICATIONS_READ_KEY_PREFIX = 'scuilone_cp_read_notifications_';

export function resolvePortalTenantId(fallback = 'default'): string {
  try {
    const portalTenant =
      sessionStorage.getItem('scuilone_portal_tenant_id') ||
      localStorage.getItem('scuilone_portal_tenant_id');
    if (portalTenant) return portalTenant;

    const custStr =
      sessionStorage.getItem('scuilone_portal_customer') ||
      localStorage.getItem('scuilone_portal_customer');
    if (custStr) {
      const parsed = JSON.parse(custStr);
      if (parsed?.tenant_id) return parsed.tenant_id;
    }

    const tenantId =
      sessionStorage.getItem('tenant_id') ||
      localStorage.getItem('tenant_id');
    if (tenantId) return tenantId;

    const userStr =
      sessionStorage.getItem('user') ||
      localStorage.getItem('user');
    if (userStr) {
      const parsed = JSON.parse(userStr);
      if (parsed?.tenant_id) return parsed.tenant_id;
      if (parsed?.tenant?.id) return parsed.tenant.id;
    }
  } catch {
    // ignore
  }
  return fallback;
}

function getStoredNotifications(tenantId: string): PortalNotification[] {
  try {
    const raw = localStorage.getItem(`${NOTIFICATIONS_STORAGE_KEY_PREFIX}${tenantId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr;
      }
    }
  } catch {

  }
  return [];
}

function saveStoredNotifications(tenantId: string, list: PortalNotification[]): void {
  try {
    localStorage.setItem(`${NOTIFICATIONS_STORAGE_KEY_PREFIX}${tenantId}`, JSON.stringify(list));
  } catch {

  }
}

function getReadIds(tenantId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${NOTIFICATIONS_READ_KEY_PREFIX}${tenantId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch {

  }
  return new Set();
}

function saveReadIds(tenantId: string, ids: Set<string>): void {
  try {
    localStorage.setItem(`${NOTIFICATIONS_READ_KEY_PREFIX}${tenantId}`, JSON.stringify(Array.from(ids)));
  } catch {

  }
}

export const CustomerPortalNotificationService = {
  getNotifications(tenantId: string = 'default'): PortalNotification[] {
    const safeTenant = tenantId || 'default';
    const stored = getStoredNotifications(safeTenant);
    const readSet = getReadIds(safeTenant);

    return stored.map((item) => ({
      ...item,
      tenant_id: safeTenant,
      read: item.read || readSet.has(item.id),
    }));
  },

  getUnreadCount(tenantId: string = 'default'): number {
    const list = this.getNotifications(tenantId);
    return list.filter((n) => !n.read).length;
  },

  addNotification(
    tenantId: string = 'default',
    notification: Omit<PortalNotification, 'id' | 'tenant_id' | 'read' | 'timestamp'> & {
      id?: string;
      timestamp?: string;
      read?: boolean;
    }
  ): PortalNotification {
    const safeTenant = tenantId || resolvePortalTenantId();
    const list = getStoredNotifications(safeTenant);

    // Prevent duplicate notifications caused by repeated renders or duplicate event handling
    if (notification.id) {
      const existing = list.find((item) => item.id === notification.id);
      if (existing) return existing;
    }
    if (
      notification.metadata?.recordId &&
      notification.category &&
      notification.title
    ) {
      const existing = list.find(
        (item) =>
          item.category === notification.category &&
          item.metadata?.recordId === notification.metadata?.recordId &&
          item.title === notification.title
      );
      if (existing) return existing;
    }

    const newNotif: PortalNotification = {
      ...notification,
      id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: safeTenant,
      timestamp: notification.timestamp || new Date().toISOString(),
      read: notification.read ?? false,
    };

    const updated = [newNotif, ...list];
    saveStoredNotifications(safeTenant, updated);
    this.emitChange(safeTenant);
    return newNotif;
  },

  /**
   * Generates a frontend notification when an estimate is successfully created via API.
   */
  notifyEstimateCreated(
    tenantId: string | undefined | null,
    estimate: {
      id: string;
      estimate_number?: string | null;
      title: string;
      total_amount?: number | string | null;
      currency?: string | null;
      created_at?: string | null;
    }
  ): PortalNotification {
    const safeTenant = tenantId || resolvePortalTenantId();
    const estRef = estimate.estimate_number
      ? `Estimate #${estimate.estimate_number}: ${estimate.title}`
      : `Estimate: ${estimate.title}`;

    return this.addNotification(safeTenant, {
      title: 'New estimate created',
      message: estRef,
      category: 'estimates',
      link: `/portal/estimates?id=${encodeURIComponent(estimate.id)}`,
      actionText: 'Inspect Proposal',
      priority: 'normal',
      timestamp: estimate.created_at || new Date().toISOString(),
      metadata: {
        recordId: estimate.id,
        estimateId: estimate.id,
        referenceNumber: estimate.estimate_number || undefined,
        amount: estimate.total_amount != null
          ? `${estimate.currency || 'INR'} ${Number(estimate.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          : undefined,
      },
    });
  },

  /**
   * Generates a frontend notification when an estimate is accepted or rejected.
   */
  notifyEstimateDecision(
    tenantId: string | undefined | null,
    estimate: {
      id: string;
      estimate_number?: string | null;
      title: string;
    },
    decision: 'accepted' | 'rejected'
  ): PortalNotification {
    const safeTenant = tenantId || resolvePortalTenantId();
    const actionWord = decision === 'accepted' ? 'accepted' : 'rejected';
    const estRef = estimate.estimate_number
      ? `Estimate #${estimate.estimate_number} has been ${actionWord}.`
      : `Estimate "${estimate.title}" has been ${actionWord}.`;

    return this.addNotification(safeTenant, {
      title: decision === 'accepted' ? 'Estimate accepted' : 'Estimate rejected',
      message: estRef,
      category: 'estimates',
      link: `/portal/estimates?id=${encodeURIComponent(estimate.id)}`,
      actionText: 'View Estimate',
      priority: decision === 'accepted' ? 'high' : 'normal',
      metadata: {
        recordId: `${estimate.id}-${decision}`,
        estimateId: estimate.id,
        referenceNumber: estimate.estimate_number || undefined,
      },
    });
  },

  /**
   * Generates a frontend notification when a support ticket is created.
   */
  notifyTicketCreated(
    tenantId: string | undefined | null,
    ticket: {
      id: string;
      ticket_number?: string | null;
      subject: string;
    }
  ): PortalNotification {
    const safeTenant = tenantId || resolvePortalTenantId();
    const ticketRef = ticket.ticket_number
      ? `Ticket #${ticket.ticket_number}: ${ticket.subject}`
      : ticket.subject;

    return this.addNotification(safeTenant, {
      title: 'Support ticket submitted',
      message: ticketRef,
      category: 'support',
      link: `/portal/tickets/${encodeURIComponent(ticket.id)}`,
      actionText: 'View Ticket',
      priority: 'normal',
      metadata: {
        recordId: ticket.id,
        ticketId: ticket.id,
        referenceNumber: ticket.ticket_number || undefined,
      },
    });
  },

  /**
   * Generates a frontend notification when a contract is signed.
   */
  notifyContractSigned(
    tenantId: string | undefined | null,
    contract: {
      id: string;
      contract_number?: string | null;
      title: string;
    }
  ): PortalNotification {
    const safeTenant = tenantId || resolvePortalTenantId();
    const contractRef = contract.contract_number
      ? `Contract #${contract.contract_number} has been signed successfully.`
      : `Contract "${contract.title}" signed.`;

    return this.addNotification(safeTenant, {
      title: 'Contract signed',
      message: contractRef,
      category: 'contracts',
      link: `/portal/contracts?id=${encodeURIComponent(contract.id)}`,
      actionText: 'View Contract',
      priority: 'high',
      metadata: {
        recordId: `${contract.id}-signed`,
        contractId: contract.id,
        referenceNumber: contract.contract_number || undefined,
      },
    });
  },

  markAsRead(tenantId: string = 'default', notificationId: string): void {
    const safeTenant = tenantId || 'default';
    const readSet = getReadIds(safeTenant);
    readSet.add(notificationId);
    saveReadIds(safeTenant, readSet);

    const list = getStoredNotifications(safeTenant);
    if (list.length > 0) {
      const updated = list.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
      saveStoredNotifications(safeTenant, updated);
    }

    this.emitChange(safeTenant);
  },

  markAllAsRead(tenantId: string = 'default'): void {
    const safeTenant = tenantId || 'default';
    const list = this.getNotifications(safeTenant);
    const readSet = getReadIds(safeTenant);
    list.forEach((n) => readSet.add(n.id));
    saveReadIds(safeTenant, readSet);

    const storedList = getStoredNotifications(safeTenant);
    if (storedList.length > 0) {
      const updated = storedList.map((n) => ({ ...n, read: true }));
      saveStoredNotifications(safeTenant, updated);
    }

    this.emitChange(safeTenant);
  },

  deleteNotification(tenantId: string = 'default', notificationId: string): void {
    const safeTenant = tenantId || 'default';
    const list = getStoredNotifications(safeTenant);
    const updated = list.filter((n) => n.id !== notificationId);
    saveStoredNotifications(safeTenant, updated);
    this.emitChange(safeTenant);
  },

  clearAll(tenantId: string = 'default'): void {
    const safeTenant = tenantId || 'default';
    saveStoredNotifications(safeTenant, []);
    saveReadIds(safeTenant, new Set());
    this.emitChange(safeTenant);
  },

  emitChange(tenantId: string): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('portal:notifications-updated', {
          detail: { tenantId },
        })
      );
    }
  },
};
