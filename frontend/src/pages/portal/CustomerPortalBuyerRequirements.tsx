import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  PlusIcon,
  RefreshIcon,
  XIcon,
  SendIcon,
  SearchIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  BuildingIcon,
} from "../../components/common/SupportPortalIcons";
import {
  createPortalBuyerRequirement,
  getPortalBuyerRequirements,
  getPortalRequirementMatches,
} from "../../services/customerPortalBuyerRequirementService";
import { getPortalOffers } from "../../services/customerPortalOfferService";
import { loadPortalMatches } from "../../services/customerPortalBookingNegotiation";
import { summarizeNegotiation } from "../../utils/offerDisplay";
import { formatPortalMoney } from "../../components/portal/PortalPropertyMatchCard";
import { getPortalErrorMessage } from "../../utils/portalApiError";
import { PROPERTY_TYPES, AREA_UNITS } from "../../types/property";
import type {
  PortalBuyerRequirement,
  PortalBuyerRequirementCreate,
  PortalRequirementType,
} from "../../types/customerPortalBuyerRequirement";
import "./CustomerPortalTickets.css";
import "./CustomerPortalBuyerRequirements.css";

interface PortalOutletContext {
  isRealEstate?: boolean;
}

interface RequirementFormState {
  requirement_type: PortalRequirementType;
  property_type: string;
  preferred_city: string;
  preferred_location: string;
  min_budget: string;
  max_budget: string;
  bedrooms: string;
  min_area: string;
  max_area: string;
  area_unit: string;
  min_duration_months: string;
  max_duration_months: string;
  notes: string;
}

const EMPTY_FORM: RequirementFormState = {
  requirement_type: "Buy",
  property_type: PROPERTY_TYPES[0],
  preferred_city: "",
  preferred_location: "",
  min_budget: "",
  max_budget: "",
  bedrooms: "",
  min_area: "",
  max_area: "",
  area_unit: "sqft",
  min_duration_months: "",
  max_duration_months: "",
  notes: "",
};

const toNumberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : NaN;
};

/** Client-side checks that mirror the backend schema; the server remains authoritative. */
const validateForm = (form: RequirementFormState): Record<string, string> => {
  const errors: Record<string, string> = {};
  if (!form.property_type.trim()) errors.property_type = "Select a property type.";
  if (!form.preferred_city.trim()) errors.preferred_city = "Preferred city is required.";

  const checkNumber = (key: keyof RequirementFormState, label: string, integer = false): number | null => {
    const value = toNumberOrNull(form[key] as string);
    if (value === null) return null;
    if (Number.isNaN(value)) errors[key] = `${label} must be a number.`;
    else if (value < 0) errors[key] = `${label} cannot be negative.`;
    else if (integer && !Number.isInteger(value)) errors[key] = `${label} must be a whole number.`;
    else if (integer && value > 100) errors[key] = `${label} cannot exceed 100.`;
    return value;
  };

  const minBudget = checkNumber("min_budget", "Minimum budget");
  const maxBudget = checkNumber("max_budget", "Maximum budget");
  const minArea = checkNumber("min_area", "Minimum area");
  const maxArea = checkNumber("max_area", "Maximum area");
  checkNumber("bedrooms", "Bedrooms", true);

  // Rent / lease duration in whole months (1 to 600), like the backend schema.
  if (form.requirement_type !== "Buy") {
    const months = (key: "min_duration_months" | "max_duration_months", label: string): number | null => {
      const raw = form[key].trim();
      if (raw === "") return null;
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 600) {
        errors[key] = `${label} must be a whole number of months from 1 to 600.`;
        return null;
      }
      return Number(raw);
    };
    const minMonths = months("min_duration_months", "Minimum duration");
    const maxMonths = months("max_duration_months", "Maximum duration");
    if (minMonths !== null && maxMonths !== null && minMonths > maxMonths) errors.max_duration_months = "Minimum duration cannot exceed maximum duration.";
  }

  if (!errors.min_budget && !errors.max_budget && minBudget !== null && maxBudget !== null && minBudget > maxBudget) {
    errors.max_budget = "Minimum budget cannot exceed maximum budget.";
  }
  if (!errors.min_area && !errors.max_area && minArea !== null && maxArea !== null && minArea > maxArea) {
    errors.max_area = "Minimum area cannot exceed maximum area.";
  }
  if (form.notes.length > 5000) errors.notes = "Notes cannot exceed 5000 characters.";
  return errors;
};

