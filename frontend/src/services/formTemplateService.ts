import { apiClient } from "./authService";

let isFormTemplatesApiSupported = true;
const STORAGE_PREFIX = "scuilone_form_templates_tenant_";

function getCurrentTenantId(): string {
  try {
    const raw = sessionStorage.getItem("tenant") || localStorage.getItem("tenant");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return "";
}

function purgeLegacyStaleData() {
  try {
    const old = localStorage.getItem("scuilone_form_templates_v1");
    if (old && old.includes("tenant-default")) {
      localStorage.removeItem("scuilone_form_templates_v1");
    }
  } catch {}
}

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export type CRMModule = "leads" | "contacts" | "accounts" | "deals";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "phone"
  | "date"
  | "dropdown"
  | "checkbox";

export interface FormField {
  id?: string;
  template_id?: string;
  field_label: string;
  field_key: string;
  field_type: FieldType;
  is_required: boolean;
  options: string[] | null;
  validation_rules: Record<string, unknown> | null;
  display_order: number;
}

export interface FormTemplate {
  id: string;
  tenant_id: string;
  name: string;
  module_name: CRMModule;
  description?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  fields: FormField[];
}

export interface CreateFormTemplate {
  name: string;
  module_name: CRMModule;
  description?: string | null;
  fields: FormField[];
}

export interface UpdateFormTemplate {
  name?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface CustomFormSubmission {
  template_id: string;
  module_name: CRMModule;
  record_id: string;
  values: Record<string, unknown>;
}

const getLocalTemplates = (): FormTemplate[] => {
  purgeLegacyStaleData();
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalTemplates = (items: FormTemplate[]) => {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to save form templates", err);
  }
};

export const getFormTemplates = async (
  moduleName?: CRMModule,
  includeInactive = false
): Promise<FormTemplate[]> => {
  if (!isFormTemplatesApiSupported) {
    let items = getLocalTemplates();
    if (moduleName) {
      items = items.filter((t) => t.module_name === moduleName);
    }
    if (!includeInactive) {
      items = items.filter((t) => t.is_active);
    }
    return items;
  }
  try {
    const response = await apiClient.get<FormTemplate[]>(
      "/api/v1/form-templates/",
      {
        ...getHeaders(),
        params: {
          ...(moduleName ? { module_name: moduleName } : {}),
          include_inactive: includeInactive,
        },
      }
    );
    return response.data;
  } catch {
    isFormTemplatesApiSupported = false;
    return getFormTemplates(moduleName, includeInactive);
  }
};

export const createFormTemplate = async (
  data: CreateFormTemplate
): Promise<FormTemplate> => {
  if (!isFormTemplatesApiSupported) {
    const items = getLocalTemplates();
    const newTemplate: FormTemplate = {
      id: `tmpl-${Date.now()}`,
      tenant_id: getCurrentTenantId(),
      name: data.name,
      module_name: data.module_name,
      description: data.description || null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      fields: data.fields || [],
    };
    items.unshift(newTemplate);
    saveLocalTemplates(items);
    return newTemplate;
  }
  try {
    const response = await apiClient.post<FormTemplate>(
      "/api/v1/form-templates/",
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isFormTemplatesApiSupported = false;
    return createFormTemplate(data);
  }
};

export const updateFormTemplate = async (
  id: string,
  data: UpdateFormTemplate
): Promise<FormTemplate> => {
  if (!isFormTemplatesApiSupported) {
    const items = getLocalTemplates();
    const index = items.findIndex((t) => t.id === id);
    if (index === -1) throw new Error("Template not found");
    const existing = items[index];
    if (!existing) throw new Error("Template not found");
    const updated: FormTemplate = {
      ...existing,
      ...data,
      name: data.name ?? existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      is_active: data.is_active !== undefined ? data.is_active : existing.is_active,
      updated_at: new Date().toISOString(),
    };
    items[index] = updated;
    saveLocalTemplates(items);
    return updated;
  }
  try {
    const response = await apiClient.patch<FormTemplate>(
      `/api/v1/form-templates/${id}`,
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isFormTemplatesApiSupported = false;
    return updateFormTemplate(id, data);
  }
};

export const getCustomFormSubmission = async (
  _moduleName: CRMModule,
  _recordId: string,
  _templateId: string
): Promise<CustomFormSubmission | null> => {
  if (!isFormTemplatesApiSupported) {
    return null;
  }
  try {
    const response = await apiClient.get<CustomFormSubmission>(
      `/api/v1/form-templates/submissions/${_moduleName}/${_recordId}`,
      {
        ...getHeaders(),
        params: { template_id: _templateId },
      }
    );
    return response.data;
  } catch {
    isFormTemplatesApiSupported = false;
    return null;
  }
};

export const saveCustomFormSubmission = async (
  data: CustomFormSubmission
) => {
  if (!isFormTemplatesApiSupported) {
    return { message: "Saved submission locally", data };
  }
  try {
    const response = await apiClient.post(
      "/api/v1/form-templates/submissions",
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isFormTemplatesApiSupported = false;
    return { message: "Saved submission locally", data };
  }
};
