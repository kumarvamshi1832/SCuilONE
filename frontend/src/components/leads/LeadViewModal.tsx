
import { useEffect, useState } from "react";
import type { Lead } from "../../types/lead";
import type { User } from "../../types/user";
import {
  getFormTemplates,
  getCustomFormSubmission,
  type FormTemplate,
} from "../../services/formTemplateService";
import { getLeadPermissions } from "../../utils/leadPermissions";
import { formatDateTime } from "../../utils/dateFormatter";

interface LeadViewModalProps {
  lead: Lead;
  users: User[];
  onClose: () => void;
  onEdit: () => void;
}

const permissions = getLeadPermissions();

function getStatusClass(status: string): string {
  switch (status) {
    case "New":
      return "status-new";
    case "Contacted":
      return "status-contacted";
    case "Qualified":
      return "status-qualified";
    case "Converted":
      return "status-converted";
    case "Lost":
      return "status-lost";
    default:
      return "";
  }
}

function formatCustomValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

export default function LeadViewModal({
  lead,
  users,
  onClose,
  onEdit,
}: LeadViewModalProps) {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>(
    {}
  );
  const [customFieldsLoading, setCustomFieldsLoading] = useState(true);
  const [customFieldsError, setCustomFieldsError] = useState("");

  const assignedUser = lead.assigned_to
    ? users.find((user) => user.id === lead.assigned_to)
    : null;

  useEffect(() => {
    let cancelled = false;

    const loadCustomFields = async () => {
      setCustomFieldsLoading(true);
      setCustomFieldsError("");
      setTemplates([]);
      setCustomValues({});

      try {
        const formTemplates = await getFormTemplates("leads");

        if (cancelled) return;

        setTemplates(formTemplates);

        const submissions = await Promise.all(
          formTemplates.map(async (template) => {
            try {
              const submission = await getCustomFormSubmission(
                "leads",
                lead.id,
                template.id
              );

              return submission
                ? { template, values: submission.values }
                : null;
            } catch (error) {
              console.error(
                `Failed to load custom values for ${template.name}:`,
                error
              );
              throw error;
            }
          })
        );

        if (cancelled) return;

        const mergedValues: Record<string, unknown> = {};

        submissions.forEach((submission) => {
          if (submission) {
            Object.assign(mergedValues, submission.values);
          }
        });

        setCustomValues(mergedValues);
      } catch (error) {
        console.error("Failed to load Lead custom fields:", error);

        if (!cancelled) {
          setCustomFieldsError(
            "Unable to load custom form values. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setCustomFieldsLoading(false);
        }
      }
    };

    loadCustomFields();

    return () => {
      cancelled = true;
    };
  }, [lead.id]);

  const templatesWithValues = templates.filter((template) =>
    template.fields.some(
      (field) => Object.prototype.hasOwnProperty.call(customValues, field.field_key)
    )
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content leads-modal-content"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Lead Details</h2>
          <button className="btn-close" onClick={onClose}>
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

        <div className="modal-body lead-view-body">
          <div className="lead-view-header">
            <div className="lead-view-avatar">
              {(lead.full_name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="lead-view-title">
              <h3>{lead.full_name}</h3>
              <span className={`lead-status-badge ${getStatusClass(lead.status)}`}>
                {lead.status}
              </span>
            </div>
          </div>

          <div className="lead-view-grid">
            <div className="lead-view-item">
              <span className="lead-view-label">Email</span>
              <span className="lead-view-value">{lead.email || "—"}</span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">Phone</span>
              <span className="lead-view-value">{lead.phone || "—"}</span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">Source</span>
              <span className="lead-view-value">{lead.source || "—"}</span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">Assigned To</span>
              <span className="lead-view-value">
                {assignedUser
                  ? `${assignedUser.full_name} — ${assignedUser.role}`
                  : lead.assigned_to
                    ? "Unknown User"
                    : "Unassigned"}
              </span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">Created</span>
              <span className="lead-view-value">
                {formatDateTime(lead.created_at)}
              </span>
            </div>

            <div className="lead-view-item">
              <span className="lead-view-label">Updated</span>
              <span className="lead-view-value">
                {formatDateTime(lead.updated_at)}
              </span>
            </div>
          </div>

          {lead.notes && (
            <div className="lead-view-notes">
              <span className="lead-view-label">Notes</span>
              <p className="lead-notes-text">{lead.notes}</p>
            </div>
          )}

          <div className="lead-view-notes">
            <h3>Custom Form Details</h3>

            {customFieldsLoading ? (
              <p>Loading custom form values...</p>
            ) : customFieldsError ? (
              <p>{customFieldsError}</p>
            ) : templatesWithValues.length === 0 ? (
              <p>No saved custom form values for this Lead.</p>
            ) : (
              templatesWithValues.map((template) => (
                <div key={template.id} className="lead-view-grid">
                  <h4>{template.name}</h4>

                  {template.fields
                    .filter((field) =>
                      Object.prototype.hasOwnProperty.call(
                        customValues,
                        field.field_key
                      )
                    )
                    .map((field) => (
                      <div className="lead-view-item" key={field.id}>
                        <span className="lead-view-label">
                          {field.field_label}
                        </span>
                        <span className="lead-view-value">
                          {formatCustomValue(customValues[field.field_key])}
                        </span>
                      </div>
                    ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>

          {permissions.canEdit && (
            <button className="btn-primary" onClick={onEdit}>
              Edit Lead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}