/** Statuses the backend can store for a buyer requirement (schemas/buyer_requirement.py), in lifecycle order. */
const REQUIREMENT_STAGES = ["New", "Qualified", "Matched", "Closed"] as const;
const STAGE_HELP: Record<string, string> = {
  New: "Submitted and waiting for our team",
  Qualified: "Reviewed by our team",
  Matched: "Properties have been matched",
  Closed: "Requirement closed",
};

interface CustomerPortalBuyerRequirementsProps {
  /** Rendered inside the Real Estate Portfolio tab: the page heading is replaced by the tab itself. */
  embedded?: boolean;
  /** Reports how many requirements were loaded (for the tab label). */
  onCountChange?: (count: number) => void;
}

export default function CustomerPortalBuyerRequirements({ embedded = false, onCountChange }: CustomerPortalBuyerRequirementsProps = {}) {
  const outlet = useOutletContext<PortalOutletContext | null>();
  const isRealEstate = outlet?.isRealEstate !== false;

  const [requirements, setRequirements] = useState<PortalBuyerRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  /** Matched-property count per requirement: number = loaded, null = lookup failed, missing = still loading. */
  const [matchCounts, setMatchCounts] = useState<Record<string, number | null>>({});
  const [pendingOfferReqIds, setPendingOfferReqIds] = useState<Set<string>>(new Set());

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState<RequirementFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const loadRequirements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getPortalBuyerRequirements();
      setRequirements(list);
      onCountChange?.(list.length);
      // Property matching is exposed per requirement only, so counts are fetched one request per requirement.
      setMatchCounts({});
      setPendingOfferReqIds(new Set());
      list.slice(0, 30).forEach((req) => {
        getPortalRequirementMatches(req.id)
          .then((matches) => {
            setMatchCounts((prev) => ({ ...prev, [req.id]: matches.length }));
            matches.forEach((m) => {
              getPortalOffers(m.match_id)
                .then((offers) => {
                  const summary = summarizeNegotiation(offers);
                  if (summary.awaiting === "customer") {
                    setPendingOfferReqIds((prev) => new Set([...prev, req.id]));
                  }
                })
                .catch(() => undefined);
            });
          })
          .catch(() => setMatchCounts((prev) => ({ ...prev, [req.id]: null })));
      });

      // Also check matches across portal matches (including rental/lease booking requests)
      loadPortalMatches()
        .then((allMatches) => {
          allMatches.forEach((m) => {
            if (m.requirement_id) {
              getPortalOffers(m.match_id)
                .then((offers) => {
                  const summary = summarizeNegotiation(offers);
                  if (summary.awaiting === "customer") {
                    setPendingOfferReqIds((prev) => new Set([...prev, m.requirement_id!]));
                  }
                })
                .catch(() => undefined);
            }
          });
        })
        .catch(() => undefined);
    } catch (err) {
      setError(getPortalErrorMessage(err, "Failed to load your buyer requirements."));
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    loadRequirements();
  }, [loadRequirements]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setSubmitError(null);
    setIsCreateOpen(true);
  };

  const closeCreate = () => {
    if (submitting) return;
    setIsCreateOpen(false);
  };

  const setField = <K extends keyof RequirementFormState>(key: K, value: RequirementFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: PortalBuyerRequirementCreate = {
      requirement_type: form.requirement_type,
      property_type: form.property_type.trim(),
      preferred_city: form.preferred_city.trim(),
      preferred_location: form.preferred_location.trim() || null,
      min_budget: toNumberOrNull(form.min_budget),
      max_budget: toNumberOrNull(form.max_budget),
      bedrooms: toNumberOrNull(form.bedrooms),
      ...(form.requirement_type !== "Buy"
        ? { min_duration_months: toNumberOrNull(form.min_duration_months), max_duration_months: toNumberOrNull(form.max_duration_months) }
        : {}),
      min_area: toNumberOrNull(form.min_area),
      max_area: toNumberOrNull(form.max_area),
      area_unit: form.area_unit,
      notes: form.notes.trim() || null,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createPortalBuyerRequirement(payload);
      setRequirements((prev) => {
        const next = [created, ...prev];
        onCountChange?.(next.length);
        return next;
      });
      setIsCreateOpen(false);
      showToast("Your requirement was submitted. Our team will match properties for you.");
    } catch (err) {
      setSubmitError(getPortalErrorMessage(err, "Failed to submit your requirement."));
    } finally {
      setSubmitting(false);
    }
  };

  const visibleRequirements = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requirements.filter((req) => {
      if (statusFilter && req.status !== statusFilter) return false;
      if (!q) return true;
      return [req.id, req.id.slice(0, 8), req.property_type, req.preferred_city, req.preferred_location, req.requirement_type, req.status, req.bedrooms != null ? `${req.bedrooms} bhk` : ""]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [requirements, search, statusFilter]);

  const budgetLabel = (req: PortalBuyerRequirement): string => {
    const per = req.budget_frequency === "Monthly" ? " / month" : req.budget_frequency === "Quarterly" ? " / quarter" : req.budget_frequency === "Yearly" ? " / year" : "";
    if (req.min_budget && req.max_budget)
      return `${formatPortalMoney(req.min_budget)} – ${formatPortalMoney(req.max_budget)}${per}`;
    if (req.max_budget) return `Up to ${formatPortalMoney(req.max_budget)}${per}`;
    if (req.min_budget) return `From ${formatPortalMoney(req.min_budget)}${per}`;
    return "Flexible";
  };

  const areaLabel = (req: PortalBuyerRequirement): string => {
    if (req.min_area && req.max_area) return `${Number(req.min_area)}–${Number(req.max_area)} ${req.area_unit}`;
    if (req.max_area) return `Up to ${Number(req.max_area)} ${req.area_unit}`;
    if (req.min_area) return `From ${Number(req.min_area)} ${req.area_unit}`;
    return "Any";
  };

  const fieldError = (key: string) =>
    fieldErrors[key] ? (
      <p className="cp-field-error" id={`req-${key}-error`} role="alert">
        {fieldErrors[key]}
      </p>
    ) : null;

  if (!isRealEstate) {
    return (
      <div className="cp-tickets-page">
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <AlertCircleIcon size={40} />
            <h3>Buyer requirements are not available</h3>
            <p>This feature is available for Real Estate workspaces only.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-tickets-page">
      {toast && (
        <div className="cp-toast-stack" role="status" aria-live="polite">
          <div className={`support-alert ${toast.type}`}>
            {toast.type === "success" ? <CheckCircleIcon size={18} /> : <AlertCircleIcon size={18} />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <div className="cp-tickets-header" style={embedded ? { marginBottom: 12 } : undefined}>
        <div>
          {embedded ? (
            <p style={{ margin: 0 }}>
              The properties you are looking for. We match available properties to each requirement and you can shortlist the ones you like.
            </p>
          ) : (
            <>
              <h1>Buyer Requirements</h1>
              <p>
                Tell us what you are looking for. We match available properties to each requirement and you
                can shortlist the ones you like.
              </p>
            </>
          )}
        </div>
        <button className="btn-primary" onClick={openCreate}>
          <PlusIcon size={16} />
          <span>New Requirement</span>
        </button>
      </div>

      <div className="cp-req-toolbar">
        <span className="cp-req-summary">
          {loading
            ? "Loading requirements…"
            : visibleRequirements.length === requirements.length
            ? `${requirements.length} requirement${requirements.length === 1 ? "" : "s"}`
            : `${visibleRequirements.length} of ${requirements.length} requirements`}
        </span>
        {requirements.length > 0 && (
          <>
            <div className="cp-search-box cp-req-search">
              <SearchIcon size={16} className="cp-search-icon" />
              <input
                type="text"
                placeholder="Search by ID, type, location, BHK or status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search buyer requirements"
              />
            </div>
            <select className="cp-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="">All statuses</option>
              {REQUIREMENT_STAGES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </>
        )}
        <button className="btn-secondary" onClick={loadRequirements} disabled={loading} aria-label="Refresh requirements">
          <RefreshIcon size={15} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="support-alert error" role="alert">
          <AlertCircleIcon size={18} />
          <span>{error}</span>
          <button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={loadRequirements}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="cp-loading-grid" aria-busy="true" aria-label="Loading requirements">
          {[0, 1, 2].map((i) => (
            <div key={i} className="cp-skeleton" />
          ))}
        </div>
      ) : !error && requirements.length === 0 ? (
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <BuildingIcon size={40} />
            <h3>No requirements yet</h3>
            <p>Create your first requirement and we will start matching properties for you.</p>
            <button className="btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>
              <PlusIcon size={16} />
              <span>New Requirement</span>
            </button>
          </div>
        </div>
      ) : visibleRequirements.length === 0 ? (
        <div className="cp-table-card">
          <div className="cp-empty-state">
            <h3>No matching requirements</h3>
            <p>Try a different search or status.</p>
            <button className="btn-secondary" onClick={() => { setSearch(""); setStatusFilter(""); }}>Clear filters</button>
          </div>
        </div>
      ) : (
        <div className="cp-req-grid">
          {visibleRequirements.map((req) => (
            <article key={req.id} className="cp-req-card">
              <div className="cp-req-card-head">
                <div>
                  <h3 className="cp-req-card-title">
                    {req.requirement_type || "Buy"} · {req.property_type}
                  </h3>
                  <p className="cp-req-card-sub" style={{ fontWeight: 600 }}>Requirement #{req.id.slice(0, 8).toUpperCase()}</p>
                  <p className="cp-req-card-sub">
                    {[req.preferred_location, req.preferred_city].filter(Boolean).join(", ") || "Any location"}
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  {pendingOfferReqIds.has(req.id) && (
                    <span className="cp-offer-received-badge" title="You have received an offer awaiting your response">
                      ⚡ Offer Received
                    </span>
                  )}
                  <span className={`cp-req-status status-${req.status.toLowerCase()}`}>{req.status}</span>
                </div>
              </div>
              <dl className="cp-req-facts">
                <div className="cp-req-fact">
                  <dt>Budget</dt>
                  <dd>{budgetLabel(req)}</dd>
                </div>
                <div className="cp-req-fact">
                  <dt>BHK</dt>
                  <dd>{req.bedrooms != null ? `${req.bedrooms} BHK` : "Any"}</dd>
                </div>
                <div className="cp-req-fact">
                  <dt>Area</dt>
                  <dd>{areaLabel(req)}</dd>
                </div>
                <div className="cp-req-fact">
                  <dt>Submitted</dt>
                  <dd>{new Date(req.created_at).toLocaleDateString()}</dd>
                </div>
                <div className="cp-req-fact">
                  <dt>Matched properties</dt>
                  <dd>{req.id in matchCounts ? (matchCounts[req.id] === null ? "Unavailable" : matchCounts[req.id]) : "…"}</dd>
                </div>
              </dl>
              <ol className="cp-req-track" aria-label={`Progress: ${req.status}`} title={STAGE_HELP[req.status] ?? req.status}>
                {REQUIREMENT_STAGES.map((stage, i) => {
                  const current = REQUIREMENT_STAGES.indexOf(req.status as (typeof REQUIREMENT_STAGES)[number]);
                  const state = current === -1 ? "todo" : i < current ? "done" : i === current ? "current" : "todo";
                  return (
                    <li key={stage} className={`cp-req-track-step ${state}`}>
                      <span className="cp-req-track-dot" aria-hidden="true" />
                      <span>{stage}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="cp-req-card-sub" style={{ margin: "6px 0 0" }}>{STAGE_HELP[req.status] ?? ""}</p>
              <div className="cp-req-card-foot">
                <span>Updated {new Date(req.updated_at).toLocaleDateString()}</span>
                <Link className="cp-ticket-link" to={`/portal/buyer-requirements/${req.id}`}>
                  View details & matches <ArrowRightIcon size={13} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {isCreateOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) closeCreate();
          }}
        >
          <div className="modal-dialog cp-modal-wide" role="dialog" aria-modal="true" aria-labelledby="req-modal-title">
            <div className="modal-header">
              <h2 id="req-modal-title">New Buyer Requirement</h2>
              <button className="modal-close-btn" onClick={closeCreate} disabled={submitting} aria-label="Close">
                <XIcon size={18} />
              </button>
            </div>

            <form className="cp-modal-form" onSubmit={handleSubmit} noValidate>
              <div className="modal-body">
                {submitError && (
                  <div className="support-alert error cp-inline-error" role="alert">
                    <AlertCircleIcon size={18} />
                    <span>{submitError}</span>
                  </div>
                )}

                <div className="cp-form-grid">
                  <div className="form-group">
                    <label htmlFor="req-type">I want to *</label>
                    <select
                      id="req-type"
                      className="cp-select"
                      value={form.requirement_type}
                      onChange={(e) => setField("requirement_type", e.target.value as PortalRequirementType)}
                    >
                      <option value="Buy">Buy</option>
                      <option value="Rent">Rent</option>
                      <option value="Lease">Lease</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-property-type">Property type *</label>
                    <select
                      id="req-property-type"
                      className="cp-select"
                      value={form.property_type}
                      onChange={(e) => setField("property_type", e.target.value)}
                      aria-invalid={Boolean(fieldErrors.property_type)}
                    >
                      {PROPERTY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {fieldError("property_type")}
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-city">Preferred city *</label>
                    <input
                      id="req-city"
                      type="text"
                      maxLength={100}
                      placeholder="e.g. Hyderabad"
                      value={form.preferred_city}
                      onChange={(e) => setField("preferred_city", e.target.value)}
                      aria-invalid={Boolean(fieldErrors.preferred_city)}
                      aria-describedby={fieldErrors.preferred_city ? "req-preferred_city-error" : undefined}
                    />
                    {fieldError("preferred_city")}
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-location">Preferred location / area</label>
                    <input
                      id="req-location"
                      type="text"
                      maxLength={200}
                      placeholder="e.g. Gachibowli"
                      value={form.preferred_location}
                      onChange={(e) => setField("preferred_location", e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-min-budget">Minimum budget</label>
                    <input
                      id="req-min-budget"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={form.min_budget}
                      onChange={(e) => setField("min_budget", e.target.value)}
                      aria-invalid={Boolean(fieldErrors.min_budget)}
                    />
                    {fieldError("min_budget")}
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-max-budget">Maximum budget</label>
                    <input
                      id="req-max-budget"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={form.max_budget}
                      onChange={(e) => setField("max_budget", e.target.value)}
                      aria-invalid={Boolean(fieldErrors.max_budget)}
                    />
                    {fieldError("max_budget")}
                  </div>

                  {form.requirement_type !== "Buy" && (
                    <>
                      <div className="form-group">
                        <label htmlFor="req-min-duration">Minimum duration (months)</label>
                        <input
                          id="req-min-duration"
                          type="number"
                          min={1}
                          max={600}
                          value={form.min_duration_months}
                          onChange={(e) => setField("min_duration_months", e.target.value)}
                          aria-invalid={Boolean(fieldErrors.min_duration_months)}
                        />
                        {fieldError("min_duration_months")}
                      </div>
                      <div className="form-group">
                        <label htmlFor="req-max-duration">Maximum duration (months)</label>
                        <input
                          id="req-max-duration"
                          type="number"
                          min={1}
                          max={600}
                          value={form.max_duration_months}
                          onChange={(e) => setField("max_duration_months", e.target.value)}
                          aria-invalid={Boolean(fieldErrors.max_duration_months)}
                        />
                        {fieldError("max_duration_months")}
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label htmlFor="req-bedrooms">Bedrooms</label>
                    <input
                      id="req-bedrooms"
                      type="number"
                      min={0}
                      max={100}
                      value={form.bedrooms}
                      onChange={(e) => setField("bedrooms", e.target.value)}
                      aria-invalid={Boolean(fieldErrors.bedrooms)}
                    />
                    {fieldError("bedrooms")}
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-area-unit">Area unit</label>
                    <select
                      id="req-area-unit"
                      className="cp-select"
                      value={form.area_unit}
                      onChange={(e) => setField("area_unit", e.target.value)}
                    >
                      {AREA_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-min-area">Minimum area</label>
                    <input
                      id="req-min-area"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={form.min_area}
                      onChange={(e) => setField("min_area", e.target.value)}
                      aria-invalid={Boolean(fieldErrors.min_area)}
                    />
                    {fieldError("min_area")}
                  </div>

                  <div className="form-group">
                    <label htmlFor="req-max-area">Maximum area</label>
                    <input
                      id="req-max-area"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      value={form.max_area}
                      onChange={(e) => setField("max_area", e.target.value)}
                      aria-invalid={Boolean(fieldErrors.max_area)}
                    />
                    {fieldError("max_area")}
                  </div>

                  <div className="form-group full">
                    <label htmlFor="req-notes">Additional preferences</label>
                    <textarea
                      id="req-notes"
                      rows={3}
                      maxLength={5000}
                      placeholder="Anything else we should know — facing, floor, amenities, possession date…"
                      value={form.notes}
                      onChange={(e) => setField("notes", e.target.value)}
                    />
                    {fieldError("notes")}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeCreate} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  <SendIcon size={15} />
                  <span>{submitting ? "Submitting…" : "Submit Requirement"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
