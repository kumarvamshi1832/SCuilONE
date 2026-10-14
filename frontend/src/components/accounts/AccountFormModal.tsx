
import { useState, useEffect } from "react";
import type { Account, AccountCreate, AccountUpdate } from "../../types/account";
import type { User } from "../../types/user";
import type { Lead } from "../../types/lead";
import {
  createAccount,
  updateAccount,
  linkLeadToAccount,
} from "../../services/accountService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import {
  getFormTemplates,
  getCustomFormSubmission,
  saveCustomFormSubmission,
} from "../../services/formTemplateService";
import type {
  FormField,
  FormTemplate,
} from "../../services/formTemplateService";

interface AccountFormModalProps {
  account?: Account | null;
  onClose: () => void;
  onSuccess: (savedAccount: Account) => void;
}

const ACCOUNT_SOURCES = [
  "Website",
  "Referral",
  "Social Media",
  "Walk-in",
  "Phone Inquiry",
  "Email Campaign",
  "Property Portal",
  "Other",
];

const ACCOUNT_STATUSES = [
  "Active",
  "Inactive",
  "Prospect",
  "Churned",
];

type CustomValues = Record<string, Record<string, unknown>>;

export default function AccountFormModal({
  account,
  onClose,
  onSuccess,
}: AccountFormModalProps) {
  const isEdit = Boolean(account);

  const [name, setName] = useState(account?.name || "");
  const [email, setEmail] = useState(account?.email || "");
  const [phone, setPhone] = useState(account?.phone || "");
  const [website, setWebsite] = useState(account?.website || "");
  const [industry, setIndustry] = useState(account?.industry || "");
  const [status, setStatus] = useState(account?.status || "Active");
  const [source, setSource] = useState(account?.source || "");
  const [assignedTo, setAssignedTo] = useState(account?.assigned_to || "");
  const [leadId, setLeadId] = useState(account?.lead_id || "");
  const [address, setAddress] = useState(account?.address || "");
  const [city, setCity] = useState(account?.city || "");
  const [state, setState] = useState(account?.state || "");
  const [country, setCountry] = useState(account?.country || "");
  const [postalCode, setPostalCode] = useState(account?.postal_code || "");
  const [notes, setNotes] = useState(account?.notes || "");

  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customValues, setCustomValues] = useState<CustomValues>({});

  const [customLoading, setCustomLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId
  );

  const selectedValues = customValues[selectedTemplateId] || {};

  useEffect(() => {
    let cancelled = false;

    setUsersLoading(true);
    setLeadsLoading(true);
    setCustomLoading(true);

    getUsers()
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });

    getLeads()
      .then((data) => {
        if (!cancelled) setLeads(data);
      })
      .catch(() => {
        if (!cancelled) setLeads([]);
      })
      .finally(() => {
        if (!cancelled) setLeadsLoading(false);
      });

    async function loadTemplatesAndValues() {
      try {
        const data = await getFormTemplates("accounts");

        if (cancelled) return;

        const activeTemplates = data.filter(
          (template) => template.is_active !== false
        );

        setTemplates(activeTemplates);

        const valuesByTemplate: CustomValues = {};
        let firstSavedTemplateId = "";

        if (account?.id) {
          for (const template of activeTemplates) {
            try {
              const submission = await getCustomFormSubmission(
                "accounts",
                account.id,
                template.id
              );

              if (submission) {
                valuesByTemplate[template.id] = submission.values || {};

                if (!firstSavedTemplateId) {
                  firstSavedTemplateId = template.id;
                }
              }
            } catch (err: any) {
              if (
                err?.response?.status !== 404 &&
                err?.status !== 404
              ) {
                console.error(
                  `Could not load custom values for ${template.name}:`,
                  err
                );
              }
            }
          }
        }

        if (cancelled) return;

        setCustomValues(valuesByTemplate);
        setSelectedTemplateId(
          firstSavedTemplateId || activeTemplates[0]?.id || ""
        );
      } catch (err) {
        console.error("Failed to load account form templates:", err);

        if (!cancelled) {
          setTemplates([]);
          setSelectedTemplateId("");
          setCustomValues({});
        }
      } finally {
        if (!cancelled) setCustomLoading(false);
      }
    }

    loadTemplatesAndValues();

    return () => {
      cancelled = true;
    };
  }, [account?.id]);

  const updateCustomValue = (fieldKey: string, value: unknown) => {
    setCustomValues((previous) => ({
      ...previous,
      [selectedTemplateId]: {
        ...(previous[selectedTemplateId] || {}),
        [fieldKey]: value,
      },
    }));

    setFieldErrors((previous) => ({
      ...previous,
      [`custom_${fieldKey}`]: "",
    }));

    setError(null);
  };

  const validateCustomFields = (): boolean => {
    if (!selectedTemplate) return true;

    const errors: Record<string, string> = {};
    const values = customValues[selectedTemplate.id] || {};

    for (const field of selectedTemplate.fields || []) {
      const value = values[field.field_key];
      const textValue = value == null ? "" : String(value).trim();

      if (field.is_required && (textValue === "" || value === false)) {
        errors[`custom_${field.field_key}`] =
          `${field.field_label} is required.`;
        continue;
      }

      if (textValue && field.field_type === "email") {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue)) {
          errors[`custom_${field.field_key}`] =
            "Enter a valid email address.";
        }
      }

      if (
        textValue &&
        field.field_type === "number" &&
        !Number.isFinite(Number(value))
      ) {
        errors[`custom_${field.field_key}`] = "Enter a valid number.";
      }
    }

    setFieldErrors((previous) => {
      const standardErrors = Object.fromEntries(
        Object.entries(previous).filter(
          ([key]) => !key.startsWith("custom_")
        )
      );

      return { ...standardErrors, ...errors };
    });

    return Object.keys(errors).length === 0;
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Account Name is required.";
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return false;

    return validateCustomFields();
  };

  const saveSelectedCustomForm = async (savedAccount: Account) => {
    if (!selectedTemplate) return;

    await saveCustomFormSubmission({
      template_id: selectedTemplate.id,
      module_name: "accounts",
      record_id: savedAccount.id,
      values: customValues[selectedTemplate.id] || {},
    });
  };

  const handleSubmit = async () => {
    if (loading || customLoading) return;

    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      let savedAccount: Account;

      if (isEdit && account) {
        const data: AccountUpdate = {
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
          status: status || undefined,
          source: source || undefined,
          assigned_to: assignedTo || undefined,
          notes: notes.trim() || undefined,
        };

        savedAccount = await updateAccount(account.id, data);

        if (leadId && leadId !== account.lead_id) {
          try {
            await linkLeadToAccount(account.id, leadId);
          } catch (linkErr: any) {
            throw new Error(
              linkErr?.response?.data?.detail ||
                "Account saved, but failed to link Lead."
            );
          }
        }
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
          lead_id: leadId || undefined,
          notes: notes.trim() || undefined,
        };

        savedAccount = await createAccount(data);
      }

      await saveSelectedCustomForm(savedAccount);

      onSuccess(savedAccount);
      onClose();
    } catch (err: any) {
      console.error("Account form error:", err);

      if (err?.response?.status === 422 || err?.status === 422) {
        const detail = err?.response?.data?.detail || err?.detail;

        if (Array.isArray(detail)) {
          const newFieldErrors: Record<string, string> = {};

          detail.forEach((item: any) => {
            const field = item.loc?.[item.loc.length - 1];

            if (field && item.msg) {
              newFieldErrors[String(field)] = item.msg;
            }
          });

          if (Object.keys(newFieldErrors).length > 0) {
            setFieldErrors((previous) => ({
              ...previous,
              ...newFieldErrors,
            }));

            setError("Please check the highlighted fields.");
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

      setError(
        typeof rawMessage === "string"
          ? rawMessage
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const renderCustomField = (field: FormField) => {
    const value = selectedValues[field.field_key];
    const fieldError = fieldErrors[`custom_${field.field_key}`];

    const commonProps = {
      disabled: loading || customLoading,
      required: field.is_required,
      "aria-label": field.field_label,
    };

    return (
      <div className="account-form-group" key={field.field_key}>
        <label>
          {field.field_label}
          {field.is_required && (
            <span style={{ color: "#e53e3e" }}> *</span>
          )}
        </label>

        {field.field_type === "textarea" ? (
          <textarea
            {...commonProps}
            value={value == null ? "" : String(value)}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.value)
            }
            className={fieldError ? "input-error" : ""}
          />
        ) : field.field_type === "dropdown" ? (
          <select
            {...commonProps}
            value={value == null ? "" : String(value)}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.value)
            }
            className={fieldError ? "input-error" : ""}
          >
            <option value="">-- Select {field.field_label} --</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : field.field_type === "checkbox" ? (
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={loading || customLoading}
            aria-label={field.field_label}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.checked)
            }
            style={{ width: "auto", minHeight: "auto" }}
          />
        ) : (
          <input
            {...commonProps}
            type={
              field.field_type === "number" ||
              field.field_type === "email" ||
              field.field_type === "date"
                ? field.field_type
                : field.field_type === "phone"
                  ? "tel"
                  : "text"
            }
            value={value == null ? "" : String(value)}
            onChange={(event) => {
              const nextValue =
                field.field_type === "number" &&
                event.target.value !== ""
                  ? Number(event.target.value)
                  : event.target.value;

              updateCustomValue(field.field_key, nextValue);
            }}
            className={fieldError ? "input-error" : ""}
          />
        )}

        {fieldError && (
          <span className="field-error">{fieldError}</span>
        )}
      </div>
    );
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

        .account-form-group input.input-error,
        .account-form-group select.input-error,
        .account-form-group textarea.input-error {
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

      <div
        className="modal-content"
        onClick={(event) => event.stopPropagation()}
        style={{
          maxWidth: "680px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header">
          <h2>{isEdit ? "Edit Account" : "Create Account"}</h2>

          <button
            className="btn-close"
            onClick={onClose}
            disabled={loading}
            type="button"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div
          className="modal-body"
          style={{ overflowY: "auto", flex: 1 }}
        >
          {error && (
            <div
              className="alert-box error"
              style={{
                padding: "10px 14px",
                marginBottom: 20,
                borderRadius: 6,
                background: "#fcebea",
                color: "#cc0000",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          <div className="account-form-grid">
            <div className="account-form-group">
              <label>
                Account Name <span style={{ color: "#e53e3e" }}>*</span>
              </label>

              <input
                type="text"
                placeholder="e.g. ABC Company"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setFieldErrors((previous) => ({
                    ...previous,
                    name: "",
                  }));
                  setError(null);
                }}
                disabled={loading}
                className={fieldErrors.name ? "input-error" : ""}
              />

              {fieldErrors.name && (
                <span className="field-error">{fieldErrors.name}</span>
              )}
            </div>

            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Email</label>

                <input
                  type="email"
                  placeholder="e.g. info@company.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldErrors((previous) => ({
                      ...previous,
                      email: "",
                    }));
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
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Website</label>

                <input
                  type="text"
                  placeholder="e.g. https://company.com"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="account-form-group">
                <label>Industry</label>

                <input
                  type="text"
                  placeholder="e.g. Real Estate"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Status</label>

                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  disabled={loading}
                >
                  {ACCOUNT_STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="account-form-group">
                <label>Source</label>

                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  disabled={loading}
                >
                  <option value="">-- Select Source --</option>

                  {ACCOUNT_SOURCES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Assigned To</label>

                <select
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  disabled={loading || usersLoading}
                >
                  <option value="">-- Select User --</option>

                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} — {user.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="account-form-group">
                <label>Lead</label>

                <select
                  value={leadId}
                  onChange={(event) => setLeadId(event.target.value)}
                  disabled={loading || leadsLoading}
                >
                  <option value="">
                    {leads.length === 0 && !leadsLoading
                      ? "-- No Leads Available --"
                      : "-- Select Lead --"}
                  </option>

                  {leads
                    .filter(
                      (lead) =>
                        !lead.account_id ||
                        (isEdit && lead.account_id === account?.id)
                    )
                    .map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.full_name}
                        {lead.email ? ` (${lead.email})` : ""}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>City</label>

                <input
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder="e.g. Hyderabad"
                  disabled={loading}
                />
              </div>

              <div className="account-form-group">
                <label>State</label>

                <input
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  placeholder="e.g. Telangana"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="account-form-row-two-column">
              <div className="account-form-group">
                <label>Country</label>

                <input
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="e.g. India"
                  disabled={loading}
                />
              </div>

              <div className="account-form-group">
                <label>Postal Code</label>

                <input
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  placeholder="e.g. 500001"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="account-form-group">
              <label>Address</label>

              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="e.g. 123 Main Street"
                disabled={loading}
              />
            </div>

            <div className="account-form-group">
              <label>Notes</label>

              <textarea
                placeholder="Any additional notes..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={loading}
              />
            </div>

            <div
              style={{
                borderTop: "1px solid #e2e8f0",
                paddingTop: 20,
                marginTop: 4,
              }}
            >
              <h3 style={{ margin: "0 0 6px" }}>Custom Form</h3>

              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: "0.875rem",
                  color: "#718096",
                }}
              >
                Select an account form to enter additional custom fields.
              </p>

              {customLoading ? (
                <p>Loading custom forms...</p>
              ) : templates.length === 0 ? (
                <p className="text-muted">
                  No active custom forms are configured for Accounts.
                </p>
              ) : (
                <>
                  <div
                    className="account-form-group"
                    style={{ marginBottom: 16 }}
                  >
                    <label>Select Custom Form</label>

                    <select
                      value={selectedTemplateId}
                      onChange={(event) => {
                        setSelectedTemplateId(event.target.value);

                        setFieldErrors((previous) =>
                          Object.fromEntries(
                            Object.entries(previous).filter(
                              ([key]) => !key.startsWith("custom_")
                            )
                          )
                        );
                      }}
                      disabled={loading}
                    >
                      <option value="">-- Select Custom Form --</option>

                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedTemplate && (
                    <div className="account-form-grid">
                      {selectedTemplate.fields?.length ? (
                        selectedTemplate.fields.map(renderCustomField)
                      ) : (
                        <p className="text-muted">
                          This form has no configured fields.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div
          className="account-modal-footer"
          style={{ padding: "0 24px 24px" }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading || customLoading}
          >
            {loading
              ? "Saving..."
              : isEdit
                ? "Save Changes"
                : "Create Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
