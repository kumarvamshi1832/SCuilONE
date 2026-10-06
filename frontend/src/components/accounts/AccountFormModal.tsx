import { useState, useEffect } from "react";
import type { Account, AccountCreate, AccountUpdate } from "../../types/account";
import { User } from "../../types/user";
import { createAccount, updateAccount } from "../../services/accountService";
import { getUsers } from "../../services/userService";

interface AccountFormModalProps {
  account?: Account | null;
  onClose: () => void;
  onSuccess: (savedAccount: Account) => void;
}

const ACCOUNT_SOURCES: string[] = [
  "Website",
  "Referral",
  "Social Media",
  "Walk-in",
  "Phone Inquiry",
  "Email Campaign",
  "Property Portal",
  "Other",
];

const ACCOUNT_STATUSES: string[] = [
  "Active",
  "Inactive",
  "Prospect",
  "Churned",
];

export default function AccountFormModal({ account, onClose, onSuccess }: AccountFormModalProps) {
  const isEdit = !!account;

  const [name, setName] = useState(account?.name || "");
  const [email, setEmail] = useState(account?.email || "");
  const [phone, setPhone] = useState(account?.phone || "");
  const [website, setWebsite] = useState(account?.website || "");
  const [industry, setIndustry] = useState(account?.industry || "");
  const [status, setStatus] = useState(account?.status || "Active");
  const [source, setSource] = useState(account?.source || "");
  const [assignedTo, setAssignedTo] = useState(account?.assigned_to || "");
  const [address, setAddress] = useState(account?.address || "");
  const [city, setCity] = useState(account?.city || "");
  const [state, setState] = useState(account?.state || "");
  const [country, setCountry] = useState(account?.country || "");
  const [postalCode, setPostalCode] = useState(account?.postal_code || "");
  const [notes, setNotes] = useState(account?.notes || "");

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setUsersLoading(true);
    getUsers()
      .then((data) => setUsers(data))
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) {
      errors.name = "Account Name is required.";
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
      let savedAccount: Account;
      if (isEdit && account) {
        const data: AccountUpdate = {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          website: website.trim() || undefined,
          industry: industry.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          country: country.trim() || undefined,
          postal_code: postalCode.trim() || undefined,
          status: status || undefined,
          source: source || undefined,
          assigned_to: assignedTo || undefined,
          notes: notes.trim() || undefined,
        };
        savedAccount = await updateAccount(account.id, data);
      } else {
        const data: AccountCreate = {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          website: website.trim() || undefined,
          industry: industry.trim() || undefined,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          country: country.trim() || undefined,
          postal_code: postalCode.trim() || undefined,
          status: status || "Active",
          source: source || undefined,
          assigned_to: assignedTo || undefined,
          notes: notes.trim() || undefined,
        };
        savedAccount = await createAccount(data);
      }
      onSuccess(savedAccount);
      onClose();
    } catch (err: any) {
      console.error("Account form error:", err);
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
        .account-form-grid {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .account-form-row-two-column {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .account-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .account-form-group label {
          font-weight: 500;
          font-size: 0.875rem;
          color: #4a5568;
        }
        .dashboard-wrapper.dark .account-form-group label {
          color: #e2e8f0;
        }
        .account-form-group input,
        .account-form-group select,
        .account-form-group textarea {
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
        .account-form-group textarea {
          resize: vertical;
          min-height: 80px;
        }
        .dashboard-wrapper.dark .account-form-group input,
        .dashboard-wrapper.dark .account-form-group select,
        .dashboard-wrapper.dark .account-form-group textarea {
          background: #2a2a2a;
          border-color: #4a5568;
        }
        .account-form-group input:focus,
        .account-form-group select:focus,
        .account-form-group textarea:focus {
          border-color: #4a90e2;
          outline: none;
        }
        .account-form-group input.input-error {
          border-color: #e53e3e !important;
        }
        .account-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #eaeaea;
        }
        .dashboard-wrapper.dark .account-modal-footer {
          border-top-color: #333;
        }
        @media (max-width: 600px) {
          .account-form-row-two-column {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>{isEdit ? "Edit Account" : "Create Account"}</h2>
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

          <div className="account-form-grid">
            {/* Account Name - Full width */}
            <div className="account-form-group">
              <label>
                Account Name <span style={{ color: "#e53e3e" }}>*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. ABC Company"
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
                <span className="field-error">{fieldErrors.name}</span>
              )}
            </div>

            {/* Email / Phone */}
            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="e.g. info@company.com"
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

              <div className="account-form-group">
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

            {/* Website / Industry */}
            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Website</label>
                <input
                  type="text"
                  placeholder="e.g. https://company.com"
                  value={website}
                  onChange={(e) => {
                    setWebsite(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>

              <div className="account-form-group">
                <label>Industry</label>
                <input
                  type="text"
                  placeholder="e.g. Real Estate"
                  value={industry}
                  onChange={(e) => {
                    setIndustry(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Status / Source */}
            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={loading}
                >
                  {ACCOUNT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="account-form-group">
                <label>Source</label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={loading}
                >
                  <option value="">-- Select Source --</option>
                  {ACCOUNT_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Assigned To / City */}
            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Assigned To</label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  disabled={loading || usersLoading}
                >
                  <option value="">-- Select User --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} — {u.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="account-form-group">
                <label>City</label>
                <input
                  type="text"
                  placeholder="e.g. Hyderabad"
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            {/* State / Country */}
            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>State</label>
                <input
                  type="text"
                  placeholder="e.g. Telangana"
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>

              <div className="account-form-group">
                <label>Country</label>
                <input
                  type="text"
                  placeholder="e.g. India"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Postal Code - in a row for layout consistency */}
            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Postal Code</label>
                <input
                  type="text"
                  placeholder="e.g. 500001"
                  value={postalCode}
                  onChange={(e) => {
                    setPostalCode(e.target.value);
                    setError(null);
                  }}
                  disabled={loading}
                />
              </div>
              <div>{/* spacer */}</div>
            </div>

            {/* Address - Full width */}
            <div className="account-form-group">
              <label>Address</label>
              <input
                type="text"
                placeholder="e.g. 123 Main Street"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setError(null);
                }}
                disabled={loading}
              />
            </div>

            {/* Notes - Full width */}
            <div className="account-form-group">
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

        <div className="account-modal-footer" style={{ padding: '0 24px 24px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
