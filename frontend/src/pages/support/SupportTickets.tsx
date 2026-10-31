import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  LifeBuoyIcon,
  PlusIcon,
  SearchIcon,
  RefreshIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  LockIcon,
  SendIcon,
  EyeIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getSupportTickets,
  getSupportTicket,
  createSupportTicket,
  updateSupportTicket,
  deleteSupportTicket,
  addSupportTicketComment,
} from "../../services/supportTicketService";
import { getAccounts } from "../../services/accountService";
import { getContacts } from "../../services/contactService";
import { getUsers } from "../../services/userService";
import { getSoftwareProjects } from "../../services/softwareProjectService";
import type {
  SupportTicket,
  SupportTicketDetailResponse,
  SupportTicketCreate,
  SupportTicketUpdate,
  TicketStatus,
  TicketPriority,
  TicketCategory,
} from "../../types/supportTicket";
import type { Account } from "../../types/account";
import type { Contact } from "../../types/contact";
import type { User } from "../../types/user";
import type { SoftwareProject } from "../../types/softwareProject";
import "./SupportTickets.css";

const CATEGORIES: TicketCategory[] = [
  "General",
  "Bug",
  "Technical Support",
  "Billing",
  "Feature Request",
  "Account Access",
  "Other",
];

const PRIORITIES: TicketPriority[] = ["Low", "Medium", "High", "Urgent"];

const STATUSES: TicketStatus[] = [
  "Open",
  "In Progress",
  "Waiting on Customer",
  "Resolved",
  "Closed",
];

const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  Open: ["In Progress", "Waiting on Customer", "Resolved", "Closed"],
  "In Progress": ["Open", "Waiting on Customer", "Resolved", "Closed"],
  "Waiting on Customer": ["Open", "In Progress", "Resolved", "Closed"],
  Resolved: ["Open", "Closed"],
  Closed: [],
};

