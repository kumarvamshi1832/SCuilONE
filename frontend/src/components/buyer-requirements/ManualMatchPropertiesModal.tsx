import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getProperties, getPropertyImages } from "../../services/propertyService";
import { getBuildings } from "../../services/buildingService";
import {
  createPropertyMatches,
  fetchApiMatchesForRequirement,
} from "../../services/propertyMatchService";
import { getApiErrorMessage } from "../../utils/apiError";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import { PROPERTY_TYPES } from "../../types/property";
import type { Property, PropertyImage } from "../../types/property";
import type { Building } from "../../types/building";
import type { BuyerRequirement } from "../../types/buyerRequirement";
import "./ManualMatchPropertiesModal.css";

const PAGE_SIZE = 100;

export interface ManualMatchSaveSummary {
  savedCount: number;
  failedCount: number;
}

interface ManualMatchPropertiesModalProps {
  requirement: BuyerRequirement;
  buyerName: string;
  onClose: () => void;
  /**
   * Called after the backend saved at least one match. When `failedCount` is 0 the modal
   * closes itself right after; otherwise it stays open so the failures can be retried.
   */
  onSaved: (summary: ManualMatchSaveSummary) => void | Promise<void>;
}

const formatPrice = (value: number | string, currency = "INR"): string => {
  const num = Number(value);
  if (Number.isNaN(num)) return `${currency} ${value}`;
  if (currency === "INR") {
    if (num >= 10000000) return `₹ ${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `₹ ${(num / 100000).toFixed(2)} Lakh`;
    return `₹ ${num.toLocaleString("en-IN")}`;
  }
  return `${currency} ${num.toLocaleString()}`;
};

const formatBudget = (min?: number | string | null, max?: number | string | null) => {
  const hasMin = min !== null && min !== undefined && min !== "";
  const hasMax = max !== null && max !== undefined && max !== "";
  if (hasMin && hasMax) return `${formatPrice(min as number)} – ${formatPrice(max as number)}`;
  if (hasMin) return `From ${formatPrice(min as number)}`;
  if (hasMax) return `Up to ${formatPrice(max as number)}`;
  return "Flexible";
};

export default function ManualMatchPropertiesModal({
  requirement,
  buyerName,
  onClose,
  onSaved,
}: ManualMatchPropertiesModalProps) {
  // Same mapping as the backend (expected_listing_type_for_requirement): Buy -> Sale, Rent -> Rent, Lease -> Lease.
  const expectedListing = requirement.requirement_type === "Buy" ? "Sale" : requirement.requirement_type === "Lease" ? "Lease" : "Rent";

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("");
  const [buildings, setBuildings] = useState<Building[]>([]);

  // Inventory
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Existing matches (authoritative copy from the backend)
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [matchesWarning, setMatchesWarning] = useState<string | null>(null);

  // Selection / preview
  const [selected, setSelected] = useState<Map<string, Property>>(new Map());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [imagesByProperty, setImagesByProperty] = useState<Record<string, PropertyImage[]>>({});
  const [saving, setSaving] = useState(false);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestSeq = useRef(0);
  const savedAny = useRef(false);

  const buildingName = useMemo(() => {
    const map = new Map<string, string>();
    buildings.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [buildings]);

  // Debounce the search box
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  // Existing matches of this requirement
  useEffect(() => {
    let cancelled = false;
    fetchApiMatchesForRequirement(requirement.id)
      .then((matches) => {
        if (!cancelled) setMatchedIds(new Set(matches.map((m) => m.property_id)));
      })
      .catch((err) => {
        if (!cancelled) {
          setMatchesWarning(
            getApiErrorMessage(err, "Could not load the existing matches.") +
              " Properties that are already matched will still be rejected when saving."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requirement.id]);

  // Building filter (optional - hidden when the user cannot read buildings)
  useEffect(() => {
    let cancelled = false;
    getBuildings({ limit: 100 })
      .then((list) => {
        if (!cancelled) setBuildings(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    async (skip: number): Promise<Property[]> => {
      const list = await getProperties({
        status: "Available",
        listing_type: expectedListing,
        property_type: typeFilter || undefined,
        building_id: buildingFilter || undefined,
        search: search || undefined,
        skip,
        limit: PAGE_SIZE,
      });
      return list.filter((p) => p.status === "Available" && p.listing_type === expectedListing);
    },
    [expectedListing, typeFilter, buildingFilter, search]
  );

  const loadFirstPage = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchPage(0);
      if (seq !== requestSeq.current) return;
      setProperties(list);
      setHasMore(list.length >= PAGE_SIZE);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setProperties([]);
      setHasMore(false);
      setLoadError(getApiErrorMessage(err, "Failed to load properties."));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async () => {
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const list = await fetchPage(properties.length);
      if (seq !== requestSeq.current) return;
      setProperties((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...list.filter((p) => !seen.has(p.id))];
      });
      setHasMore(list.length >= PAGE_SIZE);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, "Failed to load more properties."));
    } finally {
      setLoadingMore(false);
    }
  };

  // Lazy-load the photos of the previewed property
  const previewProperty = useMemo(
    () => properties.find((p) => p.id === previewId) || selected.get(previewId || "") || null,
    [properties, selected, previewId]
  );
  useEffect(() => {
    if (!previewId || imagesByProperty[previewId]) return;
    let cancelled = false;
    getPropertyImages(previewId)
      .then((imgs) => {
        if (!cancelled) setImagesByProperty((prev) => ({ ...prev, [previewId]: imgs || [] }));
      })
      .catch(() => {
        if (!cancelled) setImagesByProperty((prev) => ({ ...prev, [previewId]: [] }));
      });
    return () => {
      cancelled = true;
    };
  }, [previewId, imagesByProperty]);

  const toggleSelected = (property: Property) => {
    if (matchedIds.has(property.id) || saving) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(property.id)) next.delete(property.id);
      else next.set(property.id, property);
      return next;
    });
    setRowErrors((prev) => {
      if (!prev[property.id]) return prev;
      const { [property.id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const selectableVisible = properties.filter((p) => !matchedIds.has(p.id));
  const allVisibleSelected =
    selectableVisible.length > 0 && selectableVisible.every((p) => selected.has(p.id));

  const toggleAllVisible = () => {
    if (saving) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (allVisibleSelected) selectableVisible.forEach((p) => next.delete(p.id));
      else selectableVisible.forEach((p) => next.set(p.id, p));
      return next;
    });
  };

  const handleSave = async () => {
    if (saving || selected.size === 0) return;
    setSaving(true);
    setSaveError(null);
    setRowErrors({});

    const ids = Array.from(selected.keys());
    // Backend derives the salesperson from the requirement / property when not supplied.
    const results = await createPropertyMatches(requirement.id, ids);

    const savedIds: string[] = [];
    const duplicateIds: string[] = [];
    const errors: Record<string, string> = {};

    results.forEach((r) => {
      if (r.match) {
        savedIds.push(r.propertyId);
        return;
      }
      const status = (r.error as { response?: { status?: number } })?.response?.status;
      const message = getApiErrorMessage(r.error, "Could not match this property.");
      if (status === 409 && /already matched/i.test(message)) {
        duplicateIds.push(r.propertyId);
      }
      errors[r.propertyId] = message;
    });

    if (savedIds.length > 0) savedAny.current = true;

    setMatchedIds((prev) => {
      const next = new Set(prev);
      savedIds.forEach((id) => next.add(id));
      duplicateIds.forEach((id) => next.add(id));
      return next;
    });

    const failedIds = Object.keys(errors);

    if (failedIds.length === 0) {
      await onSaved({ savedCount: savedIds.length, failedCount: 0 });
      onClose();
      return;
    }

    // Partial / total failure: keep the modal open with only the unsaved properties selected.
    setSelected((prev) => {
      const next = new Map(prev);
      savedIds.forEach((id) => next.delete(id));
      duplicateIds.forEach((id) => next.delete(id));
      return next;
    });
    setRowErrors(errors);
    setSaveError(
      savedIds.length > 0
        ? `${savedIds.length} saved, ${failedIds.length} could not be matched.`
        : `No properties were matched. ${failedIds.length === 1 ? Object.values(errors)[0] : "See the errors below."}`
    );
    if (savedIds.length > 0) {
      await onSaved({ savedCount: savedIds.length, failedCount: failedIds.length });
    }
    setSaving(false);
  };

  const handleCancel = () => {
    if (saving) return;
    onClose();
  };

  const previewImages = previewId ? imagesByProperty[previewId] : undefined;
  const heroImage = previewImages?.find((i) => i.is_primary) || previewImages?.[0];
  const selectedList = Array.from(selected.values());
  const filtersActive = Boolean(searchInput || typeFilter || buildingFilter);

  return (
    <div className="mmp-overlay" onClick={handleCancel}>
      <div
        className="mmp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mmp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mmp-header">
          <div>
            <h2 id="mmp-title">Manually Match Properties</h2>
            <p className="mmp-subtitle">
              Link available {expectedListing === "Sale" ? "sale" : "rental"} properties to this buyer
              requirement. The customer sees them in the Customer Portal.
            </p>
          </div>
          <button className="mmp-close" onClick={handleCancel} aria-label="Close" disabled={saving}>
            &times;
          </button>
        </header>

        <section className="mmp-requirement" aria-label="Buyer requirement">
          <div className="mmp-req-item">
            <span>Buyer</span>
            <strong>{buyerName}</strong>
          </div>
          <div className="mmp-req-item">
            <span>Looking for</span>
            <strong>
              {requirement.requirement_type} · {requirement.property_type}
            </strong>
          </div>
          <div className="mmp-req-item">
            <span>Location</span>
            <strong>
              {[requirement.preferred_location, requirement.preferred_city].filter(Boolean).join(", ") ||
                "Any"}
            </strong>
          </div>
          <div className="mmp-req-item">
            <span>Budget</span>
            <strong>{formatBudget(requirement.min_budget, requirement.max_budget)}</strong>
          </div>
          <div className="mmp-req-item">
            <span>Bedrooms</span>
            <strong>{requirement.bedrooms ? `${requirement.bedrooms} BHK` : "Any"}</strong>
          </div>
          <div className="mmp-req-item">
            <span>Status</span>
            <strong>{requirement.status}</strong>
          </div>
        </section>

        <div className="mmp-body">
          <div className="mmp-list-col">
            <div className="mmp-toolbar">
              <input
                type="search"
                className="mmp-input mmp-search"
                placeholder="Search by name, unit, address or city…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search properties"
              />
              <select
                className="mmp-input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by property type"
              >
                <option value="">All property types</option>
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              {buildings.length > 0 && (
                <select
                  className="mmp-input"
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value)}
                  aria-label="Filter by project or building"
                >
                  <option value="">All buildings</option>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              {filtersActive && (
                <button
                  type="button"
                  className="mmp-link-btn"
                  onClick={() => {
                    setSearchInput("");
                    setTypeFilter("");
                    setBuildingFilter("");
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {matchesWarning && (
              <div className="mmp-alert warn" role="alert">
                {matchesWarning}
              </div>
            )}

            <div className="mmp-list-head">
              <label className="mmp-check-all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={selectableVisible.length === 0 || saving}
                />
                <span>Select all shown</span>
              </label>
              <span className="mmp-count-note">
                {loading ? "Loading…" : `${properties.length} available${hasMore ? "+" : ""}`}
              </span>
            </div>

            <div className="mmp-list" role="list">
              {loading ? (
                <div className="mmp-state">
                  <div className="mmp-spinner" />
                  <p>Loading available properties…</p>
                </div>
              ) : loadError && properties.length === 0 ? (
                <div className="mmp-state error">
                  <p>{loadError}</p>
                  <button className="mmp-btn secondary" onClick={loadFirstPage}>
                    Retry
                  </button>
                </div>
              ) : properties.length === 0 ? (
                <div className="mmp-state">
                  <p>
                    {filtersActive
                      ? "No available properties match your search."
                      : `There are no available ${expectedListing === "Sale" ? "sale" : "rental"} properties.`}
                  </p>
                </div>
              ) : (
                properties.map((p) => {
                  const isMatched = matchedIds.has(p.id);
                  const isSelected = selected.has(p.id);
                  const error = rowErrors[p.id];
                  return (
                    <div
                      key={p.id}
                      role="listitem"
                      className={`mmp-row${isSelected ? " selected" : ""}${isMatched ? " matched" : ""}${
                        previewId === p.id ? " previewing" : ""
                      }${error ? " has-error" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="mmp-row-check"
                        checked={isSelected}
                        disabled={isMatched || saving}
                        onChange={() => toggleSelected(p)}
                        aria-label={`Select ${p.name}`}
                      />
                      <button
                        type="button"
                        className="mmp-row-main"
                        onClick={() => setPreviewId(p.id)}
                        aria-label={`Preview ${p.name}`}
                      >
                        <span className="mmp-row-title">
                          {p.name}
                          {p.unit_number ? ` · Unit ${p.unit_number}` : ""}
                        </span>
                        <span className="mmp-row-meta">
                          {p.property_type}
                          {" · "}
                          {[p.address, p.city].filter(Boolean).join(", ")}
                          {p.building_id && buildingName.get(p.building_id)
                            ? ` · ${buildingName.get(p.building_id)}`
                            : ""}
                        </span>
                        <span className="mmp-row-facts">
                          <b>{formatPrice(p.price, p.currency)}</b>
                          <span>{p.bedrooms ? `${p.bedrooms} BHK` : "— BHK"}</span>
                          <span className="mmp-status">{p.status}</span>
                          {isMatched && <span className="mmp-badge">Already matched</span>}
                        </span>
                        {error && <span className="mmp-row-error">{error}</span>}
                      </button>
                    </div>
                  );
                })
              )}
              {!loading && hasMore && (
                <div className="mmp-more">
                  <button className="mmp-btn secondary" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="mmp-side-col">
            <div className="mmp-card">
              <h3>Property preview</h3>
              {!previewProperty ? (
                <p className="mmp-muted">Click a property to preview its photos and details.</p>
              ) : (
                <div className="mmp-preview">
                  <img
                    className="mmp-preview-img"
                    src={resolveImageUrl(heroImage?.image_url)}
                    alt={previewProperty.name}
                    onError={handleImageError}
                  />
                  {previewImages && previewImages.length > 1 && (
                    <div className="mmp-thumbs">
                      {previewImages.slice(0, 6).map((img) => (
                        <img
                          key={img.id}
                          src={resolveImageUrl(img.image_url)}
                          alt=""
                          loading="lazy"
                          onError={handleImageError}
                        />
                      ))}
                    </div>
                  )}
                  <h4>{previewProperty.name}</h4>
                  <p className="mmp-preview-price">
                    {formatPrice(previewProperty.price, previewProperty.currency)}
                  </p>
                  <dl className="mmp-facts">
                    <div>
                      <dt>Type</dt>
                      <dd>{previewProperty.property_type}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{[previewProperty.city, previewProperty.state].filter(Boolean).join(", ")}</dd>
                    </div>
                    <div>
                      <dt>Bedrooms</dt>
                      <dd>{previewProperty.bedrooms ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Bathrooms</dt>
                      <dd>{previewProperty.bathrooms ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Area</dt>
                      <dd>
                        {previewProperty.area ? `${previewProperty.area} ${previewProperty.area_unit}` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{previewProperty.status}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>

            <div className="mmp-card">
              <h3>Selected ({selected.size})</h3>
              {selectedList.length === 0 ? (
                <p className="mmp-muted">No properties selected yet.</p>
              ) : (
                <ul className="mmp-selected">
                  {selectedList.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{p.name}</strong>
                        <span>
                          {formatPrice(p.price, p.currency)} · {p.city}
                          {p.bedrooms ? ` · ${p.bedrooms} BHK` : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="mmp-remove"
                        onClick={() => toggleSelected(p)}
                        disabled={saving}
                        aria-label={`Remove ${p.name}`}
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        {saveError && (
          <div className="mmp-alert error" role="alert">
            {saveError}
          </div>
        )}

        <footer className="mmp-footer">
          <span className="mmp-footer-count">
            {selected.size} propert{selected.size === 1 ? "y" : "ies"} selected
          </span>
          <div className="mmp-footer-actions">
            <button className="mmp-btn secondary" onClick={handleCancel} disabled={saving}>
              {savedAny.current ? "Close" : "Cancel"}
            </button>
            <button
              className="mmp-btn primary"
              onClick={handleSave}
              disabled={saving || selected.size === 0}
            >
              {saving ? "Saving…" : `Save Matches${selected.size ? ` (${selected.size})` : ""}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
