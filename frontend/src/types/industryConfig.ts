export interface IndustryModuleInfo {
  key: string;
  label: string;
  endpoint: string;
  industry_specific: boolean;
  api_available: boolean;
  enabled?: boolean;
}

export interface IndustryPackObject {
  key: string;
  name: string;
  version?: string | null;
}

export interface TenantIndustryConfigResponse {
  tenant_id: string;
  tenant_name?: string;
  industry: string;
  industry_key: string;
  industry_pack: string | IndustryPackObject | null;
  industry_pack_id?: string | null;
  enabled_modules: string[];
  modules: IndustryModuleInfo[];
  common_modules?: IndustryModuleInfo[];
  industry_modules?: IndustryModuleInfo[];
  related_activity_modules?: string[];
  settings?: Record<string, any>;
  configuration?: Record<string, any>;
  configuration_overrides?: Record<string, any>;
  dashboard_widgets?: string[];
  report_widgets?: string[];
  custom_labels?: Record<string, string>;
}

export interface IndustryPackSummary {
  id?: string;
  key?: string;
  pack_key?: string;
  name: string;
  description?: string | null;
  version?: string | null;
  default_modules?: string[];
  default_config?: {
    enabled_modules?: string[];
    settings?: Record<string, any>;
    dashboard_widgets?: string[];
    report_widgets?: string[];
    [key: string]: any;
  };
  settings?: Record<string, any>;
  dashboard_widgets?: string[];
  report_widgets?: string[];
}

export interface IndustryConfigUpdate {
  enabled_modules?: string[];
  settings?: Record<string, any>;
  dashboard_widgets?: string[];
  report_widgets?: string[];
  custom_labels?: Record<string, string>;
}
