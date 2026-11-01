import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSoftwareEstimates,
  createSoftwareEstimate,
  updateSoftwareEstimate,
  deleteSoftwareEstimate,
  createEstimateRevision,
} from "../../services/softwareEstimateService";
import { getSoftwareRequirements } from "../../services/softwareRequirementService";
import { getUsers } from "../../services/userService";

import type {
  SoftwareEstimate,
  SoftwareEstimateCreate,
  SoftwareEstimateUpdate,
  SoftwareEstimateItemCreate,
  SoftwareEstimateStatus,
} from "../../types/softwareEstimate";
import { SOFTWARE_ESTIMATE_STATUSES } from "../../types/softwareEstimate";
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
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [estData, reqData, usersData] = await Promise.all([
        getSoftwareEstimates(),
        getSoftwareRequirements().catch(() => []),
        getUsers().catch(() => []),
      ]);

      setEstimates(estData);
      setRequirements(reqData);
      setUsers(usersData);
    } catch (err: any) {
      setError(err?.message || "Failed to load estimates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
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

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormError(null);
    setFormData({
      software_requirement_id: requirements[0]?.id || "",
      title: "",
      description: "",
      assigned_to: users[0]?.id || null,
      currency: "INR",
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

    setSubmitting(true);
    try {
      if (editingItem) {
        const payload: SoftwareEstimateUpdate = {
          title: formData.title,
          description: formData.description,
          assigned_to: formData.assigned_to,
          currency: formData.currency,
          issue_date: formData.issue_date,
          expiry_date: formData.expiry_date || null,
          status: formData.status,
          discount_amount: formData.discount_amount,
          terms_and_conditions: formData.terms_and_conditions,
          notes: formData.notes,
          items: formData.items,
        };
        const updated = await updateSoftwareEstimate(editingItem.id, payload);
        setEstimates((prev) => prev.map((e) => (e.id === editingItem.id ? updated : e)));
      } else {
        const payload: SoftwareEstimateCreate = {
          software_requirement_id: formData.software_requirement_id,
          title: formData.title,
          description: formData.description,
          assigned_to: formData.assigned_to,
          currency: formData.currency,
          issue_date: formData.issue_date,
          expiry_date: formData.expiry_date || null,
          status: formData.status,
          discount_amount: formData.discount_amount,
          terms_and_conditions: formData.terms_and_conditions,
          notes: formData.notes,
          items: formData.items,
        };
        const created = await createSoftwareEstimate(payload);
        setEstimates((prev) => [created, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || "Failed to save estimate");
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
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          {SOFTWARE_ESTIMATE_STATUSES.map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </div>

      {/* Table Card */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading software estimates...
          </div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
            <p>{error}</p>
            <button className="sw-btn-secondary" onClick={loadData}>Retry</button>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            No software estimates found matching your criteria.
          </div>
        ) : (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Estimate No</th>
                <th>Title / Requirement</th>
                <th>Issue Date</th>
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

                {/* 2-Column Responsive Form Grid */}
                <div className="sw-estimate-form-grid">
                  <div className="sw-form-group">
                    <label>Software Requirement *</label>
                    <select
                      className="sw-form-select"
                      required
                      value={formData.software_requirement_id}
                      onChange={(e) =>
                        setFormData({ ...formData, software_requirement_id: e.target.value })
                      }
                    >
                      <option value="">Select Requirement</option>
                      {requirements.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} ({r.software_type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Estimate Title *</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      required
                      placeholder="e.g. CRM Customization Proposal"
                      value={formData.title}
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
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as SoftwareEstimateStatus,
                        })
                      }
                    >
                      {SOFTWARE_ESTIMATE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Currency</label>
                    <select
                      className="sw-form-select"
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="AED">AED (د.إ)</option>
                    </select>
                  </div>
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
