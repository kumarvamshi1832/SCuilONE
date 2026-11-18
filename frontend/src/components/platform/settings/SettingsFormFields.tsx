import { useEffect, useId, useMemo, useState } from "react";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import {
  humanizeKey,
  isObject,
  pathId,
  resolveKind,
  type FieldMeta,
  type JsonObject,
  type JsonValue,
  type NumberDraft,
  type SectionMeta,
} from "./settingsSchema";

/**
 * Reusable, schema-light form renderer. It walks the live configuration object and picks a control
 * from the value type (or explicit metadata): string -> text, number -> number, boolean -> switch,
 * select metadata -> dropdown, nested object -> grouped section, array -> list editor.
 */

type Path = (string | number)[];

interface RenderContext {
  disabled: boolean;
  errors: Record<string, string>;
  onChange: (path: Path, next: JsonValue) => void;
}

/* ------------------------------ leaf controls ------------------------------ */

function NumberInput({
  id,
  value,
  min,
  max,
  invalid,
  disabled,
  describedBy,
  onChange,
}: {
  id: string;
  value: JsonValue;
  min?: number;
  max?: number;
  invalid: boolean;
  disabled: boolean;
  describedBy?: string;
  onChange: (next: NumberDraft) => void;
}) {
  const toText = (v: JsonValue) => (typeof v === "number" ? String(v) : "");
  const parse = (text: string): NumberDraft => {
    if (text.trim() === "") return "";
    const n = Number(text);
    return Number.isFinite(n) ? n : "";
  };
  const [text, setText] = useState(toText(value));

  // Re-sync when the draft is reset / reloaded from outside, without clobbering partial typing.
  useEffect(() => {
    const current = parse(text);
    const incoming = typeof value === "number" ? value : "";
    if (current !== incoming) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      id={id}
      type="number"
      inputMode="numeric"
      className={`gs-input${invalid ? " is-invalid" : ""}`}
      value={text}
      min={min}
      max={max}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
    />
  );
}

function Switch({
  checked,
  disabled,
  labelledBy,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  labelledBy: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={`gs-switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="gs-switch-thumb" />
    </button>
  );
}

function SecretInput({
  id,
  value,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (next: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="gs-input-wrap">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete="off"
        className={`gs-input${invalid ? " is-invalid" : ""}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="gs-input-adorn"
        aria-label={visible ? "Hide value" : "Show value"}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

/* ------------------------------ field rows ------------------------------ */

function FieldShell({
  label,
  description,
  unit,
  error,
  htmlFor,
  descId,
  children,
}: {
  label: string;
  description?: string;
  unit?: string;
  error?: string;
  htmlFor: string;
  descId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="gs-field">
      <label className="gs-label" htmlFor={htmlFor}>
        {label}
        {unit && <span className="gs-unit">{unit}</span>}
      </label>
      {children}
      {error ? (
        <p className="gs-error" id={descId} role="alert">
          {error}
        </p>
      ) : description ? (
        <p className="gs-help" id={descId}>
          {description}
        </p>
      ) : null}
    </div>
  );
}

function ScalarField({
  fieldKey,
  value,
  meta,
  path,
  ctx,
}: {
  fieldKey: string;
  value: JsonValue;
  meta?: FieldMeta;
  path: Path;
  ctx: RenderContext;
}) {
  const uid = useId();
  const id = pathId(path);
  const inputId = `${uid}-${id}`;
  const descId = `${inputId}-desc`;
  const label = meta?.label || humanizeKey(fieldKey);
  const kind = resolveKind(fieldKey, value, meta);
  const error = ctx.errors[id];
  const invalid = Boolean(error);

  const options = useMemo(() => {
    if (kind !== "select") return [];
    const base = meta?.options || meta?.optionsFactory?.() || [];
    const current = typeof value === "string" ? value : "";
    return current && !base.some((o) => o.value === current)
      ? [{ value: current, label: current }, ...base]
      : base;
  }, [kind, meta, value]);

  if (kind === "toggle") {
    const labelId = `${inputId}-label`;
    return (
      <div className="gs-toggle-row">
        <div className="gs-toggle-text">
          <span className="gs-toggle-label" id={labelId}>
            {label}
          </span>
          {(error || meta?.description) && (
            <span className={error ? "gs-error" : "gs-help"} id={descId}>
              {error || meta?.description}
            </span>
          )}
        </div>
        <Switch
          checked={value === true}
          disabled={ctx.disabled}
          labelledBy={labelId}
          onChange={(next) => ctx.onChange(path, next)}
        />
      </div>
    );
  }

  let control: React.ReactNode;
  if (kind === "number") {
    control = (
      <NumberInput
        id={inputId}
        value={value}
        min={meta?.min}
        max={meta?.max}
        invalid={invalid}
        disabled={ctx.disabled}
        describedBy={descId}
        onChange={(next) => ctx.onChange(path, next)}
      />
    );
  } else if (kind === "select") {
    control = (
      <select
        id={inputId}
        className={`gs-input gs-select${invalid ? " is-invalid" : ""}`}
        value={typeof value === "string" ? value : ""}
        disabled={ctx.disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={descId}
        onChange={(e) => ctx.onChange(path, e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (kind === "secret") {
    control = (
      <SecretInput
        id={inputId}
        value={typeof value === "string" ? value : ""}
        disabled={ctx.disabled}
        invalid={invalid}
        onChange={(next) => ctx.onChange(path, next)}
      />
    );
  } else {
    control = (
      <input
        id={inputId}
        type={kind === "email" ? "email" : "text"}
        className={`gs-input${invalid ? " is-invalid" : ""}`}
        value={typeof value === "string" ? value : value === null ? "" : String(value)}
        placeholder={meta?.placeholder}
        disabled={ctx.disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={descId}
        autoComplete="off"
        onChange={(e) => ctx.onChange(path, e.target.value)}
      />
    );
  }

  return (
    <FieldShell
      label={label}
      description={meta?.description}
      unit={meta?.unit}
      error={error}
      htmlFor={inputId}
      descId={descId}
    >
      {control}
    </FieldShell>
  );
}

/* ------------------------------ arrays ------------------------------ */

function ArrayField({
  fieldKey,
  value,
  meta,
  path,
  ctx,
}: {
  fieldKey: string;
  value: JsonValue[];
  meta?: FieldMeta;
  path: Path;
  ctx: RenderContext;
}) {
  const label = meta?.label || humanizeKey(fieldKey);
  const allPrimitive = value.every((item) => item === null || typeof item !== "object");
  const sample = value.find((item) => item !== null);
  const addDefault: JsonValue = typeof sample === "number" ? 0 : "";

  return (
    <div className="gs-subgroup">
      <div className="gs-subgroup-head">
        <h5>{label}</h5>
        {meta?.description && <p>{meta.description}</p>}
      </div>
      {value.length === 0 && <p className="gs-help">No items.</p>}
      <div className="gs-array">
        {value.map((item, idx) => {
          const itemPath = [...path, idx];
          return (
            <div className="gs-array-item" key={pathId(itemPath)}>
              <div className="gs-array-item-body">
                {allPrimitive ? (
                  <ScalarField
                    fieldKey={`${fieldKey} ${idx + 1}`}
                    value={item as JsonValue}
                    meta={{ ...meta, label: `${label} ${idx + 1}`, description: undefined }}
                    path={itemPath}
                    ctx={ctx}
                  />
                ) : (
                  <ValueRenderer
                    fieldKey={`${fieldKey} ${idx + 1}`}
                    value={item as JsonValue}
                    meta={meta ? { ...meta, label: `${label} ${idx + 1}` } : undefined}
                    path={itemPath}
                    ctx={ctx}
                  />
                )}
              </div>
              {!ctx.disabled && (
                <button
                  type="button"
                  className="gs-icon-btn"
                  aria-label={`Remove ${label} ${idx + 1}`}
                  onClick={() => ctx.onChange(path, value.filter((_, i) => i !== idx))}
                >
                  <X size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!ctx.disabled && allPrimitive && (
        <button
          type="button"
          className="gs-add-btn"
          onClick={() => ctx.onChange(path, [...value, addDefault])}
        >
          <Plus size={14} /> Add item
        </button>
      )}
    </div>
  );
}

/* ------------------------------ dispatcher ------------------------------ */

function ValueRenderer({
  fieldKey,
  value,
  meta,
  path,
  ctx,
}: {
  fieldKey: string;
  value: JsonValue;
  meta?: FieldMeta;
  path: Path;
  ctx: RenderContext;
}) {
  if (Array.isArray(value)) {
    return <ArrayField fieldKey={fieldKey} value={value} meta={meta} path={path} ctx={ctx} />;
  }
  if (isObject(value)) {
    return (
      <div className="gs-subgroup">
        <div className="gs-subgroup-head">
          <h5>{meta?.label || humanizeKey(fieldKey)}</h5>
          {meta?.description && <p>{meta.description}</p>}
        </div>
        <ObjectFields value={value} fields={meta?.children || {}} path={path} ctx={ctx} />
      </div>
    );
  }
  return <ScalarField fieldKey={fieldKey} value={value} meta={meta} path={path} ctx={ctx} />;
}

/* ------------------------------ object renderer ------------------------------ */

function ObjectFields({
  value,
  fields,
  path,
  ctx,
  sections,
}: {
  value: JsonObject;
  fields: Record<string, FieldMeta>;
  path: Path;
  ctx: RenderContext;
  sections?: Record<string, SectionMeta>;
}) {
  // Documented fields first (in their declared order), then every other key the API returned.
  const keys = [
    ...Object.keys(fields).filter((k) => k in value),
    ...Object.keys(value).filter((k) => !(k in fields)),
  ];

  const buckets = new Map<string, string[]>();
  keys.forEach((key) => {
    const section = fields[key]?.section ?? "";
    buckets.set(section, [...(buckets.get(section) || []), key]);
  });

  const renderKeys = (list: string[]) => {
    const toggles = list.filter((k) => {
      const v = value[k];
      return v !== undefined && !Array.isArray(v) && !isObject(v) && resolveKind(k, v, fields[k]) === "toggle";
    });
    const scalars = list.filter(
      (k) => !toggles.includes(k) && !isObject(value[k]) && !Array.isArray(value[k])
    );
    const complex = list.filter((k) => isObject(value[k]) || Array.isArray(value[k]));
    const render = (k: string) => (
      <ValueRenderer
        key={k}
        fieldKey={k}
        value={value[k] as JsonValue}
        meta={fields[k]}
        path={[...path, k]}
        ctx={ctx}
      />
    );
    return (
      <>
        {scalars.length > 0 && <div className="gs-grid">{scalars.map(render)}</div>}
        {toggles.length > 0 && <div className="gs-toggle-list">{toggles.map(render)}</div>}
        {complex.map(render)}
      </>
    );
  };

  return (
    <div className="gs-sections">
      {Array.from(buckets.entries()).map(([sectionId, list]) => {
        const section = sections?.[sectionId];
        return (
          <section className="gs-section" key={sectionId || "__default"}>
            {section && (
              <div className="gs-section-head">
                <h4>{section.title}</h4>
                {section.description && <p>{section.description}</p>}
              </div>
            )}
            {renderKeys(list)}
          </section>
        );
      })}
    </div>
  );
}

export interface SettingsFormProps {
  value: JsonObject;
  fields: Record<string, FieldMeta>;
  sections?: Record<string, SectionMeta>;
  errors: Record<string, string>;
  disabled: boolean;
  onChange: (path: Path, next: JsonValue) => void;
}

export default function SettingsForm({
  value,
  fields,
  sections,
  errors,
  disabled,
  onChange,
}: SettingsFormProps) {
  const ctx: RenderContext = { disabled, errors, onChange };
  return <ObjectFields value={value} fields={fields} sections={sections} path={[]} ctx={ctx} />;
}
