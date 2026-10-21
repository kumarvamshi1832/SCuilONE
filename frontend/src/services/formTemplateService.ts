
import { apiClient } from "./authService";

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

export const getFormTemplates = async (
  moduleName?: CRMModule,
  includeInactive = false
): Promise<FormTemplate[]> => {
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
};

export const createFormTemplate = async (
  data: CreateFormTemplate
): Promise<FormTemplate> => {
  const response = await apiClient.post<FormTemplate>(
    "/api/v1/form-templates/",
    data,
    getHeaders()
  );

  return response.data;
};

export const updateFormTemplate = async (
  id: string,
  data: UpdateFormTemplate
): Promise<FormTemplate> => {
  const response = await apiClient.patch<FormTemplate>(
    `/api/v1/form-templates/${id}`,
    data,
    getHeaders()
  );

  return response.data;
};

export const getCustomFormSubmission = async (
  moduleName: CRMModule,
  recordId: string,
  templateId: string
): Promise<CustomFormSubmission | null> => {
  try {
    const response = await apiClient.get<CustomFormSubmission>(
      `/api/v1/form-templates/submissions/${moduleName}/${recordId}`,
      {
        ...getHeaders(),
        params: { template_id: templateId },
      }
    );

    return response.data;
  } catch (error: any) {
    if (error?.response?.status === 404 || error?.status === 404) {
      return null;
    }

    throw error;
  }
};

export const saveCustomFormSubmission = async (
  data: CustomFormSubmission
) => {
  const response = await apiClient.post(
    "/api/v1/form-templates/submissions",
    data,
    getHeaders()
  );

  return response.data;
};