import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type {
  Pipeline,
  PipelineStage,
  PipelineCreate,
  PipelineStageCreate,
} from "../../types/pipeline";
import {
  getPipelines,
  createPipeline,
  updatePipeline,
  deletePipeline,
  getPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
} from "../../services/pipelineService";
import "./Pipelines.css";

export default function Pipelines() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState("");
  const [stages, setStages] = useState<PipelineStage[]>([]);

  const [loading, setLoading] = useState(true);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(
    null
  );
  const [pipelineName, setPipelineName] = useState("");
  const [pipelineDescription, setPipelineDescription] = useState("");
  const [pipelineActive, setPipelineActive] = useState(true);
  const [pipelineDefault, setPipelineDefault] = useState(false);

  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [stageName, setStageName] = useState("");
  const [stagePosition, setStagePosition] = useState(1);
  const [stageActive, setStageActive] = useState(true);
  const [stageWon, setStageWon] = useState(false);
  const [stageLost, setStageLost] = useState(false);
  const [stageFormOpen, setStageFormOpen] = useState(false);

  const selectedPipeline = pipelines.find(
    (pipeline) => pipeline.id === selectedPipelineId
  );

  const showError = (err: unknown, fallback: string) => {
    const problem = err as {
      response?: {
        data?: {
          detail?: string;
          message?: string;
        };
      };
      message?: string;
    };

    setError(
      problem?.response?.data?.detail ||
        problem?.response?.data?.message ||
        problem?.message ||
        fallback
    );
  };

  const loadPipelines = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await getPipelines();

      setPipelines(data);

      setSelectedPipelineId((current) => {
        if (current && data.some((pipeline) => pipeline.id === current)) {
          return current;
        }

        return data[0]?.id ?? "";
      });
    } catch (err: unknown) {
      showError(err, "Unable to load pipelines.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStages = useCallback(async (pipelineId: string) => {
    if (!pipelineId) {
      setStages([]);
      setStagesLoading(false);
      return;
    }

    setStagesLoading(true);

    try {
      const data = await getPipelineStages(pipelineId);
      setStages([...data].sort((a, b) => a.position - b.position));
    } catch (err: unknown) {
      showError(err, "Unable to load pipeline stages.");
      setStages([]);
    } finally {
      setStagesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    void loadStages(selectedPipelineId);
  }, [selectedPipelineId, loadStages]);

  const resetPipelineForm = () => {
    setEditingPipelineId(null);
    setPipelineName("");
    setPipelineDescription("");
    setPipelineActive(true);
    setPipelineDefault(false);
  };

  const openCreatePipeline = () => {
    setError("");
    setNotice("");
    resetPipelineForm();
    document.getElementById("pipeline-name")?.focus();
  };

  const openEditPipeline = (pipeline: Pipeline) => {
    setError("");
    setNotice("");
    setEditingPipelineId(pipeline.id);
    setSelectedPipelineId(pipeline.id);
    setPipelineName(pipeline.name);
    setPipelineDescription(pipeline.description ?? "");
    setPipelineActive(pipeline.is_active);
    setPipelineDefault(pipeline.is_default);
    setStageFormOpen(false);

    document.getElementById("pipeline-name")?.focus();
  };

  const handlePipelineSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const name = pipelineName.trim();

    if (!name) {
      setError("Pipeline name is required.");
      return;
    }

    const data: PipelineCreate = {
      name,
      description: pipelineDescription.trim() || null,
      is_active: pipelineActive,
      is_default: pipelineDefault,
    };

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingPipelineId) {
        await updatePipeline(editingPipelineId, data);

        setNotice("Pipeline updated successfully.");
        await loadPipelines();
      } else {
        const created = await createPipeline(data);

        setSelectedPipelineId(created.id);
        setNotice("Pipeline created successfully.");
        await loadPipelines();
      }

      resetPipelineForm();
    } catch (err: unknown) {
      showError(err, "Unable to save pipeline.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePipeline = async (pipeline: Pipeline) => {
    const confirmed = window.confirm(
      `Delete the pipeline "${pipeline.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    setError("");
    setNotice("");

    try {
      await deletePipeline(pipeline.id);

      if (editingPipelineId === pipeline.id) {
        resetPipelineForm();
      }

      if (selectedPipelineId === pipeline.id) {
        setStages([]);
        setStageFormOpen(false);
      }

      await loadPipelines();
      setNotice("Pipeline deleted successfully.");
    } catch (err: unknown) {
      showError(err, "Unable to delete pipeline.");
    }
  };

  const resetStageForm = () => {
    setStageFormOpen(false);
    setEditingStageId(null);
    setStageName("");
    setStagePosition(stages.length + 1);
    setStageActive(true);
    setStageWon(false);
    setStageLost(false);
  };

  const openCreateStage = () => {
    if (!selectedPipelineId) {
      setError("Create or select a pipeline before adding stages.");
      return;
    }

    setError("");
    setNotice("");
    setEditingStageId(null);
    setStageName("");
    setStagePosition(stages.length + 1);
    setStageActive(true);
    setStageWon(false);
    setStageLost(false);
    setStageFormOpen(true);
  };

  const openEditStage = (stage: PipelineStage) => {
    setError("");
    setNotice("");
    setEditingStageId(stage.id);
    setStageName(stage.name);
    setStagePosition(stage.position);
    setStageActive(stage.is_active);
    setStageWon(stage.is_closed_won);
    setStageLost(stage.is_closed_lost);
    setStageFormOpen(true);
  };

  const handleStageSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPipelineId) {
      setError("Select a pipeline first.");
      return;
    }

    if (!stageName.trim()) {
      setError("Stage name is required.");
      return;
    }

    if (!Number.isInteger(stagePosition) || stagePosition < 1) {
      setError("Stage position must be a positive whole number.");
      return;
    }

    if (stageWon && stageLost) {
      setError("A stage cannot be both Closed Won and Closed Lost.");
      return;
    }

    const data: PipelineStageCreate = {
      name: stageName.trim(),
      position: stagePosition,
      is_active: stageActive,
      is_closed_won: stageWon,
      is_closed_lost: stageLost,
    };

    setSaving(true);
    setError("");
    setNotice("");

    try {
      if (editingStageId) {
        await updatePipelineStage(
          selectedPipelineId,
          editingStageId,
          data
        );

        setNotice("Stage updated successfully.");
      } else {
        await createPipelineStage(selectedPipelineId, data);
        setNotice("Stage created successfully.");
      }

      setStageFormOpen(false);
      setEditingStageId(null);
      setStageName("");
      setStageWon(false);
      setStageLost(false);
      setStageActive(true);

      await loadStages(selectedPipelineId);
    } catch (err: unknown) {
      showError(err, "Unable to save stage.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStage = async (stage: PipelineStage) => {
    if (!selectedPipelineId) return;

    if (!window.confirm(`Delete the stage "${stage.name}"?`)) return;

    setError("");
    setNotice("");

    try {
      await deletePipelineStage(selectedPipelineId, stage.id);
      await loadStages(selectedPipelineId);
      setNotice("Stage deleted successfully.");
    } catch (err: unknown) {
      showError(err, "Unable to delete stage.");
    }
  };

  return (
    <div className="pipelines-page">
      <header className="pipelines-header">
        <div>
          <div className="pipeline-breadcrumb">
            <span>‹</span> Sales Management / Pipelines
          </div>

          <h1>{editingPipelineId ? "Edit Pipeline" : "Create Pipeline"}</h1>

          <p>
            Define your sales pipeline and add stages to match your business
            process.
          </p>
        </div>

        <button
          className="pipeline-primary-btn"
          type="button"
          onClick={openCreatePipeline}
        >
          ＋ Create Pipeline
        </button>
      </header>

      {error && (
        <div className="pipeline-alert pipeline-alert-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {notice && (
        <div className="pipeline-alert pipeline-alert-success" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <div className="pipeline-creation-layout">
        <main className="pipeline-main-column">
          <div className="pipeline-form-card">
            <form id="pipeline-form" onSubmit={handlePipelineSubmit}>
              <div className="pipeline-section-heading">
                <div>
                  <h2>Pipeline Details</h2>
                  <p>
                    Set up the name and preferences for your sales process.
                  </p>
                </div>
              </div>

              <div className="pipeline-form-grid">
                <label>
                  Pipeline Name <span className="pipeline-required">*</span>
                  <input
                    id="pipeline-name"
                    value={pipelineName}
                    onChange={(event) => setPipelineName(event.target.value)}
                    placeholder="e.g. Real Estate Sales"
                    maxLength={150}
                    required
                  />
                </label>

                <label>
                  Description
                  <textarea
                    value={pipelineDescription}
                    onChange={(event) =>
                      setPipelineDescription(event.target.value)
                    }
                    placeholder="Describe the purpose of this pipeline"
                    rows={3}
                  />
                </label>
              </div>

              <div className="pipeline-options-row">
                <label className="pipeline-option">
                  <span>
                    <strong>Set as Default Pipeline</strong>
                    <small>Automatically select it for new deals.</small>
                  </span>

                  <input
                    type="checkbox"
                    checked={pipelineDefault}
                    onChange={(event) =>
                      setPipelineDefault(event.target.checked)
                    }
                  />
                </label>

                <label className="pipeline-option">
                  <span>
                    <strong>Active</strong>
                    <small>Allow this pipeline to be used.</small>
                  </span>

                  <input
                    type="checkbox"
                    checked={pipelineActive}
                    onChange={(event) =>
                      setPipelineActive(event.target.checked)
                    }
                  />
                </label>
              </div>

              <div className="pipeline-form-actions">
                <button
                  className="pipeline-secondary-btn"
                  type="button"
                  onClick={openCreatePipeline}
                >
                  Clear Form
                </button>

                <button
                  className="pipeline-primary-btn"
                  type="submit"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingPipelineId
                      ? "Save Changes"
                      : "Create Pipeline"}
                </button>
              </div>
            </form>

            {selectedPipeline && (
              <section className="pipeline-selected-details">
                <div className="pipeline-selected-copy">
                  <span className="pipeline-selected-label">
                    Currently Selected Pipeline
                  </span>

                  <h3>{selectedPipeline.name}</h3>

                  <p>
                    {selectedPipeline.description ||
                      "No description provided."}
                  </p>
                </div>

                <div className="pipeline-selected-badges">
                  <span
                    className={`pipeline-status ${
                      selectedPipeline.is_active ? "active" : "inactive"
                    }`}
                  >
                    {selectedPipeline.is_active ? "Active" : "Inactive"}
                  </span>

                  {selectedPipeline.is_default && (
                    <span className="pipeline-status default">Default</span>
                  )}
                </div>
              </section>
            )}

            <div className="pipeline-section-heading pipeline-stage-heading">
              <div>
                <h2>Pipeline Stages</h2>
                <p>Add and manage the stages your deals move through.</p>
              </div>

              <button
                className="pipeline-outline-btn"
                type="button"
                onClick={openCreateStage}
                disabled={!selectedPipelineId || saving}
              >
                ＋ Add Stage
              </button>
            </div>

            {!selectedPipelineId && (
              <div className="pipeline-inline-info">
                Create your pipeline first. You can then add and manage its
                stages here.
              </div>
            )}

            {stageFormOpen && (
              <form
                className="pipeline-stage-form"
                onSubmit={handleStageSubmit}
              >
                <h3>{editingStageId ? "Edit Stage" : "Add New Stage"}</h3>

                <div className="pipeline-stage-form-grid">
                  <label>
                    Stage Name <span className="pipeline-required">*</span>
                    <input
                      value={stageName}
                      onChange={(event) => setStageName(event.target.value)}
                      placeholder="e.g. Site Visit"
                      maxLength={100}
                      required
                    />
                  </label>

                  <label>
                    Position
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={stagePosition}
                      onChange={(event) =>
                        setStagePosition(Number(event.target.value))
                      }
                      required
                    />
                  </label>
                </div>

                <div className="pipeline-checkbox-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={stageWon}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setStageWon(checked);
                        if (checked) setStageLost(false);
                      }}
                    />
                    Closed Won
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={stageLost}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setStageLost(checked);
                        if (checked) setStageWon(false);
                      }}
                    />
                    Closed Lost
                  </label>

                  <label>
                    <input
                      type="checkbox"
                      checked={stageActive}
                      onChange={(event) =>
                        setStageActive(event.target.checked)
                      }
                    />
                    Active
                  </label>
                </div>

                <div className="pipeline-form-actions">
                  <button
                    className="pipeline-secondary-btn"
                    type="button"
                    onClick={resetStageForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>

                  <button
                    className="pipeline-primary-btn"
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : editingStageId
                        ? "Save Changes"
                        : "Add Stage"}
                  </button>
                </div>
              </form>
            )}

            <div className="pipeline-table-wrap">
              <table className="pipeline-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Stage Name</th>
                    <th>Closed Won</th>
                    <th>Closed Lost</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {stagesLoading ? (
                    <tr>
                      <td colSpan={6} className="pipeline-table-message">
                        Loading stages...
                      </td>
                    </tr>
                  ) : stages.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="pipeline-table-message">
                        {selectedPipelineId
                          ? "No stages yet. Click Add Stage to create one."
                          : "Stages will appear here after you create a pipeline."}
                      </td>
                    </tr>
                  ) : (
                    stages.map((stage, index) => (
                      <tr key={stage.id}>
                        <td>
                          <span className="pipeline-position-cell">
                            <span className="pipeline-drag-handle">⠿</span>
                            {stage.position || index + 1}
                          </span>
                        </td>

                        <td className="pipeline-stage-name">{stage.name}</td>

                        <td>
                          <input
                            className="pipeline-table-checkbox"
                            type="checkbox"
                            checked={stage.is_closed_won}
                            readOnly
                            aria-label={`${stage.name} is Closed Won`}
                          />
                        </td>

                        <td>
                          <input
                            className="pipeline-table-checkbox"
                            type="checkbox"
                            checked={stage.is_closed_lost}
                            readOnly
                            aria-label={`${stage.name} is Closed Lost`}
                          />
                        </td>

                        <td>
                          <span
                            className={`pipeline-status ${
                              stage.is_active ? "active" : "inactive"
                            }`}
                          >
                            {stage.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>

                        <td>
                          <div className="pipeline-table-actions">
                            <button
                              type="button"
                              title="Edit stage"
                              onClick={() => openEditStage(stage)}
                            >
                              ✎
                            </button>

                            <button
                              type="button"
                              title="Delete stage"
                              onClick={() => handleDeleteStage(stage)}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        <aside className="pipeline-side-column">
          <section className="pipeline-help-card">
            <h2>What You Fill In</h2>

            <div className="pipeline-help-item">
              <span className="pipeline-help-number">1</span>
              <div>
                <h3>Pipeline Name</h3>
                <p>
                  Give your pipeline a clear name, such as Real Estate Sales.
                </p>
              </div>
              <span className="pipeline-help-icon">▤</span>
            </div>

            <div className="pipeline-help-item">
              <span className="pipeline-help-number">2</span>
              <div>
                <h3>Description</h3>
                <p>Add a short description of the pipeline&apos;s purpose.</p>
              </div>
              <span className="pipeline-help-icon">▧</span>
            </div>

            <div className="pipeline-help-item">
              <span className="pipeline-help-number">3</span>
              <div>
                <h3>Set as Default Pipeline</h3>
                <p>
                  Choose the default sales process for your tenant. Only one
                  pipeline should be the default.
                </p>
              </div>
              <span className="pipeline-help-icon">☆</span>
            </div>

            <div className="pipeline-help-item">
              <span className="pipeline-help-number">4</span>
              <div>
                <h3>Active</h3>
                <p>
                  Inactive pipelines should not be offered when creating deals.
                </p>
              </div>
              <span className="pipeline-help-icon">◉</span>
            </div>

            <div className="pipeline-help-item">
              <span className="pipeline-help-number">5</span>
              <div>
                <h3>Stages</h3>
                <p>
                  Define the stages of your sales process. Mark the final
                  outcomes as Closed Won or Closed Lost.
                </p>
              </div>
              <span className="pipeline-help-icon">☷</span>
            </div>
          </section>

          <section className="pipeline-result-card">
            <div className="pipeline-result-icon">✓</div>
            <div>
              <h3>Result</h3>
              <p>
                Your pipeline will be available in the Pipelines list and can
                be used with Deals.
              </p>
            </div>
          </section>
        </aside>
      </div>

      <div className="pipeline-bottom-grid">
        <section className="pipeline-list-panel">
          <div className="pipeline-bottom-heading">
            <div>
              <h2>After Creation — Pipeline in Your List</h2>
              <p>Manage your sales pipelines and their stages.</p>
            </div>

            <button
              className="pipeline-primary-btn"
              type="button"
              onClick={openCreatePipeline}
            >
              ＋ Create Pipeline
            </button>
          </div>

          {loading ? (
            <div className="pipeline-table-message">
              Loading pipelines...
            </div>
          ) : pipelines.length === 0 ? (
            <div className="pipeline-table-message">
              No pipelines created yet.
            </div>
          ) : (
            <div className="pipeline-table-wrap">
              <table className="pipeline-table pipeline-list-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Description</th>
                    <th>Default</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {pipelines.map((pipeline) => (
                    <tr
                      key={pipeline.id}
                      className={
                        selectedPipelineId === pipeline.id
                          ? "pipeline-selected-row"
                          : ""
                      }
                    >
                      <td>
                        <button
                          type="button"
                          className="pipeline-name-link"
                          onClick={() => {
                            setSelectedPipelineId(pipeline.id);
                            setStageFormOpen(false);
                            setEditingStageId(null);
                            setError("");
                            setNotice("");
                          }}
                        >
                          {pipeline.name}
                        </button>
                      </td>

                      <td>{pipeline.description || "—"}</td>

                      <td>
                        {pipeline.is_default ? (
                          <span className="pipeline-status default">
                            Default
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td>
                        <span
                          className={`pipeline-status ${
                            pipeline.is_active ? "active" : "inactive"
                          }`}
                        >
                          {pipeline.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <div className="pipeline-table-actions">
                          <button
                            type="button"
                            title="Edit pipeline"
                            onClick={() => openEditPipeline(pipeline)}
                          >
                            ✎
                          </button>

                          <button
                            type="button"
                            title="Delete pipeline"
                            onClick={() => handleDeletePipeline(pipeline)}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="pipeline-workflow-panel">
          <h2>How It&apos;s Used in Deals</h2>

          <div className="pipeline-workflow-steps">
            <article>
              <span className="pipeline-workflow-icon">♧</span>
              <h3>1. Create a Deal</h3>
              <p>Choose a pipeline and select the starting stage.</p>
            </article>

            <span className="pipeline-workflow-arrow">→</span>

            <article>
              <span className="pipeline-workflow-icon">▤</span>
              <h3>2. Track Progress</h3>
              <p>Move the deal through your configured stages.</p>
            </article>

            <span className="pipeline-workflow-arrow">→</span>

            <article>
              <span className="pipeline-workflow-icon">♜</span>
              <h3>3. Close the Deal</h3>
              <p>Mark the deal Won or Lost at the final stage.</p>
            </article>
          </div>

          <div className="pipeline-example">
            <strong>💡 Example</strong>
            <p>
              A real estate sales pipeline could use New Enquiry → Contacted →
              Site Visit → Booking → Closed Won or Closed Lost.
            </p>
          </div>
        </section>

        <section className="pipeline-benefits-panel">
          <h2>Why It&apos;s Useful</h2>
          <ul>
            <li>Each company can have its own sales process.</li>
            <li>Organizes deals and helps track progress.</li>
            <li>Improves reporting and sales analytics.</li>
            <li>Supports different business types and workflows.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}