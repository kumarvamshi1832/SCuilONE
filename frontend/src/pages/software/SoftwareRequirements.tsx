import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  getSoftwareRequirements,
  createSoftwareRequirement,
  updateSoftwareRequirement,
  deleteSoftwareRequirement,
  extractErrorMessage,
} from "../../services/softwareRequirementService";
import { clearSoftwareForbidden } from "../../services/softwareRequestManager";
import { getLeads } from "../../services/leadService";
import { getAccounts } from "../../services/accountService";
import { getContacts } from "../../services/contactService";
import { getDeals } from "../../services/dealService";
import { getUsers } from "../../services/userService";

import type {
  SoftwareRequirement,
  SoftwareRequirementCreate,
  SoftwareType,
  SoftwareRequirementStatus,
  SoftwarePriority,
} from "../../types/softwareRequirement";
import {
  SOFTWARE_TYPES,
  SOFTWARE_REQUIREMENT_STATUSES,
  SOFTWARE_PRIORITIES,
} from "../../types/softwareRequirement";
import type { Lead } from "../../types/lead";
import type { Account } from "../../types/account";
import type { Contact } from "../../types/contact";
import type { Deal } from "../../types/deal";
import type { User } from "../../types/user";
import ErrorBoundary from "../../components/common/ErrorBoundary";

import "./SoftwareModules.css";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * Safely format currency amounts without throwing on string Decimals, nulls, or invalid numbers.
 */
function formatBudget(min?: number | string | null, max?: number | string | null): string {
  const numMin = min !== undefined && min !== null && min !== ("" as any) ? Number(min) : null;
  const numMax = max !== undefined && max !== null && max !== ("" as any) ? Number(max) : null;

  const validMin = numMin !== null && !isNaN(numMin);
  const validMax = numMax !== null && !isNaN(numMax);

  if (validMin && validMax) {
    return `${INR.format(numMin)} - ${INR.format(numMax)}`;
  }
  if (validMin) {
    return `Min ${INR.format(numMin)}`;
  }
  if (validMax) {
    return `Up to ${INR.format(numMax)}`;
  }
  return "—";
}

