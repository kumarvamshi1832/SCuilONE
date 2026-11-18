import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleAlert,
  CircleCheck,
  Loader2,
  Lock,
  RotateCcw,
  Route,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import {
  extractApiErrorMessage,
  platformService,
} from "../../../services/platformService";
import type { PlatformSettingItem } from "../../../types/platform";
import SettingsForm from "./SettingsFormFields";
import {
  GROUP_ORDER,
  SETTING_GROUPS,
  buildPayload,
  deepClone,
  deepEqual,
  humanizeKey,
  setAtPath,
  validateSettings,
  type GroupMeta,
  type JsonObject,
  type JsonValue,
} from "./settingsSchema";
import "./GlobalSettings.css";

interface CardStatus {
  saving: boolean;
  error: string | null;
  success: string | null;
}

const IDLE: CardStatus = { saving: false, error: null, success: null };

const ICONS: Record<GroupMeta["icon"], typeof Building2> = {
  general: Building2,
  security: ShieldCheck,
  routing: Route,
  generic: SlidersHorizontal,
};

const asObject = (value: unknown): JsonObject =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};

const formatTimestamp = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

interface Props {
  /** Only Platform Super Admins may modify; everyone else gets a read-only view. */
  canEdit: boolean;
  /** Increment to force a reload from the API. */
  reloadKey: number;
  onDirtyChange?: (dirty: boolean) => void;
  onCountChange?: (count: number) => void;
}

