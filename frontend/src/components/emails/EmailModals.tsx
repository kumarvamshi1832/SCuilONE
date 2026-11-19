import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { deleteEmail, getEmail, getEmailThread, isSmtpFailure, logEmail, relinkEmail, sendEmail } from "../../services/emailLogService";
import { getApiErrorMessage } from "../../utils/apiError";
import { findInvalidAddress, localInputToNaiveUtc, parseAddressList } from "../../utils/emailAddress";
import { formatMessageDateTime } from "../../utils/messageTime";
import { EMAIL_LIMITS } from "../../types/emailLog";
import type { EmailDetail, EmailDirection, EmailLinks, EmailSummary } from "../../types/emailLog";
import { DEFAULT_ENTITY_LABELS, EmailDirectionBadge, EmailLinkChips, EmailLinkFields, EmailStatusBadge } from "./emailUi";
import type { EntityLabels } from "./emailUi";
import "./Emails.css";

const hasLinks = (links: EmailLinks): boolean => Boolean(links.lead_id || links.contact_id || links.account_id || links.deal_id);
const joinList = (list: string[] | null | undefined): string => (list ?? []).join(", ");

/* ───────────────────────── compose / reply ───────────────────────── */

export interface ComposeInitial {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
  links?: EmailLinks;
  replyTo?: EmailDetail | null;
}

interface ComposeModalProps {
  initial?: ComposeInitial;
  labels?: EntityLabels;
  /** Hides the link pickers (used when composing from a record's own page: the links are fixed). */
  lockLinks?: boolean;
  onClose: () => void;
  onSent: (email: EmailDetail) => void;
  /** The mail server refused the message; the backend stored it as "Failed". */
  onFailedRecorded?: () => void;
}

export function EmailComposeModal({ initial, labels = DEFAULT_ENTITY_LABELS, lockLinks, onClose, onSent, onFailedRecorded }: ComposeModalProps) {
  const [to, setTo] = useState(joinList(initial?.to));
  const [cc, setCc] = useState(joinList(initial?.cc));
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [links, setLinks] = useState<EmailLinks>(initial?.links ?? {});
  const [error, setError] = useState<string | null>(null);
  const [failedRecorded, setFailedRecorded] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const reply = initial?.replyTo ?? null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sendingRef.current) return;
    setError(null);
    const toList = parseAddressList(to);
    const ccList = parseAddressList(cc);
    const cleanSubject = subject.trim();
    if (toList.length === 0) return setError("Enter at least one recipient.");
    if (toList.length > EMAIL_LIMITS.sendRecipients) return setError(`At most ${EMAIL_LIMITS.sendRecipients} recipients are allowed.`);
    if (ccList.length > EMAIL_LIMITS.sendRecipients) return setError(`At most ${EMAIL_LIMITS.sendRecipients} CC recipients are allowed.`);
    const bad = findInvalidAddress([...toList, ...ccList]);
    if (bad) return setError(`"${bad}" is not a valid e-mail address.`);
    if (!cleanSubject) return setError("Enter a subject.");
    if (cleanSubject.length > EMAIL_LIMITS.subjectSend) return setError(`The subject can be at most ${EMAIL_LIMITS.subjectSend} characters.`);
    if (!body.trim()) return setError("Write a message.");
    if (body.length > EMAIL_LIMITS.bodySend) return setError(`The message can be at most ${EMAIL_LIMITS.bodySend.toLocaleString()} characters.`);

    sendingRef.current = true;
    setSending(true);
    setFailedRecorded(false);
    try {
      const sent = await sendEmail({
        to: toList,
        cc: ccList,
        subject: cleanSubject,
        body,
        in_reply_to_email_id: reply?.id ?? null,
        ...links,
      });
      onSent(sent);
    } catch (err) {
      if (isSmtpFailure(err)) {
        // HTTP 502: the SMTP server rejected the message. The backend saved it as a Failed e-mail in the timeline.
        setFailedRecorded(true);
        setError(getApiErrorMessage(err, "The email could not be sent. It was saved as Failed in the timeline."));
        onFailedRecorded?.();
      } else {
        setError(getApiErrorMessage(err, "The email could not be sent."));
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="ins-modal-overlay" role="presentation">
      <form className="ins-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="em-compose-title" onSubmit={submit} noValidate>
        <div className="ins-modal-header">
          <h3 id="em-compose-title">{reply ? "Reply" : "Compose email"}</h3>
          <button type="button" className="ins-modal-close" onClick={onClose} disabled={sending} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ins-modal-body em-form">
          {reply && (
            <div className="em-quote">
              Replying to <strong>{reply.subject || "(no subject)"}</strong> from {reply.from_email || "unknown sender"}
            </div>
          )}
          <label className="em-field">
            <span>To * <small>(separate several addresses with commas)</small></span>
            <input type="text" value={to} onChange={(e) => setTo(e.target.value)} disabled={sending} placeholder="name@example.com" autoFocus />
          </label>
          <label className="em-field">
            <span>CC</span>
            <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} disabled={sending} />
          </label>
          <label className="em-field">
            <span>Subject *</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sending} maxLength={EMAIL_LIMITS.subjectSend} />
          </label>
          <label className="em-field">
            <span>Message *</span>
            <textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} disabled={sending} />
            <small className={body.length > EMAIL_LIMITS.bodySend ? "em-error-text" : "em-muted"}>
              {body.length.toLocaleString()} / {EMAIL_LIMITS.bodySend.toLocaleString()} · plain text
            </small>
          </label>
          {!lockLinks && (
            <fieldset className="em-fieldset" disabled={sending}>
              <legend>Link to CRM records</legend>
              <p className="em-muted">
                {reply
                  ? "Linked to the same records as the original message unless you change them."
                  : "Leave empty to link automatically by recipient address."}
              </p>
              <EmailLinkFields value={links} onChange={setLinks} labels={labels} />
            </fieldset>
          )}
          {error && (
            <div className="ins-alert error" role="alert">
              <span>
                {error}
                {failedRecorded && " You can find it in the email list with the Failed status and send it again."}
              </span>
            </div>
          )}
        </div>
        <div className="ins-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={sending}>
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────── manual logging ───────────────────────── */

