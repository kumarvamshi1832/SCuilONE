import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ChatMessage } from "../../types/customerChat";
import { CHAT_MESSAGE_MAX_LENGTH } from "../../types/customerChat";
import { dayKey, formatDayLabel, formatMessageDateTime } from "../../utils/messageTime";
import "./ChatThread.css";

export type ChatPerspective = "staff" | "customer";

interface ChatThreadProps {
  messages: ChatMessage[];
  /** Whose screen this is. Messages written by the viewer's own side are aligned right. */
  perspective: ChatPerspective;
  /** Label above each bubble. */
  senderLabel: (message: ChatMessage) => string;
  /** Marks a bubble as written by the viewer themself. */
  isOwn: (message: ChatMessage) => boolean;
  emptyText?: string;
}

/** Scrollable message list with day dividers. Sticks to the bottom unless the reader scrolled up. */
export function ChatThread({ messages, perspective, senderLabel, isOwn, emptyText }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const lastCount = useRef(0);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // First render of a conversation, or a new message while the reader is at the bottom.
    if (lastCount.current === 0 || stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastCount.current = messages.length;
  }, [messages]);

  let previousDay = "";
  return (
    <div className="chat-thread" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-label="Messages">
      {messages.length === 0 && <p className="chat-thread-empty">{emptyText ?? "No messages yet."}</p>}
      {messages.map((message) => {
        const day = dayKey(message.created_at);
        const showDay = day !== previousDay;
        previousDay = day;
        const own = isOwn(message);
        const fromCustomer = message.sender_type === "Customer";
        const side = (perspective === "staff" ? !fromCustomer : fromCustomer) ? "right" : "left";
        return (
          <div key={message.id}>
            {showDay && <div className="chat-day-divider"><span>{formatDayLabel(message.created_at)}</span></div>}
            <div className={`chat-row ${side}`}>
              <div className={`chat-bubble ${fromCustomer ? "customer" : "staff"} ${own ? "own" : ""}`}>
                <div className="chat-bubble-meta">
                  <span className="chat-bubble-sender">{senderLabel(message)}</span>
                  <span className={`chat-role-tag ${fromCustomer ? "customer" : "staff"}`}>
                    {fromCustomer ? "Customer" : "Staff"}
                  </span>
                </div>
                <p className="chat-bubble-text">{message.content}</p>
                <time className="chat-bubble-time" dateTime={message.created_at}>
                  {formatMessageDateTime(message.created_at)}
                </time>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ChatComposerProps {
  onSend: (content: string) => Promise<void>;
  /** When set the composer is locked and this text explains why. */
  disabledReason?: string | null;
  placeholder?: string;
}

/** Message box. Enter sends, Shift+Enter inserts a new line. The draft is kept when sending fails. */
export function ChatComposer({ onSend, disabledReason, placeholder }: ChatComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  const trimmed = text.trim();
  const tooLong = text.length > CHAT_MESSAGE_MAX_LENGTH;
  const locked = Boolean(disabledReason);

  const submit = async () => {
    if (sendingRef.current || locked || !trimmed || tooLong) return;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The message could not be sent.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="chat-composer">
      {locked && <div className="chat-composer-locked" role="status">{disabledReason}</div>}
      {error && <div className="chat-composer-error" role="alert">{error}</div>}
      <div className="chat-composer-row">
        <textarea
          className="chat-composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder={locked ? "Messaging is unavailable" : placeholder ?? "Write a message…  (Enter to send, Shift+Enter for a new line)"}
          disabled={locked || sending}
          aria-label="Message"
        />
        <button
          type="button"
          className="chat-send-btn"
          onClick={() => void submit()}
          disabled={locked || sending || !trimmed || tooLong}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      {tooLong && (
        <div className="chat-composer-error" role="alert">
          Messages can be at most {CHAT_MESSAGE_MAX_LENGTH.toLocaleString()} characters ({text.length.toLocaleString()} entered).
        </div>
      )}
    </div>
  );
}
