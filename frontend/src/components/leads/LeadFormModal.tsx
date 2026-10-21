
import { useState, useEffect } from "react";
import type {
  Lead,
  CreateLeadRequest,
  UpdateLeadRequest,
  LeadStatus,
  LeadSource,
} from "../../types/lead";
import type { User } from "../../types/user";
import type { Account } from "../../types/account";
import { createLead, updateLead } from "../../services/leadService";
import { getUsers } from "../../services/userService";
import { getAccounts } from "../../services/accountService";
import { friendlyAssignmentError } from "../../utils/leadPermissions";
import UserSearchDropdown from "./UserSearchDropdown";
import {
  getFormTemplates,
  getCustomFormSubmission,
  saveCustomFormSubmission,
} from "../../services/formTemplateService";
import type {
  FormField,
  FormTemplate,
} from "../../services/formTemplateService";

interface LeadFormModalProps {
  lead?: Lead | null;
  onClose: () => void;
  onSuccess: (savedLead: Lead) => void;
}

const LEAD_STATUSES: LeadStatus[] = [
  "New",
  "Contacted",
  "Qualified",
  "Converted",
  "Lost",
];

const LEAD_SOURCES: LeadSource[] = [
  "Website",
  "Referral",
  "Social Media",
  "Walk-in",
  "Phone Inquiry",
  "Email Campaign",
  "Property Portal",
  "Other",
];

type CustomValues = Record<string, string | number | boolean | null>;

interface CapacityWarning {
  message: string;
  active_leads?: number;
  maximum_active_leads?: number;
}

