import { useState, useEffect, useMemo, useCallback } from "react";
import type { Account, AccountDetails } from "../../types/account";
import type { User } from "../../types/user";
import type { Deal } from "../../types/deal";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import { formatDateTime } from "../../utils/dateFormatter";
import { getAccountById, getAccounts } from "../../services/accountService";
import { getDealById, getDeals } from "../../services/dealService";
import { getLead, getLeads } from "../../services/leadService";
import { getContact, getContacts } from "../../services/contactService";
import { getDealPermissions } from "../../utils/dealPermissions";
import { getLeadPermissions } from "../../utils/leadPermissions";
import { getContactPermissions } from "../../utils/contactPermissions";
import DealViewModal from "../deals/DealViewModal";
import DealFormModal from "../deals/DealFormModal";
import LeadViewModal from "../leads/LeadViewModal";
import LeadFormModal from "../leads/LeadFormModal";
import ContactViewModal from "../contacts/ContactViewModal";
import ContactFormModal from "../contacts/ContactFormModal";
import "./AccountViewModal.css";

interface AccountViewModalProps {
  account: Account;
  users: User[];
  onClose: () => void;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="related-action-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
    </svg>
  );
}

export default function AccountViewModal({ account, users, onClose }: AccountViewModalProps) {
  const [details, setDetails] = useState<AccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Submodal states for related records
  const [viewDeal, setViewDeal] = useState<Deal | null>(null);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [viewLead, setViewLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [editContact, setEditContact] = useState<Contact | null>(null);

  // Supporting reference lists for modals
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);

  // Collapsible Related Deals state
  const [isDealsExpanded, setIsDealsExpanded] = useState(false);
  const [relatedDeals, setRelatedDeals] = useState<Deal[] | null>(null);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState<string | null>(null);

  // Collapsible Related Leads state
  const [isLeadsExpanded, setIsLeadsExpanded] = useState(false);
  const [relatedLeads, setRelatedLeads] = useState<Lead[] | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);

  // Collapsible Related Contacts state
  const [isContactsExpanded, setIsContactsExpanded] = useState(false);
  const [relatedContacts, setRelatedContacts] = useState<Contact[] | null>(null);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);

  // Permissions
  const dealPerms = useMemo(() => getDealPermissions(), []);
  const leadPerms = useMemo(() => getLeadPermissions(), []);
  const contactPerms = useMemo(() => getContactPermissions(), []);

  const canViewDeal = dealPerms.view !== false;
  const canEditDeal = !!dealPerms.update;

  const canViewLead = leadPerms.canView !== false;
  const canEditLead = !!leadPerms.canEdit;

  const canViewContact = contactPerms.view !== false;
  const canEditContact = !!contactPerms.update;

  const refreshAccountDetails = useCallback(() => {
    getAccountById(account.id)
      .then((data) => {
        setDetails(data);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to refresh account details:", err);
      });
  }, [account.id]);

  useEffect(() => {
    setLoading(true);
    getAccountById(account.id)
      .then((data) => {
        setDetails(data);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load account details:", err);
        setError("Failed to load account details.");
      })
      .finally(() => {
        setLoading(false);
      });

    // Pre-load reference lists in the background
    Promise.all([
      getLeads().catch(() => []),
      getContacts().catch(() => []),
      getAccounts().catch(() => []),
    ]).then(([leadsData, contactsData, accountsData]) => {
      setAllLeads(leadsData);
      setAllContacts(contactsData);
      setAllAccounts(accountsData);
    });
  }, [account.id]);

  // Deal action handlers
  const handleViewDeal = async (dealId: string) => {
    try {
      setActionLoading(`deal-view-${dealId}`);
      setActionError(null);
      const fullDeal = await getDealById(dealId);
      setViewDeal(fullDeal);
    } catch (err) {
      console.error("Failed to load deal details:", err);
      setActionError("Failed to load deal details.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditDeal = async (dealId: string) => {
    try {
      setActionLoading(`deal-edit-${dealId}`);
      setActionError(null);
      const fullDeal = await getDealById(dealId);
      setEditDeal(fullDeal);
    } catch (err) {
      console.error("Failed to load deal for editing:", err);
      setActionError("Failed to load deal for editing.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDealSuccess = () => {
    setEditDeal(null);
    refreshAccountDetails();
    if (isDealsExpanded) {
      void loadRelatedDeals();
    }
  };

  // Lead action handlers
  const handleViewLead = async (leadId: string) => {
    try {
      setActionLoading(`lead-view-${leadId}`);
      setActionError(null);
      const fullLead = await getLead(leadId);
      setViewLead(fullLead);
    } catch (err) {
      console.error("Failed to load lead details:", err);
      setActionError("Failed to load lead details.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditLead = async (leadId: string) => {
    try {
      setActionLoading(`lead-edit-${leadId}`);
      setActionError(null);
      const fullLead = await getLead(leadId);
      setEditLead(fullLead);
    } catch (err) {
      console.error("Failed to load lead for editing:", err);
      setActionError("Failed to load lead for editing.");
    } finally {
      setActionLoading(null);
    }
  };

  // Reset related expanded states and cache when switching accounts
  useEffect(() => {
    setIsDealsExpanded(false);
    setRelatedDeals(null);
    setDealsLoading(false);
    setDealsError(null);

    setIsLeadsExpanded(false);
    setRelatedLeads(null);
    setLeadsLoading(false);
    setLeadsError(null);

    setIsContactsExpanded(false);
    setRelatedContacts(null);
    setContactsLoading(false);
    setContactsError(null);
  }, [account.id]);

  const loadRelatedDeals = useCallback(async () => {
    setDealsLoading(true);
    setDealsError(null);
    try {
      const dealsData = await getDeals();
      const currentAccountId = String(account.id).toLowerCase();
      const matched = dealsData.filter((deal) => {
        const isDirectMatch =
          deal.account_id &&
          String(deal.account_id).toLowerCase() === currentAccountId;
        const isSummaryMatch =
          details?.deals &&
          details.deals.some(
            (dd) => String(dd.id).toLowerCase() === String(deal.id).toLowerCase()
          );
        return Boolean(isDirectMatch || isSummaryMatch);
      });
      setRelatedDeals(matched);
    } catch (err: any) {
      console.error("Failed to load related deals:", err);
      setDealsError(
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load related deals. Please try again."
      );
    } finally {
      setDealsLoading(false);
    }
  }, [account.id, details?.deals]);

  const handleToggleDeals = async () => {
    if (isDealsExpanded) {
      setIsDealsExpanded(false);
      return;
    }

    setIsDealsExpanded(true);
    if (relatedDeals === null || dealsError) {
      await loadRelatedDeals();
    }
  };

  const loadRelatedLeads = useCallback(async () => {
    setLeadsLoading(true);
    setLeadsError(null);
    try {
      const leadsData = await getLeads();
      const currentAccountId = String(account.id).toLowerCase();
      const matched = leadsData.filter((lead) => {
        const isDirectMatch =
          lead.account_id &&
          String(lead.account_id).toLowerCase() === currentAccountId;
        const isSummaryMatch =
          details?.leads &&
          details.leads.some(
            (dl) => String(dl.id).toLowerCase() === String(lead.id).toLowerCase()
          );
        return Boolean(isDirectMatch || isSummaryMatch);
      });
      setRelatedLeads(matched);
    } catch (err: any) {
      console.error("Failed to load related leads:", err);
      setLeadsError(
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load related leads. Please try again."
      );
    } finally {
      setLeadsLoading(false);
    }
  }, [account.id, details?.leads]);

  const handleToggleLeads = async () => {
    if (isLeadsExpanded) {
      setIsLeadsExpanded(false);
      return;
    }

    setIsLeadsExpanded(true);
    if (relatedLeads === null || leadsError) {
      await loadRelatedLeads();
    }
  };

  const handleLeadSuccess = () => {
    setEditLead(null);
    refreshAccountDetails();
    if (isLeadsExpanded) {
      void loadRelatedLeads();
    }
  };

  // Contact action handlers
  const handleViewContact = async (contactId: string) => {
    try {
      setActionLoading(`contact-view-${contactId}`);
      setActionError(null);
      const fullContact = await getContact(contactId);
      setViewContact(fullContact);
    } catch (err) {
      console.error("Failed to load contact details:", err);
      setActionError("Failed to load contact details.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditContact = async (contactId: string) => {
    try {
      setActionLoading(`contact-edit-${contactId}`);
      setActionError(null);
      const fullContact = await getContact(contactId);
      setEditContact(fullContact);
    } catch (err) {
      console.error("Failed to load contact for editing:", err);
      setActionError("Failed to load contact for editing.");
    } finally {
      setActionLoading(null);
    }
  };

  const loadRelatedContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError(null);
    try {
      const contactsData = await getContacts();
      const currentAccountId = String(account.id).toLowerCase();
      const matched = contactsData.filter((contact) => {
        const isDirectMatch =
          contact.account_id &&
          String(contact.account_id).toLowerCase() === currentAccountId;
        const isSummaryMatch =
          details?.contacts &&
          details.contacts.some(
            (dc) => String(dc.id).toLowerCase() === String(contact.id).toLowerCase()
          );
        return Boolean(isDirectMatch || isSummaryMatch);
      });
      setRelatedContacts(matched);
    } catch (err: any) {
      console.error("Failed to load related contacts:", err);
      setContactsError(
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load related contacts. Please try again."
      );
    } finally {
      setContactsLoading(false);
    }
  }, [account.id, details?.contacts]);

  const handleToggleContacts = async () => {
    if (isContactsExpanded) {
      setIsContactsExpanded(false);
      return;
    }

    setIsContactsExpanded(true);
    if (relatedContacts === null || contactsError) {
      await loadRelatedContacts();
    }
  };

  const handleContactSuccess = () => {
    setEditContact(null);
    refreshAccountDetails();
    if (isContactsExpanded) {
      void loadRelatedContacts();
    }
  };

  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";
    const user = users.find((u) => u.id === userId);
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null) return "—";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(Number(amount));
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "800px" }}>
          <div className="modal-header">
            <h2>Account Details</h2>
            <button className="btn-close" onClick={onClose} aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
            {actionError && (
              <div
                style={{
                  padding: "10px 14px",
                  marginBottom: "16px",
                  borderRadius: "6px",
                  backgroundColor: "#fee2e2",
                  color: "#991b1b",
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span>{actionError}</span>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#991b1b",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ textAlign: "center", padding: "40px" }}>Loading account details...</div>
            ) : error ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#e53e3e" }}>{error}</div>
            ) : details ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                {/* Overview Section */}
                <section>
                  <h3 className="account-modal-section-title account-section-header">
                    Overview
                  </h3>
                  <div className="detail-grid">
                    <div className="detail-group">
                      <label className="text-muted">Account Name</label>
                      <p className="detail-value">{details.name || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Email</label>
                      <p className="detail-value">{details.email || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Phone</label>
                      <p className="detail-value">{details.phone || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Website</label>
                      <p className="detail-value">{details.website || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Industry</label>
                      <p className="detail-value">{details.industry || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Status</label>
                      <p className="detail-value">{details.status || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Source</label>
                      <p className="detail-value">{details.source || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Assigned To</label>
                      <p className="detail-value">{getAssignedUser(details.assigned_to)}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">City</label>
                      <p className="detail-value">{details.city || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">State</label>
                      <p className="detail-value">{details.state || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Country</label>
                      <p className="detail-value">{details.country || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Postal Code</label>
                      <p className="detail-value">{details.postal_code || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Address</label>
                      <p className="detail-value">{details.address || "—"}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Created At</label>
                      <p className="detail-value">{formatDateTime(details.created_at)}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Updated At</label>
                      <p className="detail-value">{formatDateTime(details.updated_at)}</p>
                    </div>
                  </div>
                  {details.notes && (
                    <div className="detail-group mt-4">
                      <label className="text-muted">Notes</label>
                      <div className="detail-value notes-box">
                        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{details.notes}</p>
                      </div>
                    </div>
                  )}
                </section>

                {/* Revenue Summary */}
                <section>
                  <h3 className="account-modal-section-title account-section-header">
                    Revenue Summary
                  </h3>
                  <div className="detail-grid">
                    <div className="detail-group">
                      <label className="text-muted">Total Deals</label>
                      <p className="detail-value detail-value-semibold">{details.total_deals}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Won Deals</label>
                      <p className="detail-value detail-value-semibold revenue-won-value">{details.won_deals}</p>
                    </div>
                    <div className="detail-group">
                      <label className="text-muted">Total Revenue (Won)</label>
                      <p className="detail-value detail-value-semibold revenue-won-value">
                        {formatCurrency(details.total_revenue)}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Related Deals */}
                <section>
                  <div
                    className="related-section-title-bar"
                    style={{ marginBottom: isDealsExpanded ? "14px" : "0" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h3
                        className="account-modal-section-title"
                        style={{ margin: 0, padding: 0, border: "none" }}
                      >
                        Related Deals
                      </h3>
                      <span
                        className={`related-count-badge ${
                          (relatedDeals !== null
                            ? relatedDeals.length
                            : (details?.deals?.length ?? 0)) > 0
                            ? "has-records"
                            : ""
                        }`}
                      >
                        {relatedDeals !== null
                          ? relatedDeals.length
                          : (details?.deals?.length ?? 0)}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="related-toggle-btn"
                      onClick={handleToggleDeals}
                      aria-expanded={isDealsExpanded}
                    >
                      <span>{isDealsExpanded ? "Hide Deals" : "View Deals"}</span>
                      <svg
                        className={`related-toggle-icon ${
                          isDealsExpanded ? "expanded" : ""
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>

                  {isDealsExpanded && (
                    <div style={{ marginTop: "12px" }}>
                      {dealsLoading ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            padding: "24px",
                            color: "#718096",
                            fontSize: "0.9rem",
                          }}
                        >
                          <SpinnerIcon />
                          <span>Loading related deals...</span>
                        </div>
                      ) : dealsError ? (
                        <div
                          style={{
                            padding: "12px 16px",
                            borderRadius: "6px",
                            backgroundColor: "#fee2e2",
                            color: "#991b1b",
                            fontSize: "0.88rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <span>{dealsError}</span>
                          <button
                            type="button"
                            onClick={loadRelatedDeals}
                            className="related-action-btn"
                            style={{
                              borderColor: "#ef4444",
                              color: "#b91c1c",
                              backgroundColor: "#ffffff",
                            }}
                          >
                            Retry
                          </button>
                        </div>
                      ) : !relatedDeals || relatedDeals.length === 0 ? (
                        <p
                          className="text-muted italic"
                          style={{ padding: "8px 0", margin: 0 }}
                        >
                          No deals related to this account.
                        </p>
                      ) : (
                        <div className="related-records-list">
                          {relatedDeals.map((deal) => (
                            <div key={deal.id} className="related-record-card">
                              <div className="related-record-info">
                                <div className="related-record-name">{deal.name}</div>
                                <div className="related-record-meta">
                                  <span className="related-badge">Stage: {deal.stage}</span>
                                  <span className="related-deal-amount">{formatCurrency(deal.amount)}</span>
                                </div>
                              </div>
                              <div className="related-record-actions">
                                {canViewDeal && (
                                  <button
                                    type="button"
                                    className="related-action-btn view"
                                    onClick={() => handleViewDeal(deal.id)}
                                    disabled={actionLoading === `deal-view-${deal.id}`}
                                    title="View Deal Details"
                                  >
                                    {actionLoading === `deal-view-${deal.id}` ? <SpinnerIcon /> : <EyeIcon />}
                                    <span>View</span>
                                  </button>
                                )}
                                {canEditDeal && (
                                  <button
                                    type="button"
                                    className="related-action-btn edit"
                                    onClick={() => handleEditDeal(deal.id)}
                                    disabled={actionLoading === `deal-edit-${deal.id}`}
                                    title="Edit Deal"
                                  >
                                    {actionLoading === `deal-edit-${deal.id}` ? <SpinnerIcon /> : <PencilIcon />}
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Related Leads */}
                <section>
                  <div
                    className="related-section-title-bar"
                    style={{ marginBottom: isLeadsExpanded ? "14px" : "0" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h3
                        className="account-modal-section-title"
                        style={{ margin: 0, padding: 0, border: "none" }}
                      >
                        Related Leads
                      </h3>
                      <span
                        className={`related-count-badge ${
                          (relatedLeads !== null
                            ? relatedLeads.length
                            : (details?.leads?.length ?? 0)) > 0
                            ? "has-records"
                            : ""
                        }`}
                      >
                        {relatedLeads !== null
                          ? relatedLeads.length
                          : (details?.leads?.length ?? 0)}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="related-toggle-btn"
                      onClick={handleToggleLeads}
                      aria-expanded={isLeadsExpanded}
                    >
                      <span>{isLeadsExpanded ? "Hide Leads" : "View Leads"}</span>
                      <svg
                        className={`related-toggle-icon ${
                          isLeadsExpanded ? "expanded" : ""
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>

                  {isLeadsExpanded && (
                    <div style={{ marginTop: "12px" }}>
                      {leadsLoading ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            padding: "24px",
                            color: "#718096",
                            fontSize: "0.9rem",
                          }}
                        >
                          <SpinnerIcon />
                          <span>Loading related leads...</span>
                        </div>
                      ) : leadsError ? (
                        <div
                          style={{
                            padding: "12px 16px",
                            borderRadius: "6px",
                            backgroundColor: "#fee2e2",
                            color: "#991b1b",
                            fontSize: "0.88rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <span>{leadsError}</span>
                          <button
                            type="button"
                            onClick={loadRelatedLeads}
                            className="related-action-btn"
                            style={{
                              borderColor: "#ef4444",
                              color: "#b91c1c",
                              backgroundColor: "#ffffff",
                            }}
                          >
                            Retry
                          </button>
                        </div>
                      ) : !relatedLeads || relatedLeads.length === 0 ? (
                        <p
                          className="text-muted italic"
                          style={{ padding: "8px 0", margin: 0 }}
                        >
                          No leads related to this account.
                        </p>
                      ) : (
                        <div className="related-records-list">
                          {relatedLeads.map((lead) => (
                            <div key={lead.id} className="related-record-card">
                              <div className="related-record-info">
                                <div className="related-record-name">
                                  {lead.full_name}
                                </div>
                                <div className="related-record-meta">
                                  {lead.email && (
                                    <span className="related-meta-item">
                                      📧 {lead.email}
                                    </span>
                                  )}
                                  {lead.phone && (
                                    <span className="related-meta-item">
                                      📞 {lead.phone}
                                    </span>
                                  )}
                                  <span className="related-badge">
                                    Status: {lead.status}
                                  </span>
                                </div>
                              </div>
                              <div className="related-record-actions">
                                {canViewLead && (
                                  <button
                                    type="button"
                                    className="related-action-btn view"
                                    onClick={() => handleViewLead(lead.id)}
                                    disabled={
                                      actionLoading === `lead-view-${lead.id}`
                                    }
                                    title="View Lead Details"
                                  >
                                    {actionLoading === `lead-view-${lead.id}` ? (
                                      <SpinnerIcon />
                                    ) : (
                                      <EyeIcon />
                                    )}
                                    <span>View</span>
                                  </button>
                                )}
                                {canEditLead && (
                                  <button
                                    type="button"
                                    className="related-action-btn edit"
                                    onClick={() => handleEditLead(lead.id)}
                                    disabled={
                                      actionLoading === `lead-edit-${lead.id}`
                                    }
                                    title="Edit Lead"
                                  >
                                    {actionLoading === `lead-edit-${lead.id}` ? (
                                      <SpinnerIcon />
                                    ) : (
                                      <PencilIcon />
                                    )}
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* Related Contacts */}
                <section>
                  <div
                    className="related-section-title-bar"
                    style={{ marginBottom: isContactsExpanded ? "14px" : "0" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <h3
                        className="account-modal-section-title"
                        style={{ margin: 0, padding: 0, border: "none" }}
                      >
                        Related Contacts
                      </h3>
                      <span
                        className={`related-count-badge ${
                          (relatedContacts !== null
                            ? relatedContacts.length
                            : (details?.contacts?.length ?? 0)) > 0
                            ? "has-records"
                            : ""
                        }`}
                      >
                        {relatedContacts !== null
                          ? relatedContacts.length
                          : (details?.contacts?.length ?? 0)}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="related-toggle-btn"
                      onClick={handleToggleContacts}
                      aria-expanded={isContactsExpanded}
                    >
                      <span>{isContactsExpanded ? "Hide Contacts" : "View Contacts"}</span>
                      <svg
                        className={`related-toggle-icon ${
                          isContactsExpanded ? "expanded" : ""
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>

                  {isContactsExpanded && (
                    <div style={{ marginTop: "12px" }}>
                      {contactsLoading ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            padding: "24px",
                            color: "#718096",
                            fontSize: "0.9rem",
                          }}
                        >
                          <SpinnerIcon />
                          <span>Loading related contacts...</span>
                        </div>
                      ) : contactsError ? (
                        <div
                          style={{
                            padding: "12px 16px",
                            borderRadius: "6px",
                            backgroundColor: "#fee2e2",
                            color: "#991b1b",
                            fontSize: "0.88rem",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <span>{contactsError}</span>
                          <button
                            type="button"
                            onClick={loadRelatedContacts}
                            className="related-action-btn"
                            style={{
                              borderColor: "#ef4444",
                              color: "#b91c1c",
                              backgroundColor: "#ffffff",
                            }}
                          >
                            Retry
                          </button>
                        </div>
                      ) : !relatedContacts || relatedContacts.length === 0 ? (
                        <p
                          className="text-muted italic"
                          style={{ padding: "8px 0", margin: 0 }}
                        >
                          No contacts related to this account.
                        </p>
                      ) : (
                        <div className="related-records-list">
                          {relatedContacts.map((contact) => (
                            <div key={contact.id} className="related-record-card">
                              <div className="related-record-info">
                                <div className="related-record-name">{contact.full_name}</div>
                                <div className="related-record-meta">
                                  {contact.email && <span className="related-meta-item">📧 {contact.email}</span>}
                                  {contact.phone && <span className="related-meta-item">📞 {contact.phone}</span>}
                                  {(contact.job_title || contact.company) && (
                                    <span className="related-meta-item">
                                      💼 {contact.job_title} {contact.job_title && contact.company && "at"}{" "}
                                      {contact.company}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="related-record-actions">
                                {canViewContact && (
                                  <button
                                    type="button"
                                    className="related-action-btn view"
                                    onClick={() => handleViewContact(contact.id)}
                                    disabled={actionLoading === `contact-view-${contact.id}`}
                                    title="View Contact Details"
                                  >
                                    {actionLoading === `contact-view-${contact.id}` ? (
                                      <SpinnerIcon />
                                    ) : (
                                      <EyeIcon />
                                    )}
                                    <span>View</span>
                                  </button>
                                )}
                                {canEditContact && (
                                  <button
                                    type="button"
                                    className="related-action-btn edit"
                                    onClick={() => handleEditContact(contact.id)}
                                    disabled={actionLoading === `contact-edit-${contact.id}`}
                                    title="Edit Contact"
                                  >
                                    {actionLoading === `contact-edit-${contact.id}` ? (
                                      <SpinnerIcon />
                                    ) : (
                                      <PencilIcon />
                                    )}
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </div>

          <div className="modal-footer">
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Submodals for Related Records */}
      <div className="account-modal-submodal-container">
        {viewDeal && (
          <DealViewModal
            deal={viewDeal}
            users={users}
            leads={allLeads.length ? allLeads : ((details?.leads as any) || [])}
            contacts={allContacts.length ? allContacts : ((details?.contacts as any) || [])}
            accounts={allAccounts.length ? allAccounts : [account]}
            onClose={() => setViewDeal(null)}
          />
        )}

        {editDeal && (
          <DealFormModal
            deal={editDeal}
            onClose={() => setEditDeal(null)}
            onSuccess={handleDealSuccess}
          />
        )}

        {viewLead && (
          <LeadViewModal
            lead={viewLead}
            users={users}
            onClose={() => setViewLead(null)}
            onEdit={() => {
              const current = viewLead;
              setViewLead(null);
              setEditLead(current);
            }}
          />
        )}

        {editLead && (
          <LeadFormModal
            lead={editLead}
            onClose={() => setEditLead(null)}
            onSuccess={handleLeadSuccess}
          />
        )}

        {viewContact && (
          <ContactViewModal
            contact={viewContact}
            users={users}
            accounts={allAccounts.length ? allAccounts : [account]}
            onClose={() => setViewContact(null)}
          />
        )}

        {editContact && (
          <ContactFormModal
            contact={editContact}
            onClose={() => setEditContact(null)}
            onSuccess={handleContactSuccess}
          />
        )}
      </div>
    </>
  );
}
