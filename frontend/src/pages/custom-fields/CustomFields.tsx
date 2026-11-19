import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { getIndustryConfig } from "../../config/industryConfig";
import {
  createCustomFieldDefinition,
  deactivateCustomFieldDefinition,
  getCustomFieldDefinitions,
  updateCustomFieldDefinition,
} from "../../services/customFieldService";
import { getApiErrorMessage } from "../../utils/apiError";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import {
  CUSTOM_FIELD_ENTITIES,
  CUSTOM_FIELD_KEY_PATTERN,
  CUSTOM_FIELD_LIMITS,
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  isOptionType,
} from "../../types/customField";
import type {
  CustomFieldDefinition,
  CustomFieldEntity,
  CustomFieldType,
} from "../../types/customField";
import "../users/Users.css";
import "../leads/Leads.css";
import "../insights/CrmInsights.css";
import "../../components/emails/Emails.css";
import "../../components/custom-fields/CustomFields.css";

type Tab = "all" | CustomFieldEntity;

const slugifyKey = (label: string): string => {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, CUSTOM_FIELD_LIMITS.keyMax);
  if (!slug) return "";
  return /^[a-z]/.test(slug) ? slug : `f_${slug}`.slice(0, CUSTOM_FIELD_LIMITS.keyMax);
};

const parseOptions = (raw: string): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (!seen.has(line)) {
        seen.add(line);
        out.push(line);
      }
    });
  return out;
};

interface FormState {
  entity: CustomFieldEntity;
  field_key: string;
  keyEdited: boolean;
  label: string;
  field_type: CustomFieldType;
  optionsText: string;
  help_text: string;
  is_required: boolean;
  is_active: boolean;
  position: string;
}

const emptyForm = (entity: CustomFieldEntity, nextPosition: number): FormState => ({
  entity,
  field_key: "",
  keyEdited: false,
  label: "",
  field_type: "text",
  optionsText: "",
  help_text: "",
  is_required: false,
  is_active: true,
  position: String(nextPosition),
});

const formFromDefinition = (def: CustomFieldDefinition): FormState => ({
  entity: def.entity,
  field_key: def.field_key,
  keyEdited: true,
  label: def.label,
  field_type: def.field_type,
  optionsText: (def.options ?? []).join("\n"),
  help_text: def.help_text ?? "",
  is_required: def.is_required,
  is_active: def.is_active,
  position: String(def.position),
});