interface LogModalProps {
  initialLinks?: EmailLinks;
  labels?: EntityLabels;
  lockLinks?: boolean;
  onClose: () => void;
  onLogged: (email: EmailDetail) => void;
}

export function EmailLogModal({ initialLinks, labels = DEFAULT_ENTITY_LABELS, lockLinks, onClose, onLogged }: LogModalProps) {
  const [direction, setDirection] = useState<EmailDirection>("Outbound");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [messageId, setMessageId] = useState("");
  const [inReplyTo, setInReplyTo] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [links, setLinks] = useState<EmailLinks>(initialLinks ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    setError(null);
    const toList = parseAddressList(to);
    const ccList = parseAddressList(cc);
    if (toList.length === 0) return setError("Enter at least one recipient.");
    if (toList.length > EMAIL_LIMITS.logRecipients || ccList.length > EMAIL_LIMITS.logRecipients) {
      return setError(`At most ${EMAIL_LIMITS.logRecipients} recipients are allowed per field.`);
    }
    const fromList = parseAddressList(from);
    if (fromList.length > 1) return setError("Enter a single sender address.");
    if (direction === "Inbound" && fromList.length === 0) return setError("Enter the sender address of the received email.");
    const bad = findInvalidAddress([...fromList, ...toList, ...ccList]);
    if (bad) return setError(`"${bad}" is not a valid e-mail address.`);
    if (subject.length > EMAIL_LIMITS.subjectLog) return setError(`The subject can be at most ${EMAIL_LIMITS.subjectLog} characters.`);
    if (body.length > EMAIL_LIMITS.bodyLog) return setError(`The message can be at most ${EMAIL_LIMITS.bodyLog.toLocaleString()} characters.`);
    if (!subject.trim() && !body.trim()) return setError("Enter a subject or a message.");
    if (messageId.length > EMAIL_LIMITS.messageId || inReplyTo.length > EMAIL_LIMITS.messageId) {
      return setError(`Message IDs can be at most ${EMAIL_LIMITS.messageId} characters.`);
    }
    const occurred = occurredAt ? localInputToNaiveUtc(occurredAt) : null;
    if (occurredAt && !occurred) return setError("Enter a valid date and time.");

    savingRef.current = true;
    setSaving(true);
    try {
      const logged = await logEmail({
        direction,
        subject: subject.trim(),
        body_text: body,
        from_email: fromList[0] ?? null,
        to_emails: toList,
        cc_emails: ccList,
        message_id: messageId,
        in_reply_to: inReplyTo,
        occurred_at: occurred,
        ...links,
      });
      onLogged(logged);
    } catch (err) {
      setError(getApiErrorMessage(err, "The email could not be recorded."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="ins-modal-overlay" role="presentation">
      <form className="ins-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="em-log-title" onSubmit={submit} noValidate>
        <div className="ins-modal-header">
          <h3 id="em-log-title">Record an email</h3>
          <button type="button" className="ins-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ins-modal-body em-form">
          <p className="em-muted" style={{ margin: 0 }}>
            Keep a copy of an email that was sent or received outside the CRM. Nothing is sent from here.
          </p>
          <div className="em-grid-2">
            <label className="em-field">
              <span>Direction *</span>
              <select value={direction} onChange={(e) => setDirection(e.target.value as EmailDirection)} disabled={saving}>
                <option value="Outbound">Outbound (sent by us)</option>
                <option value="Inbound">Inbound (received)</option>
              </select>
            </label>
            <label className="em-field">
              <span>Date &amp; time</span>
              <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} disabled={saving} />
              <small className="em-muted">Defaults to now</small>
            </label>
          </div>
          <label className="em-field">
            <span>From {direction === "Inbound" ? "*" : ""}</span>
            <input type="text" value={from} onChange={(e) => setFrom(e.target.value)} disabled={saving} placeholder="sender@example.com" />
          </label>
          <label className="em-field">
            <span>To * <small>(comma separated)</small></span>
            <input type="text" value={to} onChange={(e) => setTo(e.target.value)} disabled={saving} />
          </label>
          <label className="em-field">
            <span>CC</span>
            <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} disabled={saving} />
          </label>
          <label className="em-field">
            <span>Subject</span>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={saving} maxLength={EMAIL_LIMITS.subjectLog} />
          </label>
          <label className="em-field">
            <span>Message</span>
            <textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} disabled={saving} />
          </label>
          <div className="em-grid-2">
            <label className="em-field">
              <span>Message-ID</span>
              <input type="text" value={messageId} onChange={(e) => setMessageId(e.target.value)} disabled={saving} placeholder="<abc@mail.example.com>" />
            </label>
            <label className="em-field">
              <span>In reply to (Message-ID)</span>
              <input type="text" value={inReplyTo} onChange={(e) => setInReplyTo(e.target.value)} disabled={saving} />
            </label>
          </div>
          {!lockLinks && (
            <fieldset className="em-fieldset" disabled={saving}>
              <legend>Link to CRM records</legend>
              <p className="em-muted">Leave empty to link automatically by e-mail address.</p>
              <EmailLinkFields value={links} onChange={setLinks} labels={labels} />
            </fieldset>
          )}
          {error && (
            <div className="ins-alert error" role="alert">
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="ins-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Record email"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────── link / relink ───────────────────────── */

interface LinksModalProps {
  email: EmailSummary;
  labels?: EntityLabels;
  onClose: () => void;
  onSaved: (email: EmailSummary) => void;
}

export function EmailLinksModal({ email, labels = DEFAULT_ENTITY_LABELS, onClose, onSaved }: LinksModalProps) {
  const [links, setLinks] = useState<EmailLinks>({
    lead_id: email.lead_id ?? null,
    contact_id: email.contact_id ?? null,
    account_id: email.account_id ?? null,
    deal_id: email.deal_id ?? null,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await relinkEmail(email.id, links));
    } catch (err) {
      setError(getApiErrorMessage(err, "The links could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ins-modal-overlay" role="presentation">
      <div className="ins-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="em-links-title">
        <div className="ins-modal-header">
          <h3 id="em-links-title">Link email to records</h3>
          <button className="ins-modal-close" onClick={onClose} disabled={saving} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ins-modal-body em-form">
          <div className="em-quote">
            <strong>{email.subject || "(no subject)"}</strong>
          </div>
          <p className="em-muted" style={{ margin: 0 }}>
            Saving replaces the current links. Choose “None” to remove a link.
          </p>
          <EmailLinkFields value={links} onChange={setLinks} labels={labels} disabled={saving} />
          {error && (
            <div className="ins-alert error" role="alert">
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="ins-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save links"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── delete confirmation ───────────────────────── */

interface DeleteModalProps {
  email: EmailSummary;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function EmailDeleteModal({ email, onClose, onDeleted }: DeleteModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteEmail(email.id);
      onDeleted(email.id);
    } catch (err) {
      setError(getApiErrorMessage(err, "The email could not be deleted."));
      setBusy(false);
    }
  };

  return (
    <div className="ins-modal-overlay" role="presentation">
      <div className="ins-modal" role="alertdialog" aria-modal="true" aria-labelledby="em-del-title">
        <div className="ins-modal-header">
          <h3 id="em-del-title">Delete this email?</h3>
          <button className="ins-modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ins-modal-body">
          <p style={{ margin: 0 }}>
            <strong>{email.subject || "(no subject)"}</strong> will be permanently removed from the email timeline. This cannot be undone.
          </p>
          {error && (
            <div className="ins-alert error" role="alert" style={{ marginTop: 12 }}>
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="ins-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="ins-btn-danger" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Deleting…" : "Delete email"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── detail + thread ───────────────────────── */

interface DetailModalProps {
  summary: EmailSummary;
  labels?: EntityLabels;
  linkNames?: Map<string, string>;
  canReply: boolean;
  canLink: boolean;
  canDelete: boolean;
  onClose: () => void;
  onReply: (email: EmailDetail) => void;
  onRelink: (email: EmailSummary) => void;
  onDelete: (email: EmailSummary) => void;
}

export function EmailDetailModal({ summary, labels = DEFAULT_ENTITY_LABELS, linkNames, canReply, canLink, canDelete, onClose, onReply, onRelink, onDelete }: DetailModalProps) {
  const [thread, setThread] = useState<EmailDetail[]>([]);
  const [activeId, setActiveId] = useState(summary.id);
  const [single, setSingle] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActiveId(summary.id);
    // The thread already contains the full body of every message; fall back to the single e-mail if it fails.
    getEmailThread(summary.thread_id, controller.signal)
      .then((rows) => {
        setThread(rows);
        if (!rows.some((r) => r.id === summary.id)) return getEmail(summary.id, controller.signal).then(setSingle);
        return undefined;
      })
      .catch((err) => {
        if ((err as { code?: string })?.code === "ERR_CANCELED") return;
        return getEmail(summary.id, controller.signal)
          .then(setSingle)
          .catch((inner) => {
            if ((inner as { code?: string })?.code !== "ERR_CANCELED") {
              setError(getApiErrorMessage(inner, "Could not load this email."));
            }
          });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [summary.id, summary.thread_id]);

  const active = useMemo(() => thread.find((t) => t.id === activeId) ?? (activeId === summary.id ? single : null), [thread, activeId, single, summary.id]);
  const shown: EmailSummary = active ?? summary;

  return (
    <div className="ins-modal-overlay" role="presentation" onClick={onClose}>
      <div className="ins-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="em-detail-title" onClick={(e) => e.stopPropagation()}>
        <div className="ins-modal-header">
          <h3 id="em-detail-title">{shown.subject || "(no subject)"}</h3>
          <button className="ins-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ins-modal-body em-detail">
          <div className="em-detail-badges">
            <EmailDirectionBadge direction={shown.direction} />
            <EmailStatusBadge status={shown.status} />
            <span className="em-muted">{formatMessageDateTime(shown.occurred_at)}</span>
          </div>
          <dl className="em-meta">
            <dt>From</dt>
            <dd>{shown.from_email || "—"}</dd>
            <dt>To</dt>
            <dd>{joinList(shown.to_emails) || "—"}</dd>
            {(shown.cc_emails?.length ?? 0) > 0 && (
              <>
                <dt>CC</dt>
                <dd>{joinList(shown.cc_emails)}</dd>
              </>
            )}
            <dt>Linked to</dt>
            <dd>
              <EmailLinkChips links={shown} labels={labels} names={linkNames} />
            </dd>
          </dl>

          {active?.status === "Failed" && (
            <div className="ins-alert error" role="alert">
              <span>
                This email was not delivered{active.error_message ? ` (${active.error_message})` : ""}. It was saved here so you can review it and send it again.
              </span>
            </div>
          )}

          {loading ? (
            <div className="ins-loading" aria-busy="true">
              <div className="leads-loading-spinner" /> Loading message…
            </div>
          ) : error ? (
            <div className="ins-alert error" role="alert">
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Plain text only: bodies are rendered as text, never as HTML. */}
              <pre className="em-body">{active?.body_text || shown.body_preview || "(empty message)"}</pre>
              {thread.length > 1 && (
                <div className="em-thread">
                  <h4>Conversation ({thread.length})</h4>
                  <ol>
                    {thread.map((t) => (
                      <li key={t.id}>
                        <button className={`em-thread-item ${t.id === activeId ? "active" : ""}`} onClick={() => setActiveId(t.id)}>
                          <span className="em-thread-top">
                            <EmailDirectionBadge direction={t.direction} />
                            <EmailStatusBadge status={t.status} />
                            <span className="em-muted">{formatMessageDateTime(t.occurred_at)}</span>
                          </span>
                          <span className="em-thread-from">{t.from_email || "—"}</span>
                          <span className="em-thread-preview">{t.body_preview || "(empty message)"}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
        <div className="ins-modal-footer">
          {canDelete && (
            <button className="ins-btn-outline-danger ins-btn-sm em-footer-left" onClick={() => onDelete(shown)}>
              Delete
            </button>
          )}
          {canLink && (
            <button className="btn-secondary" onClick={() => onRelink(shown)}>
              {hasLinks(shown) ? "Change links" : "Link to records"}
            </button>
          )}
          {canReply && active && (
            <button className="btn-primary" onClick={() => onReply(active)}>
              Reply
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
