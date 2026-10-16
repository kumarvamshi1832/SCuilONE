import { useState, useEffect } from "react";
import type { Deal, DealCreate, DealUpdate } from "../../types/deal";
import type { User } from "../../types/user";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import type { Account } from "../../types/account";
import type { Pipeline, PipelineStage } from "../../types/pipeline";

import { createDeal, updateDeal } from "../../services/dealService";
import { getUsers } from "../../services/userService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getAccounts } from "../../services/accountService";
import { getPipelines, getPipelineStages } from "../../services/pipelineService";

import {
  getFormTemplates,
  getCustomFormSubmission,
  saveCustomFormSubmission,
} from "../../services/formTemplateService";

import type {
  FormTemplate,
  FormField,
} from "../../services/formTemplateService";

interface DealFormModalProps {
  deal?: Deal | null;
  onClose: () => void;
  onSuccess: (savedDeal: Deal) => void;
}

const DEAL_STAGES = [
  "New",
  "Discovery",
  "Proposal",
  "Negotiation",
  "Won",
  "Lost",
];

export default function DealFormModal({
  deal,
  onClose,
  onSuccess,
}: DealFormModalProps) {
  const isEdit = !!deal;

  const [name, setName] = useState(deal?.name || "");
  const [leadId, setLeadId] = useState(deal?.lead_id || "");
  const [contactId, setContactId] = useState(deal?.contact_id || "");
  const [accountId, setAccountId] = useState(deal?.account_id || "");
  const [assignedTo, setAssignedTo] = useState(deal?.assigned_to || "");
  const [amount, setAmount] = useState(
    deal?.amount != null ? deal.amount.toString() : ""
  );
  const [stage, setStage] = useState(deal?.stage || "New");
  const [pipelineId, setPipelineId] = useState(deal?.pipeline_id || "");
  const [pipelineStageId, setPipelineStageId] = useState(
    deal?.pipeline_stage_id || ""
  );
  const [expectedCloseDate, setExpectedCloseDate] = useState(
    deal?.expected_close_date || ""
  );
  const [description, setDescription] = useState(deal?.description || "");

  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customValues, setCustomValues] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [customFormsLoading, setCustomFormsLoading] = useState(false);

  const [dataLoading, setDataLoading] = useState(true);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId
  );

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      setDataLoading(true);
      setError(null);

      try {
        const [
          usersData,
          leadsData,
          contactsData,
          accountsData,
          pipelinesData,
        ] = await Promise.all([
          getUsers(),
          getLeads(),
          getContacts(),
          getAccounts(),
          getPipelines(),
        ]);

        if (cancelled) return;

        setUsers(usersData);
        setLeads(leadsData);
        setContacts(contactsData);
        setAccounts(accountsData);
        setPipelines(pipelinesData.filter((p) => p.is_active));
      } catch (err) {
        console.error("Failed to load deal form data:", err);

        if (!cancelled) {
          setError(
            "Failed to load required data. Please check your connection and try again."
          );
        }
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCustomForms = async () => {
      setCustomFormsLoading(true);

      try {
        const templatesData = await getFormTemplates("deals");

        if (cancelled) return;

        const activeTemplates = templatesData.filter(
          (template) => template.is_active
        );

        setTemplates(activeTemplates);

        if (!deal || activeTemplates.length === 0) {
          setSelectedTemplateId(activeTemplates[0]?.id || "");
          return;
        }

        const submissionResults = await Promise.allSettled(
          activeTemplates.map(async (template) => {
            const submission = await getCustomFormSubmission(
              "deals",
              deal.id,
              template.id
            );

            return { template, submission };
          })
        );

        if (cancelled) return;

        const loadedValues: Record<string, Record<string, unknown>> = {};
        let firstSavedTemplateId = "";

        submissionResults.forEach((result) => {
          if (result.status !== "fulfilled") return;

          const { template, submission } = result.value;

          if (submission && submission.values) {
            loadedValues[template.id] = submission.values;

            if (!firstSavedTemplateId) {
              firstSavedTemplateId = template.id;
            }
          }
        });

        setCustomValues(loadedValues);
        setSelectedTemplateId(
          firstSavedTemplateId || activeTemplates[0]?.id || ""
        );
      } catch (err) {
        console.error("Failed to load Deal custom forms:", err);

        if (!cancelled) {
          setTemplates([]);
        }
      } finally {
        if (!cancelled) setCustomFormsLoading(false);
      }
    };

    void loadCustomForms();

    return () => {
      cancelled = true;
    };
  }, [deal?.id]);

  useEffect(() => {
    let cancelled = false;

    const loadStages = async () => {
      setPipelineStages([]);
      setStagesLoading(false);

      if (!pipelineId) {
        setPipelineStageId("");
        return;
      }

      setStagesLoading(true);

      try {
        const stagesData = await getPipelineStages(pipelineId);

        if (cancelled) return;

        const activeStages = stagesData
          .filter((s) => s.is_active)
          .sort((a, b) => a.position - b.position);

        setPipelineStages(activeStages);

        const currentStageExists = activeStages.some(
          (s) => s.id === pipelineStageId
        );

        if (pipelineStageId && !currentStageExists) {
          setPipelineStageId("");
          setStage("");
        } else if (pipelineStageId) {
          const selectedStage = activeStages.find(
            (s) => s.id === pipelineStageId
          );

          if (selectedStage) setStage(selectedStage.name);
        }
      } catch (err) {
        console.error("Failed to load pipeline stages:", err);

        if (!cancelled) {
          setError("Failed to load stages for the selected pipeline.");
        }
      } finally {
        if (!cancelled) setStagesLoading(false);
      }
    };

    void loadStages();

    return () => {
      cancelled = true;
    };
  }, [pipelineId]);

  const availableLeads = accountId
    ? leads.filter((l) => l.account_id === accountId)
    : [];

  const availableContacts = accountId
    ? contacts.filter((c) => c.account_id === accountId)
    : [];

  const updateCustomValue = (field: FormField, value: unknown) => {
    if (!selectedTemplate) return;

    setCustomValues((previous) => ({
      ...previous,
      [selectedTemplate.id]: {
        ...(previous[selectedTemplate.id] || {}),
        [field.field_key]: value,
      },
    }));

    setFieldErrors((previous) => ({
      ...previous,
      [`custom_${field.field_key}`]: "",
    }));
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = "Deal Name is required.";
    }

    if (amount.trim() && !Number.isFinite(Number(amount))) {
      errors.amount = "Amount must be a valid number.";
    } else if (amount.trim() && Number(amount) < 0) {
      errors.amount = "Amount cannot be negative.";
    }

    if ((leadId || contactId) && !accountId) {
      errors.accountId =
        "Please select an Account when Lead or Contact is selected.";
    }

    if (leadId && accountId) {
      const selectedLead = leads.find((l) => l.id === leadId);

      if (selectedLead && selectedLead.account_id !== accountId) {
        errors.leadId =
          "Selected Lead does not belong to the selected Account.";
      }
    }

    if (contactId && accountId) {
      const selectedContact = contacts.find((c) => c.id === contactId);

      if (selectedContact && selectedContact.account_id !== accountId) {
        errors.contactId =
          "Selected Contact does not belong to the selected Account.";
      }
    }

    if (pipelineId && !pipelineStageId) {
      errors.pipelineStageId = "Please select a stage for this pipeline.";
    }

    if (
      pipelineId &&
      pipelineStageId &&
      !pipelineStages.some((s) => s.id === pipelineStageId)
    ) {
      errors.pipelineStageId =
        "Please select a valid stage from the selected pipeline.";
    }

    if (selectedTemplate) {
      const values = customValues[selectedTemplate.id] || {};

      selectedTemplate.fields.forEach((field) => {
        const value = values[field.field_key];
        const isEmpty =
          value === undefined ||
          value === null ||
          (typeof value === "string" && !value.trim()) ||
          (Array.isArray(value) && value.length === 0);

        if (field.is_required && isEmpty) {
          errors[`custom_${field.field_key}`] =
            `${field.field_label} is required.`;
          return;
        }

        if (
          !isEmpty &&
          field.field_type === "email" &&
          typeof value === "string" &&
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ) {
          errors[`custom_${field.field_key}`] =
            `Enter a valid email address for ${field.field_label}.`;
        }

        if (
          !isEmpty &&
          field.field_type === "number" &&
          !Number.isFinite(Number(value))
        ) {
          errors[`custom_${field.field_key}`] =
            `${field.field_label} must be a valid number.`;
        }
      });
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    setError(null);

    try {
      const payloadAmount = amount.trim() ? Number(amount) : null;

      const selectedPipelineStage = pipelineStages.find(
        (s) => s.id === pipelineStageId
      );

      const selectedStageName = pipelineId
        ? selectedPipelineStage?.name || ""
        : stage || "New";

      let savedDeal: Deal;

      if (isEdit && deal) {
        const data: DealUpdate = {
          name: name.trim(),
          lead_id: leadId || null,
          contact_id: contactId || null,
          account_id: accountId || null,
          assigned_to: assignedTo || null,
          amount: payloadAmount,
          stage: selectedStageName,
          pipeline_id: pipelineId || null,
          pipeline_stage_id: pipelineId ? pipelineStageId : null,
          expected_close_date: expectedCloseDate || null,
          description: description.trim() || null,
        };

        savedDeal = await updateDeal(deal.id, data);
      } else {
        const data: DealCreate = {
          name: name.trim(),
          lead_id: leadId || null,
          contact_id: contactId || null,
          account_id: accountId || null,
          assigned_to: assignedTo || null,
          amount: payloadAmount,
          stage: selectedStageName,
          pipeline_id: pipelineId || null,
          pipeline_stage_id: pipelineId ? pipelineStageId : null,
          expected_close_date: expectedCloseDate || null,
          description: description.trim() || null,
        };

        savedDeal = await createDeal(data);
      }

      if (selectedTemplate) {
        try {
          await saveCustomFormSubmission({
            template_id: selectedTemplate.id,
            module_name: "deals",
            record_id: savedDeal.id,
            values: customValues[selectedTemplate.id] || {},
          });
        } catch (customFormError) {
          console.error(
            "Deal saved, but custom form submission failed:",
            customFormError
          );

          setError(
            "The Deal was saved, but its custom fields could not be saved. Please reopen the Deal and try saving the custom fields again."
          );

          onSuccess(savedDeal);
          return;
        }
      }

      onSuccess(savedDeal);
      onClose();
    } catch (err: any) {
      console.error("Deal form error:", err);

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
    const value = customValues[selectedTemplateId]?.[field.field_key];
    const errorKey = `custom_${field.field_key}`;
    const fieldError = fieldErrors[errorKey];
    const commonProps = {
      id: `deal-custom-${field.field_key}`,
      disabled: loading,
      className: fieldError ? "input-error" : "",
    };

    return (
      <div className="deal-form-group" key={field.id || field.field_key}>
        <label htmlFor={commonProps.id}>
          {field.field_label}
          {field.is_required && (
            <span style={{ color: "#e53e3e" }}> *</span>
          )}
        </label>

        {field.field_type === "textarea" ? (
          <textarea
            {...commonProps}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => updateCustomValue(field, e.target.value)}
          />
        ) : field.field_type === "dropdown" ? (
          <select
            {...commonProps}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => updateCustomValue(field, e.target.value)}
          >
            <option value="">-- Select {field.field_label} --</option>
            {(field.options || []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : field.field_type === "checkbox" ? (
          <label
            htmlFor={commonProps.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <input
              {...commonProps}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => updateCustomValue(field, e.target.checked)}
              style={{ width: "auto", minHeight: "auto" }}
            />
            {field.field_label}
          </label>
        ) : (
          <input
            {...commonProps}
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
            value={
              value === undefined || value === null ? "" : String(value)
            }
            onChange={(e) =>
              updateCustomValue(
                field,
                field.field_type === "number" && e.target.value !== ""
                  ? Number(e.target.value)
                  : e.target.value
              )
            }
          />
        )}

        {fieldError && (
          <span style={{ color: "#e53e3e", fontSize: "0.8rem" }}>
            {fieldError}
          </span>
        )}
      </div>
    );
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
          min-width: 0;
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
        .deal-form-group input.input-error,
        .deal-form-group select.input-error,
        .deal-form-group textarea.input-error {
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

      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "680px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="modal-header">
          <h2>{isEdit ? "Edit Deal" : "Create Deal"}</h2>
          <button className="btn-close" onClick={onClose} disabled={loading}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: "auto", flex: 1 }}>
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

          {dataLoading && (
            <p style={{ color: "#718096", fontSize: "0.875rem" }}>
              Loading deal form data...
            </p>
          )}

          <div className="deal-form-grid">
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
                <span style={{ color: "#e53e3e", fontSize: "0.8rem" }}>
                  {fieldErrors.name}
                </span>
              )}
            </div>

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
                      if (
                        currentLead &&
                        currentLead.account_id !== newAccountId
                      ) {
                        setLeadId("");
                      }

                      const currentContact = contacts.find(
                        (c) => c.id === contactId
                      );
                      if (
                        currentContact &&
                        currentContact.account_id !== newAccountId
                      ) {
                        setContactId("");
                      }
                    }

                    setFieldErrors((prev) => ({
                      ...prev,
                      accountId: "",
                      leadId: "",
                      contactId: "",
                    }));
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
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#718096",
                      marginTop: "2px",
                    }}
                  >
                    Select an Account first to choose related Leads and Contacts.
                  </span>
                )}

                {fieldErrors.accountId && (
                  <span style={{ color: "#e53e3e", fontSize: "0.8rem" }}>
                    {fieldErrors.accountId}
                  </span>
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
                  <span style={{ color: "#e53e3e", fontSize: "0.8rem" }}>
                    {fieldErrors.contactId}
                  </span>
                )}
              </div>
            </div>

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
                  <span style={{ color: "#e53e3e", fontSize: "0.8rem" }}>
                    {fieldErrors.leadId}
                  </span>
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

            <div className="deal-form-row-two-column">
              <div className="deal-form-group">
                <label>Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
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
                  <span style={{ color: "#e53e3e", fontSize: "0.8rem" }}>
                    {fieldErrors.amount}
                  </span>
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

            <div className="deal-form-row-two-column">
              <div className="deal-form-group">
                <label>Pipeline</label>
                <select
                  value={pipelineId}
                  onChange={(e) => {
                    const newPipelineId = e.target.value;
                    setPipelineId(newPipelineId);
                    setPipelineStageId("");
                    setStage(newPipelineId ? "" : "New");
                    setPipelineStages([]);
                    setFieldErrors((prev) => ({
                      ...prev,
                      pipelineId: "",
                      pipelineStageId: "",
                    }));
                    setError(null);
                  }}
                  disabled={loading || dataLoading}
                  className={fieldErrors.pipelineId ? "input-error" : ""}
                >
                  <option value="">-- No Pipeline --</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}{p.is_default ? " (Default)" : ""}
                    </option>
                  ))}
                </select>
                {pipelines.length === 0 && !dataLoading && (
                  <span style={{ fontSize: "0.75rem", color: "#718096" }}>
                    No active pipelines found. You can still use the standard stages.
                  </span>
                )}
              </div>

              <div className="deal-form-group">
                <label>
                  Stage <span style={{ color: "#e53e3e" }}>*</span>
                </label>

                {pipelineId ? (
                  <select
                    value={pipelineStageId}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setPipelineStageId(selectedId);

                      const selected = pipelineStages.find(
                        (s) => s.id === selectedId
                      );

                      setStage(selected?.name || "");
                      setFieldErrors((prev) => ({
                        ...prev,
                        pipelineStageId: "",
                      }));
                    }}
                    disabled={loading || stagesLoading}
                    className={
                      fieldErrors.pipelineStageId ? "input-error" : ""
                    }
                  >
                    <option value="">
                      {stagesLoading
                        ? "Loading stages..."
                        : "-- Select Stage --"}
                    </option>
                    {pipelineStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
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
                )}

                {fieldErrors.pipelineStageId && (
                  <span style={{ color: "#e53e3e", fontSize: "0.8rem" }}>
                    {fieldErrors.pipelineStageId}
                  </span>
                )}
              </div>
            </div>

            <div className="deal-form-group">
              <label>Description</label>
              <textarea
                placeholder="Details about the deal..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
              />
            </div>

            {templates.length > 0 && (
              <>
                <div
                  style={{
                    borderTop: "1px solid #e2e8f0",
                    paddingTop: "18px",
                    marginTop: "4px",
                  }}
                >
                  <h3 style={{ margin: "0 0 6px", fontSize: "1rem" }}>
                    Custom Fields
                  </h3>
                  <p
                    style={{
                      margin: "0 0 14px",
                      color: "#718096",
                      fontSize: "0.85rem",
                    }}
                  >
                    Choose a Deal form to enter additional information.
                  </p>

                  <div className="deal-form-group">
                    <label htmlFor="deal-custom-template">
                      Form Template
                    </label>
                    <select
                      id="deal-custom-template"
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      disabled={loading || customFormsLoading}
                    >
                      <option value="">-- Select Form Template --</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {customFormsLoading && (
                  <p style={{ color: "#718096", fontSize: "0.85rem" }}>
                    Loading custom fields...
                  </p>
                )}

                {selectedTemplate &&
                  [...selectedTemplate.fields]
                    .sort((a, b) => a.display_order - b.display_order)
                    .map(renderCustomField)}

                {selectedTemplate &&
                  selectedTemplate.fields.length === 0 && (
                    <p style={{ color: "#718096", fontSize: "0.85rem" }}>
                      This template has no fields yet.
                    </p>
                  )}
              </>
            )}
          </div>
        </div>

        <div className="deal-modal-footer" style={{ padding: "0 24px 24px" }}>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={
              loading ||
              dataLoading ||
              stagesLoading ||
              customFormsLoading
            }
          >
            {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Deal"}
          </button>
        </div>
      </div>
    </div>
  );
}