export default function SupportTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Reference data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<SoftwareProject[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [assignedFilter, setAssignedFilter] = useState<string>("");

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketDetails, setTicketDetails] = useState<SupportTicketDetailResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState<SupportTicketCreate>({
    subject: "",
    description: "",
    category: "Technical Support",
    priority: "Medium",
    source: "CRM",
    requester_name: "",
    requester_email: "",
    account_id: "",
    contact_id: "",
    software_project_id: "",
    assigned_to: "",
  });

  const [editForm, setEditForm] = useState<{
    subject: string;
    description: string;
    status: TicketStatus;
    priority: TicketPriority;
    category: TicketCategory;
    assigned_to: string;
    resolution: string;
  }>({
    subject: "",
    description: "",
    status: "Open",
    priority: "Medium",
    category: "Technical Support",
    assigned_to: "",
    resolution: "",
  });

  // Comments
  const [newCommentBody, setNewCommentBody] = useState("");
  const [newCommentInternal, setNewCommentInternal] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Lookups
  useEffect(() => {
    async function loadLookups() {
      try {
        const [accList, contList, usrList, projList] = await Promise.all([
          getAccounts().catch(() => []),
          getContacts().catch(() => []),
          getUsers().catch(() => []),
          getSoftwareProjects().catch(() => []),
        ]);
        setAccounts(accList);
        setContacts(contList);
        setUsers(usrList);
        setProjects(projList);
      } catch (err) {
        console.warn("Failed to load reference lookups:", err);
      }
    }
    loadLookups();
  }, []);

  // Fetch Tickets
  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getSupportTickets({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        assigned_to: assignedFilter || undefined,
        search: searchTerm || undefined,
        limit: 100,
      });
      setTickets(response.items);
    } catch (err: any) {
      console.error("Failed to fetch tickets:", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load support tickets.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, assignedFilter, searchTerm]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // Lookup maps
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c.full_name])), [contacts]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name || u.email])), [users]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  // Filtered tickets (category filter client-side if not in backend query params)
  const displayedTickets = useMemo(() => {
    if (!categoryFilter) return tickets;
    return tickets.filter((t) => t.category === categoryFilter);
  }, [tickets, categoryFilter]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "Open").length;
    const inProgress = tickets.filter((t) => t.status === "In Progress" || t.status === "Waiting on Customer").length;
    const resolvedClosed = tickets.filter((t) => t.status === "Resolved" || t.status === "Closed").length;
    return { total, open, inProgress, resolvedClosed };
  }, [tickets]);

  // Filter contacts by selected account in form
  const filteredContactsForCreate = useMemo(() => {
    if (!createForm.account_id) return contacts;
    return contacts.filter((c) => !c.account_id || c.account_id === createForm.account_id);
  }, [contacts, createForm.account_id]);

  // Open Details Modal
  const handleOpenDetails = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setIsDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const details = await getSupportTicket(ticket.id);
      setTicketDetails(details);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to load ticket details", "error");
    } finally {
      setDetailsLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setEditForm({
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      assigned_to: ticket.assigned_to || "",
      resolution: ticket.resolution || "",
    });
    setIsEditOpen(true);
  };

  // Open Delete Modal
  const handleOpenDelete = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setIsDeleteOpen(true);
  };

  // Create Ticket Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.subject.trim() || !createForm.description.trim() || !createForm.requester_name.trim()) {
      showToast("Subject, Requester Name, and Description are required.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload: SupportTicketCreate = {
        subject: createForm.subject.trim(),
        description: createForm.description.trim(),
        category: createForm.category,
        priority: createForm.priority,
        source: createForm.source,
        requester_name: createForm.requester_name.trim(),
        requester_email: createForm.requester_email?.trim() || null,
        account_id: createForm.account_id || null,
        contact_id: createForm.contact_id || null,
        software_project_id: createForm.software_project_id || null,
        assigned_to: createForm.assigned_to || null,
      };

      await createSupportTicket(payload);
      showToast("Support ticket created successfully!", "success");
      setIsCreateOpen(false);
      // Reset form
      setCreateForm({
        subject: "",
        description: "",
        category: "Technical Support",
        priority: "Medium",
        source: "CRM",
        requester_name: "",
        requester_email: "",
        account_id: "",
        contact_id: "",
        software_project_id: "",
        assigned_to: "",
      });
      fetchTickets();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to create support ticket", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Edit Ticket Submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    if (editForm.status === "Resolved" && !editForm.resolution.trim()) {
      showToast("A resolution note is required when resolving a ticket.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload: SupportTicketUpdate = {
        subject: editForm.subject.trim(),
        description: editForm.description.trim(),
        category: editForm.category,
        priority: editForm.priority,
        status: editForm.status,
        assigned_to: editForm.assigned_to || null,
        resolution: editForm.resolution.trim() || null,
      };

      await updateSupportTicket(selectedTicket.id, payload);
      showToast("Ticket updated successfully!", "success");
      setIsEditOpen(false);
      fetchTickets();
      if (ticketDetails && ticketDetails.id === selectedTicket.id) {
        const updated = await getSupportTicket(selectedTicket.id);
        setTicketDetails(updated);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to update ticket", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !newCommentBody.trim()) return;

    setCommentSubmitting(true);
    try {
      await addSupportTicketComment(selectedTicket.id, {
        body: newCommentBody.trim(),
        is_internal: newCommentInternal,
      });
      setNewCommentBody("");
      setNewCommentInternal(false);
      showToast("Comment posted successfully!", "success");
      const details = await getSupportTicket(selectedTicket.id);
      setTicketDetails(details);
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to post comment", "error");
    } finally {
      setCommentSubmitting(false);
    }
  };

  // Delete Ticket Submit
  const handleDeleteSubmit = async () => {
    if (!selectedTicket) return;
    if (selectedTicket.status !== "Closed") {
      showToast("Only closed tickets can be deleted. Please close the ticket first.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await deleteSupportTicket(selectedTicket.id);
      showToast(`Ticket ${selectedTicket.ticket_number} deleted successfully.`, "success");
      setIsDeleteOpen(false);
      setSelectedTicket(null);
      if (isDetailsOpen) setIsDetailsOpen(false);
      fetchTickets();
    } catch (err: any) {
      showToast(err?.response?.data?.detail || "Failed to delete ticket", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const getPriorityClass = (priority: TicketPriority) => {
    switch (priority) {
      case "Urgent": return "prio-urgent";
      case "High": return "prio-high";
      case "Medium": return "prio-medium";
      case "Low": return "prio-low";
    }
  };

  const getStatusClass = (status: TicketStatus) => {
    switch (status) {
      case "Open": return "status-open";
      case "In Progress": return "status-in-progress";
      case "Waiting on Customer": return "status-waiting";
      case "Resolved": return "status-resolved";
      case "Closed": return "status-closed";
    }
  };

  return (
    <div className="support-tickets-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`support-alert ${toast.type}`}>
          {toast.type === "success" && <CheckCircleIcon size={18} />}
          {toast.type === "error" && <AlertCircleIcon size={18} />}
          {toast.type === "info" && <AlertTriangleIcon size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="support-header">
        <div className="support-header-title">
          <LifeBuoyIcon size={28} color="#2563eb" />
          <div>
            <h1>Customer Support Tickets</h1>
            <div className="support-header-subtitle">
              Manage incoming customer inquiries, service requests, and issue resolutions
            </div>
          </div>
        </div>
        <div className="support-header-actions">
          <button className="btn-secondary" onClick={fetchTickets} disabled={loading}>
            <RefreshIcon size={16} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
          <button className="btn-primary" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon size={16} />
            <span>Create Ticket</span>
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="support-kpis">
        <div className="support-kpi-card">
          <div className="support-kpi-icon blue">
            <LifeBuoyIcon size={24} />
          </div>
          <div className="support-kpi-content">
            <span className="support-kpi-label">Total Tickets</span>
            <span className="support-kpi-value">{kpis.total}</span>
          </div>
        </div>
        <div className="support-kpi-card">
          <div className="support-kpi-icon amber">
            <ClockIcon size={24} />
          </div>
          <div className="support-kpi-content">
            <span className="support-kpi-label">Open Tickets</span>
            <span className="support-kpi-value">{kpis.open}</span>
          </div>
        </div>
        <div className="support-kpi-card">
          <div className="support-kpi-icon purple">
            <AlertCircleIcon size={24} />
          </div>
          <div className="support-kpi-content">
            <span className="support-kpi-label">In Progress / Pending</span>
            <span className="support-kpi-value">{kpis.inProgress}</span>
          </div>
        </div>
        <div className="support-kpi-card">
          <div className="support-kpi-icon emerald">
            <CheckCircleIcon size={24} />
          </div>
          <div className="support-kpi-content">
            <span className="support-kpi-label">Resolved & Closed</span>
            <span className="support-kpi-value">{kpis.resolvedClosed}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="support-filter-bar">
        <div className="support-search-box">
          <SearchIcon size={16} className="support-search-icon" />
          <input
            type="text"
            placeholder="Search tickets by number, subject, requester..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
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
        <select
          className="support-select"
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
        >
          <option value="">All Agents</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
          ))}
        </select>
        {(searchTerm || statusFilter || priorityFilter || categoryFilter || assignedFilter) && (
          <button
            className="btn-secondary"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("");
              setPriorityFilter("");
              setCategoryFilter("");
              setAssignedFilter("");
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Tickets Table */}
      <div className="support-table-container">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
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
        ) : displayedTickets.length === 0 ? (
          <div className="empty-state">
            <LifeBuoyIcon size={48} style={{ opacity: 0.3, margin: "0 auto 12px" }} />
            <h3>No Support Tickets Found</h3>
            <p>
              {searchTerm || statusFilter || priorityFilter || categoryFilter || assignedFilter
                ? "No tickets match your filter criteria. Try clearing filters."
                : "No support tickets have been created yet. Click 'Create Ticket' above to add one."}
            </p>
          </div>
        ) : (
          <table className="support-table">
            <thead>
              <tr>
                <th>Ticket #</th>
                <th>Subject & Category</th>
                <th>Requester</th>
                <th>Account / Contact</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned Agent</th>
                <th>Updated</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedTickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <span
                      className="ticket-number-link"
                      onClick={() => handleOpenDetails(ticket)}
                    >
                      {ticket.ticket_number}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: "var(--text-color, #0f172a)", marginBottom: 4 }}>
                      {ticket.subject}
                    </div>
                    <span className="badge-category">{ticket.category}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{ticket.requester_name}</div>
                    {ticket.requester_email && (
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {ticket.requester_email}
                      </div>
                    )}
                  </td>
                  <td>
                    {ticket.account_id ? (
                      <div style={{ fontWeight: 500 }}>{accountMap.get(ticket.account_id) || "Account"}</div>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                    {ticket.contact_id && (
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {contactMap.get(ticket.contact_id) || "Contact"}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`badge-priority ${getPriorityClass(ticket.priority)}`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`badge-status ${getStatusClass(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td>
                    {ticket.assigned_to ? (
                      userMap.get(ticket.assigned_to) || "Assigned Agent"
                    ) : (
                      <span style={{ color: "#94a3b8" }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                    {ticket.updated_at ? new Date(ticket.updated_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "6px" }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: "6px 8px" }}
                        title="View Details & Comments"
                        onClick={() => handleOpenDetails(ticket)}
                      >
                        <EyeIcon size={15} />
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ padding: "6px 8px" }}
                        title="Edit / Status Transition"
                        onClick={() => handleOpenEdit(ticket)}
                      >
                        <EditIcon size={15} />
                      </button>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: "6px 8px",
                          color: ticket.status === "Closed" ? "#ef4444" : "#94a3b8",
                        }}
                        title={
                          ticket.status === "Closed"
                            ? "Delete Ticket"
                            : "Delete disabled: Ticket must be Closed first"
                        }
                        onClick={() => handleOpenDelete(ticket)}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE TICKET MODAL */}
      {isCreateOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Support Ticket</h2>
              <button className="modal-close-btn" onClick={() => setIsCreateOpen(false)}>
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
                    placeholder="Brief description of the issue"
                    value={createForm.subject}
                    onChange={(e) => setCreateForm({ ...createForm, subject: e.target.value })}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Category *</label>
                    <select
                      value={createForm.category}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, category: e.target.value as TicketCategory })
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Priority *</label>
                    <select
                      value={createForm.priority}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, priority: e.target.value as TicketPriority })
                      }
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Requester Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Doe"
                      value={createForm.requester_name}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, requester_name: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Requester Email</label>
                    <input
                      type="email"
                      placeholder="e.g. requester@example.com"
                      value={createForm.requester_email || ""}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, requester_email: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Associated Account</label>
                    <select
                      value={createForm.account_id || ""}
                      onChange={(e) => {
                        const accId = e.target.value;
                        setCreateForm({ ...createForm, account_id: accId, contact_id: "" });
                      }}
                    >
                      <option value="">-- No Account --</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Associated Contact</label>
                    <select
                      value={createForm.contact_id || ""}
                      onChange={(e) => setCreateForm({ ...createForm, contact_id: e.target.value })}
                    >
                      <option value="">-- No Contact --</option>
                      {filteredContactsForCreate.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} {c.email ? `(${c.email})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Assigned Agent</label>
                    <select
                      value={createForm.assigned_to || ""}
                      onChange={(e) => setCreateForm({ ...createForm, assigned_to: e.target.value })}
                    >
                      <option value="">-- Unassigned --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Software Project</label>
                    <select
                      value={createForm.software_project_id || ""}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, software_project_id: e.target.value })
                      }
                    >
                      <option value="">-- None --</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Description *</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Provide detailed description of the issue or request..."
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
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Creating..." : "Create Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT / TRANSITION TICKET MODAL */}
      {isEditOpen && selectedTicket && (
        <div className="modal-overlay" onClick={() => setIsEditOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Ticket — {selectedTicket.ticket_number}</h2>
              <button className="modal-close-btn" onClick={() => setIsEditOpen(false)}>
                <XIcon size={20} />
              </button>
            </div>
            <form onSubmit={handleEditSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Subject *</label>
                  <input
                    type="text"
                    required
                    value={editForm.subject}
                    onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Status Transition</label>
                    <select
                      value={editForm.status}
                      onChange={(e) =>
                        setEditForm({ ...editForm, status: e.target.value as TicketStatus })
                      }
                    >
                      <option value={selectedTicket.status}>{selectedTicket.status} (Current)</option>
                      {STATUS_TRANSITIONS[selectedTicket.status]?.map((st) => (
                        <option key={st} value={st}>
                          &rarr; {st}
                        </option>
                      ))}
                    </select>
                    {STATUS_TRANSITIONS[selectedTicket.status]?.length === 0 && (
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Closed tickets cannot be changed.
                      </span>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      value={editForm.priority}
                      onChange={(e) =>
                        setEditForm({ ...editForm, priority: e.target.value as TicketPriority })
                      }
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Category</label>
                    <select
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({ ...editForm, category: e.target.value as TicketCategory })
                      }
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assigned Agent</label>
                    <select
                      value={editForm.assigned_to}
                      onChange={(e) =>
                        setEditForm({ ...editForm, assigned_to: e.target.value })
                      }
                    >
                      <option value="">-- Unassigned --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {editForm.status === "Resolved" && (
                  <div className="form-group">
                    <label style={{ color: "#15803d" }}>
                      Resolution Summary * (Required when resolving)
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Explain how this issue was resolved..."
                      value={editForm.resolution}
                      onChange={(e) =>
                        setEditForm({ ...editForm, resolution: e.target.value })
                      }
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    rows={4}
                    value={editForm.description}
                    onChange={(e) =>
                      setEditForm({ ...editForm, description: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsEditOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TICKET DETAILS & COMMENTS MODAL / DRAWER */}
      {isDetailsOpen && selectedTicket && (
        <div className="modal-overlay" onClick={() => setIsDetailsOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 840 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>{selectedTicket.ticket_number} — {selectedTicket.subject}</h2>
                <div style={{ display: "flex", gap: "8px", marginTop: 6, alignItems: "center" }}>
                  <span className={`badge-status ${getStatusClass(selectedTicket.status)}`}>
                    {selectedTicket.status}
                  </span>
                  <span className={`badge-priority ${getPriorityClass(selectedTicket.priority)}`}>
                    {selectedTicket.priority}
                  </span>
                  <span className="badge-category">{selectedTicket.category}</span>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setIsDetailsOpen(false)}>
                <XIcon size={20} />
              </button>
            </div>

            <div className="modal-body">
              {detailsLoading ? (
                <div style={{ textAlign: "center", padding: "40px" }}>
                  <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                  <div>Loading ticket details...</div>
                </div>
              ) : ticketDetails ? (
                <div>
                  {/* Metadata Summary */}
                  <div
                    style={{
                      background: "rgba(0,0,0,0.02)",
                      padding: "16px",
                      borderRadius: "10px",
                      marginBottom: "20px",
                      border: "1px solid var(--border-color, #e2e8f0)",
                    }}
                  >
                    <div className="form-grid">
                      <div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Requester</div>
                        <div style={{ fontWeight: 600 }}>{ticketDetails.requester_name}</div>
                        {ticketDetails.requester_email && (
                          <div style={{ fontSize: "0.8125rem", color: "#64748b" }}>
                            {ticketDetails.requester_email}
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Assigned Agent</div>
                        <div style={{ fontWeight: 600 }}>
                          {ticketDetails.assigned_to
                            ? userMap.get(ticketDetails.assigned_to) || "Assigned Agent"
                            : "Unassigned"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Account / Company</div>
                        <div style={{ fontWeight: 600 }}>
                          {ticketDetails.account_id
                            ? accountMap.get(ticketDetails.account_id) || "Account"
                            : "None"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Contact</div>
                        <div style={{ fontWeight: 600 }}>
                          {ticketDetails.contact_id
                            ? contactMap.get(ticketDetails.contact_id) || "Contact"
                            : "None"}
                        </div>
                      </div>
                      {ticketDetails.software_project_id && (
                        <div>
                          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Software Project</div>
                          <div style={{ fontWeight: 600 }}>
                            {projectMap.get(ticketDetails.software_project_id) || "Project"}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 4 }}>
                        Description
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", fontSize: "0.875rem", lineHeight: 1.5 }}>
                        {ticketDetails.description}
                      </div>
                    </div>

                    {ticketDetails.resolution && (
                      <div
                        style={{
                          marginTop: 14,
                          padding: 12,
                          background: "rgba(16, 185, 129, 0.08)",
                          borderRadius: 8,
                          border: "1px solid rgba(16, 185, 129, 0.2)",
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "#15803d", fontWeight: 700 }}>
                          Resolution:
                        </div>
                        <div style={{ fontSize: "0.875rem", color: "#166534", marginTop: 2 }}>
                          {ticketDetails.resolution}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Comments Timeline */}
                  <div style={{ marginTop: 24 }}>
                    <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: "0 0 12px 0" }}>
                      Activity & Comments ({ticketDetails.comments?.length || 0})
                    </h3>

                    {(!ticketDetails.comments || ticketDetails.comments.length === 0) ? (
                      <div style={{ color: "#64748b", fontSize: "0.875rem", fontStyle: "italic", marginBottom: 16 }}>
                        No comments or conversation updates yet.
                      </div>
                    ) : (
                      <div className="comments-timeline">
                        {ticketDetails.comments.map((c) => {
                          const isStaff = Boolean(c.author_user_id);
                          const authorLabel = isStaff
                            ? (userMap.get(c.author_user_id!) || "Staff Agent")
                            : "Customer Portal User";

                          return (
                            <div
                              key={c.id}
                              className={`comment-card ${c.is_internal ? "internal" : ""}`}
                            >
                              <div className="comment-header">
                                <span className="comment-author">
                                  {authorLabel}
                                  {c.is_internal && (
                                    <span className="comment-internal-pill">
                                      Internal Note
                                    </span>
                                  )}
                                </span>
                                <span className="comment-time">
                                  {new Date(c.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="comment-body">{c.body}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add Comment Form */}
                    {ticketDetails.status === "Closed" ? (
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          background: "#f1f5f9",
                          color: "#64748b",
                          fontSize: "0.875rem",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <LockIcon size={16} />
                        <span>This ticket is Closed. Comments are disabled on closed tickets.</span>
                      </div>
                    ) : (
                      <form onSubmit={handleAddComment} style={{ marginTop: 16 }}>
                        <div className="form-group">
                          <label>Add a comment or internal note</label>
                          <textarea
                            rows={3}
                            placeholder="Type a response to the customer or internal note..."
                            value={newCommentBody}
                            onChange={(e) => setNewCommentBody(e.target.value)}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <label
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: "0.8125rem",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={newCommentInternal}
                              onChange={(e) => setNewCommentInternal(e.target.checked)}
                            />
                            <span>Make this an Internal Note (hidden from Customer Portal)</span>
                          </label>
                          <button
                            type="submit"
                            className="btn-primary"
                            disabled={commentSubmitting || !newCommentBody.trim()}
                          >
                            <SendIcon size={15} />
                            <span>{commentSubmitting ? "Posting..." : "Post Comment"}</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => {
                  setIsDetailsOpen(false);
                  handleOpenEdit(selectedTicket);
                }}
              >
                <EditIcon size={15} />
                <span>Edit / Change Status</span>
              </button>
              <button className="btn-secondary" onClick={() => setIsDetailsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {isDeleteOpen && selectedTicket && (
        <div className="modal-overlay" onClick={() => setIsDeleteOpen(false)}>
          <div className="modal-content" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Support Ticket</h2>
              <button className="modal-close-btn" onClick={() => setIsDeleteOpen(false)}>
                <XIcon size={20} />
              </button>
            </div>
            <div className="modal-body">
              {selectedTicket.status !== "Closed" ? (
                <div>
                  <div className="support-alert error">
                    <AlertCircleIcon size={20} />
                    <div>
                      <strong>Cannot Delete Active Ticket</strong>
                      <div style={{ marginTop: 4, fontSize: "0.8125rem" }}>
                        This ticket is currently <strong>{selectedTicket.status}</strong>.
                        The backend API strictly requires tickets to be in <strong>Closed</strong> status before they can be deleted.
                      </div>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.875rem", color: "#64748b" }}>
                    To delete this ticket, first change its status to <strong>Closed</strong> using the Edit modal.
                  </p>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: "0.9375rem" }}>
                    Are you sure you want to permanently delete ticket{" "}
                    <strong>{selectedTicket.ticket_number}</strong> ({selectedTicket.subject})?
                  </p>
                  <p style={{ fontSize: "0.8125rem", color: "#dc2626" }}>
                    This action is permanent and will remove all associated comments from the database.
                  </p>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setIsDeleteOpen(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              {selectedTicket.status === "Closed" && (
                <button
                  className="btn-primary"
                  style={{ background: "#dc2626" }}
                  onClick={handleDeleteSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Deleting..." : "Permanently Delete"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

