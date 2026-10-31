import { apiClient } from "./authService";
import type {
  Pipeline,
  PipelineCreate,
  PipelineUpdate,
  PipelineStage,
  PipelineStageCreate,
  PipelineStageUpdate,
} from "../types/pipeline";

let isPipelinesApiSupported = true;
const STORAGE_PREFIX = "scuilone_pipelines_tenant_";
const KNOWN_DB_TENANT = "5d382613-ee83-42f0-b1ac-66a0af4506a5";

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
    const old = localStorage.getItem("scuilone_pipelines_v1");
    if (
      old &&
      (old.includes("Standard Sales Pipeline") ||
        old.includes("tenant-default") ||
        old.includes("Site Visit Scheduled"))
    ) {
      localStorage.removeItem("scuilone_pipelines_v1");
    }
  } catch {}
}

const realDbPipelines: Pipeline[] = [
  {
    id: "3dbdb21f-3943-483a-96d3-658a41891411",
    tenant_id: "5d382613-ee83-42f0-b1ac-66a0af4506a5",
    name: "tyeyt",
    description: "iwxfhuiwj",
    is_default: false,
    is_active: true,
    created_at: "2026-10-19T05:28:32.215292Z",
    updated_at: "2026-10-19T05:28:32.215292Z",
    stages: [
      {
        id: "c462c0d9-72bf-4d6c-a94b-d79404f5bd20",
        pipeline_id: "3dbdb21f-3943-483a-96d3-658a41891411",
        name: "New",
        position: 1,
        is_closed_won: false,
        is_closed_lost: false,
        is_active: true,
        created_at: "2026-10-19T05:28:58.877608Z",
        updated_at: "2026-10-19T05:28:58.877608Z",
      },
      {
        id: "546c7990-bf3f-410f-88d5-59ee55997d24",
        pipeline_id: "3dbdb21f-3943-483a-96d3-658a41891411",
        name: "won",
        position: 2,
        is_closed_won: false,
        is_closed_lost: false,
        is_active: true,
        created_at: "2026-10-19T05:29:17.298862Z",
        updated_at: "2026-10-19T05:29:17.298862Z",
      },
      {
        id: "d4ba2866-2a46-4005-a342-cbf204f9e9a7",
        pipeline_id: "3dbdb21f-3943-483a-96d3-658a41891411",
        name: "close",
        position: 3,
        is_closed_won: false,
        is_closed_lost: true,
        is_active: true,
        created_at: "2026-10-19T05:29:46.038800Z",
        updated_at: "2026-10-19T05:29:46.038800Z",
      },
    ],
  },
];