export default function GlobalSettingsPanel({
  canEdit,
  reloadKey,
  onDirtyChange,
  onCountChange,
}: Props) {
  const [items, setItems] = useState<PlatformSettingItem[]>([]);
  const [baselines, setBaselines] = useState<Record<string, JsonObject>>({});
  const [drafts, setDrafts] = useState<Record<string, JsonObject>>({});
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Replace everything (initial load / explicit refresh). */
  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await platformService.listSettings();
      const list = res.items || [];
      const nextBase: Record<string, JsonObject> = {};
      list.forEach((item) => {
        nextBase[item.setting_key] = asObject(item.value_json);
      });
      setItems(list);
      setBaselines(nextBase);
      setDrafts(deepClone(nextBase));
      setStatus({});
      onCountChange?.(list.length);
    } catch (err) {
      setLoadError(extractApiErrorMessage(err, "Failed to load platform settings."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll, reloadKey]);

  const orderedItems = useMemo(() => {
    const rank = (key: string) => {
      const idx = GROUP_ORDER.indexOf(key);
      return idx === -1 ? GROUP_ORDER.length : idx;
    };
    return items
      .map((item, idx) => ({ item, idx }))
      .sort((a, b) => rank(a.item.setting_key) - rank(b.item.setting_key) || a.idx - b.idx)
      .map(({ item }) => item);
  }, [items]);

  const dirtyKeys = useMemo(
    () =>
      Object.keys(drafts).filter((key) => !deepEqual(drafts[key], baselines[key])),
    [drafts, baselines]
  );
  const anyDirty = dirtyKeys.length > 0;

  useEffect(() => {
    onDirtyChange?.(anyDirty);
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyDirty]);

  // Parent loses its dirty flag if the panel unmounts (tab switch).
  useEffect(() => () => onDirtyChange?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const setCardStatus = (key: string, next: CardStatus) =>
    setStatus((prev) => ({ ...prev, [key]: next }));

  const handleChange = (key: string, path: (string | number)[], next: JsonValue) => {
    setDrafts((prev) => ({ ...prev, [key]: setAtPath(prev[key] || {}, path, next) }));
    setStatus((prev) => (prev[key] ? { ...prev, [key]: IDLE } : prev));
  };

  const handleReset = (key: string) => {
    setDrafts((prev) => ({ ...prev, [key]: deepClone(baselines[key] || {}) }));
    setCardStatus(key, IDLE);
  };

  const handleSave = async (item: PlatformSettingItem) => {
    const key = item.setting_key;
    const fields = SETTING_GROUPS[key]?.fields || {};
    const draft = drafts[key] || {};
    const baseline = baselines[key] || {};

    const errors = validateSettings(draft, fields);
    const errorCount = Object.keys(errors).length;
    if (errorCount > 0) {
      setCardStatus(key, {
        saving: false,
        error: `Fix ${errorCount} highlighted ${errorCount === 1 ? "field" : "fields"} before saving.`,
        success: null,
      });
      return;
    }

    setCardStatus(key, { saving: true, error: null, success: null });
    try {
      const saved = await platformService.updateSetting(key, {
        category: item.category,
        value_json: buildPayload(draft, baseline, fields),
        description: item.description,
      });

      // The API confirmed the save: adopt the value it returned.
      const confirmed = asObject(saved.value_json);
      setBaselines((prev) => ({ ...prev, [key]: confirmed }));
      setDrafts((prev) => ({ ...prev, [key]: deepClone(confirmed) }));

      // Refresh from the API so the displayed state is what is actually stored.
      let message = "Changes saved.";
      try {
        const res = await platformService.listSettings();
        const list = res.items || [];
        setItems(list);
        const fresh = list.find((s) => s.setting_key === key);
        if (fresh) {
          const freshValue = asObject(fresh.value_json);
          setBaselines((prev) => ({ ...prev, [key]: freshValue }));
          setDrafts((prev) => ({ ...prev, [key]: deepClone(freshValue) }));
        }
      } catch (refreshErr) {
        message = `Changes saved, but the latest values could not be reloaded: ${extractApiErrorMessage(
          refreshErr,
          "refresh failed."
        )}`;
      }
      setCardStatus(key, { saving: false, error: null, success: message });
    } catch (err) {
      setCardStatus(key, {
        saving: false,
        error: extractApiErrorMessage(err, "Failed to save settings."),
        success: null,
      });
    }
  };

  /* ------------------------------ render ------------------------------ */

  if (loading && items.length === 0) {
    return (
      <div className="gs-stack" aria-busy="true" aria-live="polite">
        {[0, 1, 2].map((n) => (
          <div className="gs-card gs-skeleton" key={n}>
            <div className="gs-skel-line w40" />
            <div className="gs-skel-line w70" />
            <div className="gs-skel-grid">
              <div className="gs-skel-box" />
              <div className="gs-skel-box" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loadError && items.length === 0) {
    return (
      <div className="gs-card gs-empty" role="alert">
        <CircleAlert size={22} />
        <p>{loadError}</p>
        <button type="button" className="platform-btn primary" onClick={() => void loadAll()}>
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="gs-card gs-empty">No platform settings are available.</div>;
  }

  return (
    <div className="gs-stack">
      {!canEdit && (
        <div className="platform-alert info">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Lock size={15} /> Only Platform Super Admins can modify global settings. You are
            viewing them in read-only mode.
          </span>
        </div>
      )}

      {orderedItems.map((item) => {
        const key = item.setting_key;
        const group = SETTING_GROUPS[key];
        const Icon = ICONS[group?.icon || "generic"];
        const draft = drafts[key] || {};
        const dirty = dirtyKeys.includes(key);
        const cardStatus = status[key] || IDLE;
        const errors = dirty ? validateSettings(draft, group?.fields || {}) : {};
        const updated = formatTimestamp(item.updated_at);
        const titleId = `gs-title-${key}`;

        return (
          <section
            key={key}
            className={`gs-card${dirty ? " is-dirty" : ""}`}
            aria-labelledby={titleId}
          >
            <header className="gs-card-head">
              <span className="gs-card-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div className="gs-card-heading">
                <h3 id={titleId}>{group?.title || humanizeKey(key.replace(/^platform\./, ""))}</h3>
                <p>{group?.description || item.description}</p>
              </div>
              <span
                className={`gs-chip ${
                  cardStatus.saving ? "saving" : dirty ? "dirty" : "clean"
                }`}
              >
                {cardStatus.saving ? (
                  <>
                    <Loader2 size={12} className="gs-spin" /> Saving
                  </>
                ) : dirty ? (
                  "Unsaved changes"
                ) : (
                  "Up to date"
                )}
              </span>
            </header>

            <div className="gs-card-body">
              <SettingsForm
                value={draft}
                fields={group?.fields || {}}
                sections={group?.sections}
                errors={errors}
                disabled={!canEdit || cardStatus.saving}
                onChange={(path, next) => handleChange(key, path, next)}
              />
            </div>

            {(cardStatus.error || cardStatus.success) && (
              <div
                className={`gs-banner ${cardStatus.error ? "error" : "success"}`}
                role={cardStatus.error ? "alert" : "status"}
              >
                {cardStatus.error ? <CircleAlert size={16} /> : <CircleCheck size={16} />}
                <span>{cardStatus.error || cardStatus.success}</span>
              </div>
            )}

            <footer className="gs-card-foot">
              <span className="gs-meta">{updated ? `Last updated ${updated}` : "Not yet customised"}</span>
              {canEdit && (
                <div className="gs-actions">
                  <button
                    type="button"
                    className="platform-btn"
                    disabled={!dirty || cardStatus.saving}
                    onClick={() => handleReset(key)}
                  >
                    <RotateCcw size={14} />
                    <span>Reset</span>
                  </button>
                  <button
                    type="button"
                    className="platform-btn primary"
                    disabled={!dirty || cardStatus.saving}
                    onClick={() => void handleSave(item)}
                  >
                    {cardStatus.saving ? (
                      <Loader2 size={14} className="gs-spin" />
                    ) : (
                      <Save size={14} />
                    )}
                    <span>{cardStatus.saving ? "Saving..." : "Save Changes"}</span>
                  </button>
                </div>
              )}
            </footer>
          </section>
        );
      })}
    </div>
  );
}
