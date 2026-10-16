
import { useState, useEffect } from "react";
import type { Contact, ContactCreate, ContactUpdate } from "../../types/contact";
import type { User } from "../../types/user";
import type { Account } from "../../types/account";
import { createContact, updateContact } from "../../services/contactService";
import { getUsers } from "../../services/userService";
import { getAccounts } from "../../services/accountService";
import {
  getFormTemplates,
  getCustomFormSubmission,
  saveCustomFormSubmission,
} from "../../services/formTemplateService";
import type { FormTemplate } from "../../services/formTemplateService";

interface ContactFormModalProps {
  contact?: Contact | null;
  onClose: () => void;
  onSuccess: (savedContact: Contact) => void;
}

const CONTACT_SOURCES = [
  "Website",
  "Referral",
  "Social Media",
  "Walk-in",
  "Phone Inquiry",
  "Email Campaign",
  "Property Portal",
  "Other",
];

export default function ContactFormModal({
  contact,
  onClose,
  onSuccess,
}: ContactFormModalProps) {
  const isEdit = Boolean(contact);

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

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [formTemplates, setFormTemplates] = useState<FormTemplate[]>([]);

  const [customValues, setCustomValues] = useState<
    Record<string, Record<string, unknown>>
  >({});

  const [dataLoading, setDataLoading] = useState(true);
  const [customLoading, setCustomLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      setDataLoading(true);
      setCustomLoading(true);
      setError(null);

      try {
        const [usersData, accountsData, templates] = await Promise.all([
          getUsers(),
          getAccounts(),
          getFormTemplates("contacts"),
        ]);

        if (cancelled) return;

        setUsers(usersData);
        setAccounts(accountsData);

        const activeTemplates = templates
          .filter((template) => template.is_active)
          .sort((a, b) => a.name.localeCompare(b.name));

        setFormTemplates(activeTemplates);

        if (contact) {
          const submissions = await Promise.all(
            activeTemplates.map(async (template) => {
              try {
                const submission = await getCustomFormSubmission(
                  "contacts",
                  contact.id,
                  template.id
                );

                return submission
                  ? {
                      templateId: template.id,
                      values: submission.values ?? {},
                    }
                  : null;
              } catch {
                return null;
              }
            })
          );

          if (cancelled) return;

          const savedSubmissions = submissions.filter(
            (
              submission
            ): submission is {
              templateId: string;
              values: Record<string, unknown>;
            } => submission !== null
          );

          const valuesByTemplate: Record<
            string,
            Record<string, unknown>
          > = {};

          savedSubmissions.forEach((submission) => {
            valuesByTemplate[submission.templateId] = submission.values;
          });

          setCustomValues(valuesByTemplate);

         if (savedSubmissions.length > 0 && savedSubmissions[0]) {
  setSelectedTemplateId(savedSubmissions[0].templateId);
} else {
            setSelectedTemplateId("");
          }} else {
          setCustomValues({});
          setSelectedTemplateId("");
        }
      } catch (err) {
        console.error("Failed to load Contact form data:", err);

        if (!cancelled) {
          setError(
            "Failed to load required data or custom forms. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setDataLoading(false);
          setCustomLoading(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [contact?.id]);

  const selectedTemplate = formTemplates.find(
    (template) => template.id === selectedTemplateId
  );

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.full_name = "Full Name is required.";
    }

    if (
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      errors.email = "Please enter a valid email address.";
    }

    if (selectedTemplate) {
      const values = customValues[selectedTemplate.id] ?? {};

      for (const field of selectedTemplate.fields) {
        const value = values[field.field_key];

        const isEmpty =
          value === undefined ||
          value === null ||
          (typeof value === "string" && !value.trim());

        if (field.is_required && isEmpty) {
          errors[`custom_${selectedTemplate.id}_${field.field_key}`] =
            `${field.field_label} is required.`;
          continue;
        }

        if (isEmpty) continue;

        if (field.field_type === "email" && typeof value === "string") {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors[`custom_${selectedTemplate.id}_${field.field_key}`] =
              `Please enter a valid email for ${field.field_label}.`;
          }
        }

        if (field.field_type === "number" && Number.isNaN(Number(value))) {
          errors[`custom_${selectedTemplate.id}_${field.field_key}`] =
            `${field.field_label} must be a number.`;
        }
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCustomValueChange = (
    templateId: string,
    fieldKey: string,
    value: unknown
  ) => {
    setCustomValues((previous) => ({
      ...previous,
      [templateId]: {
        ...(previous[templateId] ?? {}),
        [fieldKey]: value,
      },
    }));

    const errorKey = `custom_${templateId}_${fieldKey}`;

    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[errorKey];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!validate()) {
      setError("Please correct the highlighted fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let savedContact: Contact;

      if (isEdit && contact) {
        const data: ContactUpdate = {
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

      if (selectedTemplate) {
        await saveCustomFormSubmission({
          template_id: selectedTemplate.id,
          module_name: "contacts",
          record_id: savedContact.id,
          values: customValues[selectedTemplate.id] ?? {},
        });
      }

      onSuccess(savedContact);
      onClose();
    } catch (err: any) {
      console.error("Contact form error:", err);

      if (err?.response?.status === 422 || err?.status === 422) {
        const detail = err?.response?.data?.detail || err?.detail;

        if (Array.isArray(detail)) {
          const newFieldErrors: Record<string, string> = {};

          detail.forEach((item: any) => {
            const field = item.loc?.[item.loc.length - 1];

            if (field && item.msg) {
              newFieldErrors[field] = item.msg;
            }
          });

          if (Object.keys(newFieldErrors).length > 0) {
            setFieldErrors(newFieldErrors);
            setError("Please correct the highlighted fields.");
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

        .contact-form-group input:not([type="checkbox"]),
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

        .contact-form-group input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #4a90e2;
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
          color: #f7fafc;
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

        .contact-custom-template {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .dashboard-wrapper.dark .contact-custom-template {
          border-color: #4a5568;
        }

        .contact-custom-template h3 {
          margin: 0;
          font-size: 1rem;
        }

        .contact-custom-description {
          margin: 6px 0 0;
          color: #718096;
          font-size: 0.875rem;
        }

        .contact-custom-field-error {
          color: #e53e3e;
          font-size: 0.8rem;
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

      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "650px", width: "100%" }}
      >
        <div className="modal-header">
          <h2>{isEdit ? "Edit Contact" : "Create Contact"}</h2>

          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            disabled={loading}
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
          style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}
        >
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
                  setFieldErrors((previous) => ({
                    ...previous,
                    full_name: "",
                  }));
                  setError(null);
                }}
                disabled={loading}
                className={fieldErrors.full_name ? "input-error" : ""}
              />

              {fieldErrors.full_name && (
                <span className="contact-custom-field-error">
                  {fieldErrors.full_name}
                </span>
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
                  <span className="contact-custom-field-error">
                    {fieldErrors.email}
                  </span>
                )}
              </div>

              <div className="contact-form-group">
                <label>Phone</label>

                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
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
                <option value="">-- Select Account --</option>

                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>

              {!dataLoading && accounts.length === 0 && (
                <small>No accounts available.</small>
              )}
            </div>

            <div className="form-row-two-column">
              <div className="contact-form-group">
                <label>Company</label>

                <input
                  type="text"
                  placeholder="e.g. ABC Realty"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="contact-form-group">
                <label>Job Title</label>

                <input
                  type="text"
                  placeholder="e.g. Buyer"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
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
                onChange={(e) => setAddress(e.target.value)}
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

                  {CONTACT_SOURCES.map((item) => (
                    <option key={item} value={item}>
                      {item}
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

                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} â€” {user.role}
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

            <section className="contact-custom-forms">
              <h3>Custom Form</h3>

              {customLoading ? (
                <p>Loading custom forms...</p>
              ) : formTemplates.length === 0 ? (
                <p>No active custom forms available for Contacts.</p>
              ) : (
                <>
                  <div className="contact-form-group">
                    <label htmlFor="selected-custom-form">
                      Select Custom Form
                    </label>

                    <select
                      id="selected-custom-form"
                      value={selectedTemplateId}
                      disabled={loading}
                      onChange={(e) => {
                        setSelectedTemplateId(e.target.value);
                        setFieldErrors({});
                        setError(null);
                      }}
                    >
                      <option value="">-- Choose a custom form --</option>

                      {formTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedTemplate && (
                    <section className="contact-custom-template">
                      <div>
                        <h3>{selectedTemplate.name}</h3>

                        {selectedTemplate.description && (
                          <p className="contact-custom-description">
                            {selectedTemplate.description}
                          </p>
                        )}
                      </div>

                      {selectedTemplate.fields
                        .slice()
                        .sort((a, b) => a.display_order - b.display_order)
                        .map((field) => {
                          const value =
                            customValues[selectedTemplate.id]?.[
                              field.field_key
                            ];

                          const errorKey =
                            `custom_${selectedTemplate.id}_${field.field_key}`;

                          const fieldError = fieldErrors[errorKey];

                          return (
                            <div
                              className="contact-form-group"
                              key={field.id}
                            >
                              <label>
                                {field.field_label}

                                {field.is_required && (
                                  <span style={{ color: "#e53e3e" }}>
                                    {" "}*
                                  </span>
                                )}
                              </label>

                              {field.field_type === "textarea" ? (
                                <textarea
                                  value={String(value ?? "")}
                                  required={field.is_required}
                                  disabled={loading}
                                  onChange={(e) =>
                                    handleCustomValueChange(
                                      selectedTemplate.id,
                                      field.field_key,
                                      e.target.value
                                    )
                                  }
                                />
                              ) : field.field_type === "dropdown" ? (
                                <select
                                  value={String(value ?? "")}
                                  required={field.is_required}
                                  disabled={loading}
                                  onChange={(e) =>
                                    handleCustomValueChange(
                                      selectedTemplate.id,
                                      field.field_key,
                                      e.target.value
                                    )
                                  }
                                >
                                  <option value="">-- Select --</option>

                                  {(field.options ?? []).map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              ) : field.field_type === "checkbox" ? (
                                <input
                                  type="checkbox"
                                  checked={value === true}
                                  disabled={loading}
                                  onChange={(e) =>
                                    handleCustomValueChange(
                                      selectedTemplate.id,
                                      field.field_key,
                                      e.target.checked
                                    )
                                  }
                                />
                              ) : (
                                <input
                                  type={
                                    field.field_type === "number"
                                      ? "number"
                                      : field.field_type === "email"
                                      ? "email"
                                      : field.field_type === "phone"
                                      ? "tel"
                                      : field.field_type === "date"
                                      ? "date"
                                      : "text"
                                  }
                                  value={String(value ?? "")}
                                  required={field.is_required}
                                  disabled={loading}
                                  onChange={(e) =>
                                    handleCustomValueChange(
                                      selectedTemplate.id,
                                      field.field_key,
                                      field.field_type === "number" &&
                                        e.target.value !== ""
                                        ? Number(e.target.value)
                                        : e.target.value
                                    )
                                  }
                                />
                              )}

                              {fieldError && (
                                <span className="contact-custom-field-error">
                                  {fieldError}
                                </span>
                              )}
                            </div>
                          );
                        })}
                    </section>
                  )}
                </>
              )}
            </section>
          </div>
        </div>

        <div className="contact-modal-footer">
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
            disabled={loading || dataLoading || customLoading}
          >
            {loading
              ? "Saving..."
              : isEdit
              ? "Update Contact"
              : "Save Contact"}
          </button>
        </div>
      </div>
    </div>
  );
}
