import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer, ChatThread } from "../../components/chat/ChatThread";
import {
  getPortalChatConversation,
  markPortalChatRead,
  sendPortalChatMessage,
} from "../../services/customerPortalChatService";
import { getPortalErrorMessage } from "../../utils/apiError";
import type { ChatConversationDetail, ChatMessage } from "../../types/customerChat";
import "./CustomerPortalTickets.css";
import "./CustomerPortalChat.css";

const POLL_MS = 12_000;

const httpStatus = (err: unknown): number | undefined =>
  (err as { response?: { status?: number } })?.response?.status;

export default function CustomerPortalChat() {
  const [conversation, setConversation] = useState<ChatConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  /** `unavailable` = no conversation exists yet (404); `error` = anything else. */
  const [problem, setProblem] = useState<{ kind: "unavailable" | "error"; message: string } | null>(null);
  const seq = useRef(0);
  const lastStaffMarker = useRef("");

  const load = useCallback(async (mode: "initial" | "poll") => {
    const mine = ++seq.current;
    if (mode === "initial") {
      setLoading(true);
      setProblem(null);
    }
    try {
      // The GET already records that the customer has read the conversation.
      const data = await getPortalChatConversation();
      if (mine !== seq.current) return;
      setConversation(data);
      setProblem(null);
      const lastStaff = [...data.messages].reverse().find((m) => m.sender_type === "Staff");
      if (lastStaff && lastStaffMarker.current !== lastStaff.id) {
        lastStaffMarker.current = lastStaff.id;
        markPortalChatRead().catch(() => undefined);
      }
    } catch (err) {
      if (mine !== seq.current) return;
      if (mode === "poll") return; // keep showing the last good state
      setConversation(null);
      setProblem(
        httpStatus(err) === 404
          ? {
              kind: "unavailable",
              message: getPortalErrorMessage(
                err,
                "Your conversation has not been set up yet. Please contact the company."
              ),
            }
          : { kind: "error", message: getPortalErrorMessage(err, "Could not load your conversation.") }
      );
    } finally {
      if (mine === seq.current && mode === "initial") setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) void load("poll");
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const handleSend = async (content: string) => {
    try {
      const sent = await sendPortalChatMessage(content);
      seq.current += 1; // discard a refresh that started before this message existed
      setConversation((prev) =>
        prev && !prev.messages.some((m) => m.id === sent.id)
          ? { ...prev, messages: [...prev.messages, sent], last_message_at: sent.created_at }
          : prev
      );
    } catch (err) {
      // 409: the conversation was closed or its contact person is being reassigned. Pick up the new status.
      if (httpStatus(err) === 409) void load("poll");
      throw new Error(getPortalErrorMessage(err, "Your message could not be sent. Please try again."));
    }
  };

  const status = conversation?.status ?? "";
  const lock =
    status === "Closed"
      ? "This conversation is closed. Please contact the company if you need it reopened."
      : status === "Needs Reassignment"
      ? "Your contact person is being reassigned. The company has been notified — please try again shortly."
      : null;

  // The customer API does not expose which employee wrote a message, so staff replies are labelled as the team.
  const senderLabel = (message: ChatMessage): string => (message.sender_type === "Customer" ? "You" : "Our team");

  return (
    <div className="cp-tickets-page">
      <div className="cp-tickets-header">
        <div>
          <h1>Messages</h1>
          <p>Chat directly with your contact person at the company.</p>
        </div>
        <button className="btn-secondary" onClick={() => void load("initial")} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="cp-chat-card cp-chat-state" aria-busy="true">
          <div className="cp-skeleton" style={{ height: 22, width: "40%" }} />
          <div className="cp-skeleton" style={{ height: 70, width: "70%" }} />
          <div className="cp-skeleton" style={{ height: 70, width: "55%", alignSelf: "flex-end" }} />
        </div>
      ) : problem ? (
        <div className="cp-chat-card cp-chat-state" role={problem.kind === "error" ? "alert" : "status"}>
          <h3>{problem.kind === "unavailable" ? "Chat is not available yet" : "Something went wrong"}</h3>
          <p>{problem.message}</p>
          {problem.kind === "error" && (
            <button className="btn-primary" onClick={() => void load("initial")}>
              Try again
            </button>
          )}
        </div>
      ) : conversation ? (
        <div className="cp-chat-card">
          <div className="cp-chat-head">
            <div>
              <div className="cp-chat-contact">
                {conversation.primary_assignee ? conversation.primary_assignee.name : "Awaiting a contact person"}
              </div>
              <div className="cp-chat-sub">
                {conversation.account_name ? `${conversation.account_name} · ` : ""}
                Your dedicated contact
              </div>
            </div>
            <span className={`cp-chat-status ${status === "Open" ? "open" : status === "Closed" ? "closed" : "pending"}`}>
              {status === "Needs Reassignment" ? "Being reassigned" : status}
            </span>
          </div>
          <ChatThread
            messages={conversation.messages}
            perspective="customer"
            senderLabel={senderLabel}
            isOwn={(m) => m.sender_type === "Customer"}
            emptyText="No messages yet. Say hello to start the conversation."
          />
          <ChatComposer onSend={handleSend} disabledReason={lock} placeholder="Write a message to the company…" />
        </div>
      ) : null}
    </div>
  );
}
