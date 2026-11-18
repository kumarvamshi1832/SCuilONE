import { useCallback, useEffect, useRef, useState } from "react";
import {
  platformNotificationService,
  type NotificationItem,
} from "../../../services/platformNotificationService";
import { extractApiErrorMessage } from "../../../services/platformService";

const PAGE_SIZE = 30;
const POLL_INTERVAL_MS = 60_000;
const MIN_REFOCUS_GAP_MS = 15_000;

/**
 * Notification state for one signed-in platform employee.
 *
 * Everything comes from the existing notifications API; read state is stored by the backend.
 * `identityKey` (the signed-in user id) scopes all state: when it changes, state is reset and any
 * response still in flight for the previous identity is discarded, so a different user's
 * notifications are never shown.
 */
export function usePlatformNotifications(identityKey: string, panelOpen: boolean) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const epochRef = useRef(0);
  const openRef = useRef(panelOpen);
  const itemsRef = useRef<NotificationItem[]>([]);
  const lastFetchRef = useRef(0);
  openRef.current = panelOpen;
  itemsRef.current = items;

  // Reset everything when the signed-in identity changes.
  useEffect(() => {
    epochRef.current += 1;
    setItems([]);
    setTotal(0);
    setUnread(null);
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setActionError(null);
    lastFetchRef.current = 0;
  }, [identityKey]);

  const refreshCount = useCallback(async () => {
    const epoch = epochRef.current;
    try {
      const count = await platformNotificationService.unreadCount();
      if (epoch === epochRef.current) {
        setUnread(count);
        lastFetchRef.current = Date.now();
      }
    } catch {
      // A failed badge refresh keeps the last known count; the panel surfaces list errors itself.
    }
  }, []);

  const loadFirstPage = useCallback(async (silent = false) => {
    const epoch = epochRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await platformNotificationService.list(PAGE_SIZE, 0);
      if (epoch !== epochRef.current) return;
      lastFetchRef.current = Date.now();
      setUnread(res.unread_count);
      setTotal(res.total);
      // A silent refresh must not discard pages the user already loaded.
      if (!silent || itemsRef.current.length <= PAGE_SIZE) {
        setItems(res.items);
      }
      setError(null);
    } catch (err) {
      if (epoch === epochRef.current && !silent) {
        setError(extractApiErrorMessage(err, "Unable to load notifications."));
      }
    } finally {
      if (epoch === epochRef.current && !silent) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const epoch = epochRef.current;
    setLoadingMore(true);
    try {
      const res = await platformNotificationService.list(PAGE_SIZE, itemsRef.current.length);
      if (epoch !== epochRef.current) return;
      setUnread(res.unread_count);
      setTotal(res.total);
      setItems((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...res.items.filter((n) => !seen.has(n.id))];
      });
    } catch (err) {
      if (epoch === epochRef.current) {
        setActionError(extractApiErrorMessage(err, "Unable to load more notifications."));
      }
    } finally {
      if (epoch === epochRef.current) setLoadingMore(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    const epoch = epochRef.current;
    const target = itemsRef.current.find((n) => n.id === id);
    if (!target || target.is_read) return;
    setActionError(null);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    setUnread((prev) => (prev === null ? prev : Math.max(0, prev - 1)));
    try {
      await platformNotificationService.markRead(id);
    } catch (err) {
      if (epoch !== epochRef.current) return;
      // Revert: the server did not confirm the change.
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
      setUnread((prev) => (prev === null ? prev : prev + 1));
      setActionError(extractApiErrorMessage(err, "Unable to mark the notification as read."));
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const epoch = epochRef.current;
    setActionError(null);
    try {
      await platformNotificationService.markAllRead();
      if (epoch !== epochRef.current) return;
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnread(0);
      void refreshCount();
    } catch (err) {
      if (epoch === epochRef.current) {
        setActionError(extractApiErrorMessage(err, "Unable to mark all notifications as read."));
      }
    }
  }, [refreshCount]);

  // Initial badge count for this identity.
  useEffect(() => {
    void refreshCount();
  }, [identityKey, refreshCount]);

  // Load the list whenever the panel opens.
  useEffect(() => {
    if (panelOpen) void loadFirstPage(false);
  }, [panelOpen, identityKey, loadFirstPage]);

  // Polling + refresh on return to the tab. All listeners/timers are removed on unmount.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (openRef.current) void loadFirstPage(true);
      else void refreshCount();
    };
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current >= MIN_REFOCUS_GAP_MS) tick();
    };
    const timer = window.setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [identityKey, loadFirstPage, refreshCount]);

  return {
    items,
    total,
    unread,
    loading,
    loadingMore,
    error,
    actionError,
    hasMore: items.length < total,
    reload: () => loadFirstPage(false),
    loadMore,
    markRead,
    markAllRead,
    clearActionError: () => setActionError(null),
  };
}
