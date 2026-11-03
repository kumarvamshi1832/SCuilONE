import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import {
  getSoftwareEstimates,
  createSoftwareEstimate,
  updateSoftwareEstimate,
  deleteSoftwareEstimate,
  createEstimateRevision,
} from "../../services/softwareEstimateService";
import { clearSoftwareForbidden, extractBackendDetail } from "../../services/softwareRequestManager";
import { getSoftwareRequirements } from "../../services/softwareRequirementService";
import { getUsers } from "../../services/userService";

import type {
  SoftwareEstimate,
  SoftwareEstimateCreate,
  SoftwareEstimateUpdate,
  SoftwareEstimateItemCreate,
  SoftwareEstimateStatus,
  SoftwareBillingType,
} from "../../types/softwareEstimate";
import {
  SOFTWARE_ESTIMATE_STATUSES,
  ESTIMATE_STATUS_TRANSITIONS,
  getAvailableEstimateStatuses,
} from "../../types/softwareEstimate";
import type { SoftwareRequirement } from "../../types/softwareRequirement";
import type { User } from "../../types/user";

import "./SoftwareModules.css";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatCurrency(
  amount: number | string | undefined | null,
  currencyCode: string = "INR"
): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || "0")) || 0;
  const curr = (currencyCode || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: curr,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${curr} ${num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export default function SoftwareEstimates() {
  const [estimates, setEstimates] = useState<SoftwareEstimate[]>([]);
  const [requirements, setRequirements] = useState<SoftwareRequirement[]>([]);
  const [requirementsLoading, setRequirementsLoading] = useState(false);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  // Helper to match status string against canonical SOFTWARE_ESTIMATE_STATUSES
  const resolveCanonicalStatus = useCallback((val: string | null | undefined): string => {
    if (!val) return "";
    const clean = val.trim().toLowerCase();
    const found = SOFTWARE_ESTIMATE_STATUSES.find((s) => s.toLowerCase() === clean);
    return found || "";
  }, []);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const fromParam = searchParams.get("status");
    const fromState = (location.state as any)?.status;
    return resolveCanonicalStatus(fromParam || fromState);
  });

  // Sync with URL query parameter changes (supports Back / Forward navigation)
  useEffect(() => {
    const fromParam = searchParams.get("status");
    const fromState = (location.state as any)?.status;
    const resolved = resolveCanonicalStatus(fromParam || fromState);
    setStatusFilter(resolved);
  }, [searchParams, location.state, resolveCanonicalStatus]);

  const handleStatusFilterChange = (newStatus: string) => {
    const resolved = resolveCanonicalStatus(newStatus);
    setStatusFilter(resolved);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (resolved) {
        next.set("status", resolved);
      } else {
        next.delete("status");
      }
      return next;
    });
  };

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SoftwareEstimate | null>(null);
  const [viewingItem, setViewingItem] = useState<SoftwareEstimate | null>(null);
  const [deletingItem, setDeletingItem] = useState<SoftwareEstimate | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState<{
    software_requirement_id: string;
    title: string;
    description: string;
    assigned_to: string | null;
    currency: string;
    billing_type: SoftwareBillingType;
    hourly_rate: number | null;
    issue_date: string;
    expiry_date: string;
    status: SoftwareEstimateStatus;
    discount_amount: number;
    terms_and_conditions: string;
    notes: string;
    items: SoftwareEstimateItemCreate[];
  }>({
    software_requirement_id: "",
    title: "",
    description: "",
    assigned_to: null,
    currency: "INR",
    billing_type: "Fixed Price",
    hourly_rate: null,
    issue_date: new Date().toISOString().slice(0, 10),
    expiry_date: "",
    status: "Draft",
    discount_amount: 0,
    terms_and_conditions: "",
    notes: "",
    items: [
      {
        item_name: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        discount_percent: 0,
        tax_percent: 0,
        sort_order: 1,
      },
    ],
  });

  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenDetail, setForbiddenDetail] = useState<string | null>(null);

  const isLockedAfterDraft = useMemo(() => {
    return Boolean(editingItem && editingItem.status !== "Draft");
  }, [editingItem]);

  const availableStatuses = useMemo(() => {
    if (!editingItem) {
      return ["Draft"] as SoftwareEstimateStatus[];
    }
    return getAvailableEstimateStatuses(editingItem.status);
  }, [editingItem]);

  const loadRequirements = useCallback(async (force = false) => {
    setRequirementsLoading(true);
    setRequirementsError(null);
    try {
      const reqs = await getSoftwareRequirements(undefined, { forceRetry: force });
      const validReqs = Array.isArray(reqs) ? reqs : [];
      setRequirements(validReqs);
      return validReqs;
    } catch (err: any) {
      const msg = extractBackendDetail(err) || "Failed to load software requirements";
      setRequirementsError(msg);
      return [];
    } finally {
      setRequirementsLoading(false);
    }
  }, []);

  const loadData = useCallback(async (forceRetry = false) => {
    setLoading(true);
    setError(null);
    if (forceRetry) {
      clearSoftwareForbidden("software_estimates");
      setIsForbidden(false);
      setForbiddenDetail(null);
    }

    setRequirementsLoading(true);
    setRequirementsError(null);

    try {
      const [estRes, reqRes, usersRes] = await Promise.allSettled([
        getSoftwareEstimates(undefined, { forceRetry }),
        getSoftwareRequirements(undefined, { forceRetry }),
        getUsers(),
      ]);

      if (estRes.status === "fulfilled") {
        setEstimates(Array.isArray(estRes.value) ? estRes.value : []);
        setIsForbidden(false);
        setForbiddenDetail(null);
      } else {
        const err = estRes.reason;
        if (err?.response?.status === 403 || err?.isCachedForbidden) {
          setIsForbidden(true);
          setForbiddenDetail(extractBackendDetail(err));
        } else {
          setError(extractBackendDetail(err));
        }
      }

      if (reqRes.status === "fulfilled") {
        const list = Array.isArray(reqRes.value) ? reqRes.value : [];
        setRequirements(list);
        setRequirementsError(null);
      } else {
        setRequirements([]);
        setRequirementsError(extractBackendDetail(reqRes.reason) || "Failed to load software requirements");
      }

      if (usersRes.status === "fulfilled") {
        setUsers(Array.isArray(usersRes.value) ? usersRes.value : []);
      }
    } finally {
      setLoading(false);
      setRequirementsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const reqMap = useMemo(() => new Map(requirements.map((r) => [r.id, r.title])), [requirements]);
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);

  // Filtered List
  const filteredList = useMemo(() => {
    return estimates.filter((e) => {
      if (statusFilter && e.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const reqTitle = reqMap.get(e.software_requirement_id)?.toLowerCase() || "";
        const matchTitle = e.title.toLowerCase().includes(q);
        const matchNum = e.estimate_number?.toLowerCase().includes(q);
        const matchReq = reqTitle.includes(q);
        if (!matchTitle && !matchNum && !matchReq) return false;
      }
      return true;
    });
  }, [estimates, statusFilter, searchTerm, reqMap]);

  // Dynamic Line Item Handlers
  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          item_name: `Module Feature #${prev.items.length + 1}`,
          description: "",
          quantity: 1,
          unit_price: 50000,
          discount_percent: 0,
          tax_percent: 18,
          sort_order: prev.items.length + 1,
        },
      ],
    }));
  };

  const handleRemoveItem = (index: number) => {
    if (formData.items.length <= 1) {
      setFormError("At least one line item is required in the estimate.");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const handleItemChange = (index: number, field: keyof SoftwareEstimateItemCreate, val: any) => {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const cur = nextItems[index]!;
      nextItems[index] = {
        item_name: field === "item_name" ? String(val) : cur.item_name,
        description: field === "description" ? String(val) : cur.description,
        quantity: field === "quantity" ? Number(val) : cur.quantity,
        unit_price: field === "unit_price" ? Number(val) : cur.unit_price,
        discount_percent: field === "discount_percent" ? Number(val) : cur.discount_percent,
        tax_percent: field === "tax_percent" ? Number(val) : cur.tax_percent,
        sort_order: field === "sort_order" ? Number(val) : cur.sort_order,
      };
      return { ...prev, items: nextItems };
    });
  };

  // Live calculation preview
  const previewTotals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    formData.items.forEach((it) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.unit_price || 0);
      const disc = Number(it.discount_percent || 0);
      const tax = Number(it.tax_percent || 0);

      const base = qty * price;
      const afterDisc = base - base * (disc / 100);
      const lineTax = afterDisc * (tax / 100);

      subtotal += base;
      taxTotal += lineTax;
    });

    const discAmt = Number(formData.discount_amount || 0);
    const grandTotal = Math.max(0, subtotal - discAmt + taxTotal);
    return { subtotal, taxTotal, grandTotal };
  }, [formData.items, formData.discount_amount]);

  const handleOpenCreate = async () => {
    setEditingItem(null);
    setFormError(null);
    let activeReqs = requirements;
    if (activeReqs.length === 0) {
      activeReqs = await loadRequirements(true);
    }
    setFormData({
      software_requirement_id: activeReqs[0]?.id || "",
      title: "",
      description: "",
      assigned_to: users[0]?.id || null,
      currency: "INR",
      billing_type: "Fixed Price",
      hourly_rate: null,
      issue_date: new Date().toISOString().slice(0, 10),
      expiry_date: "",
      status: "Draft",
      discount_amount: 0,
      terms_and_conditions: "",
      notes: "",
      items: [
        {
          item_name: "",
          description: "",
          quantity: 1,
          unit_price: 0,
          discount_percent: 0,
          tax_percent: 0,
          sort_order: 1,
        },
      ],
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: SoftwareEstimate) => {
    setEditingItem(item);
    setFormError(null);
    setFormData({
      software_requirement_id: item.software_requirement_id,
      title: item.title,
      description: item.description || "",
      assigned_to: item.assigned_to || null,
      currency: item.currency || "INR",
      billing_type: (item.billing_type as SoftwareBillingType) || "Fixed Price",
      hourly_rate: item.hourly_rate != null ? Number(item.hourly_rate) : null,
      issue_date: item.issue_date || new Date().toISOString().slice(0, 10),
      expiry_date: item.expiry_date || "",
      status: (item.status as SoftwareEstimateStatus) || "Draft",
      discount_amount: Number(item.discount_amount || 0),
      terms_and_conditions: item.terms_and_conditions || "",
      notes: item.notes || "",
      items:
        item.items && item.items.length > 0
          ? item.items.map((it) => ({
              item_name: it.item_name,
              description: it.description || "",
              quantity: it.quantity,
              unit_price: it.unit_price,
              discount_percent: it.discount_percent,
              tax_percent: it.tax_percent,
              sort_order: it.sort_order,
            }))
          : [
              {
                item_name: item.title || "",
                quantity: 1,
                unit_price: Number(item.total_amount || 0),
                discount_percent: 0,
                tax_percent: 0,
                sort_order: 1,
              },
            ],
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.title.trim()) {
      setFormError("Estimate title is required.");
      return;
    }
    if (!formData.software_requirement_id) {
      setFormError("Please select an associated Software Requirement.");
      return;
    }
    if (formData.items.length === 0) {
      setFormError("Please add at least one line item.");
      return;
    }
    if (formData.billing_type === "Time & Material") {
      const rate = Number(formData.hourly_rate);
      if (formData.hourly_rate === null || formData.hourly_rate === undefined || isNaN(rate) || rate <= 0) {
        setFormError("Hourly rate is required and must be greater than 0 for Time & Material estimates.");
        return;
      }
      if (rate > 999999999999.99) {
        setFormError("Hourly rate exceeds maximum allowed value.");
        return;
      }
    }

    // Client-side status transition guard based on backend state machine
    if (editingItem) {
      const currentStatus = (editingItem.status as SoftwareEstimateStatus) || "Draft";
      const targetStatus = (formData.status as SoftwareEstimateStatus) || currentStatus;

      if (targetStatus !== currentStatus) {
        const allowed = ESTIMATE_STATUS_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(targetStatus)) {
          setFormError(
            `Cannot change estimate status from '${currentStatus}' to '${targetStatus}'. Permitted transitions: ${
              allowed.length > 0 ? allowed.join(", ") : "None (terminal status)"
            }`
          );
          return;
        }

        // Validate expiry date if transitioning to Sent or Accepted
        if (["Sent", "Accepted"].includes(targetStatus)) {
          const effectiveExpiry = formData.expiry_date || editingItem.expiry_date;
          if (!effectiveExpiry) {
            setFormError(`An expiry date is required before marking an estimate as ${targetStatus}.`);
            return;
          }
          const todayStr = new Date().toISOString().slice(0, 10);
          if (effectiveExpiry < todayStr) {
            setFormError(`The expiry date (${effectiveExpiry}) cannot be in the past. Please update it to today or a future date.`);
            return;
          }
        }
      }
    } else {
      // New estimates must start as Draft
      if (formData.status && formData.status !== "Draft") {
        setFormError("A new estimate must start as Draft.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        let payload: SoftwareEstimateUpdate;
        if (editingItem.status === "Draft") {
          // In Draft status, commercial fields can be updated
          payload = {
            title: formData.title,
            description: formData.description,
            assigned_to: formData.assigned_to,
            currency: formData.currency,
            billing_type: formData.billing_type,
            hourly_rate: formData.billing_type === "Time & Material" ? Number(formData.hourly_rate) : null,
            issue_date: formData.issue_date,
            expiry_date: formData.expiry_date || null,
            status: formData.status,
            discount_amount: formData.discount_amount,
            terms_and_conditions: formData.terms_and_conditions,
            notes: formData.notes,
            items: formData.items,
          };
        } else {
          // Commercial fields are locked after Draft (Sent, Accepted, Rejected, Expired, Withdrawn)
          // Only status, notes, and assigned_to are editable
          payload = {
            status: formData.status,
            notes: formData.notes || null,
            assigned_to: formData.assigned_to || null,
          };
        }

        const updated = await updateSoftwareEstimate(editingItem.id, payload);
        setEstimates((prev) => prev.map((e) => (e.id === editingItem.id ? updated : e)));
        setIsModalOpen(false);
      } else {
        const payload: SoftwareEstimateCreate = {
          software_requirement_id: formData.software_requirement_id,
          title: formData.title,
          description: formData.description,
          assigned_to: formData.assigned_to,
          currency: formData.currency,
          billing_type: formData.billing_type,
          hourly_rate: formData.billing_type === "Time & Material" ? Number(formData.hourly_rate) : null,
          issue_date: formData.issue_date,
          expiry_date: formData.expiry_date || null,
          status: "Draft",
          discount_amount: formData.discount_amount,
          terms_and_conditions: formData.terms_and_conditions,
          notes: formData.notes,
          items: formData.items,
        };
        const created = await createSoftwareEstimate(payload);
        setEstimates((prev) => [created, ...prev]);
        setIsModalOpen(false);
      }
    } catch (err: any) {
      // Keep modal open, preserve all entered form values, display exact backend message
      const errorMsg = extractBackendDetail(err) || err?.message || "Failed to save estimate";
      setFormError(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setSubmitting(true);
    try {
      await deleteSoftwareEstimate(deletingItem.id);
      setEstimates((prev) => prev.filter((e) => e.id !== deletingItem.id));
      setDeletingItem(null);
    } catch (err: any) {
      alert("Failed to delete estimate: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateRevision = async (id: string) => {
    setLoading(true);
    try {
      const revision = await createEstimateRevision(id);
      setEstimates((prev) => [revision, ...prev]);
      handleOpenEdit(revision);
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.message || "Failed to create estimate revision");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sw-module-page">
      {/* Header */}
      <div className="sw-module-header">
        <div className="sw-module-title-box">
          <h1>
            Software Estimates
            <span className="sw-count-badge">{estimates.length} Total</span>
          </h1>
          <p>Generate detailed quotes, dynamic cost breakdowns, milestones, and client pricing proposals.</p>
        </div>
        <button className="sw-btn-primary" onClick={handleOpenCreate}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Estimate
        </button>
      </div>

      {/* Filter Bar */}
      <div className="sw-filter-bar">
        <div className="sw-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="sw-search-input"
            placeholder="Search estimates by number, title, or requirement..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="sw-filter-select"
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
        >
          <option value="">All Statuses</option>
          {SOFTWARE_ESTIMATE_STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>

        {(Boolean(searchTerm) || Boolean(statusFilter)) && (
          <button
            type="button"
            className="sw-btn-secondary"
            style={{ padding: "8px 14px", fontSize: "0.82rem" }}
            onClick={() => {
              setSearchTerm("");
              handleStatusFilterChange("");
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Table Card */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading software estimates...
          </div>
        ) : isForbidden ? (
          <div className="sw-forbidden-card">
            <div className="sw-forbidden-icon-box">🔒</div>
            <h3>Software Estimates Access Restricted</h3>
            <p>
              This module is not enabled for your tenant industry or your user role does not have view permission.
            </p>
            {forbiddenDetail && (
              <div className="sw-forbidden-detail">{forbiddenDetail}</div>
            )}
            <button
              className="sw-btn-secondary"
              style={{ marginTop: "8px" }}
              onClick={() => void loadData(true)}
            >
              Retry Access
            </button>
          </div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
            <p style={{ marginBottom: "12px" }}>{error}</p>
            <button className="sw-btn-secondary" onClick={() => void loadData(true)}>Retry</button>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            <p>No software estimates found matching your criteria.</p>
            {(Boolean(searchTerm) || Boolean(statusFilter)) && (
              <button
                type="button"
                className="sw-btn-secondary"
                style={{ marginTop: "12px", padding: "6px 14px", fontSize: "0.82rem" }}
                onClick={() => {
                  setSearchTerm("");
                  handleStatusFilterChange("");
                }}
              >
                Reset Filters ({estimates.length} available)
              </button>
            )}
          </div>
        ) : (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Estimate No</th>
                <th>Title / Requirement</th>
                <th>Issue Date</th>
                <th>Billing</th>
                <th>Items</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((est) => {
                const canRevise = ["Sent", "Rejected", "Expired", "Withdrawn"].includes(est.status);
                return (
                  <tr key={est.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: "#0ea5e9" }}>{est.estimate_number}</div>
                      <span className="sw-badge discovery" style={{ fontSize: "0.68rem", padding: "1px 6px", marginTop: "2px" }}>
                        Rev {est.revision_number || 1}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{est.title}</div>
                      <div style={{ fontSize: "0.76rem", color: "#64748b" }}>
                        {reqMap.get(est.software_requirement_id) || "Custom Software"}
                      </div>
                    </td>
                    <td>{est.issue_date}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{est.billing_type || "Fixed Price"}</div>
                      {est.billing_type === "Time & Material" && est.hourly_rate != null ? (
                        <div style={{ fontSize: "0.75rem", color: "#0ea5e9" }}>
                          {formatCurrency(est.hourly_rate, est.currency)}/hr
                        </div>
                      ) : (
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          Fixed Scope
                        </div>
                      )}
                    </td>
                    <td>{est.items ? est.items.length : 1} line item(s)</td>
                    <td style={{ fontWeight: 700 }}>{INR.format(est.total_amount)}</td>
                    <td>
                      <span className={`sw-badge ${est.status?.toLowerCase()}`}>
                        {est.status}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="sw-row-actions" style={{ justifyContent: "flex-end" }}>
                        {canRevise && (
                          <button
                            className="sw-btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.72rem", borderColor: "#0ea5e9", color: "#0ea5e9" }}
                            title="Create Revision based on this estimate"
                            onClick={() => handleCreateRevision(est.id)}
                          >
                            + Revise
                          </button>
                        )}
                        <button
                          className="sw-btn-icon"
                          title="View Details"
                          onClick={() => setViewingItem(est)}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                        <button
                          className="sw-btn-icon"
                          title="Edit Estimate"
                          onClick={() => handleOpenEdit(est)}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="sw-btn-icon danger"
                          title="Delete Estimate"
                          onClick={() => setDeletingItem(est)}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Modal with Dynamic Line Items */}
      {isModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div
            className="sw-modal-card sw-estimate-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>{editingItem ? "Edit Software Estimate" : "Create Software Estimate"}</h2>
              <button
                type="button"
                className="sw-btn-icon"
                onClick={() => setIsModalOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>
            <form className="sw-modal-form" onSubmit={handleSubmit}>
              <div className="sw-modal-body">
                {formError && <div className="sw-error-banner">{formError}</div>}

                {isLockedAfterDraft && (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: "6px",
                      background: "rgba(14, 165, 233, 0.12)",
                      border: "1px solid rgba(14, 165, 233, 0.35)",
                      color: "#38bdf8",
                      fontSize: "0.82rem",
                      marginBottom: "16px",
                      lineHeight: 1.45,
                    }}
                  >
                    🔒 <strong>Commercial content is locked for {editingItem?.status} estimates.</strong> Only status, notes, and assignee can be updated. To change items, prices, or scope, use the <em>Revise Estimate</em> action to generate a new revision.
                  </div>
                )}

                {/* 2-Column Responsive Form Grid */}
                <div className="sw-estimate-form-grid">
                  <div className="sw-form-group">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <label style={{ margin: 0 }}>Software Requirement *</label>
                      {requirementsLoading && (
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>(Loading...)</span>
                      )}
                      {requirementsError && (
                        <button
                          type="button"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#0ea5e9",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            textDecoration: "underline",
                            padding: 0,
                          }}
                          onClick={() => void loadRequirements(true)}
                        >
                          Retry Loading
                        </button>
                      )}
                    </div>
                    <select
                      className="sw-form-select"
                      required
                      value={formData.software_requirement_id}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev) => ({ ...prev, software_requirement_id: val }));
                        if (val && formError?.includes("Requirement")) {
                          setFormError(null);
                        }
                      }}
                      disabled={isLockedAfterDraft || requirementsLoading}
                    >
                      <option value="">Select Requirement</option>
                      {requirementsLoading && (
                        <option value="" disabled>Loading requirements...</option>
                      )}
                      {requirementsError && (
                        <option value="" disabled>Error loading requirements ({requirementsError})</option>
                      )}
                      {!requirementsLoading && !requirementsError && requirements.length === 0 && (
                        <option value="" disabled>No software requirements available (Create one first)</option>
                      )}
                      {requirements.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} ({r.software_type})
                        </option>
                      ))}
                    </select>
                    {requirementsError && (
                      <div style={{ fontSize: "0.78rem", color: "#ef4444", marginTop: "4px" }}>
                        {requirementsError}
                      </div>
                    )}
                  </div>

                  <div className="sw-form-group">
                    <label>Estimate Title *</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      required
                      placeholder="e.g. CRM Customization Proposal"
                      value={formData.title}
                      disabled={isLockedAfterDraft}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Issue Date</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      value={formData.issue_date}
                      onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Expiry Date</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      value={formData.expiry_date}
                      onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Status</label>
                    <select
                      className="sw-form-select"
                      value={formData.status}
                      disabled={availableStatuses.length <= 1}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as SoftwareEstimateStatus,
                        })
                      }
                    >
                      {availableStatuses.map((st) => (
                        <option key={st} value={st}>
                          {st} {editingItem && st === editingItem.status ? "(Current)" : ""}
                        </option>
                      ))}
                    </select>
                    {!editingItem && (
                      <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                        New estimates must start as <strong>Draft</strong>.
                      </span>
                    )}
                    {editingItem?.status === "Draft" && (
                      <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                        Workflow: <strong>Draft → Sent → Accepted</strong>. Save as <strong>Sent</strong> first to enable acceptance.
                      </span>
                    )}
                    {editingItem?.status === "Sent" && (
                      <span style={{ fontSize: "0.75rem", color: "#0ea5e9", marginTop: "4px", display: "block" }}>
                        Active proposal. Permitted: <strong>Accepted</strong>, <strong>Rejected</strong>, <strong>Expired</strong>, <strong>Withdrawn</strong>.
                      </span>
                    )}
                    {editingItem?.status === "Accepted" && (
                      <span style={{ fontSize: "0.75rem", color: "#10b981", marginTop: "4px", display: "block" }}>
                        ✅ Accepted (Terminal). Estimate is ready for contract creation in Software Contracts.
                      </span>
                    )}
                    {editingItem && ["Rejected", "Expired", "Withdrawn"].includes(editingItem.status) && (
                      <span style={{ fontSize: "0.75rem", color: "#f59e0b", marginTop: "4px", display: "block" }}>
                        Terminal status ({editingItem.status}). Use "Revise Estimate" to make commercial adjustments.
                      </span>
                    )}
                  </div>

                  <div className="sw-form-group">
                    <label>Currency</label>
                    <select
                      className="sw-form-select"
                      value={formData.currency}
                      disabled={isLockedAfterDraft}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="AED">AED (د.إ)</option>
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Billing Type *</label>
                    <select
                      className="sw-form-select"
                      value={formData.billing_type}
                      disabled={isLockedAfterDraft}
                      onChange={(e) => {
                        const val = e.target.value as SoftwareBillingType;
                        setFormData((prev) => ({
                          ...prev,
                          billing_type: val,
                          hourly_rate: val === "Fixed Price" ? null : prev.hourly_rate,
                        }));
                      }}
                    >
                      <option value="Fixed Price">Fixed Price</option>
                      <option value="Time & Material">Time & Material</option>
                    </select>
                  </div>

                  {formData.billing_type === "Time & Material" && (
                    <div className="sw-form-group">
                      <label>Hourly Rate ({formData.currency}/hr) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="sw-form-input"
                        required={formData.billing_type === "Time & Material"}
                        placeholder="e.g. 50.00"
                        disabled={isLockedAfterDraft}
                        value={formData.hourly_rate ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            hourly_rate: val === "" ? null : parseFloat(val),
                          }));
                        }}
                      />
                      <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px", display: "block" }}>
                        Rate per hour for Time & Material billing (&gt; 0).
                      </span>
                    </div>
                  )}
                </div>

                {/* Estimate Line Items Section */}
                <div className="sw-estimate-items-section">
                  <div className="sw-estimate-items-section-header">
                    <div className="sw-estimate-items-title">
                      <h3>Estimate Line Items</h3>
                      <span className="sw-items-count-badge">
                        {formData.items.length} {formData.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="sw-btn-secondary"
                      style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                      onClick={handleAddItem}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{ marginRight: "4px" }}
                      >
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                      Add Item
                    </button>
                  </div>

                  {/* Header Row on Desktop */}
                  <div className="sw-estimate-items-header">
                    <span className="sw-col-name">Item Name *</span>
                    <span className="sw-col-qty">Qty *</span>
                    <span className="sw-col-price">Unit Price *</span>
                    <span className="sw-col-disc">Discount %</span>
                    <span className="sw-col-tax">Tax %</span>
                    <span className="sw-col-action"></span>
                  </div>

                  {/* Line Item Rows */}
                  <div className="sw-estimate-items-list">
                    {formData.items.map((item, idx) => (
                      <div className="sw-estimate-item-row" key={idx}>
                        <div className="sw-estimate-item-field sw-field-name">
                          <span className="sw-mobile-label">Item Name *</span>
                          <input
                            type="text"
                            className="sw-form-input"
                            placeholder="e.g. Core CRM Engine"
                            required
                            value={item.item_name}
                            onChange={(e) =>
                              handleItemChange(idx, "item_name", e.target.value)
                            }
                          />
                        </div>
                        <div className="sw-estimate-item-field sw-field-qty">
                          <span className="sw-mobile-label">Quantity *</span>
                          <input
                            type="number"
                            className="sw-form-input"
                            placeholder="1"
                            min="1"
                            step="1"
                            required
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemChange(idx, "quantity", Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="sw-estimate-item-field sw-field-price">
                          <span className="sw-mobile-label">Unit Price *</span>
                          <input
                            type="number"
                            className="sw-form-input"
                            placeholder="0"
                            min="0"
                            step="any"
                            required
                            value={item.unit_price}
                            onChange={(e) =>
                              handleItemChange(idx, "unit_price", Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="sw-estimate-item-field sw-field-disc">
                          <span className="sw-mobile-label">Discount %</span>
                          <input
                            type="number"
                            className="sw-form-input"
                            placeholder="0"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.discount_percent ?? ""}
                            onChange={(e) =>
                              handleItemChange(idx, "discount_percent", Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="sw-estimate-item-field sw-field-tax">
                          <span className="sw-mobile-label">Tax %</span>
                          <input
                            type="number"
                            className="sw-form-input"
                            placeholder="18"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.tax_percent ?? ""}
                            onChange={(e) =>
                              handleItemChange(idx, "tax_percent", Number(e.target.value))
                            }
                          />
                        </div>
                        <div className="sw-estimate-item-action">
                          {formData.items.length > 1 ? (
                            <button
                              type="button"
                              className="sw-btn-icon danger"
                              title="Remove Line Item"
                              onClick={() => handleRemoveItem(idx)}
                            >
                              ✕
                            </button>
                          ) : (
                            <span style={{ width: "32px", display: "inline-block" }}></span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Calculations Summary Bar */}
                  <div className="sw-estimate-totals-bar">
                    <div className="sw-estimate-total-col">
                      <span className="sw-total-label">Subtotal</span>
                      <span className="sw-total-value">
                        {formatCurrency(previewTotals.subtotal, formData.currency)}
                      </span>
                    </div>
                    <div className="sw-estimate-total-divider" />
                    <div className="sw-estimate-total-col">
                      <span className="sw-total-label">Tax (GST)</span>
                      <span className="sw-total-value">
                        {formatCurrency(previewTotals.taxTotal, formData.currency)}
                      </span>
                    </div>
                    <div className="sw-estimate-total-divider" />
                    <div className="sw-estimate-total-col grand-total">
                      <span className="sw-total-label">Estimated Total</span>
                      <span className="sw-total-value grand">
                        {formatCurrency(previewTotals.grandTotal, formData.currency)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Terms & Conditions */}
                <div className="sw-form-group" style={{ marginTop: "4px" }}>
                  <label>Terms & Conditions</label>
                  <textarea
                    className="sw-form-textarea"
                    placeholder="Milestones, payment schedules, expiry policies, warranty..."
                    value={formData.terms_and_conditions}
                    onChange={(e) =>
                      setFormData({ ...formData, terms_and_conditions: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sw-btn-primary"
                  disabled={submitting}
                >
                  {submitting
                    ? "Saving..."
                    : editingItem
                    ? "Update Estimate"
                    : "Generate Estimate"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {viewingItem && (
        <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "680px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>{viewingItem.estimate_number}: {viewingItem.title}</h2>
              <button className="sw-btn-icon" onClick={() => setViewingItem(null)}>✕</button>
            </div>
            <div className="sw-modal-body">
              <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                <span className={`sw-badge ${viewingItem.status?.toLowerCase()}`}>Status: {viewingItem.status}</span>
                <span className="sw-badge active">Total: {INR.format(viewingItem.total_amount)}</span>
                <span className="sw-badge planned">Issue Date: {viewingItem.issue_date}</span>
                <span className="sw-badge discovery">
                  Billing: {viewingItem.billing_type || "Fixed Price"}
                  {viewingItem.billing_type === "Time & Material" && viewingItem.hourly_rate != null
                    ? ` (${formatCurrency(viewingItem.hourly_rate, viewingItem.currency)}/hr)`
                    : ""}
                </span>
              </div>
              <p>
                <strong>Requirement:</strong> {reqMap.get(viewingItem.software_requirement_id) || "—"}
                {viewingItem.assigned_to && (
                  <span style={{ marginLeft: "16px" }}>
                    <strong>Assigned:</strong> {userMap.get(viewingItem.assigned_to) || viewingItem.assigned_to}
                  </span>
                )}
              </p>
              
              <h4 style={{ margin: "16px 0 8px 0" }}>Line Items Breakdown:</h4>
              <table className="sw-data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Tax</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingItem.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td>{it.item_name}</td>
                      <td>{it.quantity}</td>
                      <td>{INR.format(it.unit_price)}</td>
                      <td>{it.tax_percent}%</td>
                      <td>{INR.format(it.line_total || it.quantity * it.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {viewingItem.terms_and_conditions && (
                <div style={{ marginTop: "14px", fontSize: "0.85rem", color: "#94a3b8" }}>
                  <strong>Terms:</strong> {viewingItem.terms_and_conditions}
                </div>
              )}
            </div>
            <div className="sw-modal-footer">
              <button className="sw-btn-secondary" onClick={() => setViewingItem(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingItem && (
        <div className="sw-modal-overlay" onClick={() => setDeletingItem(null)}>
          <div className="sw-modal-card" style={{ maxWidth: "420px" }} onClick={(e) => e.stopPropagation()}>
            <div className="sw-modal-header">
              <h2>Confirm Deletion</h2>
              <button className="sw-btn-icon" onClick={() => setDeletingItem(null)}>✕</button>
            </div>
            <div className="sw-modal-body">
              <p>Are you sure you want to delete <strong>{deletingItem.estimate_number}</strong>?</p>
            </div>
            <div className="sw-modal-footer">
              <button className="sw-btn-secondary" onClick={() => setDeletingItem(null)}>Cancel</button>
              <button className="sw-btn-primary" style={{ background: "#ef4444" }} onClick={handleDelete} disabled={submitting}>
                {submitting ? "Deleting..." : "Delete Estimate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
