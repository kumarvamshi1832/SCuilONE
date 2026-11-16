export type NotificationCategory =
  | 'all'
  | 'estimates'
  | 'contracts'
  | 'projects'
  | 'invoices'
  | 'support'
  | 'documents'
  | 'bookings'
  | 'visits';

export type NotificationPriority = 'normal' | 'high' | 'urgent';

export interface PortalNotification {
  id: string;
  tenant_id: string;
  category: Exclude<NotificationCategory, 'all'>;
  title: string;
  message: string;
  timestamp: string; // ISO string
  read: boolean;
  link: string;
  actionText?: string;
  priority?: NotificationPriority;
  metadata?: {
    referenceNumber?: string;
    amount?: string;
    statusBadge?: string;
    [key: string]: any;
  };
}

export type NotificationFilterTab = 'all' | 'unread';
