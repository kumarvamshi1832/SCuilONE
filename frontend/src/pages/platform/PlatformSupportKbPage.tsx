import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pagination } from "../../components/common/Pagination";
import {
  EyeIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import { hasPlatformPermission } from "../../services/platformApiClient";
import {
  extractApiErrorMessage,
  platformService,
} from "../../services/platformService";
import type {
  PlatformEmployee,
  PlatformKnowledgeArticle,
  PlatformSupportTicket,
} from "../../types/platform";
import "./PlatformPages.css";

const TICKET_VIEWS = [
  { key: "", label: "All Tickets" },
  { key: "my_tickets", label: "My Tickets" },
  { key: "new_open", label: "New / Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "waiting_for_customer", label: "Waiting on Customer" },
  { key: "escalated", label: "Escalated" },
  { key: "sla_breached", label: "SLA Breached" },
  { key: "resolved", label: "Resolved / Closed" },
];

const TICKET_STATUSES = [
  "Open",
  "In Progress",
  "Waiting on Customer",
  "Resolved",
  "Closed",
];

export default function PlatformSupportKbPage() {
  const canViewTickets = hasPlatformPermission("platform.tickets.view");
  const canManageTickets = hasPlatformPermission("platform.tickets.manage");
  const canViewAudit = hasPlatformPermission("platform.audit.view");
  const canViewKb = hasPlatformPermission("platform.kb.view");
  const canManageKb = hasPlatformPermission("platform.kb.manage");

  const [searchParams, setSearchParams] = useSearchParams();
  const resolveSupportTab = (requested: string | null): "tickets" | "kb" => {
    if (requested === "kb" && canViewKb) return "kb";
    if (requested === "tickets" && canViewTickets) return "tickets";
    return canViewTickets ? "tickets" : "kb";
  };
  const resolveTicketView = (requested: string | null): string => {
    if (!requested) return "";
    return TICKET_VIEWS.some((v) => v.key === requested) ? requested : "";
  };

  const [tab, setTab] = useState<"tickets" | "kb">(() =>
    resolveSupportTab(searchParams.get("tab"))
  );

  // Tickets state
  const [tickets, setTickets] = useState<PlatformSupportTicket[]>([]);
  const [employees, setEmployees] = useState<PlatformEmployee[]>([]);
  const [viewFilter, setViewFilter] = useState(() =>
    resolveTicketView(searchParams.get("view"))
  );

  useEffect(() => {
    const nextTab = resolveSupportTab(searchParams.get("tab"));
    const nextView = resolveTicketView(searchParams.get("view"));
    setTab((prev) => (prev === nextTab ? prev : nextTab));
    setViewFilter((prev) => (prev === nextView ? prev : nextView));
  }, [searchParams, canViewTickets, canViewKb]);

  const handleSelectTab = (nextTab: "tickets" | "kb") => {
    setTab(nextTab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", nextTab);
        return next;
      },
      { replace: true }
    );
  };

  const handleViewFilterChange = (nextView: string) => {
    setViewFilter(nextView);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextView) {
          next.set("view", nextView);
        } else {
          next.delete("view");
        }
        return next;
      },
      { replace: true }
    );
  };
  const [issueTypeFilter, setIssueTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [ticketPage, setTicketPage] = useState(1);

  // Selected ticket detail
  const [selectedTicket, setSelectedTicket] =
    useState<PlatformSupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action modals
  const [assignModalTicket, setAssignModalTicket] =
    useState<PlatformSupportTicket | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignQueue, setAssignQueue] = useState("Support");
  const [assignNotes, setAssignNotes] = useState("");

  const [escalateModalTicket, setEscalateModalTicket] =
    useState<PlatformSupportTicket | null>(null);
  const [escalateTarget, setEscalateTarget] = useState("Team Manager");
  const [escalateReason, setEscalateReason] = useState("");
  const [escalateAssigneeId, setEscalateAssigneeId] = useState("");

  const [statusModalTicket, setStatusModalTicket] =
    useState<PlatformSupportTicket | null>(null);
  const [nextStatus, setNextStatus] = useState("In Progress");
  const [resolutionText, setResolutionText] = useState("");

  const [auditModalTicket, setAuditModalTicket] =
    useState<PlatformSupportTicket | null>(null);
  const [auditNotes, setAuditNotes] = useState("");

  // Knowledge base state
  const [articles, setArticles] = useState<PlatformKnowledgeArticle[]>([]);
  const [kbSearch, setKbSearch] = useState("");
  const [kbCategory, setKbCategory] = useState("");
  const [kbCreateOpen, setKbCreateOpen] = useState(false);
  const [kbSlug, setKbSlug] = useState("");
  const [kbTitle, setKbTitle] = useState("");
  const [kbCatInput, setKbCatInput] = useState("Troubleshooting");
  const [kbIndustry, setKbIndustry] = useState("");
  const [kbContent, setKbContent] = useState("");
  const [kbTags, setKbTags] = useState("");
  const [kbPublished, setKbPublished] = useState(true);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadTickets = async () => {
    if (!canViewTickets) return;
    setLoading(true);
    setError(null);
    try {
      const [tickRes, empRes] = await Promise.all([
        platformService.listSupportTickets({
          view: viewFilter || undefined,
          issue_type: issueTypeFilter || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
        }),
        platformService.listEmployees({ status: "Active" }).catch(() => ({
          items: [],
          total: 0,
        })),
      ]);
      setTickets(tickRes.items || []);
      setEmployees(empRes.items || []);
      setTicketPage(1);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load support tickets."));
    } finally {
      setLoading(false);
    }
  };

  const loadKb = async () => {
    if (!canViewKb) return;
    setLoading(true);
    setError(null);
    try {
      const res = await platformService.listKnowledgeBase({
        category: kbCategory || undefined,
        search: kbSearch || undefined,
      });
      setArticles(res.items || []);
    } catch (err) {
      setError(
        extractApiErrorMessage(err, "Failed to load knowledge base articles.")
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "tickets") {
      loadTickets();
    } else {
      loadKb();
    }
  }, [tab, viewFilter, issueTypeFilter, statusFilter, priorityFilter]);

  const openDetail = async (t: PlatformSupportTicket) => {
    setDetailLoading(true);
    setSelectedTicket(t);
    try {
      const full = await platformService.getSupportTicket(t.id);
      setSelectedTicket(full);
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to load ticket detail."));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalTicket || !assignUserId) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.assignSupportTicket(assignModalTicket.id, {
        assigned_employee_user_id: assignUserId,
        routing_queue: assignQueue || undefined,
        notes: assignNotes.trim() || undefined,
      });
      setSuccess("Ticket assigned successfully.");
      setAssignModalTicket(null);
      await loadTickets();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to assign ticket."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEscalateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalateModalTicket) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.escalateSupportTicket(escalateModalTicket.id, {
        escalation_target: escalateTarget,
        escalation_reason: escalateReason.trim(),
        assigned_employee_user_id: escalateAssigneeId || undefined,
      });
      setSuccess(`Ticket escalated to ${escalateTarget}.`);
      setEscalateModalTicket(null);
      await loadTickets();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to escalate ticket."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalTicket) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.updateSupportTicketStatus(
        statusModalTicket.id,
        nextStatus,
        resolutionText.trim() || undefined
      );
      setSuccess(`Ticket status updated to ${nextStatus}.`);
      setStatusModalTicket(null);
      await loadTickets();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to update ticket status."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAuditReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auditModalTicket) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.auditReviewSupportTicket(auditModalTicket.id, {
        audit_reviewed: true,
        audit_review_notes: auditNotes.trim(),
      });
      setSuccess("Audit review recorded on ticket.");
      setAuditModalTicket(null);
      await loadTickets();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to record audit review."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKb = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await platformService.createKnowledgeArticle({
        slug: kbSlug.trim(),
        title: kbTitle.trim(),
        category: kbCatInput.trim() || "Troubleshooting",
        industry_type: kbIndustry.trim() || undefined,
        content: kbContent.trim(),
        tags_json: kbTags
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        is_published: kbPublished,
      });
      setSuccess(`Created knowledge base article "${kbTitle.trim()}".`);
      setKbCreateOpen(false);
      setKbSlug("");
      setKbTitle("");
      setKbContent("");
      setKbTags("");
      await loadKb();
    } catch (err) {
      setError(extractApiErrorMessage(err, "Failed to create KB article."));
    } finally {
      setSubmitting(false);
    }
  };

  const pageSize = 10;
  const pagedTickets = tickets.slice(
    (ticketPage - 1) * pageSize,
    ticketPage * pageSize
  );

  return (
    <div className="platform-page">
      <div className="platform-page-header">
        <div>
          <h2>Platform Support Queue & Knowledge Base</h2>
          <p>
            Cross-tenant ticket routing, SLA monitoring, assignment,
            escalation, compliance audit review, and SOP documentation.
          </p>
        </div>
        <div className="platform-actions-row">
          <button
            type="button"
            className="platform-btn"
            onClick={() => (tab === "tickets" ? loadTickets() : loadKb())}
          >
            <RefreshIcon size={15} />
            <span>Refresh</span>
          </button>
          {tab === "kb" && canManageKb && (
            <button
              type="button"
              className="platform-btn primary"
              onClick={() => setKbCreateOpen(true)}
            >
              <PlusIcon size={15} />
              <span>New KB Article</span>
            </button>
          )}
        </div>
      </div>

      {error && <div className="platform-alert error">{error}</div>}
      {success && <div className="platform-alert success">{success}</div>}

      <div className="platform-tabs">
        {canViewTickets && (
          <button
            type="button"
            className={`platform-tab ${tab === "tickets" ? "active" : ""}`}
            onClick={() => handleSelectTab("tickets")}
          >
            Support Tickets ({tickets.length})
          </button>
        )}
        {canViewKb && (
          <button
            type="button"
            className={`platform-tab ${tab === "kb" ? "active" : ""}`}
            onClick={() => handleSelectTab("kb")}
          >
            Knowledge Base ({articles.length})
          </button>
        )}
      </div>

      {tab === "tickets" && canViewTickets && (
        <>
          <div className="platform-filter-bar">
            <select
              className="platform-select"
              value={viewFilter}
              onChange={(e) => handleViewFilterChange(e.target.value)}
            >
              {TICKET_VIEWS.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
            <select
              className="platform-select"
              value={issueTypeFilter}
              onChange={(e) => setIssueTypeFilter(e.target.value)}
            >
              <option value="">All Issue Types</option>
              <option value="Support">Support</option>
              <option value="Technical">Technical</option>
              <option value="Billing">Billing</option>
            </select>
            <select
              className="platform-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              className="platform-select"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>
          </div>

          <div className="platform-card">
            {loading ? (
              <div className="platform-empty">Loading support tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="platform-empty">
                No support tickets match the selected filters.
              </div>
            ) : (
              <>
                <div className="platform-table-wrap">
                  <table className="platform-table">
                    <thead>
                      <tr>
                        <th>Ticket & Subject</th>
                        <th>Company / Industry</th>
                        <th>Routing & Flags</th>
                        <th>Status & Priority</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedTickets.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.subject}</strong>
                            <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                              {t.ticket_number || t.id}
                            </div>
                          </td>
                          <td>
                            <div>{t.company_name || t.tenant_id}</div>
                            <div style={{ fontSize: 12, color: "var(--plat-muted)" }}>
                              {t.industry_key || "—"}
                            </div>
                          </td>
                          <td>
                            <span className="platform-badge indigo">
                              {t.issue_type || "Support"}
                            </span>{" "}
                            {t.is_escalated && (
                              <span className="platform-badge red">
                                Escalated: {t.escalation_target}
                              </span>
                            )}{" "}
                            {t.sla_breached && (
                              <span className="platform-badge red">SLA Breached</span>
                            )}{" "}
                            {t.audit_reviewed && (
                              <span className="platform-badge green">Audited</span>
                            )}
                          </td>
                          <td>
                            <span className="platform-badge blue">{t.status}</span>{" "}
                            <span className="platform-badge yellow">
                              {t.priority}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="platform-btn sm"
                                onClick={() => openDetail(t)}
                              >
                                <EyeIcon size={13} />
                                <span>View</span>
                              </button>
                              {canManageTickets && (
                                <>
                                  <button
                                    type="button"
                                    className="platform-btn sm"
                                    onClick={() => {
                                      setAssignModalTicket(t);
                                      setAssignUserId(
                                        t.assigned_employee_user_id ||
                                          employees[0]?.user_id ||
                                          ""
                                      );
                                      setAssignQueue(t.routing_queue || "Support");
                                      setAssignNotes("");
                                    }}
                                  >
                                    Assign
                                  </button>
                                  <button
                                    type="button"
                                    className="platform-btn sm danger"
                                    onClick={() => {
                                      setEscalateModalTicket(t);
                                      setEscalateTarget("Team Manager");
                                      setEscalateReason("");
                                      setEscalateAssigneeId("");
                                    }}
                                  >
                                    Escalate
                                  </button>
                                  <button
                                    type="button"
                                    className="platform-btn sm primary"
                                    onClick={() => {
                                      setStatusModalTicket(t);
                                      setNextStatus(t.status || "In Progress");
                                      setResolutionText(t.resolution || "");
                                    }}
                                  >
                                    Status
                                  </button>
                                </>
                              )}
                              {canViewAudit && (
                                <button
                                  type="button"
                                  className="platform-btn sm"
                                  onClick={() => {
                                    setAuditModalTicket(t);
                                    setAuditNotes(t.audit_review_notes || "");
                                  }}
                                >
                                  <ShieldCheckIcon size={13} />
                                  <span>Audit</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  currentPage={ticketPage}
                  totalItems={tickets.length}
                  pageSize={pageSize}
                  onPageChange={setTicketPage}
                  entityName="tickets"
                />
              </>
            )}
          </div>
        </>
      )}

      {tab === "kb" && canViewKb && (
        <>
          <form
            className="platform-filter-bar"
            onSubmit={(e) => {
              e.preventDefault();
              loadKb();
            }}
          >
            <input
              className="platform-input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="Search articles..."
              value={kbSearch}
              onChange={(e) => setKbSearch(e.target.value)}
            />
            <input
              className="platform-input"
              placeholder="Category filter..."
              value={kbCategory}
              onChange={(e) => setKbCategory(e.target.value)}
            />
            <button type="submit" className="platform-btn primary sm">
              <SearchIcon size={14} />
              <span>Search</span>
            </button>
          </form>

          <div className="platform-grid-2">
            {loading ? (
              <div className="platform-card platform-empty">
                Loading knowledge base...
              </div>
            ) : articles.length === 0 ? (
              <div className="platform-card platform-empty">
                No knowledge base articles found.
              </div>
            ) : (
              articles.map((art) => (
                <div key={art.id} className="platform-card">
                  <div className="platform-card-title">
                    <span>{art.title}</span>
                    <span className="platform-badge indigo">{art.category}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--plat-muted)",
                      marginBottom: 8,
                    }}
                  >
                    Slug: <code>{art.slug}</code>{" "}
                    {art.industry_key ? `• Industry: ${art.industry_key}` : "• Global"}
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 13.5, whiteSpace: "pre-wrap" }}>
                    {art.content}
                  </p>
                  {art.tags?.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {art.tags.map((tg) => (
                        <span key={tg} className="platform-badge">
                          #{tg}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>{selectedTicket.subject}</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setSelectedTicket(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            {detailLoading ? (
              <div className="platform-empty">Loading full conversation...</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span className="platform-badge blue">{selectedTicket.status}</span>
                  <span className="platform-badge yellow">
                    {selectedTicket.priority}
                  </span>
                  {selectedTicket.issue_type && (
                    <span className="platform-badge indigo">
                      {selectedTicket.issue_type}
                    </span>
                  )}
                </div>
                {selectedTicket.description && (
                  <p style={{ margin: 0, fontSize: 13.5 }}>
                    {selectedTicket.description}
                  </p>
                )}
                {selectedTicket.resolution && (
                  <div className="platform-alert success">
                    Resolution: {selectedTicket.resolution}
                  </div>
                )}
                {selectedTicket.audit_review_notes && (
                  <div className="platform-alert info">
                    Audit Review: {selectedTicket.audit_review_notes}
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 8 }}>
                  Comments ({selectedTicket.comments?.length || 0})
                </div>
                {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                  selectedTicket.comments.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--plat-border)",
                        background: "var(--plat-surface-alt)",
                      }}
                    >
                      <div style={{ fontSize: 11.5, color: "var(--plat-muted)" }}>
                        {c.is_internal ? "Internal Note" : "Customer / Staff"} •{" "}
                        {c.created_at}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13.5 }}>{c.body}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13, color: "var(--plat-muted)" }}>
                    No comments on this ticket.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignModalTicket && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Assign Ticket</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setAssignModalTicket(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleAssignSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Assignee Employee</label>
                <select
                  className="platform-select"
                  required
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                >
                  <option value="">Select active platform employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.user_id} value={emp.user_id}>
                      {emp.full_name} ({emp.role}
                      {emp.industry_key ? ` • ${emp.industry_key}` : ""})
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-field">
                <label>Routing Queue</label>
                <select
                  className="platform-select"
                  value={assignQueue}
                  onChange={(e) => setAssignQueue(e.target.value)}
                >
                  <option value="Support">Support</option>
                  <option value="Technical">Technical</option>
                  <option value="Billing">Billing</option>
                  <option value="Team Manager">Team Manager</option>
                  <option value="Platform Manager">Platform Manager</option>
                </select>
              </div>
              <div className="platform-field">
                <label>Internal Notes (optional)</label>
                <textarea
                  className="platform-textarea"
                  rows={2}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setAssignModalTicket(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Assigning..." : "Assign Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escalate Modal */}
      {escalateModalTicket && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Escalate Ticket</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setEscalateModalTicket(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleEscalateSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Escalation Target</label>
                <select
                  className="platform-select"
                  value={escalateTarget}
                  onChange={(e) => setEscalateTarget(e.target.value)}
                >
                  <option value="Team Manager">Team Manager</option>
                  <option value="Platform Manager">Platform Manager</option>
                  <option value="Technical">Technical</option>
                  <option value="Billing">Billing</option>
                </select>
              </div>
              <div className="platform-field">
                <label>Optional Re-Assignee</label>
                <select
                  className="platform-select"
                  value={escalateAssigneeId}
                  onChange={(e) => setEscalateAssigneeId(e.target.value)}
                >
                  <option value="">Keep existing / auto</option>
                  {employees.map((emp) => (
                    <option key={emp.user_id} value={emp.user_id}>
                      {emp.full_name} ({emp.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-field">
                <label>Escalation Reason</label>
                <textarea
                  className="platform-textarea"
                  required
                  minLength={3}
                  rows={3}
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setEscalateModalTicket(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn danger"
                  disabled={submitting}
                >
                  {submitting ? "Escalating..." : "Confirm Escalation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {statusModalTicket && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Update Ticket Status</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setStatusModalTicket(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleStatusSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>New Status</label>
                <select
                  className="platform-select"
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                >
                  {TICKET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="platform-field">
                <label>Resolution Summary (optional)</label>
                <textarea
                  className="platform-textarea"
                  rows={3}
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setStatusModalTicket(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Updating..." : "Save Status"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit Review Modal */}
      {auditModalTicket && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>Auditor Compliance Review</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setAuditModalTicket(null)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleAuditReviewSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-field">
                <label>Audit Review Notes</label>
                <textarea
                  className="platform-textarea"
                  required
                  minLength={3}
                  rows={3}
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                />
              </div>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setAuditModalTicket(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Recording..." : "Mark Audit Reviewed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create KB Article Modal */}
      {kbCreateOpen && (
        <div className="platform-modal-overlay">
          <div className="platform-modal">
            <div className="platform-modal-header">
              <h3>New Knowledge Base Article</h3>
              <button
                type="button"
                className="platform-btn sm"
                onClick={() => setKbCreateOpen(false)}
              >
                <XIcon size={15} />
              </button>
            </div>
            <form
              onSubmit={handleCreateKb}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <div className="platform-form-grid">
                <div className="platform-field">
                  <label>Slug</label>
                  <input
                    className="platform-input"
                    required
                    minLength={2}
                    value={kbSlug}
                    onChange={(e) => setKbSlug(e.target.value)}
                    placeholder="mfa-lockout-recovery"
                  />
                </div>
                <div className="platform-field">
                  <label>Title</label>
                  <input
                    className="platform-input"
                    required
                    minLength={2}
                    value={kbTitle}
                    onChange={(e) => setKbTitle(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Category</label>
                  <input
                    className="platform-input"
                    value={kbCatInput}
                    onChange={(e) => setKbCatInput(e.target.value)}
                  />
                </div>
                <div className="platform-field">
                  <label>Industry Key (blank for global)</label>
                  <input
                    className="platform-input"
                    value={kbIndustry}
                    onChange={(e) => setKbIndustry(e.target.value)}
                    placeholder="real-estate"
                  />
                </div>
              </div>
              <div className="platform-field">
                <label>Tags (comma-separated)</label>
                <input
                  className="platform-input"
                  value={kbTags}
                  onChange={(e) => setKbTags(e.target.value)}
                  placeholder="billing, onboarding, mfa"
                />
              </div>
              <div className="platform-field">
                <label>Article Content</label>
                <textarea
                  className="platform-textarea"
                  required
                  minLength={5}
                  rows={5}
                  value={kbContent}
                  onChange={(e) => setKbContent(e.target.value)}
                />
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={kbPublished}
                  onChange={(e) => setKbPublished(e.target.checked)}
                />
                Publish immediately
              </label>
              <div className="platform-actions-row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="platform-btn"
                  onClick={() => setKbCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="platform-btn primary"
                  disabled={submitting}
                >
                  {submitting ? "Publishing..." : "Create Article"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
