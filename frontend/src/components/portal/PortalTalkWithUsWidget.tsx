import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircleIcon, XIcon } from "../common/SupportPortalIcons";
import {
  CustomerPortalNotificationService,
  PORTAL_NOTIFICATIONS_UPDATED_EVENT,
} from "../../services/customerPortalNotificationService";
import "./PortalTalkWithUsWidget.css";

const CHAT_MINIMIZED_KEY = "scuilone_cp_chat_minimized";

interface PortalTalkWithUsWidgetProps {
  /** Custom label; defaults to "Talk With Us" */
  label?: string;
  /** Custom subtitle; defaults to "Online" */
  subtitle?: string;
  /** Destination route; defaults to "/portal/chat" */
  targetPath?: string;
}

/**
 * Floating "Talk With Us" Chat Widget for the Customer Portal Dashboard.
 * Matches modern SaaS chat launchers (Intercom / Drift / Copilot / Talk with Vaiu).
 * Anchored to the bottom-right corner, shows active online status, dynamic unread badge,
 * and allows fast navigation to the existing Messages module (/portal/chat).
 */
export default function PortalTalkWithUsWidget({
  label = "Talk With Us",
  subtitle = "Online",
  targetPath = "/portal/chat",
}: PortalTalkWithUsWidgetProps) {
  const navigate = useNavigate();

  const [minimized, setMinimized] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(CHAT_MINIMIZED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [unreadCount, setUnreadCount] = useState<number>(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await CustomerPortalNotificationService.getNotifications(50, 0);
      const chatUnread = data.items.filter(
        (n) => n.related_module === "customer_chat" && !n.read
      ).length;
      setUnreadCount(chatUnread);
    } catch {
      /* notifications service unmounted or unavailable */
    }
  }, []);

  useEffect(() => {
    void fetchUnreadCount();

    const handleUpdate = () => {
      void fetchUnreadCount();
    };

    window.addEventListener(PORTAL_NOTIFICATIONS_UPDATED_EVENT, handleUpdate);
    const interval = window.setInterval(() => {
      if (!document.hidden) void fetchUnreadCount();
    }, 25_000);

    return () => {
      window.removeEventListener(PORTAL_NOTIFICATIONS_UPDATED_EVENT, handleUpdate);
      window.clearInterval(interval);
    };
  }, [fetchUnreadCount]);

  const handleOpenChat = () => {
    navigate(targetPath);
  };

  const handleToggleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimized((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(CHAT_MINIMIZED_KEY, String(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpenChat();
    }
  };

  return (
    <aside
      className="cp-chat-widget-container"
      aria-label="Customer Support Chat Launcher"
    >
      {minimized ? (
        <button
          type="button"
          className="cp-chat-widget-fab"
          onClick={handleOpenChat}
          onDoubleClick={handleToggleMinimize}
          title={`${label} (${subtitle}) - Click to open messages`}
          aria-label={`${label} - Open messages`}
        >
          <div className="cp-chat-widget-avatar-wrap">
            <MessageCircleIcon size={22} />
            <span className="cp-chat-online-dot" aria-hidden="true" />
          </div>
          {unreadCount > 0 && (
            <span
              className="cp-chat-unread-badge cp-chat-widget-fab-unread"
              aria-label={`${unreadCount} unread messages`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      ) : (
        <div
          role="button"
          tabIndex={0}
          className="cp-chat-widget-card"
          onClick={handleOpenChat}
          onKeyDown={handleKeyDown}
          title="Click to open messages"
          aria-label={`${label} - ${subtitle}. Open messages`}
        >
          <div className="cp-chat-widget-avatar-wrap">
            <MessageCircleIcon size={20} />
            <span className="cp-chat-online-dot" aria-hidden="true" />
          </div>

          <div className="cp-chat-widget-content">
            <div className="cp-chat-widget-title-row">
              <span className="cp-chat-widget-title">{label}</span>
              {unreadCount > 0 && (
                <span
                  className="cp-chat-unread-badge"
                  aria-label={`${unreadCount} unread messages`}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <div className="cp-chat-widget-subtitle">
              <span className="cp-chat-inline-status-dot" aria-hidden="true" />
              <span>{subtitle}</span>
            </div>
          </div>

          <button
            type="button"
            className="cp-chat-widget-minimize-btn"
            onClick={handleToggleMinimize}
            title="Minimize chat widget"
            aria-label="Minimize chat widget"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}
