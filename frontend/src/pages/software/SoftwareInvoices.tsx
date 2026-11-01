import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSoftwareInvoices,
  getSoftwareInvoice,
  createSoftwareInvoice,
  updateSoftwareInvoiceStatus,
  recordSoftwareInvoicePayment,
} from "../../services/softwareInvoiceService";
import { getSoftwareProjects } from "../../services/softwareProjectService";
import { getSoftwareContracts } from "../../services/softwareContractService";
import { getSoftwarePermissions } from "../../utils/softwarePermissions";

import type {
  SoftwareInvoice,
  SoftwareInvoiceCreate,
  SoftwareInvoiceItemCreate,
  SoftwareInvoicePaymentCreate,
} from "../../types/softwareInvoice";
import type { SoftwareProject } from "../../types/softwareProject";
import type { SoftwareContract } from "../../types/softwareContract";

import "./SoftwareModules.css";

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

export default function SoftwareInvoices() {
  const perms = useMemo(() => getSoftwarePermissions(), []);

  const [invoices, setInvoices] = useState<SoftwareInvoice[]>([]);
  const [projects, setProjects] = useState<SoftwareProject[]>([]);
  const [contracts, setContracts] = useState<SoftwareContract[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState<SoftwareInvoice | null>(null);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<SoftwareInvoice | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Create Form State
  const [formData, setFormData] = useState<{
    invoice_number: string;
    project_id: string;
    software_contract_id: string;
    issue_date: string;
    due_date: string;
    notes: string;
    items: SoftwareInvoiceItemCreate[];
  }>({
    invoice_number: "",
    project_id: "",
    software_contract_id: "",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: "",
    items: [],
  });

  // Record Payment Form State
  const [paymentForm, setPaymentForm] = useState<SoftwareInvoicePaymentCreate>({
    amount: 0,
    payment_method: "Bank Transfer",
    transaction_reference: "",
    payment_date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invData, projData, contData] = await Promise.all([
        getSoftwareInvoices(),
        getSoftwareProjects().catch(() => []),
        getSoftwareContracts().catch(() => []),
      ]);

      setInvoices(invData);
      setProjects(projData);
      setContracts(contData);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load software invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const contractMap = useMemo(
    () => new Map(contracts.map((c) => [c.id, `${c.contract_number} - ${c.title}`])),
    [contracts]
  );

  // Financial Stats (Calculated strictly from backend invoice records)
  const stats = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalBalance = 0;
    let overdueCount = 0;
    const today = new Date().toISOString().slice(0, 10);

    invoices.forEach((inv) => {
      if (inv.status !== "Void") {
        totalInvoiced += Number(inv.total_amount) || 0;
        totalPaid += Number(inv.amount_paid) || 0;
        totalBalance += Number(inv.balance_due) || 0;
        if (Number(inv.balance_due) > 0 && inv.due_date && inv.due_date < today) {
          overdueCount++;
        }
      }
    });

    return {
      totalInvoiced,
      totalPaid,
      totalBalance,
      overdueCount,
    };
  }, [invoices]);

  // Filtered List
  const filteredList = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter && inv.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (projectFilter && inv.project_id !== projectFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const projName = (projectMap.get(inv.project_id) || "").toLowerCase();
        const matchNum = (inv.invoice_number || "").toLowerCase().includes(q);
        const matchNotes = (inv.notes || "").toLowerCase().includes(q);
        const matchProj = projName.includes(q);
        if (!matchNum && !matchNotes && !matchProj) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, projectFilter, searchTerm, projectMap]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormError(null);
    setFormData({
      invoice_number: "",
      project_id: projects[0]?.id || "",
      software_contract_id: contracts[0]?.id || "",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: "",
      items: [
        {
          description: "",
          quantity: 1,
          unit_price: 0,
          tax_percent: 0,
        },
      ],
    });
    setIsCreateModalOpen(true);
  };

  // Add Line Item
  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          description: "",
          quantity: 1,
          unit_price: 0,
          tax_percent: 0,
        },
      ],
    }));
  };

  // Remove Line Item
  const handleRemoveItem = (index: number) => {
    if (formData.items.length <= 1) return;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  // Update Line Item
  const handleItemChange = (
    index: number,
    field: keyof SoftwareInvoiceItemCreate,
    value: any
  ) => {
    setFormData((prev) => {
      const updated = [...prev.items];
      const current = updated[index] || { description: "", quantity: 1, unit_price: 0 };
      updated[index] = { ...current, [field]: value } as SoftwareInvoiceItemCreate;
      return { ...prev, items: updated };
    });
  };

  // Computed Totals for Create Form
  const formTotals = useMemo(() => {
    let subtotal = 0;
    let taxAmount = 0;

    formData.items.forEach((item) => {
      const lineSub = Number(item.quantity || 0) * Number(item.unit_price || 0);
      const lineTax = (lineSub * Number(item.tax_percent || 0)) / 100;
      subtotal += lineSub;
      taxAmount += lineTax;
    });

    return {
      subtotal,
      taxAmount,
      totalAmount: subtotal + taxAmount,
    };
  }, [formData.items]);

  // Submit Invoice Creation
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.project_id) {
      setFormError("Please select a project.");
      return;
    }
    if (!formData.software_contract_id) {
      setFormError("Please select the linked software contract.");
      return;
    }
    if (!formData.invoice_number.trim()) {
      setFormError("Invoice number is required.");
      return;
    }
    if (formData.items.length === 0) {
      setFormError("At least one line item is required.");
      return;
    }
    for (const [i, it] of formData.items.entries()) {
      if (!it.description.trim()) {
        setFormError(`Item #${i + 1} requires a description.`);
        return;
      }
      if (Number(it.quantity) <= 0) {
        setFormError(`Item #${i + 1} quantity must be greater than 0.`);
        return;
      }
      if (Number(it.unit_price) < 0) {
        setFormError(`Item #${i + 1} unit price cannot be negative.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: SoftwareInvoiceCreate = {
        invoice_number: formData.invoice_number.trim(),
        project_id: formData.project_id,
        software_contract_id: formData.software_contract_id,
        issue_date: formData.issue_date || null,
        due_date: formData.due_date || null,
        notes: formData.notes.trim() || null,
        items: formData.items.map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          tax_percent: Number(it.tax_percent || 0),
        })),
      };

      const created = await createSoftwareInvoice(payload);
      setInvoices((prev) => [created, ...prev]);
      setIsCreateModalOpen(false);
      setActionMessage({
        text: `Invoice ${created.invoice_number} created successfully.`,
        type: "success",
      });
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  // Status Change (Mark Sent / Void)
  const handleUpdateStatus = async (invoiceId: string, status: "Sent" | "Void") => {
    try {
      const updated = await updateSoftwareInvoiceStatus(invoiceId, { status });
      setInvoices((prev) => prev.map((inv) => (inv.id === updated.id ? updated : inv)));
      if (viewingItem?.id === invoiceId) {
        setViewingItem(updated);
      }
      setActionMessage({ text: `Invoice marked as ${status}.`, type: "success" });
    } catch (err: any) {
      setActionMessage({
        text: err?.response?.data?.detail || err?.message || "Failed to update invoice status",
        type: "error",
      });
    }
  };

  // Open Record Payment Modal
  const handleOpenPaymentModal = (invoice: SoftwareInvoice) => {
    setPaymentModalInvoice(invoice);
    setPaymentFormError(null);
    setPaymentForm({
      amount: Number(invoice.balance_due),
      payment_method: "Bank Transfer",
      transaction_reference: "",
      payment_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
  };

  // Submit Payment Receipt
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalInvoice) return;

    setPaymentFormError(null);
    const enteredAmount = Number(paymentForm.amount);
    if (isNaN(enteredAmount) || enteredAmount <= 0) {
      setPaymentFormError("Payment amount must be greater than zero.");
      return;
    }

    if (enteredAmount > Number(paymentModalInvoice.balance_due)) {
      setPaymentFormError(
        `Payment amount cannot exceed the outstanding balance of ${formatCurrency(
          paymentModalInvoice.balance_due,
          paymentModalInvoice.currency
        )}.`
      );
      return;
    }

    if (!paymentForm.payment_method.trim()) {
      setPaymentFormError("Payment method is required.");
      return;
    }

    setSubmitting(true);
    try {
      const safeReference = paymentForm.transaction_reference?.trim() || null;

      const updated = await recordSoftwareInvoicePayment(paymentModalInvoice.id, {
        amount: enteredAmount,
        payment_method: paymentForm.payment_method.trim(),
        transaction_reference: safeReference,
        payment_date: paymentForm.payment_date || null,
        notes: paymentForm.notes?.trim() || null,
      });

      // Refresh authoritative invoice data
      const refreshedInvoice = await getSoftwareInvoice(updated.id);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === refreshedInvoice.id ? refreshedInvoice : inv))
      );
      if (viewingItem?.id === updated.id) {
        setViewingItem(refreshedInvoice);
      }

      setPaymentModalInvoice(null);
      setActionMessage({
        text: `Payment of ${formatCurrency(
          enteredAmount,
          refreshedInvoice.currency
        )} recorded successfully for ${refreshedInvoice.invoice_number}. Current status: ${refreshedInvoice.status
          }.`,
        type: "success",
      });
    } catch (err: any) {
      // Backend returns HTTP 409 Conflict if transaction reference already exists for tenant
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to record invoice payment receipt";
      setPaymentFormError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sw-module-page">
      {/* Header */}
      <div className="sw-module-header">
        <div className="sw-module-title-box">
          <h1>
            Software Invoices & Billing
            <span className="sw-count-badge">{invoices.length} Total</span>
          </h1>
          <p>
            Client billing, payment milestone progress invoices, receipts, transaction references,
            and revenue collection.
          </p>
        </div>
        {perms.canCreateInvoices && (
          <button className="sw-btn-primary" onClick={handleOpenCreate}>
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Invoice
          </button>
        )}
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          style={{
            marginBottom: "18px",
            padding: "12px 18px",
            borderRadius: "8px",
            fontSize: "0.88rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background:
              actionMessage.type === "success"
                ? "rgba(16, 185, 129, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${actionMessage.type === "success"
                ? "rgba(16, 185, 129, 0.3)"
                : "rgba(239, 68, 68, 0.3)"
              }`,
            color: actionMessage.type === "success" ? "#10b981" : "#ef4444",
          }}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            style={{
              background: "none",
              border: "none",
              color: "inherit",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Financial KPI Summary Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div
            style={{
              fontSize: "0.78rem",
              color: "#64748b",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Total Invoiced
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 700,
              color: "#0ea5e9",
              marginTop: "4px",
            }}
          >
            {formatCurrency(stats.totalInvoiced)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            Excluding void invoices
          </div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div
            style={{
              fontSize: "0.78rem",
              color: "#64748b",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Revenue Collected
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 700,
              color: "#10b981",
              marginTop: "4px",
            }}
          >
            {formatCurrency(stats.totalPaid)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            Settled client receipts
          </div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div
            style={{
              fontSize: "0.78rem",
              color: "#64748b",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Outstanding Balance
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 700,
              color: "#f59e0b",
              marginTop: "4px",
            }}
          >
            {formatCurrency(stats.totalBalance)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            Pending client clearance
          </div>
        </div>

        <div className="sw-table-card" style={{ padding: "18px 20px" }}>
          <div
            style={{
              fontSize: "0.78rem",
              color: "#64748b",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Overdue Invoices
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 700,
              color: stats.overdueCount > 0 ? "#ef4444" : "#10b981",
              marginTop: "4px",
            }}
          >
            {stats.overdueCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            Past due payment date
          </div>
        </div>
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
            placeholder="Search by invoice number, project, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="sw-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Invoice Statuses</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Partially Paid">Partially Paid</option>
          <option value="Paid">Paid</option>
          <option value="Void">Void</option>
        </select>

        <select
          className="sw-filter-select"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Invoices Table */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading invoices and billing records...
          </div>
        ) : error ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
            <p>{error}</p>
            <button className="sw-btn-secondary" onClick={loadData}>
              Retry
            </button>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            No software invoices found matching your criteria.
          </div>
        ) : (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Project</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Total Amount</th>
                <th>Amount Paid</th>
                <th>Balance Due</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((inv) => {
                const isOverdue =
                  Number(inv.balance_due) > 0 &&
                  inv.due_date &&
                  inv.due_date < new Date().toISOString().slice(0, 10);
                const canMarkSent = inv.status === "Draft" && perms.canUpdateInvoices;
                const canPay =
                  (inv.status === "Sent" || inv.status === "Partially Paid") &&
                  Number(inv.balance_due) > 0 &&
                  perms.canRecordPayment;
                const canVoid =
                  (inv.status === "Draft" || (inv.status === "Sent" && Number(inv.amount_paid) === 0)) &&
                  perms.canUpdateInvoices;

                return (
                  <tr key={inv.id}>
                    <td>
                      <button
                        onClick={() => setViewingItem(inv)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#0ea5e9",
                          fontWeight: 700,
                          cursor: "pointer",
                          padding: 0,
                          textDecoration: "underline",
                        }}
                      >
                        {inv.invoice_number}
                      </button>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {projectMap.get(inv.project_id) || "Project"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                        ID: {inv.project_id.slice(0, 8)}...
                      </div>
                    </td>

                    <td>{inv.issue_date || "—"}</td>

                    <td>
                      <span
                        style={{
                          color: isOverdue ? "#ef4444" : "inherit",
                          fontWeight: isOverdue ? 700 : "normal",
                        }}
                      >
                        {inv.due_date || "—"}
                        {isOverdue && (
                          <span style={{ marginLeft: "4px", fontSize: "0.7rem" }}>(Overdue)</span>
                        )}
                      </span>
                    </td>

                    <td style={{ fontWeight: 700 }}>
                      {formatCurrency(inv.total_amount, inv.currency)}
                    </td>

                    <td style={{ color: "#10b981", fontWeight: 600 }}>
                      {formatCurrency(inv.amount_paid, inv.currency)}
                    </td>

                    <td
                      style={{
                        fontWeight: 700,
                        color: Number(inv.balance_due) > 0 ? "#f59e0b" : "#10b981",
                      }}
                    >
                      {formatCurrency(inv.balance_due, inv.currency)}
                    </td>

                    <td>
                      <span
                        className={`sw-badge ${inv.status === "Paid"
                            ? "accepted"
                            : inv.status === "Sent"
                              ? "proposal"
                              : inv.status === "Partially Paid"
                                ? "under-review"
                                : inv.status === "Void"
                                  ? "rejected"
                                  : "draft"
                          }`}
                      >
                        {inv.status}
                      </span>
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div className="sw-row-actions" style={{ justifyContent: "flex-end" }}>
                        <button
                          className="sw-btn-icon"
                          title="View Invoice & Payment History"
                          onClick={() => setViewingItem(inv)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>

                        {canMarkSent && (
                          <button
                            className="sw-btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.72rem" }}
                            title="Mark as Sent to Client"
                            onClick={() => handleUpdateStatus(inv.id, "Sent")}
                          >
                            Send
                          </button>
                        )}

                        {canPay && (
                          <button
                            className="sw-btn-primary"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.72rem",
                              background: "#10b981",
                            }}
                            title="Record Payment Receipt with Reference"
                            onClick={() => handleOpenPaymentModal(inv)}
                          >
                            Record Payment
                          </button>
                        )}

                        {canVoid && (
                          <button
                            className="sw-btn-icon danger"
                            title="Void Invoice"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Are you sure you want to void invoice ${inv.invoice_number}?`
                                )
                              ) {
                                handleUpdateStatus(inv.id, "Void");
                              }
                            }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Invoice Modal */}
      {isCreateModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div
            className="sw-modal-card sw-invoice-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Create Software Invoice</h2>
              <button className="sw-btn-icon" onClick={() => setIsCreateModalOpen(false)}>
                ✕
              </button>
            </div>
            <form className="sw-modal-form" onSubmit={handleCreateSubmit}>
              <div className="sw-modal-body">
                {formError && <div className="sw-error-banner">{formError}</div>}

                <div className="sw-invoice-form-grid">
                  <div className="sw-form-group">
                    <label>Invoice Number *</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      required
                      placeholder="e.g. SINV-2026-001"
                      value={formData.invoice_number}
                      onChange={(e) =>
                        setFormData({ ...formData, invoice_number: e.target.value })
                      }
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Software Project *</label>
                    <select
                      className="sw-form-select"
                      required
                      value={formData.project_id}
                      onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                    >
                      <option value="">Select Delivery Project...</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group span-2">
                    <label>Linked Software Contract *</label>
                    <select
                      className="sw-form-select"
                      required
                      value={formData.software_contract_id}
                      onChange={(e) =>
                        setFormData({ ...formData, software_contract_id: e.target.value })
                      }
                    >
                      <option value="">Select Linked Contract...</option>
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.contract_number} — {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Issue Date *</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      required
                      value={formData.issue_date}
                      onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Due Date *</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      required
                      min={formData.issue_date}
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* Line Items */}
                <div className="sw-invoice-items-section">
                  <div className="sw-invoice-items-section-header">
                    <div className="sw-invoice-items-title">
                      <h3>Invoice Line Items</h3>
                      <span className="sw-items-count-badge">
                        {formData.items.length} {formData.items.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="sw-btn-secondary"
                      style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                      onClick={handleAddItem}
                    >
                      + Add Item
                    </button>
                  </div>

                  {/* Desktop Column Header */}
                  <div className="sw-invoice-items-header">
                    <span>Description *</span>
                    <span>Qty *</span>
                    <span>Unit Price *</span>
                    <span>Tax %</span>
                    <span style={{ textAlign: "right", paddingRight: "4px" }}>Line Total</span>
                    <span></span>
                  </div>

                  {/* Line Item Rows */}
                  <div className="sw-invoice-items-list">
                    {formData.items.map((item, idx) => {
                      const lineSub = Number(item.quantity || 0) * Number(item.unit_price || 0);
                      const lineTax = (lineSub * Number(item.tax_percent || 0)) / 100;
                      const lineTotal = lineSub + lineTax;

                      return (
                        <div className="sw-invoice-item-row" key={idx}>
                          <div className="sw-invoice-item-field sw-field-desc">
                            <span className="sw-mobile-label">Description *</span>
                            <input
                              type="text"
                              className="sw-form-input"
                              required
                              placeholder="Service description or milestone..."
                              value={item.description}
                              onChange={(e) =>
                                handleItemChange(idx, "description", e.target.value)
                              }
                            />
                          </div>

                          <div className="sw-invoice-item-field">
                            <span className="sw-mobile-label">Qty *</span>
                            <input
                              type="number"
                              className="sw-form-input"
                              min="0.0001"
                              step="any"
                              required
                              value={item.quantity}
                              onChange={(e) =>
                                handleItemChange(
                                  idx,
                                  "quantity",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </div>

                          <div className="sw-invoice-item-field">
                            <span className="sw-mobile-label">Unit Price *</span>
                            <input
                              type="number"
                              className="sw-form-input"
                              min="0"
                              step="any"
                              required
                              value={item.unit_price}
                              onChange={(e) =>
                                handleItemChange(
                                  idx,
                                  "unit_price",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </div>

                          <div className="sw-invoice-item-field">
                            <span className="sw-mobile-label">Tax %</span>
                            <input
                              type="number"
                              className="sw-form-input"
                              min="0"
                              max="100"
                              value={item.tax_percent}
                              onChange={(e) =>
                                handleItemChange(
                                  idx,
                                  "tax_percent",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </div>

                          <div className="sw-invoice-item-total">
                            <span className="sw-mobile-label">Total</span>
                            <span>{formatCurrency(lineTotal)}</span>
                          </div>

                          <div className="sw-invoice-item-action">
                            {formData.items.length > 1 ? (
                              <button
                                type="button"
                                className="sw-btn-icon danger"
                                title="Remove Item"
                                onClick={() => handleRemoveItem(idx)}
                              >
                                ✕
                              </button>
                            ) : (
                              <span style={{ width: "32px" }}></span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Totals Summary */}
                  <div className="sw-invoice-totals-wrapper">
                    <div className="sw-invoice-totals-card">
                      <div className="sw-invoice-total-row">
                        <span>Subtotal:</span>
                        <span className="value">
                          {formatCurrency(formTotals.subtotal)}
                        </span>
                      </div>
                      <div className="sw-invoice-total-row">
                        <span>Tax Amount:</span>
                        <span className="value">
                          {formatCurrency(formTotals.taxAmount)}
                        </span>
                      </div>
                      <div className="sw-invoice-total-row grand">
                        <span>Grand Total:</span>
                        <span className="value">
                          {formatCurrency(formTotals.totalAmount)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sw-form-group" style={{ marginTop: "8px" }}>
                  <label>Notes / Billing Instructions</label>
                  <textarea
                    className="sw-form-textarea"
                    placeholder="Payment instructions, bank wire remarks..."
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : "Create Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Details Modal with Payment History & Transaction References */}
      {viewingItem && (
        <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "780px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Invoice {viewingItem.invoice_number}</h2>
              <button className="sw-btn-icon" onClick={() => setViewingItem(null)}>
                ✕
              </button>
            </div>
            <div className="sw-modal-body">
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <span
                  className={`sw-badge ${viewingItem.status?.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  Status: {viewingItem.status}
                </span>
                <span className="sw-badge proposal">
                  Project: {projectMap.get(viewingItem.project_id) || viewingItem.project_id}
                </span>
                {viewingItem.software_contract_id && (
                  <span className="sw-badge discovery">
                    Contract:{" "}
                    {contractMap.get(viewingItem.software_contract_id) ||
                      viewingItem.software_contract_id.slice(0, 8)}
                  </span>
                )}
                <span className="sw-badge discovery">Issue: {viewingItem.issue_date}</span>
                <span className="sw-badge planned">Due: {viewingItem.due_date || "—"}</span>
              </div>

              {/* Financial Balances Summary */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                  padding: "16px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>TOTAL INVOICE</div>
                  <div
                    style={{
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      color: "#0ea5e9",
                      marginTop: "2px",
                    }}
                  >
                    {formatCurrency(viewingItem.total_amount, viewingItem.currency)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>AMOUNT PAID</div>
                  <div
                    style={{
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      color: "#10b981",
                      marginTop: "2px",
                    }}
                  >
                    {formatCurrency(viewingItem.amount_paid, viewingItem.currency)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>OUTSTANDING BALANCE</div>
                  <div
                    style={{
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      color: Number(viewingItem.balance_due) > 0 ? "#f59e0b" : "#10b981",
                      marginTop: "2px",
                    }}
                  >
                    {formatCurrency(viewingItem.balance_due, viewingItem.currency)}
                  </div>
                </div>
              </div>

              {/* Billed Items Table */}
              <h4 style={{ margin: "14px 0 8px 0" }}>Billed Items</h4>
              <table className="sw-data-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Rate</th>
                    <th>Tax %</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingItem.items || []).map((it) => (
                    <tr key={it.id}>
                      <td>{it.description}</td>
                      <td>{it.quantity}</td>
                      <td>{formatCurrency(it.unit_price, viewingItem.currency)}</td>
                      <td>{it.tax_percent}%</td>
                      <td style={{ fontWeight: 600 }}>
                        {formatCurrency(
                          it.line_total ?? (Number(it.quantity) * Number(it.unit_price)),
                          viewingItem.currency
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!viewingItem.items || viewingItem.items.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "#94a3b8" }}>
                        Standard Milestone Delivery
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Payment History Table with Payment / Transaction References */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  margin: "24px 0 8px 0",
                }}
              >
                <h4 style={{ margin: 0 }}>Payment History</h4>
                {Number(viewingItem.balance_due) > 0 &&
                  (viewingItem.status === "Sent" || viewingItem.status === "Partially Paid") &&
                  perms.canRecordPayment && (
                    <button
                      className="sw-btn-primary"
                      style={{
                        padding: "4px 10px",
                        fontSize: "0.75rem",
                        background: "#10b981",
                      }}
                      onClick={() => handleOpenPaymentModal(viewingItem)}
                    >
                      + Record Payment
                    </button>
                  )}
              </div>

              <table className="sw-data-table">
                <thead>
                  <tr>
                    <th>Payment Date</th>
                    <th>Method</th>
                    <th>Payment Reference / Transaction Reference</th>
                    <th>Notes</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingItem.payments || []).map((pm) => (
                    <tr key={pm.id}>
                      <td>{pm.payment_date}</td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{pm.payment_method}</span>
                      </td>
                      <td>
                        {pm.transaction_reference ? (
                          <span
                            style={{
                              fontFamily: "monospace",
                              fontWeight: 600,
                              color: "#0ea5e9",
                              background: "rgba(14, 165, 233, 0.1)",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              border: "1px solid rgba(14, 165, 233, 0.25)",
                            }}
                          >
                            {pm.transaction_reference}
                          </span>
                        ) : (
                          <span style={{ color: "#64748b" }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                        {pm.notes || "—"}
                      </td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#10b981" }}>
                        {formatCurrency(pm.amount, viewingItem.currency)}
                      </td>
                    </tr>
                  ))}
                  {(!viewingItem.payments || viewingItem.payments.length === 0) && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "#94a3b8", padding: "18px" }}>
                        No payment receipts recorded yet for this invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {viewingItem.notes && (
                <div style={{ marginTop: "16px", fontSize: "0.85rem", color: "#94a3b8" }}>
                  <strong>Notes:</strong> {viewingItem.notes}
                </div>
              )}
            </div>

            <div className="sw-modal-footer">
              {viewingItem.status === "Draft" && perms.canUpdateInvoices && (
                <button
                  className="sw-btn-primary"
                  onClick={() => handleUpdateStatus(viewingItem.id, "Sent")}
                >
                  Mark as Sent
                </button>
              )}
              {Number(viewingItem.balance_due) > 0 &&
                (viewingItem.status === "Sent" || viewingItem.status === "Partially Paid") &&
                perms.canRecordPayment && (
                  <button
                    className="sw-btn-primary"
                    style={{ background: "#10b981" }}
                    onClick={() => handleOpenPaymentModal(viewingItem)}
                  >
                    Record Payment
                  </button>
                )}
              <button className="sw-btn-secondary" onClick={() => setViewingItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Receipt Modal */}
      {paymentModalInvoice && (
        <div className="sw-modal-overlay" onClick={() => setPaymentModalInvoice(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Record Payment for {paymentModalInvoice.invoice_number}</h2>
              <button className="sw-btn-icon" onClick={() => setPaymentModalInvoice(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handlePaymentSubmit}>
              <div className="sw-modal-body">
                {paymentFormError && (
                  <div
                    className="sw-error-banner"
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      border: "1px solid rgba(239, 68, 68, 0.4)",
                      color: "#ef4444",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      marginBottom: "14px",
                      fontSize: "0.84rem",
                    }}
                  >
                    <strong>Payment Error:</strong> {paymentFormError}
                  </div>
                )}

                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: "6px",
                    marginBottom: "14px",
                    fontSize: "0.84rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total Invoice Amount:</span>
                    <span style={{ fontWeight: 600 }}>
                      {formatCurrency(
                        paymentModalInvoice.total_amount,
                        paymentModalInvoice.currency
                      )}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: "4px",
                    }}
                  >
                    <span>Current Outstanding Balance:</span>
                    <span style={{ fontWeight: 700, color: "#f59e0b" }}>
                      {formatCurrency(
                        paymentModalInvoice.balance_due,
                        paymentModalInvoice.currency
                      )}
                    </span>
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>
                    Payment Amount ({paymentModalInvoice.currency || "INR"}) *
                  </label>
                  <input
                    type="number"
                    className="sw-form-input"
                    required
                    min="0.01"
                    step="0.01"
                    max={Number(paymentModalInvoice.balance_due)}
                    value={paymentForm.amount || ""}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        amount: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <span style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                    Must be greater than 0 and cannot exceed{" "}
                    {formatCurrency(
                      paymentModalInvoice.balance_due,
                      paymentModalInvoice.currency
                    )}
                    .
                  </span>
                </div>

                <div className="sw-form-group">
                  <label>Payment Method *</label>
                  <select
                    className="sw-form-select"
                    required
                    value={paymentForm.payment_method}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, payment_method: e.target.value })
                    }
                  >
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                    <option value="Wire Transfer">Wire Transfer (SWIFT)</option>
                    <option value="UPI">UPI</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Direct Debit">Direct Debit / ACH</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>

                <div className="sw-form-group">
                  <label>Payment Reference / Transaction Reference</label>
                  <input
                    type="text"
                    className="sw-form-input"
                    maxLength={150}
                    placeholder="e.g. UTR1029384857 or TXN-998877"
                    value={paymentForm.transaction_reference || ""}
                    onChange={(e) =>
                      setPaymentForm({
                        ...paymentForm,
                        transaction_reference: e.target.value,
                      })
                    }
                  />
                  <span style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                    Enter actual bank UTR, UPI transaction ID, cheque number, or gateway reference. Must be unique per tenant.
                  </span>
                </div>

                <div className="sw-form-group">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    className="sw-form-input"
                    value={paymentForm.payment_date || ""}
                    onChange={(e) =>
                      setPaymentForm({ ...paymentForm, payment_date: e.target.value })
                    }
                  />
                </div>

                <div className="sw-form-group">
                  <label>Notes / Remittance Advice (Optional)</label>
                  <textarea
                    className="sw-form-textarea"
                    maxLength={2000}
                    placeholder="Bank remarks, clearance notes, remittance details..."
                    value={paymentForm.notes || ""}
                    onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Max 2,000 characters
                  </span>
                </div>
              </div>

              <div className="sw-modal-footer">
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => setPaymentModalInvoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sw-btn-primary"
                  style={{ background: "#10b981" }}
                  disabled={submitting}
                >
                  {submitting ? "Processing..." : "Confirm Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
