import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EmailComposeModal,
  EmailDeleteModal,
  EmailDetailModal,
  EmailLinksModal,
  EmailLogModal,
} from "../../components/emails/EmailModals";
import type { ComposeInitial } from "../../components/emails/EmailModals";
import {
  EmailDirectionBadge,
  EmailLinkChips,
  EmailStatusBadge,
  RecordPicker,
  DEFAULT_ENTITY_LABELS,
  LINK_KEY,
  useLinkNames,
} from "../../components/emails/emailUi";
import { getEmailWebhookInfo, getEmails } from "../../services/emailLogService";
import { getApiErrorMessage } from "../../utils/apiError";
import { formatMessageDateTime } from "../../utils/messageTime";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { EMAIL_LINK_ENTITIES } from "../../types/emailLog";
import type {
  EmailDetail,
  EmailDirection,
  EmailLinkEntity,
  EmailListParams,
  EmailSummary,
  EmailWebhookInfo,
} from "../../types/emailLog";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";
import "../../components/emails/Emails.css";

const PAGE_SIZE = 25;
type LinkFilter = "" | "unlinked" | EmailLinkEntity;

const isCanceled = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === "ERR_CANCELED" || e?.name === "CanceledError" || e?.name === "AbortError";
};

export default function EmailLogs() {
  const perms = useMemo(
    () => ({
      view: hasFeaturePermission("email.view"),
      create: hasFeaturePermission("email.create"),
      remove: hasFeaturePermission("email.delete"),
      manage: hasFeaturePermission("email.manage"),
    }),
    []
  );

  const [direction, setDirection] = useState<"" | EmailDirection>("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("");
  const [linkRecordId, setLinkRecordId] = useState("");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState<EmailSummary[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<EmailSummary | null>(null);
  const [composing, setComposing] = useState<ComposeInitial | null>(null);
  const [logging, setLogging] = useState(false);
  const [relinking, setRelinking] = useState<EmailSummary | null>(null);
  const [deleting, setDeleting] = useState<EmailSummary | null>(null);

  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhook, setWebhook] = useState<EmailWebhookInfo | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [tokenShown, setTokenShown] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Debounce the subject search so typing does not fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const linkNames = useLinkNames(perms.view);

  const load = useCallback(async () => {
    if (!perms.view) {
      setLoading(false);
      return;
    }
    // A link filter on a record type needs a chosen record; wait until one is selected.
    if (linkFilter && linkFilter !== "unlinked" && !linkRecordId) {
      setRows([]);
      setHasNext(false);
      setLoading(false);
      setError(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const params: EmailListParams = {
        direction: direction || undefined,
        q: search,
        unlinked: linkFilter === "unlinked",
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE + 1,
      };
      if (linkFilter && linkFilter !== "unlinked") params[LINK_KEY[linkFilter]] = linkRecordId;
      const data = await getEmails(params, controller.signal);
      if (mine !== seq.current) return;
      setHasNext(data.length > PAGE_SIZE);
      setRows(data.slice(0, PAGE_SIZE));
    } catch (err) {
      if (isCanceled(err) || mine !== seq.current) return;
      setRows([]);
      setHasNext(false);
      setError(getApiErrorMessage(err, "Could not load emails."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [perms.view, direction, search, linkFilter, linkRecordId, page]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const openWebhook = async () => {
    const next = !webhookOpen;
    setWebhookOpen(next);
    if (!next || webhook || webhookLoading) return;
    setWebhookLoading(true);
    setWebhookError(null);
    try {
      setWebhook(await getEmailWebhookInfo());
    } catch (err) {
      setWebhookError(getApiErrorMessage(err, "Could not load the inbound email setup."));
    } finally {
      setWebhookLoading(false);
    }
  };

  const copyToken = async () => {
    if (!webhook) return;
    try {
      await navigator.clipboard.writeText(webhook.token);
      showToast("Token copied to the clipboard.");
    } catch {
      showToast("Copy failed. Reveal the token and copy it manually.", "error");
    }
  };

  const hasFilters = Boolean(direction || searchInput || linkFilter);
  const clearFilters = () => {
    setDirection("");
    setSearchInput("");
    setSearch("");
    setLinkFilter("");
    setLinkRecordId("");
    setPage(0);
  };

  const afterSent = (email: EmailDetail) => {
    setComposing(null);
    showToast(`Email sent to ${(email.to_emails ?? []).join(", ") || "recipient"}.`);
    setPage(0);
    void load();
  };

  const afterLogged = () => {
    setLogging(false);
    showToast("Email recorded.");
    setPage(0);
    void load();
  };

  if (!perms.view) {
    return (
      <div className="ins-page">
        <div className="page-header">
          <div>
            <h1>Emails</h1>
          </div>
        </div>
        <div className="ins-empty">
          <h3>Access denied</h3>
          <p>You do not have permission to view emails.</p>
        </div>
      </div>
    );
  }

  const webhookUrl = webhook ? `${import.meta.env.VITE_API_BASE_URL ?? ""}${webhook.path}` : "";

  return (
    <div className="ins-page">
      {toast && (
        <div className={`ins-alert ins-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Emails</h1>
          <p className="text-muted">
            Every email sent from the CRM, recorded manually or received, linked to your leads, contacts, accounts and deals.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          {perms.manage && (
            <button className="btn-secondary" onClick={() => void openWebhook()} aria-expanded={webhookOpen}>
              Inbound setup
            </button>
          )}
          {perms.create && (
            <>
              <button className="btn-secondary" onClick={() => setLogging(true)}>
                Record email
              </button>
              <button className="btn-primary" onClick={() => setComposing({})}>
                Compose
              </button>
            </>
          )}
        </div>
      </div>

      {webhookOpen && perms.manage && (
        <section className="em-webhook" aria-label="Inbound email setup">
          <h3>Receive emails into the CRM</h3>
          {webhookLoading && (
            <div className="ins-loading" aria-busy="true">
              <div className="leads-loading-spinner" /> Loading…
            </div>
          )}
          {webhookError && (
            <div className="ins-alert error" role="alert">
              <span>{webhookError}</span>
            </div>
          )}
          {webhook && (
            <>
              <p className="em-muted" style={{ margin: 0 }}>
                Configure your mail provider to forward incoming messages with an HTTP request. The token works like a password — share it only with
                administrators and never post it in chats or tickets.
              </p>
              <div>
                <strong>{webhook.method}</strong> <code>{webhookUrl}</code>
              </div>
              <div className="em-token-row">
                <span>
                  Header <code>{webhook.auth_header}</code>:
                </span>
                <span className="em-token" data-testid="webhook-token">
                  {tokenShown ? webhook.token : "••••••••••••••••••••"}
                </span>
                <button className="btn-secondary ins-btn-sm" onClick={() => setTokenShown((v) => !v)}>
                  {tokenShown ? "Hide" : "Reveal"}
                </button>
                <button className="btn-secondary ins-btn-sm" onClick={() => void copyToken()}>
                  Copy
                </button>
              </div>
              <details>
                <summary>Example payload</summary>
                <pre>{JSON.stringify(webhook.payload_example, null, 2)}</pre>
              </details>
            </>
          )}
        </section>
      )}

      <div className="ins-toolbar">
        <div className="leads-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by subject…"
            value={searchInput}
            maxLength={100}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search emails by subject"
          />
        </div>

        <div className="em-tabs" role="tablist" aria-label="Direction">
          {([["", "All"], ["Inbound", "Inbound"], ["Outbound", "Outbound"]] as const).map(([value, label]) => (
            <button
              key={label}
              role="tab"
              aria-selected={direction === value}
              className={`em-tab ${direction === value ? "active" : ""}`}
              onClick={() => {
                setDirection(value);
                setPage(0);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          className="filter-select"
          value={linkFilter}
          onChange={(e) => {
            setLinkFilter(e.target.value as LinkFilter);
            setLinkRecordId("");
            setPage(0);
          }}
          aria-label="Filter by linked record"
        >
          <option value="">All records</option>
          {EMAIL_LINK_ENTITIES.map((entity) => (
            <option key={entity} value={entity}>
              Linked to a {DEFAULT_ENTITY_LABELS[entity].toLowerCase()}…
            </option>
          ))}
          <option value="unlinked">Not linked to anything</option>
        </select>

        {linkFilter && linkFilter !== "unlinked" && (
          <div style={{ minWidth: 220, flex: "0 1 280px" }}>
            <RecordPicker
              entity={linkFilter}
              label={DEFAULT_ENTITY_LABELS[linkFilter]}
              value={linkRecordId}
              onChange={(id) => {
                setLinkRecordId(id);
                setPage(0);
              }}
            />
          </div>
        )}

        {hasFilters && (
          <button className="btn-clear-filters" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="leads-table-container">
        {loading ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading emails…
          </div>
        ) : error ? null : linkFilter && linkFilter !== "unlinked" && !linkRecordId ? (
          <div className="ins-empty">
            <h3>Choose a {DEFAULT_ENTITY_LABELS[linkFilter].toLowerCase()}</h3>
            <p>Select a record above to see the emails linked to it.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="ins-empty">
            <h3>No emails found</h3>
            <p>
              {hasFilters
                ? "No emails match the selected filters."
                : perms.create
                ? "Compose an email or record one that was sent or received elsewhere."
                : "Emails will appear here once they are sent or recorded."}
            </p>
          </div>
        ) : (
          <>
            <div className="ins-table-wrap">
              <table className="leads-table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>From → To</th>
                    <th>Status</th>
                    <th>Linked to</th>
                    <th>Date</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="em-row-click" onClick={() => setViewing(row)}>
                      <td>
                        <div className="em-subject">{row.subject || "(no subject)"}</div>
                        <div className="em-preview">{row.body_preview || "—"}</div>
                      </td>
                      <td>
                        <EmailDirectionBadge direction={row.direction} />
                        <div className="em-addr">{row.from_email || "—"}</div>
                        <div className="em-addr em-muted">to {(row.to_emails ?? []).join(", ") || "—"}</div>
                      </td>
                      <td>
                        <EmailStatusBadge status={row.status} />
                      </td>
                      <td>
                        <EmailLinkChips links={row} names={linkNames} />
                      </td>
                      <td className="text-dim">{formatMessageDateTime(row.occurred_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="ins-row-actions">
                          <button className="btn-secondary ins-btn-sm" onClick={() => setViewing(row)}>
                            View
                          </button>
                          {perms.remove && (
                            <button className="ins-btn-outline-danger ins-btn-sm" onClick={() => setDeleting(row)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ins-pager">
              <span>Page {page + 1}</span>
              <div className="ins-pager-controls">
                <button className="btn-secondary ins-btn-sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  Previous
                </button>
                <button className="btn-secondary ins-btn-sm" disabled={!hasNext || loading} onClick={() => setPage((p) => p + 1)}>
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {viewing && (
        <EmailDetailModal
          summary={viewing}
          linkNames={linkNames}
          canReply={perms.create}
          canLink={perms.create}
          canDelete={perms.remove}
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
          onClose={() => setComposing(null)}
          onSent={afterSent}
          onFailedRecorded={() => {
            // The failed attempt is stored by the backend - show it in the list straight away.
            setPage(0);
            void load();
          }}
        />
      )}

      {logging && <EmailLogModal onClose={() => setLogging(false)} onLogged={afterLogged} />}

      {relinking && (
        <EmailLinksModal
          email={relinking}
          onClose={() => setRelinking(null)}
          onSaved={(updated) => {
            setRelinking(null);
            setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
            showToast("Email links updated.");
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
            showToast("Email deleted.");
            // Step back a page when the last row of a later page was removed.
            if (rows.length === 1 && page > 0) setPage((p) => p - 1);
            else void load();
          }}
        />
      )}
    </div>
  );
}
