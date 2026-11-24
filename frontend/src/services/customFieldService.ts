import { apiClient } from "./authService";
import type {
  CustomFieldDefinition,
  CustomFieldDefinitionCreate,
  CustomFieldDefinitionUpdate,
  CustomFieldEntity,
  CustomFieldErrors,
  CustomFieldValuesResponse,
  CustomFieldValuesSaved,
} from "../types/customField";

/**
 * Custom fields. Backend: /api/v1/custom-fields (staff access token).
 *   GET    /definitions?entity&include_inactive      custom_field.view
 *   POST   /definitions                              custom_field.manage  (409 duplicate key, 422 invalid / too many)
 *   PUT    /definitions/{id}                         custom_field.manage
 *   DELETE /definitions/{id}                         custom_field.manage  (deactivates; stored values are kept)
 *   GET    /values/{entity}/{record_id}              {entity}.view   -> active fields with this record's value
 *   PUT    /values/{entity}/{record_id}              {entity}.update { values: { field_key: value } }
 *                                                    partial update; null / "" / [] clears; every required field must end up filled
 */

const BASE = "/api/v1/custom-fields";

let backendCustomFieldsAvailable: boolean | null = null;

export const isCustomFieldsSupported = (): boolean => backendCustomFieldsAvailable !== false;

export const getCustomFieldDefinitions = async (
  options: { entity?: CustomFieldEntity; includeInactive?: boolean } = {},
  signal?: AbortSignal
): Promise<CustomFieldDefinition[]> => {
  if (backendCustomFieldsAvailable === false) {
    return [];
  }
  try {
    const response = await apiClient.get<CustomFieldDefinition[]>(`${BASE}/definitions`, {
      params: {
        entity: options.entity || undefined,
        include_inactive: options.includeInactive ? true : undefined,
      },
      signal,
    });
    backendCustomFieldsAvailable = true;
    return Array.isArray(response.data) ? response.data : [];
  } catch (err: any) {
    if (err?.response?.status === 404) {
      backendCustomFieldsAvailable = false;
      return [];
    }
    throw err;
  }
};

export const createCustomFieldDefinition = async (
  data: CustomFieldDefinitionCreate
): Promise<CustomFieldDefinition> => {
  if (backendCustomFieldsAvailable === false) {
    throw new Error("Custom Fields module is not registered on the server.");
  }
  const response = await apiClient.post<CustomFieldDefinition>(`${BASE}/definitions`, data);
  return response.data;
};

export const updateCustomFieldDefinition = async (
  definitionId: string,
  data: CustomFieldDefinitionUpdate
): Promise<CustomFieldDefinition> => {
  if (backendCustomFieldsAvailable === false) {
    throw new Error("Custom Fields module is not registered on the server.");
  }
  const response = await apiClient.put<CustomFieldDefinition>(`${BASE}/definitions/${definitionId}`, data);
  return response.data;
};

export const deactivateCustomFieldDefinition = async (definitionId: string): Promise<void> => {
  if (backendCustomFieldsAvailable === false) {
    return;
  }
  await apiClient.delete(`${BASE}/definitions/${definitionId}`);
};

export const getCustomFieldValues = async (
  entity: CustomFieldEntity,
  recordId: string,
  signal?: AbortSignal
): Promise<CustomFieldValuesResponse> => {
  if (backendCustomFieldsAvailable === false) {
    return { entity, record_id: recordId, fields: [] };
  }
  try {
    const response = await apiClient.get<CustomFieldValuesResponse>(
      `${BASE}/values/${entity}/${recordId}`,
      { signal }
    );
    backendCustomFieldsAvailable = true;
    return {
      ...response.data,
      fields: Array.isArray(response.data?.fields) ? response.data.fields : [],
    };
  } catch (err: any) {
    if (err?.response?.status === 404) {
      backendCustomFieldsAvailable = false;
      return { entity, record_id: recordId, fields: [] };
    }
    throw err;
  }
};

export const setCustomFieldValues = async (
  entity: CustomFieldEntity,
  recordId: string,
  values: Record<string, unknown>
): Promise<CustomFieldValuesSaved> => {
  if (backendCustomFieldsAvailable === false) {
    throw new Error("Custom Fields module is not registered on the server.");
  }
  const response = await apiClient.put<CustomFieldValuesSaved>(`${BASE}/values/${entity}/${recordId}`, { values });
  return response.data;
};

/** Pulls the per-field messages out of a 422 response, or null when the error is not a field validation error. */
export const extractCustomFieldErrors = (err: unknown): CustomFieldErrors | null => {
  const detail = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response?.data?.detail;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const errors = (detail as { errors?: unknown }).errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return null;
  const out: CustomFieldErrors = {};
  Object.entries(errors as Record<string, unknown>).forEach(([key, value]) => {
    if (typeof value === "string") out[key] = value;
  });
  return Object.keys(out).length > 0 ? out : null;
};
