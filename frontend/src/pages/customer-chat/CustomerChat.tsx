import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChatComposer, ChatThread } from "../../components/chat/ChatThread";
import {
  addChatParticipant,
  assignChatPrimary,
  getChatAssignmentHistory,
  getChatConversation,
  getChatConversations,
  getChatParticipants,
  getEligibleChatStaff,
  markChatConversationRead,
  removeChatParticipant,
  sendChatMessage,
  setChatConversationStatus,
} from "../../services/customerChatService";
import { getApiErrorMessage } from "../../utils/apiError";
import { getLeadPermissions } from "../../utils/leadPermissions";
import { formatMessageDateTime, formatShortTime } from "../../utils/messageTime";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { CHAT_ASSIGNMENT_REASON_MAX_LENGTH } from "../../types/customerChat";
import type {
  ChatAssignmentHistoryItem,
  ChatConversation,
  ChatConversationDetail,
  ChatEligibleStaff,
  ChatMessage,
  ChatParticipant,
} from "../../types/customerChat";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";
import "./CustomerChat.css";

const PAGE_SIZE = 50;
const LIST_POLL_MS = 30_000;
const THREAD_POLL_MS = 10_000;

type StatusFilter = "" | "Open" | "Closed" | "Needs Reassignment";
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "Open", label: "Open" },
  { value: "Closed", label: "Closed" },
  { value: "Needs Reassignment", label: "Needs reassignment" },
];

const httpStatus = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

const isCanceled = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";
};

const statusClass = (status: string): string =>
  status === "Open" ? "open" : status === "Closed" ? "closed" : "reassign";

/** Newest data first from `fresh`; conversations only present in `existing` (older pages) are kept after it. */
const mergeConversations = (fresh: ChatConversation[], existing: ChatConversation[]): ChatConversation[] => {
  const seen = new Set(fresh.map((c) => c.id));
  return [...fresh, ...existing.filter((c) => !seen.has(c.id))];
};

