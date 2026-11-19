/**
 * Tenant-defined custom fields. Mirrors backend/app/routes/custom_fields.py and
 * backend/app/services/custom_fields.py. Definitions are tenant specific - never hardcode field keys.
 */

export const CUSTOM_FIELD_ENTITIES = ["lead", "contact", "account", "deal"] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "boolean",
  "select",
  "multiselect",
  "email",
  "url",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  textarea: "Textarea",
  number: "Number",
  date: "Date",
  boolean: "Boolean (Yes / No)",
  select: "Select",
  multiselect: "Multiselect",
  email: "Email",
  url: "URL",
};

export const isOptionType = (type: string): boolean => type === "select" || type === "multiselect";

/** Backend limits. */
export const CUSTOM_FIELD_LIMITS = {
  keyMin: 2,
  keyMax: 50,
  labelMax: 100,
  helpTextMax: 255,
  positionMax: 1000,
  optionMax: 100,
  optionsMin: 1,
  optionsMax: 50,
  activePerEntity: 40,
  textMax: 255,
  textareaMax: 5000,
  urlMax: 500,
} as const;

/** Must match KEY_RE in services/custom_fields.py. */
export const CUSTOM_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{1,49}$/;

/** Item of GET /custom-fields/definitions. */
export interface CustomFieldDefinition {
  id: string;
  entity: CustomFieldEntity;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string[] | null;
  help_text: string | null;
  is_required: boolean;
  is_active: boolean;
  position: number;
}

export interface CustomFieldDefinitionCreate {
  entity: CustomFieldEntity;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options?: string[] | null;
  help_text?: string | null;
  is_required?: boolean;
  position?: number;
}

/** PUT /custom-fields/definitions/{id}. Entity, key and type cannot be changed after creation. */
export interface CustomFieldDefinitionUpdate {
  label?: string;
  options?: string[] | null;
  help_text?: string | null;
  is_required?: boolean;
  is_active?: boolean;
  position?: number;
}

/** A definition together with the record's stored value (GET /custom-fields/values/{entity}/{id}). */
export interface CustomFieldValueItem extends CustomFieldDefinition {
  value: unknown;
}

export interface CustomFieldValuesResponse {
  entity: CustomFieldEntity;
  record_id: string;
  fields: CustomFieldValueItem[];
}

export interface CustomFieldValuesSaved {
  entity: CustomFieldEntity;
  record_id: string;
  custom_fields: Record<string, unknown>;
}

/** Field-level errors returned with HTTP 422: { detail: { message, errors: { field_key: text } } }. */
export type CustomFieldErrors = Record<string, string>;
