
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
import CrmFormModal from "../common/CrmFormModal";

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
    <CrmFormModal
      title={isEdit ? "Edit Contact" : "Create Contact"}
      description={
        isEdit
          ? "Update this contact's details, account and assignment."
          : "Add a new contact and link it to an account."
      }
      onClose={onClose}
      closeDisabled={loading}
      footer={
        <>
          <button
            type="button"
            className="crm-btn crm-btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>

          <button
            type="button"
            className="crm-btn crm-btn-primary"
            onClick={handleSubmit}
            disabled={loading || dataLoading || customLoading}
          >
            {loading ? "Saving..." : isEdit ? "Update Contact" : "Save Contact"}
          </button>
        </>
      }
    >
      {error && (
        <div className="crm-alert crm-alert-error" role="alert">
          {error}
        </div>
      )}

      <section className="crm-section">
        <h3 className="crm-section-title">Contact Details</h3>
        <div className="crm-form-grid">
          <div className="crm-field crm-field-full">
            <label htmlFor="contact-full-name">
              Full Name <span className="crm-required">*</span>
            </label>
            <input
              id="contact-full-name"
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
              <span className="crm-field-error">{fieldErrors.full_name}</span>
            )}
          </div>

          <div className="crm-field">
            <label htmlFor="contact-email">Email</label>
            <input
              id="contact-email"
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
              <span className="crm-field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="crm-field">
            <label htmlFor="contact-phone">Phone</label>
            <input
              id="contact-phone"
              type="tel"
              placeholder="e.g. +91 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      </section>

      <section className="crm-section">
        <h3 className="crm-section-title">Organization</h3>
        <div className="crm-form-grid">
          <div className="crm-field">
            <label htmlFor="contact-account">Account</label>
            <select
              id="contact-account"
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
              <span className="crm-field-help">No accounts available.</span>
            )}
          </div>

          <div className="crm-field">
            <label htmlFor="contact-company">Company</label>
            <input
              id="contact-company"
              type="text"
              placeholder="e.g. ABC Realty"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="crm-field">
            <label htmlFor="contact-job-title">Job Title</label>
            <input
              id="contact-job-title"
              type="text"
              placeholder="e.g. Buyer"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="crm-field">
            <label htmlFor="contact-address">Address</label>
            <input
              id="contact-address"
              type="text"
              placeholder="e.g. Hyderabad"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      </section>

      <section className="crm-section">
        <h3 className="crm-section-title">Source, Assignment &amp; Notes</h3>
        <div className="crm-form-grid">
          <div className="crm-field">
            <label htmlFor="contact-source">Source</label>
            <select
              id="contact-source"
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

          <div className="crm-field">
            <label htmlFor="contact-assigned-to">Assigned To</label>
            <select
              id="contact-assigned-to"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              disabled={loading || dataLoading}
            >
              <option value="">-- Select User --</option>

              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {`${user.full_name} — ${user.role}`}
                </option>
              ))}
            </select>
          </div>

          <div className="crm-field crm-field-full">
            <label htmlFor="contact-notes">Notes</label>
            <textarea
              id="contact-notes"
              placeholder="Any additional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              rows={4}
            />
          </div>
        </div>
      </section>

      <section className="crm-section contact-custom-forms">
        <h3 className="crm-section-title">Custom Form</h3>

        {customLoading ? (
          <p className="crm-muted-text">Loading custom forms...</p>
        ) : formTemplates.length === 0 ? (
          <p className="crm-muted-text">No active custom forms available for Contacts.</p>
        ) : (
          <>
            <div className="crm-form-grid">
              <div className="crm-field crm-field-full">
                <label htmlFor="selected-custom-form">Select Custom Form</label>

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
            </div>

            {selectedTemplate && (
              <div className="crm-custom-template">
                <div>
                  <h3>{selectedTemplate.name}</h3>

                  {selectedTemplate.description && (
                    <p className="crm-custom-description">{selectedTemplate.description}</p>
                  )}
                </div>

                <div className="crm-form-grid">
                  {selectedTemplate.fields
                    .slice()
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((field) => {
                      const value = customValues[selectedTemplate.id]?.[field.field_key];

                      const errorKey = `custom_${selectedTemplate.id}_${field.field_key}`;

                      const fieldError = fieldErrors[errorKey];

                      return (
                        <div
                          className={`crm-field ${
                            field.field_type === "textarea" ? "crm-field-full" : ""
                          }`}
                          key={field.id}
                        >
                          <label>
                            {field.field_label}

                            {field.is_required && <span className="crm-required"> *</span>}
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
                            <span className="crm-field-error">{fieldError}</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </CrmFormModal>
  );
}