export default function CustomerChat() {
  const canAccess = useMemo(() => hasFeaturePermission("customer_chat.access"), []);
  const canManage = useMemo(() => hasFeaturePermission("customer_chat.manage"), []);
  const currentUserId = useMemo(() => getLeadPermissions().userId, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkId = searchParams.get("conversation");
  const deepLinkHandled = useRef<string | null>(null);

  const [filter, setFilter] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "thread">("list");

  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [history, setHistory] = useState<ChatAssignmentHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [staff, setStaff] = useState<ChatEligibleStaff[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [panelTab, setPanelTab] = useState<"people" | "history">("people");

  const [assigneeId, setAssigneeId] = useState("");
  const [assignReason, setAssignReason] = useState("");
  const [newParticipantId, setNewParticipantId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: "close" }
    | { kind: "remove"; participant: ChatParticipant }
    | null
  >(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const listSeq = useRef(0);
  const detailSeq = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const lastReadMarker = useRef("");
  selectedRef.current = selectedId;

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  /* ───────────── inbox ───────────── */
  const loadList = useCallback(
    async (mode: "reset" | "poll") => {
      if (!canAccess) return;
      const seq = ++listSeq.current;
      if (mode === "reset") {
        setListLoading(true);
        setListError(null);
      }
      try {
        const data = await getChatConversations({
          status: filter || undefined,
          limit: mode === "poll" ? 100 : PAGE_SIZE,
          offset: 0,
        });
        if (seq !== listSeq.current) return;
        if (mode === "reset") {
          setConversations(data);
          setHasMore(data.length === PAGE_SIZE);
        } else if (data.length < 100) {
          // The refresh returned everything, so it is authoritative (rows that no longer match the filter drop out).
          setConversations(data);
        } else {
          setConversations((prev) => mergeConversations(data, prev));
        }
      } catch (err) {
        if (seq !== listSeq.current) return;
        // A failed background refresh keeps the list on screen; only an explicit load shows the error state.
        if (mode === "reset") {
          setConversations([]);
          setHasMore(false);
          setListError(getApiErrorMessage(err, "Could not load customer conversations."));
        }
      } finally {
        if (seq === listSeq.current && mode === "reset") setListLoading(false);
      }
    },
    [canAccess, filter]
  );

  useEffect(() => {
    void loadList("reset");
  }, [loadList]);

  useEffect(() => {
    if (!canAccess) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadList("poll");
    }, LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [canAccess, loadList]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await getChatConversations({
        status: filter || undefined,
        limit: PAGE_SIZE,
        offset: conversations.length,
      });
      setConversations((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...data.filter((c) => !seen.has(c.id))];
      });
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      showToast(getApiErrorMessage(err, "Could not load more conversations."), "error");
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      [c.customer_name, c.customer_email, c.account_name, c.primary_assignee?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [conversations, search]);

  /* ───────────── one conversation ───────────── */
  const markReadQuietly = useCallback((id: string) => {
    markChatConversationRead(id).catch(() => undefined);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
  }, []);

  const loadDetail = useCallback(
    async (id: string, mode: "open" | "poll") => {
      const seq = ++detailSeq.current;
      if (mode === "open") {
        setDetailLoading(true);
        setDetailError(null);
      }
      try {
        const data = await getChatConversation(id);
        if (seq !== detailSeq.current || selectedRef.current !== id) return;
        setDetail(data);
        // Tell the server only when a new customer message arrived (the GET already marks participants as read).
        const lastCustomer = [...data.messages].reverse().find((m) => m.sender_type === "Customer");
        const marker = `${id}:${lastCustomer?.id ?? ""}`;
        if (lastCustomer && lastReadMarker.current !== marker) {
          lastReadMarker.current = marker;
          markReadQuietly(id);
        }
      } catch (err) {
        if (isCanceled(err) || seq !== detailSeq.current || selectedRef.current !== id) return;
        if (mode === "open") {
          setDetail(null);
          const status = httpStatus(err);
          setDetailError(
            status === 403
              ? "Access denied. You are not a participant in this customer conversation."
              : status === 404
              ? "This conversation no longer exists. Refresh the inbox."
              : getApiErrorMessage(err, "Could not load this conversation.")
          );
        }
      } finally {
        if (seq === detailSeq.current && mode === "open") setDetailLoading(false);
      }
    },
    [markReadQuietly]
  );

  const loadPeople = useCallback(
    async (id: string) => {
      setPanelError(null);
      try {
        const list = await getChatParticipants(id);
        if (selectedRef.current === id) setParticipants(list);
      } catch (err) {
        if (selectedRef.current === id) {
          setParticipants([]);
          setPanelError(getApiErrorMessage(err, "Could not load participants."));
        }
      }
      if (!canManage) return;
      try {
        const rows = await getChatAssignmentHistory(id);
        if (selectedRef.current === id) {
          setHistory(rows);
          setHistoryError(null);
        }
      } catch (err) {
        if (selectedRef.current === id) {
          setHistory([]);
          setHistoryError(getApiErrorMessage(err, "Could not load the assignment history."));
        }
      }
    },
    [canManage]
  );

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    getEligibleChatStaff()
      .then((rows) => active && setStaff(rows))
      .catch((err) => active && setStaffError(getApiErrorMessage(err, "Could not load eligible employees.")));
    return () => {
      active = false;
    };
  }, [canManage]);

  const openConversation = (id: string) => {
    setSelectedId(id);
    selectedRef.current = id;
    setDetail(null);
    setParticipants([]);
    setHistory([]);
    setAssigneeId("");
    setAssignReason("");
    setNewParticipantId("");
    setMobilePane("thread");
    void loadDetail(id, "open");
    void loadPeople(id);
  };

  // Notifications link here with ?conversation=<id>; open it once, then clean the address bar.
  useEffect(() => {
    if (!canAccess || !deepLinkId || deepLinkHandled.current === deepLinkId) return;
    deepLinkHandled.current = deepLinkId;
    openConversation(deepLinkId);
    setSearchParams({}, { replace: true });
  }, [canAccess, deepLinkId]);

  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadDetail(selectedId, "poll");
    }, THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [selectedId, loadDetail]);

  const refreshAfterChange = async (id: string) => {
    await Promise.all([loadDetail(id, "poll"), loadPeople(id), loadList("poll")]);
  };

  /* ───────────── actions ───────────── */
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    staff.forEach((s) => map.set(s.id, s.full_name));
    participants.forEach((p) => map.set(p.user_id, p.full_name));
    if (detail?.primary_assignee) map.set(detail.primary_assignee.id, detail.primary_assignee.name);
    return map;
  }, [staff, participants, detail]);

  const senderLabel = (message: ChatMessage): string => {
    if (message.sender_type === "Customer") return detail?.customer_name || detail?.customer_email || "Customer";
    if (message.sender_user_id && message.sender_user_id === currentUserId) return "You";
    return (message.sender_user_id && nameById.get(message.sender_user_id)) || "Team member";
  };

  const handleSend = async (content: string) => {
    if (!detail) return;
    try {
      const sent = await sendChatMessage(detail.id, content);
      detailSeq.current += 1; // discard any refresh that started before this message existed
      setDetail((prev) =>
        prev && prev.id === detail.id && !prev.messages.some((m) => m.id === sent.id)
          ? { ...prev, messages: [...prev.messages, sent], last_message_at: sent.created_at }
          : prev
      );
      setConversations((prev) => {
        const target = prev.find((c) => c.id === detail.id);
        if (!target) return prev;
        return [{ ...target, last_message_at: sent.created_at, unread_count: 0 }, ...prev.filter((c) => c.id !== detail.id)];
      });
    } catch (err) {
      const status = httpStatus(err);
      if (status === 409) void loadDetail(detail.id, "poll"); // closed meanwhile: pick up the new status
      throw new Error(
        status === 409
          ? getApiErrorMessage(err, "This conversation is closed.")
          : status === 403
          ? getApiErrorMessage(err, "You are not allowed to reply in this conversation.")
          : getApiErrorMessage(err, "The message could not be sent.")
      );
    }
  };

  const runPanelAction = async (key: string, action: () => Promise<string>) => {
    if (!detail || busy) return;
    setBusy(key);
    setPanelError(null);
    try {
      const message = await action();
      showToast(message);
      await refreshAfterChange(detail.id);
    } catch (err) {
      setPanelError(getApiErrorMessage(err, "The change could not be saved."));
    } finally {
      setBusy(null);
    }
  };

  const handleAssign = () => {
    if (!detail || !assigneeId) return;
    void runPanelAction("assign", async () => {
      const result = await assignChatPrimary(detail.id, assigneeId, assignReason);
      setAssigneeId("");
      setAssignReason("");
      return result.message || "Primary responsible employee updated.";
    });
  };

  const handleAddParticipant = () => {
    if (!detail || !newParticipantId) return;
    void runPanelAction("add", async () => {
      const result = await addChatParticipant(detail.id, newParticipantId);
      setNewParticipantId("");
      return result.message || "Participant added.";
    });
  };

  const handleRemoveParticipant = async (participant: ChatParticipant) => {
    if (!detail) return;
    setBusy("remove");
    setConfirmError(null);
    try {
      await removeChatParticipant(detail.id, participant.user_id);
      setConfirm(null);
      showToast(`${participant.full_name} was removed from this conversation.`);
      await refreshAfterChange(detail.id);
    } catch (err) {
      setConfirmError(getApiErrorMessage(err, "The participant could not be removed."));
    } finally {
      setBusy(null);
    }
  };

  const changeStatus = async (next: "Open" | "Closed") => {
    if (!detail) return;
    setBusy("status");
    setConfirmError(null);
    try {
      await setChatConversationStatus(detail.id, next);
      setConfirm(null);
      showToast(next === "Closed" ? "Conversation closed." : "Conversation reopened.");
      await refreshAfterChange(detail.id);
    } catch (err) {
      const message = getApiErrorMessage(err, "The status could not be changed.");
      if (next === "Closed") setConfirmError(message);
      else showToast(message, "error"); // e.g. 409: assign a primary employee before reopening
    } finally {
      setBusy(null);
    }
  };

  /* ───────────── derived ───────────── */
  const participantIds = useMemo(() => new Set(participants.map((p) => p.user_id)), [participants]);
  const addableStaff = staff.filter((s) => !participantIds.has(s.id));
  const isClosed = detail?.status === "Closed";
  const composerLock = !detail
    ? null
    : isClosed
    ? "This conversation is closed. Reopen it to send a message."
    : null;
  const nameOf = (id: string | null) => (id ? nameById.get(id) ?? "Former employee" : "Nobody");

  if (!canAccess) {
    return (
      <div className="ins-page">
        <div className="page-header">
          <div>
            <h1>Customer Chat</h1>
          </div>
        </div>
        <div className="ins-empty">
          <h3>Access denied</h3>
          <p>You do not have permission to view customer conversations.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ins-page cc-page">
      {toast && (
        <div className={`ins-alert ins-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Customer Chat</h1>
          <p className="text-muted">
            Conversations with customers from the Customer Portal.
            {!canManage && " You only see conversations you take part in."}
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void loadList("reset")} disabled={listLoading}>
            Refresh
          </button>
        </div>
      </div>

      <div className={`cc-layout ${mobilePane === "thread" ? "show-thread" : "show-list"} ${showPanel ? "with-panel" : ""}`}>
        {/* ───── inbox ───── */}
        <aside className="cc-inbox" aria-label="Conversations">
          <div className="cc-inbox-head">
            <input
              className="cc-search"
              type="search"
              placeholder="Search name, email, account…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search loaded conversations"
            />
            <div className="cc-filters" role="tablist" aria-label="Filter by status">
              {FILTERS.map((f) => (
                <button
                  key={f.value || "all"}
                  role="tab"
                  aria-selected={filter === f.value}
                  className={`cc-chip ${filter === f.value ? "active" : ""}`}
                  onClick={() => {
                    setFilter(f.value);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cc-inbox-list">
            {listLoading ? (
              <div className="ins-loading" aria-busy="true">
                <div className="leads-loading-spinner" /> Loading conversations…
              </div>
            ) : listError ? (
              <div className="ins-alert error" role="alert">
                <span>{listError}</span>
                <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void loadList("reset")}>
                  Retry
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="ins-empty">
                <h3>No conversations</h3>
                <p>
                  {filter
                    ? `There are no ${filter.toLowerCase()} conversations.`
                    : "Conversations appear here once a customer portal user is set up for chat."}
                </p>
              </div>
            ) : visibleConversations.length === 0 ? (
              <div className="ins-empty">
                <h3>No matches</h3>
                <p>Nothing loaded matches "{search}".</p>
              </div>
            ) : (
              <>
                <ul className="cc-list">
                  {visibleConversations.map((c) => {
                    const unread = c.unread_count ?? 0;
                    return (
                      <li key={c.id}>
                        <button
                          className={`cc-item ${selectedId === c.id ? "active" : ""} ${unread > 0 ? "unread" : ""}`}
                          onClick={() => openConversation(c.id)}
                          aria-current={selectedId === c.id}
                        >
                          <span className="cc-avatar" aria-hidden="true">
                            {(c.customer_name || c.customer_email || "?").charAt(0).toUpperCase()}
                          </span>
                          <span className="cc-item-body">
                            <span className="cc-item-top">
                              <span className="cc-item-name">{c.customer_name || c.customer_email || "Customer"}</span>
                              <span className="cc-item-time">{formatShortTime(c.last_message_at)}</span>
                            </span>
                            <span className="cc-item-sub">{c.customer_email || "—"}</span>
                            <span className="cc-item-sub">{c.account_name || "No account"}</span>
                            <span className="cc-item-foot">
                              <span className={`cc-badge ${statusClass(c.status)}`}>{c.status}</span>
                              <span className="cc-item-owner">
                                {c.primary_assignee ? c.primary_assignee.name : "Unassigned"}
                              </span>
                              {unread > 0 && (
                                <span className="cc-unread" aria-label={`${unread} unread`}>
                                  {unread > 99 ? "99+" : unread}
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {hasMore && !search.trim() && (
                  <button className="btn-secondary ins-btn-sm cc-more" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ───── thread ───── */}
        <section className="cc-thread" aria-label="Conversation">
          {!selectedId ? (
            <div className="cc-placeholder">
              <h3>Select a conversation</h3>
              <p>Choose a customer on the left to read and reply to their messages.</p>
            </div>
          ) : detailLoading && !detail ? (
            <div className="ins-loading" aria-busy="true">
              <div className="leads-loading-spinner" /> Loading conversation…
            </div>
          ) : detailError ? (
            <div className="cc-placeholder">
              <button className="btn-secondary ins-btn-sm cc-back" onClick={() => setMobilePane("list")}>
                ← Conversations
              </button>
              <div className="ins-alert error" role="alert">
                <span>{detailError}</span>
                <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => selectedId && openConversation(selectedId)}>
                  Retry
                </button>
              </div>
            </div>
          ) : detail ? (
            <>
              <header className="cc-thread-head">
                <button className="btn-secondary ins-btn-sm cc-back" onClick={() => setMobilePane("list")}>
                  ← Back
                </button>
                <div className="cc-thread-title">
                  <h2>{detail.customer_name || detail.customer_email || "Customer"}</h2>
                  <p>
                    {[detail.customer_email, detail.account_name].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="cc-thread-owner">
                    Responsible: <strong>{detail.primary_assignee?.name ?? "Nobody assigned"}</strong>
                  </p>
                </div>
                <div className="cc-thread-actions">
                  <span className={`cc-badge ${statusClass(detail.status)}`}>{detail.status}</span>
                  {canManage &&
                    (isClosed ? (
                      <button className="btn-secondary ins-btn-sm" onClick={() => void changeStatus("Open")} disabled={busy === "status"}>
                        {busy === "status" ? "Working…" : "Reopen"}
                      </button>
                    ) : (
                      <button
                        className="btn-secondary ins-btn-sm"
                        onClick={() => {
                          setConfirmError(null);
                          setConfirm({ kind: "close" });
                        }}
                      >
                        Close
                      </button>
                    ))}
                  <button
                    className={`btn-secondary ins-btn-sm ${showPanel ? "cc-toggle-on" : ""}`}
                    onClick={() => setShowPanel((v) => !v)}
                    aria-expanded={showPanel}
                  >
                    {canManage ? "Team & assignment" : "Participants"}
                  </button>
                </div>
              </header>

              {detail.status === "Needs Reassignment" && (
                <div className="ins-warning-box" role="status">
                  This customer wrote while nobody was responsible for the conversation.
                  {canManage ? " Assign a primary responsible employee to continue." : " Ask a manager to assign someone."}
                </div>
              )}

              <ChatThread
                messages={detail.messages}
                perspective="staff"
                senderLabel={senderLabel}
                isOwn={(m) => m.sender_type === "Staff" && m.sender_user_id === currentUserId}
                emptyText="No messages in this conversation yet."
              />
              <ChatComposer onSend={handleSend} disabledReason={composerLock} />
            </>
          ) : null}
        </section>

        {/* ───── side panel ───── */}
        {showPanel && detail && (
          <aside className="cc-panel" aria-label="Participants and assignment">
            <div className="cc-panel-head">
              <div className="ins-tabs" role="tablist">
                <button role="tab" aria-selected={panelTab === "people"} className={`ins-tab ${panelTab === "people" ? "active" : ""}`} onClick={() => setPanelTab("people")}>
                  People
                </button>
                {canManage && (
                  <button role="tab" aria-selected={panelTab === "history"} className={`ins-tab ${panelTab === "history" ? "active" : ""}`} onClick={() => setPanelTab("history")}>
                    History
                  </button>
                )}
              </div>
              <button className="ins-modal-close" onClick={() => setShowPanel(false)} aria-label="Close panel">
                ×
              </button>
            </div>

            {panelError && (
              <div className="ins-alert error" role="alert">
                <span>{panelError}</span>
              </div>
            )}

            {panelTab === "people" && (
              <div className="cc-panel-body">
                <h4>Participants</h4>
                {participants.length === 0 ? (
                  <p className="text-muted cc-small">No active participants.</p>
                ) : (
                  <ul className="cc-people">
                    {participants.map((p) => (
                      <li key={p.user_id}>
                        <div>
                          <div className="cc-person-name">
                            {p.full_name}
                            {p.user_id === currentUserId && <span className="cc-you"> (you)</span>}
                          </div>
                          <div className="cc-small text-dim">{p.email}</div>
                          <div className="cc-tags">
                            {p.is_primary && <span className="cc-tag primary">Primary</span>}
                            {p.is_inviter && <span className="cc-tag">Inviter</span>}
                          </div>
                        </div>
                        {canManage && !p.is_primary && !p.is_inviter && (
                          <button
                            className="ins-btn-outline-danger ins-btn-sm"
                            onClick={() => {
                              setConfirmError(null);
                              setConfirm({ kind: "remove", participant: p });
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && participants.some((p) => p.is_primary || p.is_inviter) && (
                  <p className="cc-small text-dim">
                    The primary employee must be reassigned, and the original inviter is kept, before either can be removed.
                  </p>
                )}

                {canManage && (
                  <>
                    {staffError && (
                      <div className="ins-alert error" role="alert">
                        <span>{staffError}</span>
                      </div>
                    )}
                    <h4>Primary responsible employee</h4>
                    <label className="cc-field">
                      <span>Assign to</span>
                      <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={busy !== null}>
                        <option value="">Select an employee…</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id} disabled={s.id === detail.primary_assignee?.id}>
                            {s.full_name}
                            {s.id === detail.primary_assignee?.id ? " (current)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="cc-field">
                      <span>Reason (optional)</span>
                      <textarea
                        rows={2}
                        maxLength={CHAT_ASSIGNMENT_REASON_MAX_LENGTH}
                        value={assignReason}
                        onChange={(e) => setAssignReason(e.target.value)}
                        disabled={busy !== null}
                        placeholder="Why is the conversation being reassigned?"
                      />
                    </label>
                    <button className="btn-primary ins-btn-sm" onClick={handleAssign} disabled={!assigneeId || busy !== null}>
                      {busy === "assign" ? "Assigning…" : "Assign"}
                    </button>

                    <h4>Add participant</h4>
                    <label className="cc-field">
                      <span>Employee</span>
                      <select value={newParticipantId} onChange={(e) => setNewParticipantId(e.target.value)} disabled={busy !== null}>
                        <option value="">Select an employee…</option>
                        {addableStaff.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="btn-secondary ins-btn-sm" onClick={handleAddParticipant} disabled={!newParticipantId || busy !== null}>
                      {busy === "add" ? "Adding…" : "Add participant"}
                    </button>
                  </>
                )}
              </div>
            )}

            {panelTab === "history" && canManage && (
              <div className="cc-panel-body">
                <h4>Assignment history</h4>
                {historyError ? (
                  <div className="ins-alert error" role="alert">
                    <span>{historyError}</span>
                  </div>
                ) : history.length === 0 ? (
                  <p className="text-muted cc-small">No assignment changes recorded yet.</p>
                ) : (
                  <ol className="cc-history">
                    {history.map((h) => (
                      <li key={h.id}>
                        <div>
                          <strong>{nameOf(h.new_assignee_user_id)}</strong>
                          {h.previous_assignee_user_id ? <> took over from {nameOf(h.previous_assignee_user_id)}</> : <> was assigned</>}
                        </div>
                        <div className="cc-small text-dim">
                          By {nameOf(h.changed_by_user_id)} · {formatMessageDateTime(h.created_at)}
                        </div>
                        {h.reason && <div className="cc-small">“{h.reason}”</div>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </aside>
        )}
      </div>

      {confirm && (
        <div className="ins-modal-overlay" role="presentation">
          <div className="ins-modal" role="alertdialog" aria-modal="true" aria-labelledby="cc-confirm-title">
            <div className="ins-modal-header">
              <h3 id="cc-confirm-title">{confirm.kind === "close" ? "Close this conversation?" : "Remove participant?"}</h3>
              <button className="ins-modal-close" onClick={() => setConfirm(null)} disabled={busy !== null} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ins-modal-body">
              <p style={{ margin: 0 }}>
                {confirm.kind === "close"
                  ? "The customer will not be able to send messages until the conversation is reopened."
                  : `${confirm.participant.full_name} will no longer see or reply to this conversation.`}
              </p>
              {confirmError && (
                <div className="ins-alert error" role="alert" style={{ marginTop: 12 }}>
                  <span>{confirmError}</span>
                </div>
              )}
            </div>
            <div className="ins-modal-footer">
              <button className="btn-secondary" onClick={() => setConfirm(null)} disabled={busy !== null}>
                Cancel
              </button>
              <button
                className="ins-btn-danger"
                disabled={busy !== null}
                onClick={() =>
                  confirm.kind === "close" ? void changeStatus("Closed") : void handleRemoveParticipant(confirm.participant)
                }
              >
                {busy !== null ? "Working…" : confirm.kind === "close" ? "Close conversation" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