function SoftwareRequirementsContent() {
  const [requirements, setRequirements] = useState<SoftwareRequirement[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Relationship async loading and error states
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Helper to match status string against canonical SOFTWARE_REQUIREMENT_STATUSES
  const resolveCanonicalStatus = useCallback((val: string | null | undefined): string => {
    if (!val) return "";
    const clean = val.trim().toLowerCase();
    const found = SOFTWARE_REQUIREMENT_STATUSES.find((s) => s.toLowerCase() === clean);
    return found || "";
  }, []);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const fromParam = searchParams.get("status");
    const fromState = (location.state as any)?.status;
    return resolveCanonicalStatus(fromParam || fromState);
  });
  const [typeFilter, setTypeFilter] = useState("");

  // Sync with URL query parameter changes (supports Back / Forward navigation)
  useEffect(() => {
    const fromParam = searchParams.get("status");
    const fromState = (location.state as any)?.status;
    const resolved = resolveCanonicalStatus(fromParam || fromState);
    setStatusFilter(resolved);
  }, [searchParams, location.state, resolveCanonicalStatus]);

  const handleStatusFilterChange = (newStatus: string) => {
    const resolved = resolveCanonicalStatus(newStatus);
    setStatusFilter(resolved);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (resolved) {
        next.set("status", resolved);
      } else {
        next.delete("status");
      }
      return next;
    });
  };

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SoftwareRequirement | null>(null);
  const [viewingItem, setViewingItem] = useState<SoftwareRequirement | null>(null);
  const [deletingItem, setDeletingItem] = useState<SoftwareRequirement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<SoftwareRequirementCreate>({
    title: "",
    description: "",
    software_type: "Web Application",
    deal_id: null,
    lead_id: null,
    account_id: null,
    contact_id: null,
    assigned_to: null,
    platforms: "",
    integrations: "",
    min_budget: undefined,
    max_budget: undefined,
    currency: "INR",
    target_date: "",
    priority: "Medium",
    status: "New",
    notes: "",
  });

  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenDetail, setForbiddenDetail] = useState<string | null>(null);

  const loadData = useCallback(async (forceRetry = false) => {
    setLoading(true);
    setError(null);
    if (forceRetry) {
      clearSoftwareForbidden("software_requirements");
      setIsForbidden(false);
      setForbiddenDetail(null);
    }

    setLeadsLoading(true);
    setAccountsLoading(true);
    setContactsLoading(true);
    setDealsLoading(true);
    setLeadsError(null);
    setAccountsError(null);
    setContactsError(null);
    setDealsError(null);

    try {
      const [reqRes, leadsRes, accountsRes, contactsRes, dealsRes, usersRes] =
        await Promise.allSettled([
          getSoftwareRequirements(undefined, { forceRetry }),
          getLeads(),
          getAccounts(),
          getContacts(),
          getDeals(),
          getUsers(),
        ]);

      // Software Requirements
      if (reqRes.status === "fulfilled") {
        const list = Array.isArray(reqRes.value) ? reqRes.value : [];
        setRequirements(list);
        setIsForbidden(false);
        setForbiddenDetail(null);
      } else {
        const err = reqRes.reason;
        if (err?.response?.status === 403 || err?.isCachedForbidden) {
          setIsForbidden(true);
          setForbiddenDetail(extractErrorMessage(err));
        } else {
          setError(extractErrorMessage(err));
        }
      }

      // Leads
      if (leadsRes.status === "fulfilled") {
        setLeads(Array.isArray(leadsRes.value) ? leadsRes.value : []);
        setLeadsError(null);
      } else {
        setLeadsError(extractErrorMessage(leadsRes.reason));
      }
      setLeadsLoading(false);

      // Accounts
      if (accountsRes.status === "fulfilled") {
        setAccounts(Array.isArray(accountsRes.value) ? accountsRes.value : []);
        setAccountsError(null);
      } else {
        setAccountsError(extractErrorMessage(accountsRes.reason));
      }
      setAccountsLoading(false);

      // Contacts
      if (contactsRes.status === "fulfilled") {
        setContacts(Array.isArray(contactsRes.value) ? contactsRes.value : []);
        setContactsError(null);
      } else {
        setContactsError(extractErrorMessage(contactsRes.reason));
      }
      setContactsLoading(false);

      // Deals
      if (dealsRes.status === "fulfilled") {
        setDeals(Array.isArray(dealsRes.value) ? dealsRes.value : []);
        setDealsError(null);
      } else {
        setDealsError(extractErrorMessage(dealsRes.reason));
      }
      setDealsLoading(false);

      // Users
      if (usersRes.status === "fulfilled") {
        setUsers(Array.isArray(usersRes.value) ? usersRes.value : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  // Option Label Formatters
  const formatLeadLabel = (l: Lead): string => {
    const name = (l.full_name || (l as any).name || (l as any).first_name || "Unnamed Lead").trim();
    const email = l.email ? ` — ${l.email.trim()}` : "";
    return `${name}${email}`;
  };

  const formatAccountLabel = (a: Account): string => {
    const name = (a.name || "Unnamed Account").trim();
    const email = a.email ? ` — ${a.email.trim()}` : "";
    return `${name}${email}`;
  };

  const formatContactLabel = (c: Contact): string => {
    const name = (c.full_name || `${(c as any).first_name || ""} ${(c as any).last_name || ""}`.trim() || "Unnamed Contact").trim();
    const email = c.email ? ` — ${c.email.trim()}` : "";
    return `${name}${email}`;
  };

  const formatDealLabel = (d: Deal): string => {
    return (d.name || "Unnamed Deal").trim();
  };

  // Name Resolvers
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const leadMap = useMemo(() => new Map(leads.map((l) => [l.id, l.full_name || (l as any).name || (l as any).first_name || "Lead"])), [leads]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c.full_name || `${(c as any).first_name || ""} ${(c as any).last_name || ""}`.trim() || "Contact"])), [contacts]);
  const dealMap = useMemo(() => new Map(deals.map((d) => [d.id, d.name])), [deals]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);

  const resolveClient = useCallback((req: SoftwareRequirement | null | undefined): string => {
    if (!req) return "—";
    if (req.lead_id && leadMap.has(req.lead_id)) {
      return `Lead: ${leadMap.get(req.lead_id)}`;
    }
    if (req.account_id && accountMap.has(req.account_id)) {
      return `Account: ${accountMap.get(req.account_id)}`;
    }
    if (req.contact_id && contactMap.has(req.contact_id)) {
      return `Contact: ${contactMap.get(req.contact_id)}`;
    }
    if (req.deal_id && dealMap.has(req.deal_id)) {
      return `Deal: ${dealMap.get(req.deal_id)}`;
    }
    if (typeof req.notes === "string" && req.notes.includes("Client: ")) {
      return req.notes.replace("Client: ", "");
    }
    return "—";
  }, [accountMap, leadMap, contactMap, dealMap]);

  // Filtered List
  const filteredList = useMemo(() => {
    if (!Array.isArray(requirements)) return [];
    return requirements.filter((r) => {
      if (!r) return false;
      const rStatus = (r.status || "").toLowerCase();
      const rType = (r.software_type || "").toLowerCase();

      if (statusFilter && rStatus !== statusFilter.toLowerCase()) return false;
      if (typeFilter && rType !== typeFilter.toLowerCase()) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const client = (resolveClient(r) || "").toLowerCase();
        const titleMatch = (r.title || "").toLowerCase().includes(q);
        const descMatch = (r.description || "").toLowerCase().includes(q);
        const clientMatch = client.includes(q);
        if (!titleMatch && !descMatch && !clientMatch) return false;
      }
      return true;
    });
  }, [requirements, statusFilter, typeFilter, searchTerm, resolveClient]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormError(null);
    setFormData({
      title: "",
      description: "",
      software_type: "Web Application",
      deal_id: null,
      lead_id: null,
      account_id: null,
      contact_id: null,
      assigned_to: users[0]?.id || null,
      platforms: "",
      integrations: "",
      min_budget: undefined,
      max_budget: undefined,
      currency: "INR",
      target_date: "",
      priority: "Medium",
      status: "New",
      notes: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: SoftwareRequirement) => {
    setEditingItem(item);
    setFormError(null);
    setFormData({
      title: item.title || "",
      description: item.description || "",
      software_type: (item.software_type as SoftwareType) || "Web Application",
      deal_id: item.deal_id || null,
      lead_id: item.lead_id || null,
      account_id: item.account_id || null,
      contact_id: item.contact_id || null,
      assigned_to: item.assigned_to || null,
      platforms: item.platforms || "",
      integrations: item.integrations || "",
      min_budget: item.min_budget !== null && item.min_budget !== undefined ? Number(item.min_budget) : undefined,
      max_budget: item.max_budget !== null && item.max_budget !== undefined ? Number(item.max_budget) : undefined,
      currency: item.currency || "INR",
      target_date: item.target_date || "",
      priority: (item.priority as SoftwarePriority) || "Medium",
      status: (item.status as SoftwareRequirementStatus) || "New",
      notes: item.notes || "",
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validation
    const cleanTitle = (formData.title || "").trim();
    const cleanDesc = (formData.description || "").trim();

    if (cleanTitle.length < 2) {
      setFormError("Title must be at least 2 characters long.");
      return;
    }
    if (cleanDesc.length < 1) {
      setFormError("Description is required.");
      return;
    }

    const cleanRelationId = (val?: string | null) =>
      val && typeof val === "string" && val.trim().length > 0 && val.trim() !== "None"
        ? val.trim()
        : null;

    const leadId = cleanRelationId(formData.lead_id);
    const accountId = cleanRelationId(formData.account_id);
    const contactId = cleanRelationId(formData.contact_id);
    const dealId = cleanRelationId(formData.deal_id);

    if (!leadId && !accountId && !contactId && !dealId) {
      setFormError("Please link the requirement to at least one entity: Account, Lead, Deal, or Contact.");
      return;
    }

    const numMin = formData.min_budget !== undefined && formData.min_budget !== null && (formData.min_budget as any) !== ""
      ? Number(formData.min_budget)
      : null;
    const numMax = formData.max_budget !== undefined && formData.max_budget !== null && (formData.max_budget as any) !== ""
      ? Number(formData.max_budget)
      : null;

    if (numMin !== null && numMax !== null && numMin > numMax) {
      setFormError("Minimum budget cannot exceed maximum budget.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: SoftwareRequirementCreate = {
        title: cleanTitle,
        description: cleanDesc,
        software_type: formData.software_type,
        deal_id: dealId,
        lead_id: leadId,
        account_id: accountId,
        contact_id: contactId,
        assigned_to: cleanRelationId(formData.assigned_to),
        platforms: formData.platforms?.trim() || null,
        integrations: formData.integrations?.trim() || null,
        min_budget: numMin,
        max_budget: numMax,
        currency: formData.currency || "INR",
        target_date: formData.target_date?.trim() || null,
        priority: formData.priority || "Medium",
        status: formData.status || "New",
        notes: formData.notes?.trim() || null,
      };

      if (editingItem) {
        const updated = await updateSoftwareRequirement(editingItem.id, payload);
        setRequirements((prev) => prev.map((r) => (r.id === editingItem.id ? updated : r)));
        setSuccessMessage(`Requirement "${updated.title}" updated successfully.`);
      } else {
        const created = await createSoftwareRequirement(payload);
        setRequirements((prev) => [created, ...prev]);
        setSuccessMessage(`Requirement "${created.title || payload.title}" created successfully.`);
      }
      setIsModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setSubmitting(true);
    try {
      await deleteSoftwareRequirement(deletingItem.id);
      setRequirements((prev) => prev.filter((r) => r.id !== deletingItem.id));
      setSuccessMessage(`Requirement "${deletingItem.title}" deleted.`);
      setDeletingItem(null);
    } catch (err: any) {
      alert("Failed to delete requirement: " + extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sw-module-page">
      {/* Header */}
      <div className="sw-module-header">
        <div className="sw-module-title-box">
          <h1>
            Software Requirements
            <span className="sw-count-badge">
              {filteredList.length === requirements.length
                ? `${requirements.length} Total`
                : `${filteredList.length} of ${requirements.length} Filtered`}
            </span>
          </h1>
          <p>Define software specifications, technology stacks, budgets, and client deliverables.</p>
        </div>
        <button className="sw-btn-primary" onClick={handleOpenCreate}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Requirement
        </button>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="sw-success-banner" style={{ marginBottom: "16px" }}>
          <span>{successMessage}</span>
          <button
            className="sw-btn-icon"
            style={{ width: "24px", height: "24px" }}
            onClick={() => setSuccessMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="sw-filter-bar">
        <div className="sw-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="sw-search-input"
            placeholder="Search requirements by title or client..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="sw-filter-select"
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          {SOFTWARE_REQUIREMENT_STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>

        <select
          className="sw-filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          {SOFTWARE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {(Boolean(searchTerm) || Boolean(statusFilter) || Boolean(typeFilter)) && (
          <button
            type="button"
            className="sw-btn-secondary"
            style={{ padding: "8px 14px", fontSize: "0.82rem" }}
            onClick={() => {
              setSearchTerm("");
              handleStatusFilterChange("");
              setTypeFilter("");
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table Card */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading software requirements...
          </div>
        ) : isForbidden ? (
          <div className="sw-forbidden-card">
            <div className="sw-forbidden-icon-box">🔒</div>
            <h3>Software Requirements Access Restricted</h3>
            <p>
              Backend access to software requirements is governed by tenant industry authorization policy.
            </p>
            {forbiddenDetail && (
              <div className="sw-forbidden-detail">{forbiddenDetail}</div>
            )}
            <div style={{ maxWidth: "560px", fontSize: "0.85rem", color: "#64748b", margin: "4px 0 12px 0", lineHeight: "1.5" }}>
              Backend access for software requirements is strictly restricted to tenants classified as <strong>Software Services</strong> or <strong>IT Consulting</strong>. If your tenant is registered as &quot;Software Company&quot;, an administrator can update the tenant industry configuration in the database or settings.
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                className="sw-btn-secondary"
                onClick={() => void loadData(true)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "6px" }}>
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Retry Access
              </button>
              <button
                type="button"
                className="sw-btn-primary"
                onClick={handleOpenCreate}
              >
                Draft Requirement Anyway
              </button>
            </div>
          </div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
            <p style={{ marginBottom: "12px" }}>{error}</p>
            <button className="sw-btn-secondary" onClick={() => void loadData(true)}>Retry</button>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#94a3b8" }}>
            {requirements.length > 0 ? (
              <>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.95rem" }}>
                  No software requirements match your current filter criteria.
                </p>
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => {
                    setSearchTerm("");
                    handleStatusFilterChange("");
                    setTypeFilter("");
                  }}
                >
                  Reset Filters ({requirements.length} available)
                </button>
              </>
            ) : (
              <>
                <p style={{ margin: "0 0 14px 0", fontSize: "0.95rem" }}>
                  No software requirements created yet.
                </p>
                <button type="button" className="sw-btn-primary" onClick={handleOpenCreate}>
                  Create First Requirement
                </button>
              </>
            )}
          </div>
        ) : (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client / Relationship</th>
                <th>Type</th>
                <th>Budget Range</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Target Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((req) => (
                <tr key={req.id}>
                  <td style={{ fontWeight: 600 }}>{req.title || "Untitled"}</td>
                  <td>{resolveClient(req)}</td>
                  <td>{req.software_type || "—"}</td>
                  <td>{formatBudget(req.min_budget, req.max_budget)}</td>
                  <td>
                    <span className={`sw-badge ${(req.priority || "Medium").toLowerCase()}`}>
                      {req.priority || "Medium"}
                    </span>
                  </td>
                  <td>
                    <span className={`sw-badge ${(req.status || "New").toLowerCase().replace(/\s+/g, "-")}`}>
                      {req.status || "New"}
                    </span>
                  </td>
                  <td>{req.target_date || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <div className="sw-row-actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="sw-btn-icon"
                        title="View Details"
                        onClick={() => setViewingItem(req)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                      <button
                        className="sw-btn-icon"
                        title="Edit Requirement"
                        onClick={() => handleOpenEdit(req)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className="sw-btn-icon danger"
                        title="Delete Requirement"
                        onClick={() => setDeletingItem(req)}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="sw-modal-card" style={{ maxWidth: "720px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{editingItem ? "Edit Software Requirement" : "New Software Requirement"}</h2>
              <button className="sw-btn-icon" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <form className="sw-modal-form" onSubmit={handleSubmit}>
              <div className="sw-modal-body">
                {isForbidden && !formError && (
                  <div className="sw-warning-banner" style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <span style={{ fontSize: "1.1rem" }}>⚠️</span>
                      <div>
                        <strong>Tenant Industry Authorization Notice:</strong> {forbiddenDetail || "This module is available only to Software Services companies."}
                        <div style={{ fontSize: "0.8rem", marginTop: "4px", opacity: 0.9 }}>
                          Backend software requirement APIs require tenant industry to be &quot;Software Services&quot; or &quot;IT Consulting&quot;. You can still draft and link real CRM records (Accounts, Leads, Contacts, Deals), but saving to the server requires eligible tenant authorization.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {formError && (
                  <div className="sw-error-banner" style={{ marginBottom: "16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      <span style={{ fontSize: "1.1rem" }}>⛔</span>
                      <div>
                        <strong>Save Failed:</strong> {formError}
                        {formError.toLowerCase().includes("software services") && (
                          <div style={{ fontSize: "0.8rem", marginTop: "4px", opacity: 0.9 }}>
                            Your tenant is currently saved with an industry string that does not match the backend&apos;s strict eligibility list (&quot;Software Services&quot;, &quot;IT Consulting&quot;). Please have an administrator align the tenant&apos;s industry classification in the database or settings. Your form entries above have been preserved.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="sw-form-group">
                  <label>Requirement Title *</label>
                  <input
                    type="text"
                    className="sw-form-input"
                    required
                    placeholder="e.g. Healthcare Patient Portal"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Software Type *</label>
                    <select
                      className="sw-form-select"
                      value={formData.software_type}
                      onChange={(e) => setFormData({ ...formData, software_type: e.target.value as SoftwareType })}
                    >
                      {SOFTWARE_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>
                      Client Account
                      {accountsLoading && <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px" }}>(Loading...)</span>}
                      {accountsError && <span style={{ fontSize: "0.75rem", color: "#ef4444", marginLeft: "6px" }}>(Failed to load)</span>}
                    </label>
                    <select
                      className="sw-form-select"
                      value={formData.account_id || ""}
                      onChange={(e) => {
                        const val = e.target.value.trim() ? e.target.value.trim() : null;
                        setFormData((prev) => ({ ...prev, account_id: val }));
                        if (val && formError?.includes("link the requirement")) {
                          setFormError(null);
                        }
                      }}
                      disabled={accountsLoading}
                    >
                      <option value="">None</option>
                      {accountsLoading && <option value="" disabled>Loading accounts...</option>}
                      {accountsError && <option value="" disabled>Error loading accounts ({accountsError})</option>}
                      {!accountsLoading && !accountsError && accounts.length === 0 && (
                        <option value="" disabled>No accounts available</option>
                      )}
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{formatAccountLabel(a)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Additional Relationship Linkages: Lead, Deal, Contact */}
                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>
                      Related Lead
                      {leadsLoading && <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px" }}>(Loading...)</span>}
                      {leadsError && <span style={{ fontSize: "0.75rem", color: "#ef4444", marginLeft: "6px" }}>(Failed to load)</span>}
                    </label>
                    <select
                      className="sw-form-select"
                      value={formData.lead_id || ""}
                      onChange={(e) => {
                        const val = e.target.value.trim() ? e.target.value.trim() : null;
                        setFormData((prev) => ({ ...prev, lead_id: val }));
                        if (val && formError?.includes("link the requirement")) {
                          setFormError(null);
                        }
                      }}
                      disabled={leadsLoading}
                    >
                      <option value="">None</option>
                      {leadsLoading && <option value="" disabled>Loading leads...</option>}
                      {leadsError && <option value="" disabled>Error loading leads ({leadsError})</option>}
                      {!leadsLoading && !leadsError && leads.length === 0 && (
                        <option value="" disabled>No leads available</option>
                      )}
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>{formatLeadLabel(l)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>
                      Related Contact
                      {contactsLoading && <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px" }}>(Loading...)</span>}
                      {contactsError && <span style={{ fontSize: "0.75rem", color: "#ef4444", marginLeft: "6px" }}>(Failed to load)</span>}
                    </label>
                    <select
                      className="sw-form-select"
                      value={formData.contact_id || ""}
                      onChange={(e) => {
                        const val = e.target.value.trim() ? e.target.value.trim() : null;
                        setFormData((prev) => ({ ...prev, contact_id: val }));
                        if (val && formError?.includes("link the requirement")) {
                          setFormError(null);
                        }
                      }}
                      disabled={contactsLoading}
                    >
                      <option value="">None</option>
                      {contactsLoading && <option value="" disabled>Loading contacts...</option>}
                      {contactsError && <option value="" disabled>Error loading contacts ({contactsError})</option>}
                      {!contactsLoading && !contactsError && contacts.length === 0 && (
                        <option value="" disabled>No contacts available</option>
                      )}
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>{formatContactLabel(c)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>
                      Related Deal
                      {dealsLoading && <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "6px" }}>(Loading...)</span>}
                      {dealsError && <span style={{ fontSize: "0.75rem", color: "#ef4444", marginLeft: "6px" }}>(Failed to load)</span>}
                    </label>
                    <select
                      className="sw-form-select"
                      value={formData.deal_id || ""}
                      onChange={(e) => {
                        const val = e.target.value.trim() ? e.target.value.trim() : null;
                        setFormData((prev) => ({ ...prev, deal_id: val }));
                        if (val && formError?.includes("link the requirement")) {
                          setFormError(null);
                        }
                      }}
                      disabled={dealsLoading}
                    >
                      <option value="">None</option>
                      {dealsLoading && <option value="" disabled>Loading deals...</option>}
                      {dealsError && <option value="" disabled>Error loading deals ({dealsError})</option>}
                      {!dealsLoading && !dealsError && deals.length === 0 && (
                        <option value="" disabled>No deals available</option>
                      )}
                      {deals.map((d) => (
                        <option key={d.id} value={d.id}>{formatDealLabel(d)}</option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Assigned Engineer / Lead</label>
                    <select
                      className="sw-form-select"
                      value={formData.assigned_to || ""}
                      onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value || null })}
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>Description & Scope *</label>
                  <textarea
                    className="sw-form-textarea"
                    required
                    placeholder="Describe functional features, technical requirements, and client deliverables..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Min Budget (INR)</label>
                    <input
                      type="number"
                      className="sw-form-input"
                      min="0"
                      step="any"
                      placeholder="e.g. 500000"
                      value={formData.min_budget ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          min_budget: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div className="sw-form-group">
                    <label>Max Budget (INR)</label>
                    <input
                      type="number"
                      className="sw-form-input"
                      min="0"
                      step="any"
                      placeholder="e.g. 800000"
                      value={formData.max_budget ?? ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          max_budget: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Priority</label>
                    <select
                      className="sw-form-select"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as SoftwarePriority })}
                    >
                      {SOFTWARE_PRIORITIES.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sw-form-group">
                    <label>Status</label>
                    <select
                      className="sw-form-select"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as SoftwareRequirementStatus })}
                    >
                      {SOFTWARE_REQUIREMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Target Delivery Date</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      value={formData.target_date || ""}
                      onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                    />
                  </div>
                  <div className="sw-form-group">
                    <label>Platforms</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      placeholder="e.g. Web, iOS, Android, AWS"
                      value={formData.platforms || ""}
                      onChange={(e) => setFormData({ ...formData, platforms: e.target.value })}
                    />
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>Integrations & External APIs</label>
                  <input
                    type="text"
                    className="sw-form-input"
                    placeholder="e.g. Stripe, SendGrid, Salesforce API"
                    value={formData.integrations || ""}
                    onChange={(e) => setFormData({ ...formData, integrations: e.target.value })}
                  />
                </div>

                <div className="sw-form-group">
                  <label>Notes / Remarks</label>
                  <textarea
                    className="sw-form-textarea"
                    placeholder="Additional context, architecture assumptions..."
                    value={formData.notes || ""}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button type="button" className="sw-btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingItem ? "Update Requirement" : "Create Requirement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Detail Modal */}
      {viewingItem && (
        <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{viewingItem.title || "Requirement Details"}</h2>
              <button className="sw-btn-icon" onClick={() => setViewingItem(null)}>✕</button>
            </div>
            <div className="sw-modal-body">
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                <span className={`sw-badge ${(viewingItem.status || "New").toLowerCase().replace(/\s+/g, "-")}`}>
                  Status: {viewingItem.status || "New"}
                </span>
                <span className={`sw-badge ${(viewingItem.priority || "Medium").toLowerCase()}`}>
                  Priority: {viewingItem.priority || "Medium"}
                </span>
                <span className="sw-badge active">
                  Type: {viewingItem.software_type || "Web Application"}
                </span>
              </div>
              <p style={{ margin: "0 0 16px 0", lineHeight: "1.6" }}>{viewingItem.description}</p>
              <div className="sw-form-row" style={{ fontSize: "0.88rem", rowGap: "10px" }}>
                <div><strong>Client / Entity:</strong> {resolveClient(viewingItem)}</div>
                <div><strong>Assigned To:</strong> {viewingItem.assigned_to ? userMap.get(viewingItem.assigned_to) || viewingItem.assigned_to : "Unassigned"}</div>
                <div><strong>Platforms:</strong> {viewingItem.platforms || "Web / Cloud"}</div>
                <div><strong>Integrations:</strong> {viewingItem.integrations || "None specified"}</div>
                <div><strong>Target Date:</strong> {viewingItem.target_date || "—"}</div>
                <div><strong>Budget:</strong> {formatBudget(viewingItem.min_budget, viewingItem.max_budget)}</div>
              </div>
              {viewingItem.notes && (
                <div style={{ marginTop: "14px", fontSize: "0.85rem", color: "#64748b" }}>
                  <strong>Notes:</strong> {viewingItem.notes}
                </div>
              )}
            </div>
            <div className="sw-modal-footer">
              <button className="sw-btn-secondary" onClick={() => setViewingItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingItem && (
        <div className="sw-modal-overlay" onClick={() => setDeletingItem(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>Confirm Deletion</h2>
              <button className="sw-btn-icon" onClick={() => setDeletingItem(null)}>✕</button>
            </div>
            <div className="sw-modal-body">
              <p>Are you sure you want to delete <strong>{deletingItem.title}</strong>? This action cannot be undone.</p>
            </div>
            <div className="sw-modal-footer">
              <button className="sw-btn-secondary" onClick={() => setDeletingItem(null)}>Cancel</button>
              <button
                className="sw-btn-primary"
                style={{ background: "#ef4444" }}
                onClick={handleDelete}
                disabled={submitting}
              >
                {submitting ? "Deleting..." : "Delete Requirement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SoftwareRequirements() {
  return (
    <ErrorBoundary moduleName="Software Requirements">
      <SoftwareRequirementsContent />
    </ErrorBoundary>
  );
}
