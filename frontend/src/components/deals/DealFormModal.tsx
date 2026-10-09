import { useState, useEffect } from "react";
import type { Deal, DealCreate, DealUpdate } from "../../types/deal";
import { User } from "../../types/user";
import { Lead } from "../../types/lead";
import { Contact } from "../../types/contact";
import { Account } from "../../types/account";
import { createDeal, updateDeal } from "../../services/dealService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";

interface DealFormModalProps {
  deal?: Deal | null;
  onClose: () => void;
  onSuccess: (savedDeal: Deal) => void;
}

const DEAL_STAGES: string[] = [
  "New",
  "Discovery",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
];

export default function DealFormModal({ deal, onClose, onSuccess }: DealFormModalProps) {
  const isEdit = !!deal;

  const [name, setName] = useState(deal?.name || "");
  const [leadId, setLeadId] = useState(deal?.lead_id || "");
  const [contactId, setContactId] = useState(deal?.contact_id || "");
  const [accountId, setAccountId] = useState(deal?.account_id || "");
  const [assignedTo, setAssignedTo] = useState(deal?.assigned_to || "");
  const [amount, setAmount] = useState<string>(deal?.amount !== undefined && deal.amount !== null ? deal.amount.toString() : "");
  const [stage, setStage] = useState(deal?.stage || "New");
  const [expectedCloseDate, setExpectedCloseDate] = useState(deal?.expected_close_date || "");
  const [description, setDescription] = useState(deal?.description || "");

  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  
  const [dataLoading, setDataLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDataLoading(true);
    setError(null);
    Promise.all([
      getUsers(),
      getLeads(),
      getContacts(),
      getAccounts()
    ]).then(([usersData, leadsData, contactsData, accountsData]) => {
      setUsers(usersData);
      setLeads(leadsData);
      setContacts(contactsData);
      setAccounts(accountsData);
    }).catch((err) => {
      console.error("Failed to load initial data:", err);
      setError("Failed to load required data from the server. Please try again.");
    }).finally(() => {
      setDataLoading(false);
    });
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) {
      errors.name = "Deal Name is required.";
    }
    if (amount && isNaN(Number(amount))) {
      errors.amount = "Amount must be a valid number.";
    }
    
    if ((leadId || contactId) && !accountId) {
      errors.accountId = "Please select an Account when Lead or Contact is selected.";
    }
    
    if (leadId && accountId) {
      const selectedLead = leads.find((l) => l.id === leadId);
      if (selectedLead && selectedLead.account_id !== accountId) {
        errors.leadId = "Selected Lead does not belong to the selected Account.";
      }
    }
    
    if (contactId && accountId) {
      const selectedContact = contacts.find((c) => c.id === contactId);
      if (selectedContact && selectedContact.account_id !== accountId) {
        errors.contactId = "Selected Contact does not belong to the selected Account.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const availableLeads = accountId ? leads.filter((l) => l.account_id === accountId) : [];
  const availableContacts = accountId ? contacts.filter((c) => c.account_id === accountId) : [];

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      let savedDeal: Deal;
      
      const payloadAmount = amount.trim() ? parseFloat(amount) : null;
      
      if (isEdit && deal) {
        const data: DealUpdate = {
          name: name.trim() || undefined,
          lead_id: leadId || undefined,
          contact_id: contactId || undefined,
          account_id: accountId || undefined,
          assigned_to: assignedTo || undefined,
          amount: payloadAmount !== null ? payloadAmount : undefined,
          stage: stage || undefined,
          expected_close_date: expectedCloseDate || undefined,
          description: description.trim() || undefined,
        };
        // Handle explicit nulls if required by backend by not filtering them out, 
        // but here we just pass the empty strings as nulls for foreign keys.
        if (!leadId) data.lead_id = null;
        if (!contactId) data.contact_id = null;
        if (!accountId) data.account_id = null;
        if (!assignedTo) data.assigned_to = null;
        if (payloadAmount === null && amount.trim() === "") data.amount = null;
        if (!expectedCloseDate) data.expected_close_date = null;
        
        savedDeal = await updateDeal(deal.id, data);
      } else {
        const data: DealCreate = {
          name: name.trim(),
          lead_id: leadId || null,
          contact_id: contactId || null,
          account_id: accountId || null,
          assigned_to: assignedTo || null,
          amount: payloadAmount,
          stage: stage || "New",
          expected_close_date: expectedCloseDate || null,
          description: description.trim() || null,
        };
        savedDeal = await createDeal(data);
      }
      onSuccess(savedDeal);
      onClose();
    } catch (err: any) {
      console.error("Deal form error:", err);
      if (err?.response?.status === 422 || err?.status === 422) {
        const detail = err?.response?.data?.detail || err?.detail;
        if (Array.isArray(detail)) {
          const newFieldErrors: Record<string, string> = {};
          detail.forEach((d: any) => {
            const field = d.loc?.[d.loc.length - 1];
            if (field && d.msg) {
              newFieldErrors[field] = d.msg;
            }
          });
          if (Object.keys(newFieldErrors).length > 0) {
            setFieldErrors(newFieldErrors);
            return;
          }
        }
      }

      if (err?.response?.status === 403 || err?.status === 403) {
        setError("You do not have permission to perform this action.");
        return;
      }

      const rawMessage =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Something went wrong. Please try again.";
      setError(typeof rawMessage === "string" ? rawMessage : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <style>{`
        .deal-form-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .deal-form-row-two-column {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .deal-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .deal-form-group label {
          font-weight: 500;
          font-size: 0.875rem;
          color: #4a5568;
        }
        .dashboard-wrapper.dark .deal-form-group label {
          color: #e2e8f0;
        }
        .deal-form-group input,
        .deal-form-group select,
        .deal-form-group textarea {
          box-sizing: border-box;
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #cbd5e0;
          border-radius: 6px;
          font-size: 0.95rem;
          background: #fff;
          color: inherit;
          font-family: inherit;
          min-height: 42px;
          line-height: 1.5;
        }
        .deal-form-group textarea {
          resize: vertical;
          min-height: 80px;
        }
        .dashboard-wrapper.dark .deal-form-group input,
        .dashboard-wrapper.dark .deal-form-group select,
        .dashboard-wrapper.dark .deal-form-group textarea {
          background: #2a2a2a;
          border-color: #4a5568;
        }
        .deal-form-group input:focus,
        .deal-form-group select:focus,
        .deal-form-group textarea:focus {
          border-color: #4a90e2;
          outline: none;
        }
        .deal-form-group input.input-error {
          border-color: #e53e3e !important;
        }
        .deal-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #eaeaea;
        }
        .dashboard-wrapper.dark .deal-modal-footer {
          border-top-color: #333;
        }
        @media (max-width: 600px) {
          .deal-form-row-two-column {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit Deal" : "Create Deal"}</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {error && (
            <div
              className="alert-box error"
              style={{
                padding: "10px 14px",
                marginBottom: "20px",
                borderRadius: "6px",
                background: "#fcebea",
                color: "#cc0000",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <div className="deal-form-grid">
            {/* Deal Name - Full width */}
            <div className="deal-form-group">
              <label>
                Deal Name <span style={{ color: "#e53e3e" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Website Redesign Project"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, name: "" }));
                  setError(null);
                }}
                disabled={loading}
                className={fieldErrors.name ? "input-error" : ""}
              />
              {fieldErrors.name && (
                <span className="field-error" style={{ color: "#e53e3e", fontSize: "0.8rem" }}>{fieldErrors.name}</span>
              )}
            </div>

            {/* Account / Contact */}
            <div className="deal-form-row-two-column">
              <div className="deal-form-group">
                <label>Account</label>
                <select
                  value={accountId}
                  onChange={(e) => {
                    const newAccountId = e.target.value;
                    setAccountId(newAccountId);
                    if (!newAccountId) {
                      setLeadId("");
                      setContactId("");
                    } else {
                      const currentLead = leads.find((l) => l.id === leadId);
                      if (currentLead && currentLead.account_id !== newAccountId) {
                        setLeadId("");
                      }
                      const currentContact = contacts.find((c) => c.id === contactId);
                      if (currentContact && currentContact.account_id !== newAccountId) {
                        setContactId("");
                      }
                    }
                    setFieldErrors((prev) => ({ ...prev, accountId: "" }));
                  }}
                  disabled={loading || dataLoading}
                  className={fieldErrors.accountId ? "input-error" : ""}
                >
                  <option value="">-- Select Account --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {!accountId && (
                  <span style={{ fontSize: "0.75rem", color: "#718096", marginTop: "2px" }}>
                    Select an Account first to choose related Leads and Contacts.
                  </span>
                )}
                {fieldErrors.accountId && (
                  <span className="field-error" style={{ color: "#e53e3e", fontSize: "0.8rem" }}>{fieldErrors.accountId}</span>
                )}
              </div>

              <div className="deal-form-group">
                <label>Contact</label>
                <select
                  value={contactId}
                  onChange={(e) => {
                    setContactId(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, contactId: "" }));
                  }}
                  disabled={loading || dataLoading || !accountId}
                  className={fieldErrors.contactId ? "input-error" : ""}
                >
                  {!accountId ? (
                    <option value="">-- Select Account First --</option>
                  ) : (
                    <>
                      <option value="">-- Select Contact --</option>
                      {availableContacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {fieldErrors.contactId && (
                  <span className="field-error" style={{ color: "#e53e3e", fontSize: "0.8rem" }}>{fieldErrors.contactId}</span>
                )}
              </div>
            </div>

            {/* Lead / Assigned To */}
            <div className="deal-form-row-two-column">
              <div className="deal-form-group">
                <label>Lead</label>
                <select
                  value={leadId}
                  onChange={(e) => {
                    setLeadId(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, leadId: "" }));
                  }}
                  disabled={loading || dataLoading || !accountId}
                  className={fieldErrors.leadId ? "input-error" : ""}
                >
                  {!accountId ? (
                    <option value="">-- Select Account First --</option>
                  ) : availableLeads.length === 0 ? (
                    <option value="">-- No Leads for This Account --</option>
                  ) : (
                    <>
                      <option value="">-- Select Lead --</option>
                      {availableLeads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.full_name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {fieldErrors.leadId && (
                  <span className="field-error" style={{ color: "#e53e3e", fontSize: "0.8rem" }}>{fieldErrors.leadId}</span>
                )}
              </div>

              <div className="deal-form-group">
                <label>Assigned To</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={loading || dataLoading}
                >
                  <option value="">-- Select User --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} — {u.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount / Expected Close Date */}
            <div className="deal-form-row-two-column">
              <div className="deal-form-group">
                <label>Amount</label>
                <input
                  type="text"
                  placeholder="e.g. 10000"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, amount: "" }));
                    setError(null);
                  }}
                  disabled={loading}
                  className={fieldErrors.amount ? "input-error" : ""}
                />
                {fieldErrors.amount && (
                  <span className="field-error" style={{ color: "#e53e3e", fontSize: "0.8rem" }}>{fieldErrors.amount}</span>
                )}
              </div>

              <div className="deal-form-group">
                <label>Expected Close Date</label>
                <input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => {
                    setExpectedCloseDate(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Stage */}
            <div className="deal-form-row-two-column">
              <div className="deal-form-group">
                <label>Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  disabled={loading}
                >
                  {DEAL_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>{/* Spacer */}</div>
            </div>

            {/* Description - Full width */}
            <div className="deal-form-group">
              <label>Description</label>
              <textarea
                placeholder="Details about the deal..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div className="deal-modal-footer" style={{ padding: '0 24px 24px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
