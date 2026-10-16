
import { useCallback, useEffect, useState } from "react";
import {
  createFormTemplate,
  getFormTemplates,
  updateFormTemplate,
  type CRMModule,
  type FieldType,
  type FormField,
  type FormTemplate,
} from "../../services/formTemplateService";
import "./FormBuilder.css";

const modules: { value: CRMModule; label: string }[] = [
  { value: "leads", label: "Leads" },
  { value: "contacts", label: "Contacts" },
  { value: "accounts", label: "Accounts" },
  { value: "deals", label: "Deals" },
];

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

const emptyField = (): FormField => ({
  field_label: "",
  field_key: "",
  field_type: "text",
  is_required: false,
  options: null,
  validation_rules: null,
  display_order: 0,
});

const makeFieldKey = (label: string) =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "");

export default function FormBuilder() {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [moduleFilter, setModuleFilter] = useState<CRMModule | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<FormTemplate | null>(null);

  const [name, setName] = useState("");
  const [moduleName, setModuleName] = useState<CRMModule>("leads");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FormField[]>([emptyField()]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getFormTemplates(undefined, true);
      setTemplates(data);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Could not load form templates. Please check your login."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const resetEditor = () => {
    setShowEditor(false);
    setEditingTemplate(null);
    setName("");
    setModuleName("leads");
    setDescription("");
    setFields([emptyField()]);
    setError("");
    setSuccess("");
  };

  const startCreate = () => {
    resetEditor();
    setShowEditor(true);
  };

  const startEdit = (template: FormTemplate) => {
    setEditingTemplate(template);
    setName(template.name);
    setModuleName(template.module_name);
    setDescription(template.description || "");
    setFields(
      template.fields.length
        ? template.fields.map((field) => ({ ...field }))
        : [emptyField()]
    );
    setError("");
    setSuccess("");
    setShowEditor(true);
  };

  const updateField = (
    index: number,
    changes: Partial<FormField>
  ) => {
    setFields((previous) =>
      previous.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field
      )
    );
  };

  const addField = () => {
    setFields((previous) => [
      ...previous,
      { ...emptyField(), display_order: previous.length },
    ]);
  };

  const removeField = (index: number) => {
    setFields((previous) =>
      previous
        .filter((_, fieldIndex) => fieldIndex !== index)
        .map((field, fieldIndex) => ({
          ...field,
          display_order: fieldIndex,
        }))
    );
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
const reordered = [...fields];

if (
  index < 0 ||
  target < 0 ||
  index >= reordered.length ||
  target >= reordered.length
) {
  return;
}

const currentField = reordered[index];
const targetField = reordered[target];

if (!currentField || !targetField) {
  return;
}

reordered[index] = targetField;
reordered[target] = currentField;

setFields(reordered);
    setFields(
      reordered.map((field, fieldIndex) => ({
        ...field,
        display_order: fieldIndex,
      }))
    );
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const cleanedName = name.trim();

    if (!cleanedName) {
      setError("Please enter a form name.");
      return;
    }

    if (!editingTemplate && fields.some((field) => !field.field_label.trim())) {
      setError("Please enter a label for every field.");
      return;
    }

    if (!editingTemplate && fields.some((field) => !makeFieldKey(field.field_key || field.field_label))) {
      setError("Every field needs a valid key starting with a letter.");
      return;
    }

    if (!editingTemplate && fields.some((field) => field.field_type === "dropdown" && !(field.options || []).some((option) => option.trim()))) {
      setError("Each dropdown needs at least one option.");
      return;
    }

    if (!editingTemplate) {
      const keys = fields.map((field) =>
        makeFieldKey(field.field_key || field.field_label)
      );

      if (new Set(keys).size !== keys.length) {
        setError("Field keys must be unique. Please adjust the labels or keys.");
        return;
      }
    }

    setSaving(true);

    try {
      if (editingTemplate) {
        await updateFormTemplate(editingTemplate.id, {
          name: cleanedName,
          description: description.trim() || null,
        });

        setSuccess(
          "Template details updated. Field changes require backend update support."
        );
      } else {
        const preparedFields = fields.map((field, index) => ({
          field_label: field.field_label.trim(),
          field_key: makeFieldKey(field.field_key || field.field_label),
          field_type: field.field_type,
          is_required: field.is_required,
          options:
            field.field_type === "dropdown"
              ? (field.options || [])
                  .map((option) => option.trim())
                  .filter(Boolean)
              : null,
          validation_rules: field.validation_rules,
          display_order: index,
        }));

        await createFormTemplate({
          name: cleanedName,
          module_name: moduleName,
          description: description.trim() || null,
          fields: preparedFields,
        });

        setSuccess("Form template created successfully.");
      }

      await loadTemplates();

      if (!editingTemplate) {
        resetEditor();
      } else {
        setShowEditor(false);
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Unable to save the template. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (template: FormTemplate) => {
    setError("");
    setSuccess("");

    try {
      await updateFormTemplate(template.id, {
        is_active: !template.is_active,
      });

      setSuccess(
        `${template.name} is now ${template.is_active ? "inactive" : "active"}.`
      );

      await loadTemplates();
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Could not change the template status."
      );
    }
  };

  const visibleTemplates = templates.filter(
    (template) =>
      moduleFilter === "all" || template.module_name === moduleFilter
  );

  return (
    <div className="form-builder-page">
      <div className="fb-page-header">
        <div>
          <span className="fb-eyebrow">CUSTOMIZATION</span>
          <h1>Dynamic Form Builder</h1>
          <p>Create custom fields for your CRM modules.</p>
        </div>

        {!showEditor && (
          <button className="fb-primary-btn" onClick={startCreate}>
            <span>＋</span> Create Form
          </button>
        )}
      </div>

      {error && <div className="fb-alert fb-alert-error">{error}</div>}
      {success && <div className="fb-alert fb-alert-success">{success}</div>}

      {showEditor ? (
        <form className="fb-editor" onSubmit={handleSave}>
          <div className="fb-editor-heading">
            <div>
              <h2>{editingTemplate ? "Edit Template" : "Create New Form"}</h2>
              <p>
                {editingTemplate
                  ? "Update the template name and description."
                  : "Configure the form and add the fields your team needs."}
              </p>
            </div>
            <button
              type="button"
              className="fb-secondary-btn"
              onClick={resetEditor}
            >
              Cancel
            </button>
          </div>

          <div className="fb-form-grid">
            <label className="fb-control">
              Form name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. 2 BHK Lead Form"
                maxLength={150}
                required
              />
            </label>

            <label className="fb-control">
              CRM module
              <select
                value={moduleName}
                disabled={!!editingTemplate}
                onChange={(event) =>
                  setModuleName(event.target.value as CRMModule)
                }
              >
                {modules.map((module) => (
                  <option key={module.value} value={module.value}>
                    {module.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="fb-control fb-full-width">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What is this form used for?"
                rows={3}
              />
            </label>
          </div>

          {!editingTemplate && (
            <section className="fb-fields-section">
              <div className="fb-section-heading">
                <div>
                  <h3>Form Fields</h3>
                  <p>Configure labels, types, requirements, and options.</p>
                </div>
                <button
                  type="button"
                  className="fb-secondary-btn"
                  onClick={addField}
                >
                  + Add Field
                </button>
              </div>

              {fields.map((field, index) => (
                <div className="fb-field-card" key={index}>
                  <div className="fb-field-top">
                    <strong>Field {index + 1}</strong>
                    <div className="fb-field-actions">
                      <button
                        type="button"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        aria-label="Move field up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 1)}
                        disabled={index === fields.length - 1}
                        aria-label="Move field down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="fb-remove-btn"
                        onClick={() => removeField(index)}
                        aria-label="Remove field"
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="fb-form-grid">
                    <label className="fb-control">
                      Field label
                      <input
                        value={field.field_label}
                        onChange={(event) => {
                          const label = event.target.value;
                          updateField(index, {
                            field_label: label,
                            field_key: makeFieldKey(label),
                          });
                        }}
                        placeholder="e.g. Preferred Location"
                        maxLength={150}
                        required
                      />
                    </label>

                    <label className="fb-control">
                      Field key
                      <input
                        value={field.field_key}
                        onChange={(event) =>
                          updateField(index, {
                            field_key: makeFieldKey(event.target.value),
                          })
                        }
                        placeholder="preferred_location"
                        maxLength={100}
                        required
                      />
                    </label>

                    <label className="fb-control">
                      Field type
                      <select
                        value={field.field_type}
                        onChange={(event) => {
                          const type = event.target.value as FieldType;
                          updateField(index, {
                            field_type: type,
                            options:
                              type === "dropdown"
                                ? field.options?.length
                                  ? field.options
                                  : [""]
                                : null,
                          });
                        }}
                      >
                        {fieldTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="fb-checkbox-control">
                      <input
                        type="checkbox"
                        checked={field.is_required}
                        onChange={(event) =>
                          updateField(index, {
                            is_required: event.target.checked,
                          })
                        }
                      />
                      Required field
                    </label>

                    {field.field_type === "dropdown" && (
                      <label className="fb-control fb-full-width">
                        Dropdown options (one per line)
                        <textarea
                          rows={3}
                          value={(field.options || []).join("\n")}
                          onChange={(event) =>
                            updateField(index, {
                              options: event.target.value.split("\n"),
                            })
                          }
                          placeholder={"Furnished\nSemi-Furnished\nUnfurnished"}
                          required
                        />
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {editingTemplate && (
            <div className="fb-info-note">
              Field definitions are shown in the template list. Your current
              backend supports editing template metadata and status, but not
              modifying existing field definitions.
            </div>
          )}

          <div className="fb-editor-footer">
            <button
              type="button"
              className="fb-secondary-btn"
              onClick={resetEditor}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="fb-primary-btn"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingTemplate
                  ? "Save Changes"
                  : "Create Template"}
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="fb-stats-grid">
            <div className="fb-stat-card">
              <span>Total templates</span>
              <strong>{templates.length}</strong>
            </div>
            <div className="fb-stat-card">
              <span>Active templates</span>
              <strong>
                {templates.filter((template) => template.is_active).length}
              </strong>
            </div>
            <div className="fb-stat-card">
              <span>Custom fields</span>
              <strong>
                {templates.reduce(
                  (total, template) => total + template.fields.length,
                  0
                )}
              </strong>
            </div>
          </div>

          <div className="fb-list-toolbar">
            <div>
              <h2>Your Forms</h2>
              <p>Manage templates belonging to your company.</p>
            </div>

            <select
              className="fb-filter"
              value={moduleFilter}
              onChange={(event) =>
                setModuleFilter(event.target.value as CRMModule | "all")
              }
              aria-label="Filter forms by module"
            >
              <option value="all">All modules</option>
              {modules.map((module) => (
                <option key={module.value} value={module.value}>
                  {module.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="fb-empty-state">Loading form templates...</div>
          ) : visibleTemplates.length === 0 ? (
            <div className="fb-empty-state">
              <div className="fb-empty-icon">▤</div>
              <h3>No forms found</h3>
              <p>Create a form to collect additional CRM information.</p>
              <button className="fb-primary-btn" onClick={startCreate}>
                Create your first form
              </button>
            </div>
          ) : (
            <div className="fb-template-grid">
              {visibleTemplates.map((template) => (
                <article className="fb-template-card" key={template.id}>
                  <div className="fb-template-card-top">
                    <span className="fb-module-tag">
                      {modules.find(
                        (module) => module.value === template.module_name
                      )?.label || template.module_name}
                    </span>
                    <span
                      className={`fb-status ${
                        template.is_active ? "is-active" : "is-inactive"
                      }`}
                    >
                      {template.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <h3>{template.name}</h3>
                  <p className="fb-template-description">
                    {template.description || "No description provided."}
                  </p>

                  <div className="fb-template-meta">
                    <span>
                      {template.fields.length}{" "}
                      {template.fields.length === 1 ? "field" : "fields"}
                    </span>
                    <span>
                      {template.created_at
                        ? new Date(template.created_at).toLocaleDateString()
                        : ""}
                    </span>
                  </div>

                  <div className="fb-field-preview">
                    {template.fields.slice(0, 4).map((field) => (
                      <span key={field.id || field.field_key}>
                        {field.field_label}
                      </span>
                    ))}
                    {template.fields.length > 4 && (
                      <span>+{template.fields.length - 4} more</span>
                    )}
                  </div>

                  <div className="fb-card-actions">
                    <button
                      className="fb-secondary-btn"
                      onClick={() => startEdit(template)}
                    >
                      Edit Details
                    </button>
                    <button
                      className={
                        template.is_active
                          ? "fb-deactivate-btn"
                          : "fb-activate-btn"
                      }
                      onClick={() => void toggleActive(template)}
                    >
                      {template.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}