export interface IndustryModuleInfo {
  key: string;
  label: string;
  endpoint: string;
  industry_specific: boolean;
  api_available: boolean;
}

export interface TenantIndustryConfigResponse {
  tenant_id: string;
  industry: string;
  industry_key: string;
  industry_pack: string | null;
  industry_pack_id: string | null;
  enabled_modules: string[];
  modules: IndustryModuleInfo[];
  settings: Record<string, any>;
  dashboard_widgets: string[];
  report_widgets: string[];
  custom_labels: Record<string, string>;
  related_activity_modules: string[];
}

export interface IndustryPackSummary {
  id: string;
  pack_key: string;
  name: string;
  description?: string | null;
  version?: string | null;
  default_modules: string[];
  settings: Record<string, any>;
  dashboard_widgets: string[];
  report_widgets: string[];
}

export interface IndustryConfigUpdate {
  enabled_modules?: string[];
  settings?: Record<string, any>;
  dashboard_widgets?: string[];
  report_widgets?: string[];
  custom_labels?: Record<string, string>;
}

