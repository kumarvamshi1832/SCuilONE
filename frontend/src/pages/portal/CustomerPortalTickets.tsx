import React, { useState, useEffect, useCallback } from "react";
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
  ArrowLeftIcon,
  ArrowRightIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalTickets,
  createPortalTicket,
} from "../../services/customerPortalTicketService";
import { getPortalProjects } from "../../services/customerPortalCommercialService";
import type {
  PortalTicket,
  PortalTicketCreate,
  PortalProject,
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
  const [totalTickets, setTotalTickets] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  // Server-side filters
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");

  // Projects for association
  const [availableProjects, setAvailableProjects] = useState<PortalProject[]>([]);

  // Create Modal
  const [isCreateOpen, setIsCreateOpen] = useState(() => searchParams.get("new") === "true");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState<PortalTicketCreate>({
    subject: "",
    description: "",
    category: "Technical Support",
    priority: "Medium",
    software_project_id: null,
  });

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * pageSize;
      const response = await getPortalTickets({
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
        search: search || undefined,
        limit: pageSize,
        offset,
      });
      setTickets(response.items || []);
      setTotalTickets(response.total || 0);
    } catch (err: any) {
      console.error("Failed to load portal tickets:", err);
      setError(err?.response?.data?.detail || "Failed to load support tickets for your account.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, categoryFilter, priorityFilter, search]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Load eligible projects for ticket association
  useEffect(() => {
    getPortalProjects()
      .then((data) => setAvailableProjects(data || []))
      .catch((err) => console.warn("Could not load portal projects:", err));
  }, []);

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStatusFilter("");
    setCategoryFilter("");
    setPriorityFilter("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalTickets / pageSize));

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
        software_project_id: createForm.software_project_id || null,
      });
      showToast(`Ticket #${newTicket.ticket_number} created successfully!`, "success");
      setCreateForm({
        subject: "",
        description: "",
        category: "Technical Support",
        priority: "Medium",
        software_project_id: null,
      });
      handleCloseCreateModal();
      fetchTickets();
    } catch (err: any) {
      console.error("Failed to create ticket:", err);
      showToast(err?.response?.data?.detail || "Failed to submit ticket.", "error");
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
      {/* Toast Alert */}
      {toast && (
        <div className={`support-alert ${toast.type}`}>
          {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="cp-tickets-header">
        <div>
          <h1>Support Tickets</h1>
          <p>
            Track technical issues, communicate directly with our engineering team, and view ticket resolutions.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setIsCreateOpen(true)}
          title="Submit a new support ticket"
        >
          <PlusIcon size={16} />
          <span>New Support Ticket</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="cp-tickets-toolbar">
        <form onSubmit={handleSearchSubmit} className="cp-search-form" style={{ display: "flex", gap: 8, flex: 1, minWidth: 220 }}>
          <div className="cp-search-box" style={{ flex: 1 }}>
            <SearchIcon size={16} className="cp-search-icon" />
            <input
              type="text"
              placeholder="Search by ticket #, subject or keyword..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-secondary" style={{ padding: "8px 14px" }}>
            Search
          </button>
        </form>

        <div className="cp-filters-group">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="cp-select"
            aria-label="Filter by Status"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="cp-select"
            aria-label="Filter by Category"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="cp-select"
            aria-label="Filter by Priority"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {(search || statusFilter || categoryFilter || priorityFilter) && (
            <button
              className="btn-secondary"
              onClick={handleClearFilters}
              title="Reset all filters"
            >
              Clear
            </button>
          )}

          <button
            className="btn-secondary"
            onClick={fetchTickets}
            title="Refresh tickets list"
            aria-label="Refresh tickets"
          >
            <RefreshIcon size={16} />
          </button>
        </div>
      </div>

      {/* Tickets List */}
      <div className="cp-tickets-card">
        {error ? (
          <div className="support-alert error">
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#64748b" }}>
            <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 10px" }} />
            <div>Loading tickets...</div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="cp-empty-state">
            <TicketIcon size={36} style={{ color: "#94a3b8", margin: "0 auto 12px" }} />
            <h3>No tickets found</h3>
            <p>
              {search || statusFilter || categoryFilter || priorityFilter
                ? "No support tickets match the selected filters."
                : "You don't have any support tickets yet. Click below to submit your first ticket."}
            </p>
            <button className="btn-primary" onClick={() => setIsCreateOpen(true)} style={{ marginTop: 12 }}>
              <PlusIcon size={16} />
              <span>Submit Ticket</span>
            </button>
          </div>
        ) : (
          <div className="cp-table-responsive">
            <table className="cp-tickets-table">
              <thead>
                <tr>
                  <th>Ticket #</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/portal/tickets/${t.id}`} className="cp-ticket-link">
                        {t.ticket_number}
                      </Link>
                    </td>
                    <td>
                      <div className="cp-ticket-subject" title={t.subject}>
                        <Link to={`/portal/tickets/${t.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                          {t.subject}
                        </Link>
                      </div>
                      <div className="cp-ticket-snippet">
                        {t.description?.slice(0, 75)}
                        {t.description?.length > 75 ? "..." : ""}
                      </div>
                    </td>
                    <td>
                      <span className="badge-category">{t.category}</span>
                    </td>
                    <td>{getPriorityBadge(t.priority)}</td>
                    <td>{getStatusBadge(t.status)}</td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                      {new Date(t.updated_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        to={`/portal/tickets/${t.id}`}
                        className="btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "0.8125rem", textDecoration: "none" }}
                      >
                        <span>View</span>
                        <ExternalLinkIcon size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server Pagination */}
        {!loading && tickets.length > 0 && (
          <div className="cp-pagination-bar">
            <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
              Showing {Math.min((page - 1) * pageSize + 1, totalTickets)} to{" "}
              {Math.min(page * pageSize, totalTickets)} of {totalTickets} tickets
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                className="btn-secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ArrowLeftIcon size={14} />
                <span>Prev</span>
              </button>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, padding: "0 8px" }}>
                {page} / {totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <span>Next</span>
                <ArrowRightIcon size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {isCreateOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>Submit Support Ticket</h2>
              <button
                className="modal-close-btn"
                onClick={handleCloseCreateModal}
                disabled={createSubmitting}
                aria-label="Close modal"
              >
                <XIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Subject *</label>
                  <input
                    type="text"
                    required
                    placeholder="Brief summary of your issue or request"
                    value={createForm.subject}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, subject: e.target.value }))
                    }
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={createForm.category}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, category: e.target.value }))
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={createForm.priority}
                      onChange={(e) =>
                        setCreateForm((prev) => ({ ...prev, priority: e.target.value }))
                      }
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Optional Project Association */}
                {availableProjects.length > 0 && (
                  <div className="form-group">
                    <label>
                      Related Software Project <span style={{ opacity: 0.6 }}>(Optional)</span>
                    </label>
                    <select
                      value={createForm.software_project_id || ""}
                      onChange={(e) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          software_project_id: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">-- No Specific Project --</option>
                      {availableProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.project_number} - {p.name}
                        </option>
                      ))}
                    </select>
                    <small style={{ color: "#64748b", fontSize: "0.75rem", display: "block", marginTop: 4 }}>
                      Associate this support case with your contracted delivery project.
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label>Detailed Description *</label>
                  <textarea
                    rows={6}
                    required
                    placeholder="Please describe the issue in detail, including steps to reproduce, error messages, and business impact..."
                    value={createForm.description}
                    onChange={(e) =>
                      setCreateForm((prev) => ({ ...prev, description: e.target.value }))
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
                  <span>{createSubmitting ? "Submitting Ticket..." : "Submit Ticket"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
