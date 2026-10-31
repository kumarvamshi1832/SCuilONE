import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  ExternalLinkIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  XIcon,
  SendIcon,
  TicketIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalTickets,
  createPortalTicket,
} from "../../services/customerPortalTicketService";
import type {
  PortalTicket,
  PortalTicketCreate,
} from "../../types/customerPortal";
import "./CustomerPortalTickets.css";

const CATEGORIES = [
  "General",
  "Bug",
  "Technical Support",
  "Billing",
  "Feature Request",
  "Account Access",
  "Other",
];

const PRIORITIES = ["Low", "Medium", "High", "Urgent"];

const STATUSES = [
  "Open",
  "In Progress",
  "Waiting on Customer",
  "Resolved",
  "Closed",
];

export default function CustomerPortalTickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState<PortalTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(() => searchParams.get("new") === "true");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState<PortalTicketCreate>({
    subject: "",
    description: "",
    category: "Technical Support",
    priority: "Medium",
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getPortalTickets({ limit: 100 });
      setTickets(response.items);
    } catch (err: any) {
      console.error("Failed to load portal tickets:", err);
      setError(err?.response?.data?.detail || "Failed to load support tickets for your account.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Synchronize modal state with searchParams ?new=true
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setIsCreateOpen(true);
    }
  }, [searchParams]);

  const handleCloseCreateModal = () => {
    setIsCreateOpen(false);
    if (searchParams.get("new")) {
      searchParams.delete("new");
      setSearchParams(searchParams);
    }
  };

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchNumber = t.ticket_number?.toLowerCase().includes(q);
        const matchSubject = t.subject?.toLowerCase().includes(q);
        const matchDesc = t.description?.toLowerCase().includes(q);
        if (!matchNumber && !matchSubject && !matchDesc) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, categoryFilter, search]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.subject.trim() || !createForm.description.trim()) {
      showToast("Subject and Description are required.", "error");
      return;
    }

    setCreateSubmitting(true);
    try {
      const newTicket = await createPortalTicket({
        subject: createForm.subject.trim(),
        description: createForm.description.trim(),
        category: createForm.category,
        priority: createForm.priority,
      });

      showToast(`Ticket ${newTicket.ticket_number} submitted successfully!`, "success");
      setCreateForm({
        subject: "",
        description: "",
        category: "Technical Support",
        priority: "Medium",
      });
      handleCloseCreateModal();
      fetchTickets();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to submit ticket", "error");
    } finally {
      setCreateSubmitting(false);
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

  return (
    <div className="cp-tickets-page">
      {/* Toast */}
      {toast && (
        <div className={`support-alert ${toast.type}`}>
          {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="cp-page-header">
        <div>
          <h1>
            <TicketIcon size={24} color="#2563eb" />
            <span>Support Tickets</span>
          </h1>
          <p>View and manage all tickets associated with your company account</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn-secondary" onClick={fetchTickets} disabled={loading}>
            <RefreshIcon size={16} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button className="btn-primary" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon size={16} />
            <span>Submit Ticket</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="support-filter-bar">
        <div className="support-search-box">
          <SearchIcon size={16} className="support-search-icon" />
          <input
            type="text"
            placeholder="Search tickets by number, subject, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="support-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          className="support-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {(search || statusFilter || categoryFilter) && (
          <button
            className="btn-secondary"
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setCategoryFilter("");
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Tickets Table */}
      <div className="support-table-container">
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 12px" }} />
            <div>Loading support tickets...</div>
          </div>
        ) : error ? (
          <div style={{ padding: "32px", textAlign: "center" }}>
            <div className="support-alert error" style={{ maxWidth: 500, margin: "0 auto 16px" }}>
              <AlertCircleIcon size={18} />
              <span>{error}</span>
            </div>
            <button className="btn-secondary" onClick={fetchTickets}>
              Retry Loading
            </button>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="empty-state">
            <TicketIcon size={48} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
            <h3>No Tickets Found</h3>
            <p>
              {search || statusFilter || categoryFilter
                ? "No support tickets match your filter criteria."
                : "Your company has no support tickets yet. Click 'Submit Ticket' to open a new request."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="support-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Submitted By</th>
                  <th>Created</th>
                  <th>Last Update</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link to={`/portal/tickets/${ticket.id}`} className="ticket-number-link">
                        {ticket.ticket_number}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ticket.subject}</div>
                    </td>
                    <td>
                      <span className="badge-category">{ticket.category}</span>
                    </td>
                    <td>{getPriorityBadge(ticket.priority)}</td>
                    <td>{getStatusBadge(ticket.status)}</td>
                    <td style={{ fontSize: "0.8125rem" }}>{ticket.requester_name}</td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        to={`/portal/tickets/${ticket.id}`}
                        className="btn-secondary"
                        style={{ padding: "6px 12px", textDecoration: "none" }}
                      >
                        <span>View</span>
                        <ExternalLinkIcon size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SUBMIT TICKET MODAL */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={handleCloseCreateModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Submit Support Ticket</h2>
              <button className="modal-close-btn" onClick={handleCloseCreateModal}>
                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Subject *</label>
                  <input
                    type="text"
                    required
                    placeholder="Brief summary of your question or issue"
                    value={createForm.subject}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, subject: e.target.value })
                    }
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={createForm.category}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, category: e.target.value })
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Urgency / Priority *</label>
                    <select
                      value={createForm.priority}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, priority: e.target.value })
                      }
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Detailed Description *</label>
                  <textarea
                    rows={5}
                    required
                    placeholder="Describe the issue in detail, including steps to reproduce or specific questions..."
                    value={createForm.description}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCloseCreateModal}
                  disabled={createSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createSubmitting}
                >
                  <SendIcon size={15} />
                  <span>{createSubmitting ? "Submitting..." : "Submit Ticket"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

