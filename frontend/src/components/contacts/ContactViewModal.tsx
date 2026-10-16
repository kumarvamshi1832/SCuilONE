import { useEffect, useState } from "react";
import type { Contact } from "../../types/contact";
import type { User } from "../../types/user";
import { formatDateTime } from "../../utils/dateFormatter";
import {
  getFormTemplates,
  getCustomFormSubmission,
} from "../../services/formTemplateService";

interface ContactViewModalProps {
  contact: Contact;
  users: User[];
  accounts: any[];
  onClose: () => void;
}

interface CustomDetail {
  templateId: string;
  templateName: string;
  fields: {
    key: string;
    label: string;
    value: string;
  }[];
}

export default function ContactViewModal({
  contact,
  users,
  accounts,
  onClose,
}: ContactViewModalProps) {
  const [customDetails, setCustomDetails] = useState<CustomDetail[]>([]);
  const [customLoading, setCustomLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadCustomDetails = async () => {
      setCustomLoading(true);

      try {
        const templates = await getFormTemplates("contacts");

        const activeTemplates = templates.filter(
          (template) => template.is_active
        );

        const results = await Promise.all(
          activeTemplates.map(async (template) => {
            const submission = await getCustomFormSubmission(
              "contacts",
              contact.id,
              template.id
            );

            if (!submission) return null;

            const fields = template.fields
              .slice()
              .sort((a, b) => a.display_order - b.display_order)
              .filter((field) =>
                Object.prototype.hasOwnProperty.call(
                  submission.values,
                  field.field_key
                )
              )
              .map((field) => {
                const value = submission.values[field.field_key];

                return {
                  key: field.id,
                  label: field.field_label,
                  value:
                    typeof value === "boolean"
                      ? value
                        ? "Yes"
                        : "No"
                      : value === null || value === undefined || value === ""
                      ? "—"
                      : String(value),
                };
              });

            return {
              templateId: template.id,
              templateName: template.name,
              fields,
            };
          })
        );

        if (!cancelled) {
          setCustomDetails(
            results.filter(
              (item): item is CustomDetail => item !== null
            )
          );
        }
      } catch (err) {
        console.error("Failed to load Contact custom details:", err);
      } finally {
        if (!cancelled) {
          setCustomLoading(false);
        }
      }
    };

    void loadCustomDetails();

    return () => {
      cancelled = true;
    };
  }, [contact.id]);

  const getAssignedUser = (userId: string | null) => {
    if (!userId) return "—";

    const user = users.find((item) => item.id === userId);
    return user ? `${user.full_name} (${user.role})` : userId;
  };

  const getAccountDisplay = (accountId?: string | null) => {
    if (!accountId) return "—";

    const account = accounts.find((item) => item.id === accountId);
    return account ? account.name : accountId;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "600px", width: "100%" }}
      >
        <div className="modal-header">
          <h2>Contact Details</h2>
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

        <div
          className="modal-body"
          style={{
            maxHeight: "calc(100vh - 200px)",
            overflowY: "auto",
          }}
        >
          <div className="detail-group">
            <label className="text-muted">Full Name</label>
            <p className="detail-value">{contact.full_name || "—"}</p>
          </div>

          <div className="detail-grid">
            <div className="detail-group">
              <label className="text-muted">Email</label>
              <p className="detail-value">{contact.email || "—"}</p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Account</label>
              <p className="detail-value">
                {getAccountDisplay(contact.account_id)}
              </p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Phone</label>
              <p className="detail-value">{contact.phone || "—"}</p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Company</label>
              <p className="detail-value">{contact.company || "—"}</p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Job Title</label>
              <p className="detail-value">{contact.job_title || "—"}</p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Address</label>
              <p className="detail-value">{contact.address || "—"}</p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Source</label>
              <p className="detail-value">{contact.source || "—"}</p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Assigned To</label>
              <p className="detail-value">
                {getAssignedUser(contact.assigned_to)}
              </p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Created At</label>
              <p className="detail-value">
                {formatDateTime(contact.created_at)}
              </p>
            </div>

            <div className="detail-group">
              <label className="text-muted">Updated At</label>
              <p className="detail-value">
                {formatDateTime(contact.updated_at)}
              </p>
            </div>
          </div>

          <div className="detail-group mt-4">
            <label className="text-muted">Notes</label>
            <div className="detail-value notes-box">
              {contact.notes ? (
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                  {contact.notes}
                </p>
              ) : (
                <span className="text-muted italic">No notes provided.</span>
              )}
            </div>
          </div>

          <div className="mt-4">
            <h3>Custom Form Details</h3>

            {customLoading && <p>Loading custom details...</p>}

            {!customLoading && customDetails.length === 0 && (
              <p className="text-muted">
                No custom form submissions for this Contact.
              </p>
            )}

            {customDetails.map((template) => (
              <section
                key={template.templateId}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "16px",
                  marginTop: "12px",
                }}
              >
                <h4 style={{ marginTop: 0 }}>{template.templateName}</h4>

                {template.fields.length === 0 ? (
                  <p className="text-muted">
                    No custom values have been saved.
                  </p>
                ) : (
                  <div className="detail-grid">
                    {template.fields.map((field) => (
                      <div className="detail-group" key={field.key}>
                        <label className="text-muted">
                          {field.label}
                        </label>
                        <p className="detail-value">{field.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
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