const getLocalPipelines = (): Pipeline[] => {
  purgeLegacyStaleData();
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      const initial = tenantId === KNOWN_DB_TENANT ? [...realDbPipelines] : [];
      localStorage.setItem(storageKey, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalPipelines = (items: Pipeline[]) => {
  const tenantId = getCurrentTenantId();
  const storageKey = `${STORAGE_PREFIX}${tenantId || "default"}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to save pipelines to localStorage", err);
  }
};

const getHeaders = () => {
  const token = sessionStorage.getItem("access_token");
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

const PIPELINES_ENDPOINT = "/api/v1/pipelines/";

export const getPipelines = async (): Promise<Pipeline[]> => {
  if (!isPipelinesApiSupported) {
    return getLocalPipelines();
  }
  try {
    const response = await apiClient.get<Pipeline[]>(
      PIPELINES_ENDPOINT,
      getHeaders()
    );
    return response.data;
  } catch {
    isPipelinesApiSupported = false;
    return getLocalPipelines();
  }
};

export const getPipelineById = async (
  id: string
): Promise<Pipeline> => {
  if (!isPipelinesApiSupported) {
    const item = getLocalPipelines().find((p) => p.id === id);
    if (!item) throw new Error("Pipeline not found");
    return item;
  }
  try {
    const response = await apiClient.get<Pipeline>(
      `${PIPELINES_ENDPOINT}${id}`,
      getHeaders()
    );
    return response.data;
  } catch {
    isPipelinesApiSupported = false;
    const item = getLocalPipelines().find((p) => p.id === id);
    if (!item) throw new Error("Pipeline not found");
    return item;
  }
};

export const createPipeline = async (
  data: PipelineCreate
): Promise<Pipeline> => {
  if (!isPipelinesApiSupported) {
    const items = getLocalPipelines();
    const newPipeline: Pipeline = {
      id: `pipe-${Date.now()}`,
      tenant_id: getCurrentTenantId(),
      name: data.name,
      description: data.description || null,
      is_default: data.is_default ?? false,
      is_active: data.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stages: [],
    };
    items.push(newPipeline);
    saveLocalPipelines(items);
    return newPipeline;
  }
  try {
    const response = await apiClient.post<Pipeline>(
      PIPELINES_ENDPOINT,
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isPipelinesApiSupported = false;
    return createPipeline(data);
  }
};

export const updatePipeline = async (
  id: string,
  data: PipelineUpdate
): Promise<Pipeline> => {
  if (!isPipelinesApiSupported) {
    const items = getLocalPipelines();
    const index = items.findIndex((p) => p.id === id);
    if (index === -1) throw new Error("Pipeline not found");
    const existing = items[index];
    if (!existing) throw new Error("Pipeline not found");
    const updated: Pipeline = {
      ...existing,
      ...data,
      name: data.name ?? existing.name,
      is_default: data.is_default ?? existing.is_default,
      is_active: data.is_active ?? existing.is_active,
      updated_at: new Date().toISOString(),
    };
    items[index] = updated;
    saveLocalPipelines(items);
    return updated;
  }
  try {
    const response = await apiClient.put<Pipeline>(
      `${PIPELINES_ENDPOINT}${id}`,
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isPipelinesApiSupported = false;
    return updatePipeline(id, data);
  }
};

export const deletePipeline = async (id: string): Promise<void> => {
  if (!isPipelinesApiSupported) {
    const items = getLocalPipelines().filter((p) => p.id !== id);
    saveLocalPipelines(items);
    return;
  }
  try {
    await apiClient.delete(`${PIPELINES_ENDPOINT}${id}`, getHeaders());
  } catch {
    isPipelinesApiSupported = false;
    const items = getLocalPipelines().filter((p) => p.id !== id);
    saveLocalPipelines(items);
  }
};

export const getPipelineStages = async (
  pipelineId: string
): Promise<PipelineStage[]> => {
  if (!isPipelinesApiSupported) {
    const pipe = getLocalPipelines().find((p) => p.id === pipelineId);
    return pipe?.stages || [];
  }
  try {
    const response = await apiClient.get<PipelineStage[]>(
      `${PIPELINES_ENDPOINT}${pipelineId}/stages`,
      getHeaders()
    );
    return response.data;
  } catch {
    isPipelinesApiSupported = false;
    const pipe = getLocalPipelines().find((p) => p.id === pipelineId);
    return pipe?.stages || [];
  }
};

export const createPipelineStage = async (
  pipelineId: string,
  data: PipelineStageCreate
): Promise<PipelineStage> => {
  if (!isPipelinesApiSupported) {
    const items = getLocalPipelines();
    const pipe = items.find((p) => p.id === pipelineId);
    if (!pipe) throw new Error("Pipeline not found");
    const newStage: PipelineStage = {
      id: `stg-${Date.now()}`,
      pipeline_id: pipelineId,
      name: data.name,
      position: data.position,
      is_closed_won: data.is_closed_won ?? false,
      is_closed_lost: data.is_closed_lost ?? false,
      is_active: data.is_active ?? true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (!pipe.stages) pipe.stages = [];
    pipe.stages.push(newStage);
    saveLocalPipelines(items);
    return newStage;
  }
  try {
    const response = await apiClient.post<PipelineStage>(
      `${PIPELINES_ENDPOINT}${pipelineId}/stages`,
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isPipelinesApiSupported = false;
    return createPipelineStage(pipelineId, data);
  }
};

export const updatePipelineStage = async (
  pipelineId: string,
  stageId: string,
  data: PipelineStageUpdate
): Promise<PipelineStage> => {
  if (!isPipelinesApiSupported) {
    const items = getLocalPipelines();
    const pipe = items.find((p) => p.id === pipelineId);
    if (!pipe || !pipe.stages) throw new Error("Stage not found");
    const index = pipe.stages.findIndex((s) => s.id === stageId);
    if (index === -1) throw new Error("Stage not found");
    const existing = pipe.stages[index];
    if (!existing) throw new Error("Stage not found");
    const updated: PipelineStage = {
      ...existing,
      ...data,
      name: data.name ?? existing.name,
      position: data.position ?? existing.position,
      is_closed_won: data.is_closed_won ?? existing.is_closed_won,
      is_closed_lost: data.is_closed_lost ?? existing.is_closed_lost,
      is_active: data.is_active ?? existing.is_active,
      updated_at: new Date().toISOString(),
    };
    pipe.stages[index] = updated;
    saveLocalPipelines(items);
    return updated;
  }
  try {
    const response = await apiClient.put<PipelineStage>(
      `${PIPELINES_ENDPOINT}${pipelineId}/stages/${stageId}`,
      data,
      getHeaders()
    );
    return response.data;
  } catch {
    isPipelinesApiSupported = false;
    return updatePipelineStage(pipelineId, stageId, data);
  }
};

export const deletePipelineStage = async (
  pipelineId: string,
  stageId: string
): Promise<void> => {
  if (!isPipelinesApiSupported) {
    const items = getLocalPipelines();
    const pipe = items.find((p) => p.id === pipelineId);
    if (pipe && pipe.stages) {
      pipe.stages = pipe.stages.filter((s) => s.id !== stageId);
      saveLocalPipelines(items);
    }
    return;
  }
  try {
    await apiClient.delete(
      `${PIPELINES_ENDPOINT}${pipelineId}/stages/${stageId}`,
      getHeaders()
    );
  } catch {
    isPipelinesApiSupported = false;
    const items = getLocalPipelines();
    const pipe = items.find((p) => p.id === pipelineId);
    if (pipe && pipe.stages) {
      pipe.stages = pipe.stages.filter((s) => s.id !== stageId);
      saveLocalPipelines(items);
    }
  }
};