export default function LeadFormModal({
  lead,
  onClose,
  onSuccess,
}: LeadFormModalProps) {
  const isEdit = Boolean(lead);

  const [fullName, setFullName] = useState<string>(
    lead?.full_name ?? ""
  );
  const [email, setEmail] = useState<string>(lead?.email ?? "");
  const [phone, setPhone] = useState<string>(lead?.phone ?? "");
  const [source, setSource] = useState<string>(lead?.source ?? "");
  const [status, setStatus] = useState<LeadStatus>(
  (lead?.status as LeadStatus) ?? "New"
);
  const [assignedTo, setAssignedTo] = useState<string>(
    lead?.assigned_to ?? ""
  );
  const [accountId, setAccountId] = useState<string>(
    lead?.account_id ?? ""
  );
  const [notes, setNotes] = useState<string>(lead?.notes ?? "");

  const [users, setUsers] = useState<User[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customValues, setCustomValues] = useState<CustomValues>({});
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [customValuesLoading, setCustomValuesLoading] = useState(false);
  const [customFieldErrors, setCustomFieldErrors] = useState<
    Record<string, string>
  >({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string>
  >({});

  const [capacityWarning, setCapacityWarning] =
    useState<CapacityWarning | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId
  );

  useEffect(() => {
    let cancelled = false;

    getUsers()
      .then((result) => {
        if (!cancelled) setUsers(result || []);
      })
      .catch((err) => {
        console.error("Could not load users:", err);
        if (!cancelled) {
          setError("Could not load users. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });

    getAccounts()
      .then((result) => {
        if (!cancelled) setAccounts(result || []);
      })
      .catch((err) => {
        console.error("Could not load accounts:", err);
        if (!cancelled) {
          setError("Could not load accounts. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setAccountsLoading(false);
      });

    getFormTemplates("leads")
      .then((result) => {
        if (!cancelled) setTemplates(result || []);
      })
      .catch((err) => {
        console.error("Could not load Lead form templates:", err);
        if (!cancelled) {
          setError(
            "Could not load dynamic form templates. You can still use the standard Lead fields."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCustomValues = async () => {
      setCustomFieldErrors({});
      setCustomValues({});

      if (!lead || !selectedTemplateId) {
        setCustomValuesLoading(false);
        return;
      }

      setCustomValuesLoading(true);

      try {
        const submission = await getCustomFormSubmission(
          "leads",
          lead.id,
          selectedTemplateId
        );

        if (!cancelled && submission?.values) {
          setCustomValues(submission.values as CustomValues);
        }
      } catch (err) {
        console.error("Could not load saved custom fields:", err);

        if (!cancelled) {
          setError("Could not load saved custom field values.");
        }
      } finally {
        if (!cancelled) setCustomValuesLoading(false);
      }
    };

    void loadCustomValues();

    return () => {
      cancelled = true;
    };
  }, [lead?.id, selectedTemplateId]);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!fullName.trim()) {
      errors.full_name = "Full Name is required.";
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      errors.email = "Please enter a valid email address.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateCustomFields = (
    fields: FormField[],
    values: CustomValues
  ): boolean => {
    const errors: Record<string, string> = {};

    for (const field of fields) {
      const value = values[field.field_key];

      const empty =
        value === undefined ||
        value === null ||
        value === "" ||
        (typeof value === "string" && !value.trim());

      if (field.is_required && empty) {
        errors[field.field_key] =
          `${field.field_label} is required.`;
        continue;
      }

      if (empty) continue;

      const rules = field.validation_rules || {};

      if (
        ["text", "textarea", "email", "phone"].includes(
          field.field_type
        ) &&
        typeof value === "string"
      ) {
        if (
          typeof rules.min_length === "number" &&
          value.length < rules.min_length
        ) {
          errors[field.field_key] =
            `${field.field_label} must contain at least ${rules.min_length} characters.`;
        }

        if (
          typeof rules.max_length === "number" &&
          value.length > rules.max_length
        ) {
          errors[field.field_key] =
            `${field.field_label} must contain no more than ${rules.max_length} characters.`;
        }

        if (
          field.field_type === "email" &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ) {
          errors[field.field_key] =
            `${field.field_label} must be a valid email address.`;
        }
      }

      if (field.field_type === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors[field.field_key] =
            `${field.field_label} must be a number.`;
        } else {
          if (
            typeof rules.min === "number" &&
            value < rules.min
          ) {
            errors[field.field_key] =
              `${field.field_label} must be at least ${rules.min}.`;
          }

          if (
            typeof rules.max === "number" &&
            value > rules.max
          ) {
            errors[field.field_key] =
              `${field.field_label} must not exceed ${rules.max}.`;
          }
        }
      }

      if (
        field.field_type === "dropdown" &&
        (typeof value !== "string" ||
          !(field.options || []).includes(value))
      ) {
        errors[field.field_key] =
          `Select a valid option for ${field.field_label}.`;
      }

      if (
        field.field_type === "checkbox" &&
        typeof value !== "boolean"
      ) {
        errors[field.field_key] =
          `${field.field_label} must be checked or unchecked.`;
      }

      if (field.field_type === "date") {
        if (
          typeof value !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
          new Date(`${value}T00:00:00Z`)
            .toISOString()
            .slice(0, 10) !== value
        ) {
          errors[field.field_key] =
            `${field.field_label} must be a valid date.`;
        }
      }
    }

    setCustomFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const updateCustomValue = (
    fieldKey: string,
    value: string | number | boolean | null
  ) => {
    setCustomValues((previous) => ({
      ...previous,
      [fieldKey]: value,
    }));

    setCustomFieldErrors((previous) => ({
      ...previous,
      [fieldKey]: "",
    }));

    setError(null);
  };

  const resetCapacityOverride = () => {
    setCapacityWarning(null);
    setOverrideMode(false);
    setOverrideReason("");
  };

  const renderCustomField = (field: FormField) => {
    const value = customValues[field.field_key];
    const fieldError = customFieldErrors[field.field_key];

    const commonProps = {
      disabled: loading || customValuesLoading,
      className: fieldError ? "input-error" : "",
      "aria-invalid": Boolean(fieldError),
    };

    return (
      <div className="form-group" key={field.id || field.field_key}>
        {field.field_type !== "checkbox" && (
          <label>
            {field.field_label}
            {field.is_required && (
              <span style={{ color: "#e53e3e" }}> *</span>
            )}
          </label>
        )}

        {field.field_type === "text" && (
          <input
            {...commonProps}
            type="text"
            value={typeof value === "string" ? value : ""}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.value)
            }
          />
        )}

        {field.field_type === "textarea" && (
          <textarea
            {...commonProps}
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.value)
            }
          />
        )}

        {field.field_type === "number" && (
          <input
            {...commonProps}
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(event) => {
              const raw = event.target.value;
              updateCustomValue(
                field.field_key,
                raw === "" ? null : Number(raw)
              );
            }}
          />
        )}

        {field.field_type === "email" && (
          <input
            {...commonProps}
            type="email"
            value={typeof value === "string" ? value : ""}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.value)
            }
          />
        )}

        {field.field_type === "phone" && (
          <input
            {...commonProps}
            type="tel"
            value={typeof value === "string" ? value : ""}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.value)
            }
          />
        )}

        {field.field_type === "date" && (
          <input
            {...commonProps}
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(event) =>
              updateCustomValue(field.field_key, event.target.value)
            }
          />
        )}

        {field.field_type === "dropdown" && (
          <select
            {...commonProps}
            value={typeof value === "string" ? value : ""}
            onChange={(event) =>
              updateCustomValue(
                field.field_key,
                event.target.value || null
              )
            }
          >
            <option value="">
              -- Select {field.field_label} --
            </option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}

        {field.field_type === "checkbox" && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <input
              type="checkbox"
              checked={typeof value === "boolean" ? value : false}
              disabled={loading || customValuesLoading}
              onChange={(event) =>
                updateCustomValue(
                  field.field_key,
                  event.target.checked
                )
              }
            />
            {field.field_label}
            {field.is_required && (
              <span style={{ color: "#e53e3e" }}> *</span>
            )}
          </label>
        )}

        {fieldError && (
          <span className="field-error">{fieldError}</span>
        )}
      </div>
    );
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    if (
      selectedTemplate &&
      !validateCustomFields(selectedTemplate.fields, customValues)
    ) {
      return;
    }

    if (overrideMode && !overrideReason.trim()) {
      setError(
        "Please enter a reason for overriding the Lead assignment limit."
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let savedLead: Lead;

      if (isEdit && lead) {
        const data: UpdateLeadRequest = {
          full_name: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          source: source || undefined,
          status,
          assigned_to: assignedTo || undefined,
          account_id: accountId || undefined,
          notes: notes.trim() || undefined,
        };

        if (!assignedTo) data.assigned_to = null;
        if (!accountId) data.account_id = null;

        if (overrideMode) {
          data.override_capacity = true;
          data.override_reason = overrideReason.trim();
        }

        savedLead = await updateLead(lead.id, data);
      } else {
        const data: CreateLeadRequest = {
          full_name: fullName.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          source: source || undefined,
          status,
          assigned_to: assignedTo || undefined,
          account_id: accountId || undefined,
          notes: notes.trim() || undefined,
        };

        if (!assignedTo) data.assigned_to = null;
        if (!accountId) data.account_id = null;

        if (overrideMode) {
          data.override_capacity = true;
          data.override_reason = overrideReason.trim();
        }

        savedLead = await createLead(data);
      }

      if (selectedTemplate) {
        try {
          await saveCustomFormSubmission({
            template_id: selectedTemplate.id,
            module_name: "leads",
            record_id: savedLead.id,
            values: Object.fromEntries(
              selectedTemplate.fields.map((field) => [
                field.field_key,
                customValues[field.field_key] ?? null,
              ])
            ),
          });
        } catch (submissionError: any) {
          console.error("Custom form save error:", submissionError);

          const rawMessage =
            submissionError?.response?.data?.detail ??
            submissionError?.message ??
            "Unknown error";

          onSuccess(savedLead);

          setError(
            `The Lead was saved, but its custom form values could not be saved: ${
              typeof rawMessage === "string"
                ? rawMessage
                : "Please try again."
            }`
          );

          return;
        }
      }

      onSuccess(savedLead);
      onClose();
    } catch (err: any) {
      console.error("Lead form error:", err);

      const responseStatus = err?.response?.status ?? err?.status;
      const responseData = err?.response?.data;
      const detail = responseData?.detail ?? err?.detail;

      let errorPayload: any =
        detail && typeof detail === "object"
          ? detail
          : responseData;

      if (typeof errorPayload === "string") {
        try {
          errorPayload = JSON.parse(errorPayload);
        } catch {
          errorPayload = responseData;
        }
      }

      if (
        responseStatus === 409 &&
        errorPayload?.code === "LEAD_CAPACITY_EXCEEDED"
      ) {
        setCapacityWarning({
          message:
            errorPayload.message ||
            "This salesperson has reached the active Lead assignment limit.",
          active_leads: errorPayload.active_leads,
          maximum_active_leads: errorPayload.maximum_active_leads,
        });

        setOverrideMode(false);
        setOverrideReason("");
        setError(null);
        return;
      }

      if (responseStatus === 422 && Array.isArray(detail)) {
        const newFieldErrors: Record<string, string> = {};

        detail.forEach((item: any) => {
          const field = item.loc?.[item.loc.length - 1];

          if (field && item.msg) {
            newFieldErrors[field] = item.msg;
          }
        });

        if (Object.keys(newFieldErrors).length > 0) {
          setFieldErrors(newFieldErrors);
          return;
        }
      }

      if (responseStatus === 403) {
        setError(
          typeof detail === "string"
            ? detail
            : errorPayload?.message ||
                "You do not have permission to perform this action."
        );
        return;
      }

      const rawMessage =
        typeof detail === "string"
          ? detail
          : errorPayload?.message ||
            responseData?.message ||
            err?.message ||
            "Something went wrong. Please try again.";

      setError(
        friendlyAssignmentError(
          typeof rawMessage === "string"
            ? rawMessage
            : "Something went wrong. Please try again."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content leads-modal-content"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>{isEdit ? "Edit Lead" : "Create Lead"}</h2>

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

        <div className="modal-body">
          {error && (
            <div
              className="alert-box error"
              role="alert"
              style={{
                padding: "10px 14px",
                marginBottom: "16px",
                borderRadius: "6px",
                background: "#fcebea",
                color: "#cc0000",
                fontSize: "0.875rem",
              }}
            >
              {error}
            </div>
          )}

          {capacityWarning && (
            <div
              role="alert"
              style={{
                padding: "14px",
                marginBottom: "18px",
                borderRadius: "8px",
                border: "1px solid #f0c36d",
                background: "#fff8e6",
                color: "#704b00",
              }}
            >
              <strong>Lead assignment limit reached</strong>

              <p style={{ margin: "8px 0" }}>
                {capacityWarning.message}
              </p>

              {typeof capacityWarning.active_leads === "number" &&
                typeof capacityWarning.maximum_active_leads ===
                  "number" && (
                  <p style={{ margin: "6px 0 12px" }}>
                    Active Leads: {capacityWarning.active_leads} /{" "}
                    {capacityWarning.maximum_active_leads}
                  </p>
                )}

              {!overrideMode ? (
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                    marginTop: "12px",
                  }}
                >
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setOverrideMode(true);
                      setOverrideReason("");
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    Override Limit
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={resetCapacityOverride}
                    disabled={loading}
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: "14px" }}>
                  <label
                    htmlFor="lead-override-reason"
                    style={{
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: 600,
                    }}
                  >
                    Reason for overriding the limit{" "}
                    <span style={{ color: "#cc0000" }}>*</span>
                  </label>

                  <textarea
                    id="lead-override-reason"
                    rows={3}
                    value={overrideReason}
                    onChange={(event) => {
                      setOverrideReason(event.target.value);
                      setError(null);
                    }}
                    placeholder="Explain why this Lead must be assigned despite the capacity limit."
                    disabled={loading}
                    required
                    maxLength={1000}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px",
                      borderRadius: "6px",
                      border: "1px solid #d6a94a",
                      resize: "vertical",
                    }}
                  />

                  <p style={{ fontSize: "0.8rem", marginTop: "5px" }}>
                    The reason will be recorded in the assignment audit
                    log.
                  </p>

                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setOverrideMode(false);
                      setOverrideReason("");
                      setError(null);
                    }}
                    disabled={loading}
                  >
                    Cancel Override
                  </button>

                  <p style={{ marginTop: "10px", fontSize: "0.85rem" }}>
                    Enter a reason, then click Confirm Assignment below.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label>
              Full Name <span style={{ color: "#e53e3e" }}>*</span>
            </label>

            <input
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
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
              <span className="field-error">
                {fieldErrors.full_name}
              </span>
            )}
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Email</label>

              <input
                type="email"
                placeholder="e.g. rahul@example.com"
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
                <span className="field-error">
                  {fieldErrors.email}
                </span>
              )}
            </div>

            <div className="form-group">
              <label>Phone</label>

              <input
                type="tel"
                placeholder="e.g. +91 9876543210"
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setError(null);
                }}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Source</label>

              <select
                value={source}
                onChange={(event) => setSource(event.target.value)}
                disabled={loading}
              >
                <option value="">-- Select Source --</option>
                {LEAD_SOURCES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Status</label>

              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as LeadStatus)
                }
                disabled={loading}
              >
                {LEAD_STATUSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Account</label>

              <select
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                disabled={loading || accountsLoading}
              >
                <option value="">
                  {accountsLoading
                    ? "Loading accounts..."
                    : "-- Select Account --"}
                </option>

                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Assigned To</label>

              <UserSearchDropdown
                users={users}
                value={assignedTo}
                onChange={(value) => {
                  setAssignedTo(value);
                  resetCapacityOverride();
                  setError(null);
                }}
                disabled={loading}
                loading={usersLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Notes</label>

            <textarea
              placeholder="e.g. Interested in purchasing a 3BHK apartment in Hyderabad."
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setError(null);
              }}
              disabled={loading}
              rows={3}
            />
          </div>

          <div
            style={{
              borderTop: "1px solid #e5e7eb",
              margin: "20px 0",
              paddingTop: "18px",
            }}
          >
            <h3 style={{ marginBottom: "12px" }}>
              Custom Form Fields
            </h3>

            <div className="form-group">
              <label>Select Form Template</label>

              <select
                value={selectedTemplateId}
                disabled={loading || templatesLoading}
                onChange={(event) => {
                  setSelectedTemplateId(event.target.value);
                  setCustomValues({});
                  setCustomFieldErrors({});
                  setError(null);
                }}
              >
                <option value="">
                  {templatesLoading
                    ? "Loading templates..."
                    : "-- No Custom Form --"}
                </option>

                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <div>
                {selectedTemplate.description && (
                  <p style={{ marginBottom: "14px", color: "#666" }}>
                    {selectedTemplate.description}
                  </p>
                )}

                {customValuesLoading ? (
                  <p>Loading saved custom values...</p>
                ) : selectedTemplate.fields.length === 0 ? (
                  <p>This template has no custom fields.</p>
                ) : (
                  [...selectedTemplate.fields]
                    .sort(
                      (first, second) =>
                        first.display_order - second.display_order
                    )
                    .map(renderCustomField)
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
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
            disabled={loading || customValuesLoading}
          >
            {loading
              ? overrideMode
                ? "Assigning..."
                : isEdit
                  ? "Saving..."
                  : "Creating..."
              : overrideMode
                ? "Confirm Assignment"
                : isEdit
                  ? "Save Changes"
                  : "Create Lead"}
          </button>
        </div>
      </div>
    </div>
  );
}
