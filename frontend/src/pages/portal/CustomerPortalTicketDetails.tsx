import React, { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeftIcon,
  RefreshIcon,
  SendIcon,
  LockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  UserIcon,
  ShieldCheckIcon,
  XIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalTicket,
  addPortalTicketComment,
  closePortalTicket,
  reopenPortalTicket,
} from "../../services/customerPortalTicketService";
import type { PortalTicketDetailResponse } from "../../types/customerPortal";
import "./CustomerPortalTicketDetails.css";

export default function CustomerPortalTicketDetails() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<PortalTicketDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // New Comment
  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Close Ticket Modal
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeComment, setCloseComment] = useState("");
  const [closingTicket, setClosingTicket] = useState(false);

  // Reopen Ticket Modal
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenComment, setReopenComment] = useState("");
  const [reopeningTicket, setReopeningTicket] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalTicket(ticketId);
      setTicket(data);
    } catch (err: any) {
      console.error("Failed to load ticket details:", err);
      setError(
        err?.response?.data?.detail || "Ticket not found or you do not have permission to view it."
      );
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId || !newComment.trim()) return;

    setSubmittingComment(true);
    try {
      await addPortalTicketComment(ticketId, { body: newComment.trim() });
      setNewComment("");
      showToast("Reply posted successfully!", "success");
      const updated = await getPortalTicket(ticketId);
      setTicket(updated);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to post comment", "error");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCloseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId) return;
    setClosingTicket(true);
    try {
      await closePortalTicket(ticketId, closeComment.trim() || null);
      showToast("Ticket closed successfully.", "success");
      setIsCloseModalOpen(false);
      setCloseComment("");
      const fullUpdated = await getPortalTicket(ticketId);
      setTicket(fullUpdated);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to close ticket.", "error");
    } finally {
      setClosingTicket(false);
    }
  };

  const handleReopenTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId || !reopenComment.trim()) {
      showToast("Please provide a reason for reopening this ticket.", "error");
      return;
    }
    setReopeningTicket(true);
    try {
      await reopenPortalTicket(ticketId, reopenComment.trim());
      showToast("Ticket reopened successfully.", "success");
      setIsReopenModalOpen(false);
      setReopenComment("");
      const fullUpdated = await getPortalTicket(ticketId);
      setTicket(fullUpdated);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to reopen ticket.", "error");
    } finally {
      setReopeningTicket(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Open":
        return <span className="badge-status status-open">Open</span>;
      case "In Progress":
        return <span className="badge-status status-in-progress">In Progress</span>;
      case "Waiting on Customer":
        return <span className="badge-status status-waiting">Waiting on You</span>;
      case "Resolved":
        return <span className="badge-status status-resolved">Resolved</span>;
      case "Closed":
        return <span className="badge-status status-closed">Closed</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    const prio = priority.toLowerCase();
    return <span className={`badge-priority prio-${prio}`}>{priority}</span>;
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#64748b" }}>
        <RefreshIcon size={28} className="animate-spin" style={{ margin: "0 auto 12px" }} />
        <div>Loading ticket conversation...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="cp-ticket-detail-page">
        <Link to="/portal/tickets" className="cp-back-link">
          <ArrowLeftIcon size={16} />
          <span>Back to All Tickets</span>
        </Link>
        <div className="support-alert error">
          <AlertCircleIcon size={18} />
          <span>{error || "Ticket not found."}</span>
        </div>
      </div>
    );
  }

  const canClose = ["Open", "In Progress", "Waiting on Customer", "Resolved"].includes(ticket.status);
  const canReopen = ["Resolved", "Closed"].includes(ticket.status);

  return (
    <div className="cp-ticket-detail-page">
      {/* Toast */}
      {toast && (
        <div className={`support-alert ${toast.type}`}>
          {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Back Link and Action Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <Link to="/portal/tickets" className="cp-back-link">
          <ArrowLeftIcon size={16} />
          <span>Back to All Tickets</span>
        </Link>

        <div style={{ display: "flex", gap: 10 }}>
          {canClose && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsCloseModalOpen(true)}
              style={{ color: "#ef4444", borderColor: "#fca5a5" }}
            >
              <span>Close Ticket</span>
            </button>
          )}
          {canReopen && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setIsReopenModalOpen(true)}
            >
              <span>Reopen Ticket</span>
            </button>
          )}
        </div>
      </div>

      {/* Ticket Container */}
      <div className="cp-ticket-card" style={{ marginTop: 16 }}>
        {/* Header */}
        <div className="cp-ticket-header">
          <div>
            <div style={{ fontSize: "0.8125rem", color: "#64748b", marginBottom: 4 }}>
              Ticket {ticket.ticket_number}
            </div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
              {ticket.subject}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span className="badge-category">{ticket.category}</span>
            {getPriorityBadge(ticket.priority)}
            {getStatusBadge(ticket.status)}
          </div>
        </div>

        {/* Metadata */}
        <div className="cp-ticket-meta">
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Requester</div>
            <div style={{ fontWeight: 600 }}>{ticket.requester_name}</div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Status</div>
            <div style={{ fontWeight: 600 }}>{ticket.status}</div>
          </div>
          {ticket.software_project_id && (
            <div>
              <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Software Project</div>
              <div style={{ fontWeight: 600, color: "#2563eb" }}>Linked Delivery Project</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Submitted Date</div>
            <div style={{ fontWeight: 600 }}>
              {new Date(ticket.created_at).toLocaleString()}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Last Activity</div>
            <div style={{ fontWeight: 600 }}>
              {new Date(ticket.updated_at).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Issue Description */}
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: "1.0625rem", fontWeight: 700, marginBottom: 8 }}>
            Initial Issue Description
          </h2>
          <div
            style={{
              padding: "16px",
              background: "rgba(0,0,0,0.02)",
              borderRadius: "8px",
              border: "1px solid var(--cp-border, #e2e8f0)",
              whiteSpace: "pre-wrap",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
            }}
          >
            {ticket.description}
          </div>
        </div>

        {/* Resolution Banner if Resolved / Closed */}
        {ticket.resolution && (
          <div
            style={{
              padding: "16px",
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "10px",
              marginBottom: 28,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#15803d", fontWeight: 700 }}>
              <ShieldCheckIcon size={20} />
              <span>Official Resolution</span>
            </div>
            <div style={{ marginTop: 6, fontSize: "0.9375rem", color: "#166534", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {ticket.resolution}
            </div>
          </div>
        )}

        {/* Public Conversation Timeline */}
        <div style={{ marginTop: 24, borderTop: "1px solid var(--cp-border, #e2e8f0)", paddingTop: 24 }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 700, marginBottom: 16 }}>
            Conversation & Updates ({ticket.comments?.length || 0})
          </h2>

          {(!ticket.comments || ticket.comments.length === 0) ? (
            <div style={{ color: "#64748b", fontStyle: "italic", marginBottom: 20 }}>
              No replies yet. Our support engineering team will reply shortly.
            </div>
          ) : (
            <div className="comments-timeline" style={{ maxHeight: 500, overflowY: "auto" }}>
              {ticket.comments.map((comment) => {
                const isCustomer = comment.author_type === "customer";

                return (
                  <div
                    key={comment.id}
                    className="comment-card"
                    style={{
                      borderLeft: isCustomer ? "4px solid #3b82f6" : "4px solid #10b981",
                      background: isCustomer ? "rgba(59, 130, 246, 0.04)" : "rgba(16, 185, 129, 0.04)",
                      marginBottom: 12,
                    }}
                  >
                    <div className="comment-header">
                      <span className="comment-author">
                        {isCustomer ? (
                          <>
                            <UserIcon size={14} color="#3b82f6" />
                            <span>You (Customer)</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheckIcon size={14} color="#10b981" />
                            <span style={{ color: "#15803d" }}>Support Engineering Team</span>
                          </>
                        )}
                      </span>
                      <span className="comment-time">
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="comment-body" style={{ whiteSpace: "pre-wrap" }}>
                      {comment.body}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Reply Box */}
          {ticket.status === "Closed" ? (
            <div
              style={{
                marginTop: 20,
                padding: "16px",
                borderRadius: "8px",
                background: "rgba(0,0,0,0.03)",
                color: "#64748b",
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: "0.875rem",
              }}
            >
              <LockIcon size={18} />
              <span>
                This ticket has been marked as <strong>Closed</strong>. Further replies are disabled.
                You may click <strong>Reopen Ticket</strong> above if your issue persists.
              </span>
            </div>
          ) : (
            <form onSubmit={handleCommentSubmit} style={{ marginTop: 24 }}>
              <div className="form-group">
                <label>Post a Public Reply</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Type your message or additional details for our team..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingComment || !newComment.trim()}
                >
                  <SendIcon size={15} />
                  <span>{submittingComment ? "Posting..." : "Send Reply"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Close Ticket Modal */}
      {isCloseModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>Close Support Ticket</h2>
              <button
                className="modal-close-btn"
                onClick={() => setIsCloseModalOpen(false)}
                disabled={closingTicket}
              >
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleCloseTicket}>
              <div className="modal-body">
                <p style={{ color: "#475569", fontSize: "0.875rem", margin: "0 0 16px 0" }}>
                  Are you sure you want to mark this ticket as closed? You can optionally add a closing note.
                </p>
                <div className="form-group">
                  <label>Closing Note (Optional)</label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Verified resolution; issue resolved on our end. Thanks!"
                    value={closeComment}
                    onChange={(e) => setCloseComment(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsCloseModalOpen(false)}
                  disabled={closingTicket}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={closingTicket}
                  style={{ background: "#dc2626" }}
                >
                  <span>{closingTicket ? "Closing..." : "Confirm Close Ticket"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Ticket Modal */}
      {isReopenModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>Reopen Support Ticket</h2>
              <button
                className="modal-close-btn"
                onClick={() => setIsReopenModalOpen(false)}
                disabled={reopeningTicket}
              >
                <XIcon size={18} />
              </button>
            </div>
            <form onSubmit={handleReopenTicket}>
              <div className="modal-body">
                <p style={{ color: "#475569", fontSize: "0.875rem", margin: "0 0 16px 0" }}>
                  Please describe why you need this ticket reopened so our team can follow up immediately.
                </p>
                <div className="form-group">
                  <label>Reason for Reopening *</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Describe what still needs attention or why the issue has reoccurred..."
                    value={reopenComment}
                    onChange={(e) => setReopenComment(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsReopenModalOpen(false)}
                  disabled={reopeningTicket}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={reopeningTicket || !reopenComment.trim()}
                >
                  <span>{reopeningTicket ? "Reopening..." : "Reopen Ticket"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
