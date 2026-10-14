
export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  is_closed_won: boolean;
  is_closed_lost: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Pipeline {
  id: string;
  tenant_id?: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  stages?: PipelineStage[];
}

export interface PipelineCreate {
  name: string;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export interface PipelineUpdate {
  name?: string;
  description?: string | null;
  is_default?: boolean;
  is_active?: boolean;
}

export interface PipelineStageCreate {
  name: string;
  position: number;
  is_closed_won?: boolean;
  is_closed_lost?: boolean;
  is_active?: boolean;
}

export interface PipelineStageUpdate {
  name?: string;
  position?: number;
  is_closed_won?: boolean;
  is_closed_lost?: boolean;
  is_active?: boolean;
}