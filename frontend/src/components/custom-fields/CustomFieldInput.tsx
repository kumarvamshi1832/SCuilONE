import type { CustomFieldDefinition } from "../../types/customField";

interface CustomFieldInputProps {
  definition: CustomFieldDefinition;
  /** Draft value: string for text-like / number / date / select, true | false | "" for boolean, string[] for multiselect. */
  value: unknown;
  error?: string | null;
  disabled?: boolean;
  onChange: (value: unknown) => void;
}

/** One input for a tenant-defined field, rendered purely from its definition. */
export default function CustomFieldInput({ definition, value, error, disabled, onChange }: CustomFieldInputProps) {
  const id = `cf-${definition.entity}-${definition.field_key}`;
  const describedBy = [definition.help_text ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    disabled,
    "aria-invalid": Boolean(error),
    "aria-describedby": describedBy,
    "aria-required": definition.is_required,
  } as const;
  const text = typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);

  let control;
  switch (definition.field_type) {
    case "textarea":
      control = <textarea {...common} rows={3} maxLength={5000} value={text} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
      control = <input {...common} type="number" step="any" value={text} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "date":
      control = <input {...common} type="date" value={text} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "email":
      control = <input {...common} type="email" maxLength={255} value={text} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "url":
      control = <input {...common} type="url" maxLength={500} placeholder="https://" value={text} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "boolean":
      control = (
        <select
          {...common}
          value={value === true ? "true" : value === false ? "false" : ""}
          onChange={(e) => onChange(e.target.value === "true" ? true : e.target.value === "false" ? false : "")}
        >
          <option value="">Not set</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
      break;
    case "select":
      control = (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(definition.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
      break;
    case "multiselect": {
      const selected = Array.isArray(value) ? value.map(String) : [];
      control = (
        <div className="cf-checks" role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
          {(definition.options ?? []).map((option) => (
            <label key={option} className="cf-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.includes(option)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, option] : selected.filter((item) => item !== option))
                }
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    default:
      control = <input {...common} type="text" maxLength={255} value={text} onChange={(e) => onChange(e.target.value)} />;
  }

  return (
    <div className={`cf-field ${error ? "has-error" : ""}`}>
      <label id={`${id}-label`} htmlFor={definition.field_type === "multiselect" ? undefined : id}>
        {definition.label}
        {definition.is_required && <span className="cf-required" aria-hidden="true"> *</span>}
      </label>
      {control}
      {definition.help_text && (
        <small id={`${id}-help`} className="cf-help">
          {definition.help_text}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="cf-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}
