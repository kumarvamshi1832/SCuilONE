import { useState, useEffect } from "react";
import type { Contact, ContactCreate, ContactUpdate } from "../../types/contact";
import { User } from "../../types/user";
import { createContact, updateContact } from "../../services/contactService";
import { getUsers } from "../../services/userService";
import { getAccounts } from "../../services/accountService";
import { Account } from "../../types/account";

interface ContactFormModalProps {
  contact?: Contact | null;
  onClose: () => void;
  onSuccess: (savedContact: Contact) => void;
}

const CONTACT_SOURCES: string[] = [
  "Website",
  "Referral",
  "Social Media",
  "Walk-in",
  "Phone Inquiry",
  "Email Campaign",
  "Property Portal",
  "Other",
];

export default function ContactFormModal({ contact, onClose, onSuccess }: ContactFormModalProps) {
  const isEdit = !!contact;

  const [fullName, setFullName] = useState(contact?.full_name || "");
  const [email, setEmail] = useState(contact?.email || "");
  const [phone, setPhone] = useState(contact?.phone || "");
  const [company, setCompany] = useState(contact?.company || "");
  const [jobTitle, setJobTitle] = useState(contact?.job_title || "");
  const [address, setAddress] = useState(contact?.address || "");
  const [source, setSource] = useState(contact?.source || "");
  const [accountId, setAccountId] = useState(contact?.account_id || "");
  const [assignedTo, setAssignedTo] = useState(contact?.assigned_to || "");
  const [notes, setNotes] = useState(contact?.notes || "");

  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setDataLoading(true);
    Promise.all([
      getUsers(),
      getAccounts()
    ])
      .then(([usersData, accountsData]) => {
        setUsers(usersData);
        setAccounts(accountsData);
      })
      .catch((err) => {
        console.error("Failed to load initial data:", err);
        setError("Failed to load required data from the server. Please try again.");
      })
      .finally(() => {
        setDataLoading(false);
      });
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) {
      errors.full_name = "Full Name is required.";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Please enter a valid email address.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      let savedContact: Contact;
      if (isEdit && contact) {
        const data: ContactUpdate = {
          full_name: fullName.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          company: company.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          address: address.trim() || undefined,
          source: source || undefined,
          account_id: accountId || null,
          assigned_to: assignedTo || null,
          notes: notes.trim() || undefined,
        };
        savedContact = await updateContact(contact.id, data);
      } else {
        const data: ContactCreate = {
          full_name: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          company: company.trim() || undefined,
          job_title: jobTitle.trim() || undefined,
          address: address.trim() || undefined,
          source: source || undefined,
          account_id: accountId || null,
          assigned_to: assignedTo || null,
          notes: notes.trim() || undefined,
        };
        savedContact = await createContact(data);
      }
      onSuccess(savedContact);
      onClose();
    } catch (err: any) {
      console.error("Contact form error:", err);
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
        .contact-form-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .form-row-two-column {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .contact-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .contact-form-group label {
          font-weight: 500;
          font-size: 0.875rem;
          color: #4a5568;
        }
        .dashboard-wrapper.dark .contact-form-group label {
          color: #e2e8f0;
        }
        .contact-form-group input,
        .contact-form-group select,
        .contact-form-group textarea {
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
        .contact-form-group textarea {
          resize: vertical;
          min-height: 80px;
        }
        .dashboard-wrapper.dark .contact-form-group input,
        .dashboard-wrapper.dark .contact-form-group select,
        .dashboard-wrapper.dark .contact-form-group textarea {
          background: #2a2a2a;
          border-color: #4a5568;
        }
        .contact-form-group input:focus,
        .contact-form-group select:focus,
        .contact-form-group textarea:focus {
          border-color: #4a90e2;
          outline: none;
        }
        .contact-form-group input.input-error {
          border-color: #e53e3e !important;
        }
        .contact-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #eaeaea;
        }
        .dashboard-wrapper.dark .contact-modal-footer {
          border-top-color: #333;
        }
        @media (max-width: 600px) {
          .form-row-two-column {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', width: '100%' }}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit Contact" : "Create Contact"}</h2>
          <button className="btn-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="modal-body">
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

          <div className="contact-form-grid">
            <div className="contact-form-group">
              <label>
                Full Name <span style={{ color: "#e53e3e" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, full_name: "" }));
                  setError(null);
                }}
                disabled={loading}
                className={fieldErrors.full_name ? "input-error" : ""}
              />
              {fieldErrors.full_name && (
                <span className="field-error">{fieldErrors.full_name}</span>
              )}
            </div>

            <div className="form-row-two-column">
              <div className="contact-form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, email: "" }));
                    setError(null);
                  }}
                  disabled={loading}
                  className={fieldErrors.email ? "input-error" : ""}
                />
                {fieldErrors.email && (
                  <span className="field-error">{fieldErrors.email}</span>
                )}
              </div>

              <div className="contact-form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="contact-form-group">
              <label>Account</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={loading || dataLoading}
              >
                {!dataLoading && accounts.length === 0 ? (
                  <option value="">-- No Accounts Available --</option>
                ) : (
                  <>
                    <option value="">-- Select Account --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            <div className="form-row-two-column">
              <div className="contact-form-group">
                <label>Company</label>
                <input
                  type="text"
                  placeholder="e.g. ABC Realty"
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
              <div className="contact-form-group">
                <label>Job Title</label>
                <input
                  type="text"
                  placeholder="e.g. Buyer"
                  value={jobTitle}
                  onChange={(e) => {
                    setJobTitle(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="contact-form-group">
              <label>Address</label>
              <input
                type="text"
                placeholder="e.g. Hyderabad"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setError(null);
                }}
                disabled={loading}
              />
            </div>

            <div className="form-row-two-column">
              <div className="contact-form-group">
                <label>Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={loading}
                >
                  <option value="">-- Select Source --</option>
                  {CONTACT_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="contact-form-group">
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

            <div className="contact-form-group">
              <label>Notes</label>
              <textarea
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <div className="contact-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Save Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
