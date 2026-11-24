import { useCallback, useEffect, useRef, useState } from "react";
import {
  extractCustomFieldErrors,
  getCustomFieldValues,
  isCustomFieldsSupported,
  setCustomFieldValues,
} from "../../services/customFieldService";
import { getApiErrorMessage } from "../../utils/apiError";
import {
  formatStoredValue,
  isEmptyValue,
  isSafeHttpUrl,
  normalizeDraftValue,
  toDraftValue,
  validateDraft,
} from "../../utils/customFieldValidation";
import type { CustomFieldDraft } from "../../utils/customFieldValidation";
import type { CustomFieldEntity, CustomFieldErrors, CustomFieldValueItem } from "../../types/customField";
import CustomFieldInput from "./CustomFieldInput";
import "./CustomFields.css";

interface CustomFieldsPanelProps {
  entity: CustomFieldEntity;
  recordId: string;
  /** Whether the signed-in user may update this kind of record (`{entity}.update`). */
  canEdit: boolean;
}

/**
 * Custom field values of one record, shown in its detail modal and editable in place.
 * Renders nothing when the tenant has no active custom fields for this module.
 */
export default function CustomFieldsPanel({ entity, recordId, canEdit }: CustomFieldsPanelProps) {
  const [fields, setFields] = useState<CustomFieldValueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CustomFieldDraft>({});
  const [errors, setErrors] = useState<CustomFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const seq = useRef(0);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setLoadError(null);
    try {
      if (!isCustomFieldsSupported()) {
        setFields([]);
        setLoading(false);
        return;
      }
      const data = await getCustomFieldValues(entity, recordId);
      if (mine !== seq.current) return;
      setFields(data.fields);
    } catch (err: any) {
      if (mine !== seq.current) return;
      setFields([]);
      if (err?.response?.status === 404 || !isCustomFieldsSupported()) {
        setLoadError(null);
      } else {
        setLoadError(getApiErrorMessage(err, "Could not load custom fields."));
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [entity, recordId]);

  useEffect(() => {
    setEditing(false);
    setSaved(false);
    void load();
  }, [load]);

  const startEditing = () => {
    const initial: CustomFieldDraft = {};
    fields.forEach((f) => {
      initial[f.field_key] = toDraftValue(f, f.value);
    });
    setDraft(initial);
    setErrors({});
    setFormError(null);
    setSaved(false);
    setEditing(true);
  };

  const save = async () => {
    if (savingRef.current) return;
    const { errors: found, values } = validateDraft(fields, draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      setFormError("Fix the highlighted fields.");
      return;
    }
    // Send only the fields that changed (a null clears a value).
    const changed: Record<string, unknown> = {};
    fields.forEach((f) => {
      const before = normalizeDraftValue(f, toDraftValue(f, f.value)).value;
      const after = values[f.field_key] ?? null;
      if (JSON.stringify(before ?? null) !== JSON.stringify(after)) changed[f.field_key] = after;
    });
    if (Object.keys(changed).length === 0) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const result = await setCustomFieldValues(entity, recordId, changed);
      setFields((prev) => prev.map((f) => ({ ...f, value: result.custom_fields[f.field_key] ?? null })));
      setEditing(false);
      setSaved(true);
    } catch (err) {
      const fieldErrors = extractCustomFieldErrors(err);
      if (fieldErrors) {
        setErrors(fieldErrors);
        setFormError("Some values were rejected. Fix the highlighted fields.");
      } else {
        setFormError(getApiErrorMessage(err, "Custom fields could not be saved."));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading && fields.length === 0) {
    return (
      <section className="cf-panel" aria-busy="true">
        <div className="cf-skeleton" />
      </section>
    );
  }
  if (loadError) {
    return (
      <section className="cf-panel">
        <h4 className="cf-title">Custom fields</h4>
        <div className="ins-alert error" role="alert">
          <span>{loadError}</span>
          <button className="btn-secondary ins-btn-sm ins-alert-action" onClick={() => void load()}>
            Retry
          </button>
        </div>
      </section>
    );
  }
  if (fields.length === 0) return null;

  return (
    <section className="cf-panel" aria-label="Custom fields">
      <div className="cf-head">
        <h4 className="cf-title">Custom fields</h4>
        {canEdit && !editing && (
          <button className="btn-secondary ins-btn-sm" onClick={startEditing}>
            Edit
          </button>
        )}
      </div>

      {saved && !editing && (
        <div className="cf-saved" role="status">
          Custom fields saved.
        </div>
      )}

      {editing ? (
        <>
          <div className="cf-grid">
            {fields.map((f) => (
              <CustomFieldInput
                key={f.id}
                definition={f}
                value={draft[f.field_key]}
                error={errors[f.field_key]}
                disabled={saving}
                onChange={(value) => {
                  setDraft((prev) => ({ ...prev, [f.field_key]: value }));
                  if (errors[f.field_key]) setErrors((prev) => ({ ...prev, [f.field_key]: "" }));
                }}
              />
            ))}
          </div>
          {formError && (
            <div className="ins-alert error" role="alert" style={{ marginTop: 10 }}>
              <span>{formError}</span>
            </div>
          )}
          <div className="cf-actions">
            <button className="btn-secondary ins-btn-sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </button>
            <button className="btn-primary ins-btn-sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save custom fields"}
            </button>
          </div>
        </>
      ) : (
        <dl className="cf-grid cf-view">
          {fields.map((f) => {
            const empty = isEmptyValue(f.value);
            return (
              <div key={f.id} className="cf-item">
                <dt>{f.label}</dt>
                <dd>
                  {empty ? (
                    <span className={f.is_required ? "cf-missing" : "cf-none"}>{f.is_required ? "Required — not set" : "—"}</span>
                  ) : f.field_type === "url" && isSafeHttpUrl(f.value) ? (
                    <a href={f.value} target="_blank" rel="noopener noreferrer">
                      {f.value}
                    </a>
                  ) : f.field_type === "email" ? (
                    <a href={`mailto:${String(f.value)}`}>{String(f.value)}</a>
                  ) : (
                    formatStoredValue(f, f.value)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