export default function CustomFields() {
  const { industry } = useParams();
  const config = getIndustryConfig(industry);
  const canView = useMemo(() => hasFeaturePermission("custom_field.view"), []);
  const canManage = useMemo(() => hasFeaturePermission("custom_field.manage"), []);

  const entityLabels: Record<CustomFieldEntity, string> = {
    lead: config.leadLabel,
    contact: config.contactLabel,
    account: config.accountLabel,
    deal: config.dealLabel,
  };

  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<{ mode: "create" } | { mode: "edit"; definition: CustomFieldDefinition } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm("lead", 0));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [deactivating, setDeactivating] = useState<CustomFieldDefinition | null>(null);
  const [deactivateError, setDeactivateError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  };
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    if (!canView) {
      setLoading(false);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getCustomFieldDefinitions({ includeInactive: true });
      if (mine !== seq.current) return;
      setDefinitions(data);
    } catch (err) {
      if (mine !== seq.current) return;
      setDefinitions([]);
      setError(getApiErrorMessage(err, "Could not load custom fields."));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = (entity: CustomFieldEntity) => definitions.filter((d) => d.entity === entity && d.is_active).length;

  const visible = useMemo(
    () =>
      definitions
        .filter((d) => (tab === "all" ? true : d.entity === tab))
        .filter((d) => showInactive || d.is_active)
        .sort((a, b) => a.entity.localeCompare(b.entity) || a.position - b.position || a.label.localeCompare(b.label)),
    [definitions, tab, showInactive]
  );
  const inactiveCount = definitions.filter((d) => !d.is_active && (tab === "all" || d.entity === tab)).length;

  const openCreate = () => {
    const entity: CustomFieldEntity = tab === "all" ? "lead" : tab;
    const positions = definitions.filter((d) => d.entity === entity).map((d) => d.position);
    setForm(emptyForm(entity, positions.length ? Math.min(Math.max(...positions) + 1, CUSTOM_FIELD_LIMITS.positionMax) : 0));
    setFormError(null);
    setEditing({ mode: "create" });
  };

  const openEdit = (definition: CustomFieldDefinition) => {
    setForm(formFromDefinition(definition));
    setFormError(null);
    setEditing({ mode: "edit", definition });
  };

  const closeForm = () => {
    if (!saving) setEditing(null);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || savingRef.current) return;
    setFormError(null);

    const label = form.label.replace(/\s+/g, " ").trim();
    const helpText = form.help_text.trim();
    const position = Number(form.position);
    const options = parseOptions(form.optionsText);
    const needsOptions = isOptionType(form.field_type);

    if (!label) return setFormError("Enter a label.");
    if (label.length > CUSTOM_FIELD_LIMITS.labelMax) return setFormError(`The label can be at most ${CUSTOM_FIELD_LIMITS.labelMax} characters.`);
    if (helpText.length > CUSTOM_FIELD_LIMITS.helpTextMax) return setFormError(`Help text can be at most ${CUSTOM_FIELD_LIMITS.helpTextMax} characters.`);
    if (!Number.isInteger(position) || position < 0 || position > CUSTOM_FIELD_LIMITS.positionMax) {
      return setFormError(`Display order must be a whole number between 0 and ${CUSTOM_FIELD_LIMITS.positionMax}.`);
    }
    if (needsOptions) {
      if (options.length < CUSTOM_FIELD_LIMITS.optionsMin || options.length > CUSTOM_FIELD_LIMITS.optionsMax) {
        return setFormError(`Enter between ${CUSTOM_FIELD_LIMITS.optionsMin} and ${CUSTOM_FIELD_LIMITS.optionsMax} options, one per line.`);
      }
      if (options.some((o) => o.length > CUSTOM_FIELD_LIMITS.optionMax)) {
        return setFormError(`Each option can be at most ${CUSTOM_FIELD_LIMITS.optionMax} characters.`);
      }
    }

    savingRef.current = true;
    setSaving(true);
    try {
      if (editing.mode === "create") {
        const key = form.field_key.trim().toLowerCase();
        if (!CUSTOM_FIELD_KEY_PATTERN.test(key)) {
          setFormError("The field key must start with a letter and use only a–z, 0–9 and underscores (2–50 characters).");
          return;
        }
        if (form.is_active && activeCount(form.entity) >= CUSTOM_FIELD_LIMITS.activePerEntity) {
          setFormError(`At most ${CUSTOM_FIELD_LIMITS.activePerEntity} active custom fields are allowed per module.`);
          return;
        }
        await createCustomFieldDefinition({
          entity: form.entity,
          field_key: key,
          label,
          field_type: form.field_type,
          options: needsOptions ? options : null,
          help_text: helpText || null,
          is_required: form.is_required,
          position,
        });
        showToast(`Custom field “${label}” created.`);
      } else {
        const original = editing.definition;
        if (form.is_active && !original.is_active && activeCount(original.entity) >= CUSTOM_FIELD_LIMITS.activePerEntity) {
          setFormError(`At most ${CUSTOM_FIELD_LIMITS.activePerEntity} active custom fields are allowed per module.`);
          return;
        }
        await updateCustomFieldDefinition(original.id, {
          label,
          help_text: helpText || null,
          is_required: form.is_required,
          is_active: form.is_active,
          position,
          ...(needsOptions ? { options } : {}),
        });
        showToast(`Custom field “${label}” updated.`);
      }
      setEditing(null);
      await load();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setFormError(
        status === 409
          ? getApiErrorMessage(err, "A custom field with this key already exists for this module.")
          : getApiErrorMessage(err, "The custom field could not be saved.")
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const activate = async (definition: CustomFieldDefinition) => {
    if (activeCount(definition.entity) >= CUSTOM_FIELD_LIMITS.activePerEntity) {
      showToast(`At most ${CUSTOM_FIELD_LIMITS.activePerEntity} active custom fields are allowed per module.`, "error");
      return;
    }
    setBusyId(definition.id);
    try {
      await updateCustomFieldDefinition(definition.id, { is_active: true });
      showToast(`“${definition.label}” is active again.`);
      await load();
    } catch (err) {
      showToast(getApiErrorMessage(err, "The field could not be activated."), "error");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivating) return;
    setBusyId(deactivating.id);
    setDeactivateError(null);
    try {
      await deactivateCustomFieldDefinition(deactivating.id);
      showToast(`“${deactivating.label}” was deactivated. Stored values are kept.`);
      setDeactivating(null);
      await load();
    } catch (err) {
      setDeactivateError(getApiErrorMessage(err, "The field could not be deactivated."));
    } finally {
      setBusyId(null);
    }
  };

  if (!canView) {
    return (
      <div className="ins-page">
        <div className="page-header">
          <div>
            <h1>Custom Fields</h1>
          </div>
        </div>
        <div className="ins-empty">
          <h3>Access denied</h3>
          <p>You do not have permission to view custom fields.</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All modules" },
    ...CUSTOM_FIELD_ENTITIES.map((e) => ({ id: e as Tab, label: entityLabels[e] })),
  ];
  const isEdit = editing?.mode === "edit";
  const keyLocked = isEdit;

  return (
    <div className="ins-page">
      {toast && (
        <div className={`ins-alert ins-toast ${toast.type}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1>Custom Fields</h1>
          <p className="text-muted">
            Add your own fields to {config.leadLabel.toLowerCase()}, {config.contactLabel.toLowerCase()}, {config.accountLabel.toLowerCase()} and{" "}
            {config.dealLabel.toLowerCase()}. They appear on each record’s detail view.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => void load()} disabled={loading}>
            Refresh
          </button>
          {canManage && (
            <button className="btn-primary" onClick={openCreate}>
              New custom field
            </button>
          )}
        </div>
      </div>

      <div className="ins-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`ins-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id !== "all" && <span className="text-dim"> · {activeCount(t.id)}/{CUSTOM_FIELD_LIMITS.activePerEntity}</span>}
          </button>
        ))}
      </div>

      <div className="ins-toolbar">
        <label className="cfm-check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive fields{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
        </label>
      </div>

      {error && (
        <div className="ins-alert error" role="alert">
          <span>{error}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="leads-table-container">
        {loading ? (
          <div className="ins-loading" aria-busy="true">
            <div className="leads-loading-spinner" /> Loading custom fields…
          </div>
        ) : error ? null : visible.length === 0 ? (
          <div className="ins-empty">
            <h3>No custom fields</h3>
            <p>
              {definitions.length > 0 && !showInactive
                ? "No active custom fields here. Tick “Show inactive fields” to see deactivated ones."
                : canManage
                ? "Create your first custom field to capture information specific to your business."
                : "No custom fields have been defined yet."}
            </p>
          </div>
        ) : (
          <div className="ins-table-wrap">
            <table className="leads-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Field</th>
                  <th>Module</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Status</th>
                  {canManage && <th style={{ textAlign: "right" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d.id} className={d.is_active ? "" : "cfm-inactive"}>
                    <td className="text-dim">{d.position}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.label}</div>
                      <div className="cfm-key">{d.field_key}</div>
                      {d.help_text && <div className="text-dim" style={{ fontSize: "0.76rem" }}>{d.help_text}</div>}
                      {isOptionType(d.field_type) && (d.options?.length ?? 0) > 0 && (
                        <div className="text-dim" style={{ fontSize: "0.76rem" }}>
                          Options: {(d.options ?? []).join(", ")}
                        </div>
                      )}
                    </td>
                    <td>{entityLabels[d.entity]}</td>
                    <td>
                      <span className="cfm-type">{CUSTOM_FIELD_TYPE_LABELS[d.field_type]}</span>
                    </td>
                    <td>{d.is_required ? "Yes" : "No"}</td>
                    <td>
                      <span className={`cfm-status ${d.is_active ? "on" : "off"}`}>{d.is_active ? "Active" : "Inactive"}</span>
                    </td>
                    {canManage && (
                      <td>
                        <div className="ins-row-actions">
                          <button className="btn-secondary ins-btn-sm" onClick={() => openEdit(d)}>
                            Edit
                          </button>
                          {d.is_active ? (
                            <button
                              className="ins-btn-outline-danger ins-btn-sm"
                              onClick={() => {
                                setDeactivateError(null);
                                setDeactivating(d);
                              }}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button className="btn-secondary ins-btn-sm" onClick={() => void activate(d)} disabled={busyId === d.id}>
                              {busyId === d.id ? "Working…" : "Activate"}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="ins-modal-overlay" role="presentation">
          <form className="ins-modal em-modal-wide" role="dialog" aria-modal="true" aria-labelledby="cfm-title" onSubmit={submit} noValidate>
            <div className="ins-modal-header">
              <h3 id="cfm-title">{isEdit ? "Edit custom field" : "New custom field"}</h3>
              <button type="button" className="ins-modal-close" onClick={closeForm} disabled={saving} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ins-modal-body cfm-form">
              <div className="em-grid-2">
                <label className="em-field">
                  <span>Module *</span>
                  {keyLocked ? (
                    <div className="cfm-readonly">{entityLabels[form.entity]}</div>
                  ) : (
                    <select value={form.entity} onChange={(e) => setField("entity", e.target.value as CustomFieldEntity)} disabled={saving}>
                      {CUSTOM_FIELD_ENTITIES.map((e) => (
                        <option key={e} value={e}>
                          {entityLabels[e]}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label className="em-field">
                  <span>Field type *</span>
                  {keyLocked ? (
                    <div className="cfm-readonly">{CUSTOM_FIELD_TYPE_LABELS[form.field_type]}</div>
                  ) : (
                    <select value={form.field_type} onChange={(e) => setField("field_type", e.target.value as CustomFieldType)} disabled={saving}>
                      {CUSTOM_FIELD_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {CUSTOM_FIELD_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
              </div>

              <label className="em-field">
                <span>Label *</span>
                <input
                  type="text"
                  value={form.label}
                  maxLength={CUSTOM_FIELD_LIMITS.labelMax}
                  disabled={saving}
                  autoFocus
                  onChange={(e) => {
                    const label = e.target.value;
                    setForm((prev) => ({ ...prev, label, field_key: prev.keyEdited || keyLocked ? prev.field_key : slugifyKey(label) }));
                  }}
                />
              </label>

              <label className="em-field">
                <span>Field key *</span>
                {keyLocked ? (
                  <div className="cfm-readonly cfm-key">{form.field_key}</div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={form.field_key}
                      maxLength={CUSTOM_FIELD_LIMITS.keyMax}
                      disabled={saving}
                      onChange={(e) => setForm((prev) => ({ ...prev, field_key: e.target.value.toLowerCase(), keyEdited: true }))}
                    />
                    <small>Used by integrations and imports. Lowercase letters, digits and underscores; cannot be changed later.</small>
                  </>
                )}
              </label>

              {isOptionType(form.field_type) && (
                <label className="em-field">
                  <span>Options * <small>(one per line, up to {CUSTOM_FIELD_LIMITS.optionsMax})</small></span>
                  <textarea rows={5} value={form.optionsText} disabled={saving} onChange={(e) => setField("optionsText", e.target.value)} />
                  {isEdit && <small>Removing an option does not change values already stored on records.</small>}
                </label>
              )}

              <label className="em-field">
                <span>Help text</span>
                <input type="text" value={form.help_text} maxLength={CUSTOM_FIELD_LIMITS.helpTextMax} disabled={saving} onChange={(e) => setField("help_text", e.target.value)} />
              </label>

              <div className="em-grid-2">
                <label className="em-field">
                  <span>Display order</span>
                  <input type="number" min={0} max={CUSTOM_FIELD_LIMITS.positionMax} step={1} value={form.position} disabled={saving} onChange={(e) => setField("position", e.target.value)} />
                  <small>Lower numbers appear first.</small>
                </label>
                <div className="em-field">
                  <span>Options</span>
                  <label className="cfm-check">
                    <input type="checkbox" checked={form.is_required} disabled={saving} onChange={(e) => setField("is_required", e.target.checked)} />
                    Required
                  </label>
                  {isEdit && (
                    <label className="cfm-check">
                      <input type="checkbox" checked={form.is_active} disabled={saving} onChange={(e) => setField("is_active", e.target.checked)} />
                      Active
                    </label>
                  )}
                </div>
              </div>
              {form.is_required && (
                <div className="ins-warning-box" role="note">
                  Required fields must be filled before custom field values can be saved on any record of this module.
                </div>
              )}

              {formError && (
                <div className="ins-alert error" role="alert">
                  <span>{formError}</span>
                </div>
              )}
            </div>
            <div className="ins-modal-footer">
              <button type="button" className="btn-secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create field"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deactivating && (
        <div className="ins-modal-overlay" role="presentation">
          <div className="ins-modal" role="alertdialog" aria-modal="true" aria-labelledby="cfm-deact-title">
            <div className="ins-modal-header">
              <h3 id="cfm-deact-title">Deactivate “{deactivating.label}”?</h3>
              <button className="ins-modal-close" onClick={() => setDeactivating(null)} disabled={busyId !== null} aria-label="Close">
                ×
              </button>
            </div>
            <div className="ins-modal-body">
              <p style={{ margin: 0 }}>
                The field is hidden from records. Values already stored are kept and come back if you activate the field again.
              </p>
              {deactivateError && (
                <div className="ins-alert error" role="alert" style={{ marginTop: 12 }}>
                  <span>{deactivateError}</span>
                </div>
              )}
            </div>
            <div className="ins-modal-footer">
              <button className="btn-secondary" onClick={() => setDeactivating(null)} disabled={busyId !== null}>
                Cancel
              </button>
              <button className="ins-btn-danger" onClick={() => void confirmDeactivate()} disabled={busyId !== null}>
                {busyId !== null ? "Deactivating…" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
