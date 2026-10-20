import { useState, useEffect, useMemo, useRef } from "react";
import type { Account, AccountDetails } from "../../types/account";
import { User } from "../../types/user";
import { formatDateTime } from "../../utils/dateFormatter";
import { getAccountById } from "../../services/accountService";
import { getDeals } from "../../services/dealService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import type { Deal } from "../../types/deal";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import "./AccountViewModal.css";

interface AccountViewModalProps {
  account: Account;
  users: User[];
  onClose: () => void;
}

export default function AccountViewModal({ account, users, onClose }: AccountViewModalProps) {
  const [details, setDetails] = useState<AccountDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [account.id]);

  // Section expand/collapse states (collapsed by default)
  const [showDeals, setShowDeals] = useState(false);
  const [showLeads, setShowLeads] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Filtered lists for this account
  const [dealsList, setDealsList] = useState<Deal[] | null>(null);
  const [leadsList, setLeadsList] = useState<Lead[] | null>(null);
  const [contactsList, setContactsList] = useState<Contact[] | null>(null);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [errorRelated, setErrorRelated] = useState<string | null>(null);

  // Cached lists for resolving lead and contact names
  const [allLeads, setAllLeads] = useState<Lead[] | null>(null);
  const [allContacts, setAllContacts] = useState<Contact[] | null>(null);
  const allLeadsRef = useRef<Lead[] | null>(null);
  const allContactsRef = useRef<Contact[] | null>(null);

  // Name resolution lookup maps
  const leadMap = useMemo(() => {
    const map = new Map<string, string>();
    const list = allLeads || allLeadsRef.current;

    if (list) {
      list.forEach((lead) => {
        if (lead.id) map.set(lead.id, lead.full_name);
      });
    }

    return map;
  }, [allLeads]);

  const contactMap = useMemo(() => {
    const map = new Map<string, string>();
    const list = allContacts || allContactsRef.current;

    if (list) {
      list.forEach((contact) => {
        if (contact.id) map.set(contact.id, contact.full_name);
      });
    }

    return map;
  }, [allContacts]);

  const getLeadName = (leadId: string | null | undefined): string => {
    if (!leadId) return "—";
    const name = leadMap.get(leadId);
    if (name) return name;

    const lead = allLeadsRef.current?.find((item) => item.id === leadId);
    return lead ? lead.full_name : "Unknown Lead";
  };

  const getContactName = (contactId: string | null | undefined): string => {
    if (!contactId) return "—";
    const name = contactMap.get(contactId);
    if (name) return name;

    const contact = allContactsRef.current?.find(
      (item) => item.id === contactId
    );
    return contact ? contact.full_name : "Unknown Contact";
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

  // Fetch account details and related records
  useEffect(() => {
    setLoading(true);
    setLoadingRelated(true);
    setError(null);
    setErrorRelated(null);

    setShowDeals(false);
    setShowLeads(false);
    setShowContacts(false);

    Promise.all([
      getAccountById(account.id),
      getDeals().catch((err) => {
        console.error("Failed to load deals:", err);
        return [] as Deal[];
      }),
      getLeads().catch((err) => {
        console.error("Failed to load leads:", err);
        return [] as Lead[];
      }),
      getContacts().catch((err) => {
        console.error("Failed to load contacts:", err);
        return [] as Contact[];
      }),
    ])
      .then(([accountData, allDeals, allLeadsData, allContactsData]) => {
        setDetails(accountData);

        allLeadsRef.current = allLeadsData;
        allContactsRef.current = allContactsData;
        setAllLeads(allLeadsData);
        setAllContacts(allContactsData);

        setDealsList(allDeals.filter((d) => d.account_id === account.id));
        setLeadsList(allLeadsData.filter((l) => l.account_id === account.id));
        setContactsList(
          allContactsData.filter((c) => c.account_id === account.id)
        );
      })
      .catch((err) => {
        console.error("Failed to load account details:", err);
        setError("Failed to load account details.");
      })
      .finally(() => {
        setLoading(false);
        setLoadingRelated(false);
      });
  }, [account.id]);

  const dealsCount = dealsList ? dealsList.length : 0;
  const leadsCount = leadsList ? leadsList.length : 0;
  const contactsCount = contactsList ? contactsList.length : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "800px" }}
      >
        <div className="modal-header">
          <h2>Account Details</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px" }}>Loading account details...</div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#e53e3e" }}>{error}</div>
          ) : details ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Overview Section */}
              <section>
                <h3 className="account-modal-section-title">
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
                <h3 className="account-modal-section-title">
                  Revenue Summary
                </h3>
                <div className="detail-grid">
                  <div className="detail-group">
                    <label className="text-muted">Total Deals</label>
                    <p className="detail-value revenue-summary-value">
                      {details.total_deals}
                    </p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Won Deals</label>
                    <p className="detail-value revenue-won-value">
                      {details.won_deals}
                    </p>
                  </div>
                  <div className="detail-group">
                    <label className="text-muted">Total Revenue (Won)</label>
                    <p className="detail-value revenue-won-value">
                      {formatCurrency(details.total_revenue)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Related Records Section */}
              <section>
                <h3 className="account-modal-section-title">
                  Related Records
                </h3>

                <div className="related-sections-container">
                  {/* Related Deals Card */}
                  <div className="related-section-card">
                    <div
                      className="related-section-header"
                      onClick={() => setShowDeals((prev) => !prev)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowDeals((prev) => !prev);
                        }
                      }}
                    >
                      <div className="related-header-left">
                        <div className="related-icon-box related-icon-deals">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                          </svg>
                        </div>
                        <h4 className="related-header-title">Related Deals</h4>
                        <span className={`related-count-badge ${dealsCount > 0 ? "has-records" : ""}`}>
                          {loadingRelated ? "…" : dealsCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="related-toggle-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeals((prev) => !prev);
                        }}
                        aria-label={showDeals ? "Collapse Related Deals" : "Expand Related Deals"}
                      >
                        <span>{showDeals ? "Hide" : "View"}</span>
                        <svg
                          className="related-toggle-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: showDeals ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                    </div>

                    {showDeals && (
                      <div className="related-content">
                        {loadingRelated ? (
                          <div className="related-loading-state">Loading deals...</div>
                        ) : errorRelated ? (
                          <div className="related-empty-state" style={{ color: "#e53e3e" }}>{errorRelated}</div>
                        ) : (!dealsList || dealsList.length === 0) ? (
                          <div className="related-empty-state">No related deals found for this account.</div>
                        ) : (
                          <div className="related-table-wrapper">
                            <table className="related-table">
                              <thead>
                                <tr>
                                  <th>Deal Name</th>
                                  <th>Lead</th>
                                  <th>Contact</th>
                                  <th>Stage</th>
                                  <th style={{ textAlign: "right" }}>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {dealsList.map((deal) => (
                                  <tr key={deal.id}>
                                    <td className="related-deal-name">{deal.name || "—"}</td>
                                    <td className="related-lead-ref">{getLeadName(deal.lead_id)}</td>
                                    <td className="related-contact-ref">{getContactName(deal.contact_id)}</td>
                                    <td>
                                      <span className="related-badge">{deal.stage || "—"}</span>
                                    </td>
                                    <td className="related-amount-cell">
                                      {formatCurrency(deal.amount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Related Leads Card */}
                  <div className="related-section-card">
                    <div
                      className="related-section-header"
                      onClick={() => setShowLeads((prev) => !prev)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowLeads((prev) => !prev);
                        }
                      }}
                    >
                      <div className="related-header-left">
                        <div className="related-icon-box related-icon-leads">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="8.5" cy="7" r="4"></circle>
                            <line x1="20" y1="8" x2="20" y2="14"></line>
                            <line x1="23" y1="11" x2="17" y2="11"></line>
                          </svg>
                        </div>
                        <h4 className="related-header-title">Related Leads</h4>
                        <span className={`related-count-badge ${leadsCount > 0 ? "has-records" : ""}`}>
                          {loadingRelated ? "…" : leadsCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="related-toggle-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowLeads((prev) => !prev);
                        }}
                        aria-label={showLeads ? "Collapse Related Leads" : "Expand Related Leads"}
                      >
                        <span>{showLeads ? "Hide" : "View"}</span>
                        <svg
                          className="related-toggle-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: showLeads ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                    </div>

                    {showLeads && (
                      <div className="related-content">
                        {loadingRelated ? (
                          <div className="related-loading-state">Loading leads...</div>
                        ) : errorRelated ? (
                          <div className="related-empty-state" style={{ color: "#e53e3e" }}>{errorRelated}</div>
                        ) : (!leadsList || leadsList.length === 0) ? (
                          <div className="related-empty-state">No related leads found for this account.</div>
                        ) : (
                          <div className="related-table-wrapper">
                            <table className="related-table">
                              <thead>
                                <tr>
                                  <th>Lead Name</th>
                                  <th>Status</th>
                                  <th>Email</th>
                                  <th>Phone</th>
                                  <th>Source</th>
                                </tr>
                              </thead>
                              <tbody>
                                {leadsList.map((lead) => (
                                  <tr key={lead.id}>
                                    <td className="related-lead-name">{lead.full_name}</td>
                                    <td>
                                      <span className="related-badge related-badge-teal">{lead.status || "—"}</span>
                                    </td>
                                    <td className="related-cell-muted">{lead.email || "—"}</td>
                                    <td className="related-cell-muted">{lead.phone || "—"}</td>
                                    <td className="related-cell-dim">{lead.source || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Related Contacts Card */}
                  <div className="related-section-card">
                    <div
                      className="related-section-header"
                      onClick={() => setShowContacts((prev) => !prev)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowContacts((prev) => !prev);
                        }
                      }}
                    >
                      <div className="related-header-left">
                        <div className="related-icon-box related-icon-contacts">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                          </svg>
                        </div>
                        <h4 className="related-header-title">Related Contacts</h4>
                        <span className={`related-count-badge ${contactsCount > 0 ? "has-records" : ""}`}>
                          {loadingRelated ? "…" : contactsCount}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="related-toggle-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowContacts((prev) => !prev);
                        }}
                        aria-label={showContacts ? "Collapse Related Contacts" : "Expand Related Contacts"}
                      >
                        <span>{showContacts ? "Hide" : "View"}</span>
                        <svg
                          className="related-toggle-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: showContacts ? "rotate(180deg)" : "rotate(0deg)",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                    </div>

                    {showContacts && (
                      <div className="related-content">
                        {loadingRelated ? (
                          <div className="related-loading-state">Loading contacts...</div>
                        ) : errorRelated ? (
                          <div className="related-empty-state" style={{ color: "#e53e3e" }}>{errorRelated}</div>
                        ) : (!contactsList || contactsList.length === 0) ? (
                          <div className="related-empty-state">No related contacts found for this account.</div>
                        ) : (
                          <div className="related-table-wrapper">
                            <table className="related-table">
                              <thead>
                                <tr>
                                  <th>Contact Name</th>
                                  <th>Title / Company</th>
                                  <th>Email</th>
                                  <th>Phone</th>
                                </tr>
                              </thead>
                              <tbody>
                                {contactsList.map((contact) => (
                                  <tr key={contact.id}>
                                    <td className="related-contact-name">{contact.full_name}</td>
                                    <td className="related-cell-muted">
                                      {contact.job_title || contact.company
                                        ? [contact.job_title, contact.company].filter(Boolean).join(" at ")
                                        : "—"}
                                    </td>
                                    <td className="related-cell-muted">{contact.email || "—"}</td>
                                    <td className="related-cell-muted">{contact.phone || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
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
  );
}
