import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ModalPortal from "../common/ModalPortal";
import { getEmails, isEmailsSupported } from "../../services/emailLogService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatMessageDateTime } from "../../utils/messageTime";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import type { EmailDetail, EmailLinkEntity, EmailLinks, EmailListParams, EmailSummary } from "../../types/emailLog";
import { EmailComposeModal, EmailDeleteModal, EmailDetailModal, EmailLinksModal } from "./EmailModals";
import type { ComposeInitial } from "./EmailModals";
import { EmailDirectionBadge, EmailStatusBadge, LINK_KEY } from "./emailUi";
import "./Emails.css";

const STEP = 10;

interface EmailTimelineProps {
  entity: EmailLinkEntity;
  recordId: string;
  /** Pre-fills the recipient when composing from this record (the record's own e-mail address). */
  recipient?: string | null;
}

/**
 * Email history of one Lead / Contact / Account / Deal, shown inside the record's detail modal.
 * It lists the e-mail log only; activities and notes keep their own timelines elsewhere.
 */
export default function EmailTimeline({ entity, recordId, recipient }: EmailTimelineProps) {
  const canView = useMemo(() => hasFeaturePermission("email.view"), []);
  const canCreate = useMemo(() => hasFeaturePermission("email.create"), []);
  const canDelete = useMemo(() => hasFeaturePermission("email.delete"), []);

  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [limit, setLimit] = useState(STEP);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<EmailSummary | null>(null);
  const [composing, setComposing] = useState<ComposeInitial | null>(null);
  const [relinking, setRelinking] = useState<EmailSummary | null>(null);
  const [deleting, setDeleting] = useState<EmailSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);

  const recordLinks: EmailLinks = useMemo(() => {
    const links: EmailLinks = {};
    links[LINK_KEY[entity]] = recordId;
    return links;
  }, [entity, recordId]);

  const load = useCallback(async () => {
    if (!canView) return;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      if (!isEmailsSupported()) {
        setRows([]);
        setLoading(false);
        return;
      }
      const params: EmailListParams = { limit: limit + 1, skip: 0 };
      params[LINK_KEY[entity]] = recordId;
      const data = await getEmails(params);
      if (mine !== seq.current) return;
      setHasMore(data.length > limit);
      setRows(data.slice(0, limit));
    } catch (err: any) {
      if (mine !== seq.current) return;
      setRows([]);
      if (err?.response?.status === 404 || !isEmailsSupported()) {
        setError(null);
      } else {
        setError(getApiErrorMessage(err, "Could not load the email history."));
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [canView, entity, recordId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return null;

  const afterSent = (email: EmailDetail) => {
    setComposing(null);
    setNotice(`Email sent to ${(email.to_emails ?? []).join(", ")}.`);
    void load();
  };

  return (
    <section className="em-timeline" aria-label="Email history">
      <div className="em-timeline-head">
        <h4>Emails</h4>
        {canCreate && (
          <button
            className="btn-secondary ins-btn-sm"
            onClick={() => {
              setNotice(null);
              setComposing({ to: recipient ? [recipient] : [], links: recordLinks });
            }}
          >
            Send email
          </button>
        )}
      </div>

      {notice && (
        <div className="ins-alert ins-toast success" role="status" style={{ position: "static", marginBottom: 8 }}>
          <span>{notice}</span>
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div className="ins-loading" aria-busy="true">
          <div className="leads-loading-spinner" /> Loading emails…
        </div>
      ) : error ? (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="em-muted" style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
          {!isEmailsSupported()
            ? "Email history integration is currently not enabled on this server."
            : "No emails are linked to this record yet."}
        </p>
      ) : (
        <>
          <ul className="em-timeline-list">
            {rows.map((row) => (
              <li key={row.id}>
                <button className="em-timeline-item" onClick={() => setViewing(row)}>
                  <span className="em-timeline-top">
                    <EmailDirectionBadge direction={row.direction} />
                    <EmailStatusBadge status={row.status} />
                    <span className="em-muted">{formatMessageDateTime(row.occurred_at)}</span>
                  </span>
                  <span className="em-timeline-subject">{row.subject || "(no subject)"}</span>
                  <span className="em-preview">{row.body_preview || "—"}</span>
                </button>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button className="btn-secondary ins-btn-sm" style={{ marginTop: 8 }} onClick={() => setLimit((l) => l + STEP)} disabled={loading}>
              {loading ? "Loading…" : "Show older emails"}
            </button>
          )}
        </>
      )}

      <ModalPortal>
        {viewing && (
          <EmailDetailModal
            summary={viewing}
            canReply={canCreate}
            canLink={canCreate}
            canDelete={canDelete}
            onClose={() => setViewing(null)}
            onReply={(email) => {
              setViewing(null);
              setComposing({
                replyTo: email,
                to: email.direction === "Inbound" ? (email.from_email ? [email.from_email] : []) : email.to_emails ?? [],
                subject: /^re:/i.test(email.subject) ? email.subject : `Re: ${email.subject}`.trim(),
                links: { lead_id: email.lead_id, contact_id: email.contact_id, account_id: email.account_id, deal_id: email.deal_id },
              });
            }}
            onRelink={(email) => {
              setViewing(null);
              setRelinking(email);
            }}
            onDelete={(email) => {
              setViewing(null);
              setDeleting(email);
            }}
          />
        )}
        {composing && (
          <EmailComposeModal
            initial={composing}
            lockLinks={!composing.replyTo}
            onClose={() => setComposing(null)}
            onSent={afterSent}
            onFailedRecorded={() => void load()}
          />
        )}
        {relinking && (
          <EmailLinksModal
            email={relinking}
            onClose={() => setRelinking(null)}
            onSaved={() => {
              setRelinking(null);
              void load();
            }}
          />
        )}
        {deleting && (
          <EmailDeleteModal
            email={deleting}
            onClose={() => setDeleting(null)}
            onDeleted={() => {
              setDeleting(null);
              void load();
            }}
          />
        )}
      </ModalPortal>
    </section>
  );
}
