import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSoftwareContracts,
  getSoftwareContract,
  createSoftwareContract,
  updateSoftwareContract,
  deleteSoftwareContract,
  markContractMilestoneReady,
  invoiceContractMilestone,
} from "../../services/softwareContractService";
import { clearSoftwareForbidden, extractBackendDetail } from "../../services/softwareRequestManager";
import { getSoftwareEstimates } from "../../services/softwareEstimateService";
import { getUsers } from "../../services/userService";
import { getSoftwarePermissions } from "../../utils/softwarePermissions";

import type {
  SoftwareContract,
  SoftwareContractCreate,
  SoftwareContractUpdate,
  SoftwareContractStatus,
  SoftwareContractMilestone,
  SoftwareContractMilestoneCreate,
} from "../../types/softwareContract";
import { SOFTWARE_CONTRACT_STATUSES } from "../../types/softwareContract";
import type { SoftwareEstimate } from "../../types/softwareEstimate";
import type { User } from "../../types/user";

import "./SoftwareModules.css";

function formatCurrency(amount: number | string | undefined | null, currencyCode: string = "INR"): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || "0")) || 0;
  const curr = (currencyCode || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: curr,
      maximumFractionDigits: 2,
    }).format(num);
  } catch {
    return `${curr} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export default function SoftwareContracts() {
  const perms = useMemo(() => getSoftwarePermissions(), []);

  const [contracts, setContracts] = useState<SoftwareContract[]>([]);
  const [estimates, setEstimates] = useState<SoftwareEstimate[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estimatesLoading, setEstimatesLoading] = useState(false);
  const [estimatesError, setEstimatesError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SoftwareContract | null>(null);
  const [viewingItem, setViewingItem] = useState<SoftwareContract | null>(null);
  const [deletingItem, setDeletingItem] = useState<SoftwareContract | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Milestone Actions: Mark Ready confirmation modal state
  const [readyingMilestone, setReadyingMilestone] = useState<{
    contractId: string;
    milestone: SoftwareContractMilestone;
    notes: string;
  } | null>(null);
  const [readyModalError, setReadyModalError] = useState<string | null>(null);

  // Milestone Actions: Generate Invoice modal state
  const [invoicingMilestone, setInvoicingMilestone] = useState<{
    contractId: string;
    milestone: SoftwareContractMilestone;
  } | null>(null);
  const [milestoneInvoiceForm, setMilestoneInvoiceForm] = useState({
    invoice_number: "",
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: "",
  });
  const [invoiceModalError, setInvoiceModalError] = useState<string | null>(null);

  // Form State: Starts with an EMPTY milestone list (no hardcoded/dummy records)
  const [formData, setFormData] = useState<SoftwareContractCreate & { status?: SoftwareContractStatus }>({
    software_estimate_id: "",
    title: "",
    description: "",
    assigned_to: null,
    issue_date: new Date().toISOString().slice(0, 10),
    start_date: "",
    end_date: "",
    scope_of_work: "",
    deliverables: "",
    payment_terms: "",
    terms_and_conditions: "",
    notes: "",
    status: "Draft",
    milestone_billing_mode: "Sequential",
    payment_milestones: [],
  });

  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenDetail, setForbiddenDetail] = useState<string | null>(null);

  const loadEstimates = useCallback(async (force = false) => {
    setEstimatesLoading(true);
    setEstimatesError(null);
    try {
      const list = await getSoftwareEstimates(undefined, { forceRetry: force });
      const valid = Array.isArray(list) ? list : [];
      setEstimates(valid);
      return valid;
    } catch (err: any) {
      const msg = extractBackendDetail(err) || "Failed to load software estimates";
      setEstimatesError(msg);
      return [];
    } finally {
      setEstimatesLoading(false);
    }
  }, []);

  const loadData = useCallback(async (forceRetry = false) => {
    setLoading(true);
    setError(null);
    if (forceRetry) {
      clearSoftwareForbidden("software_contracts");
      clearSoftwareForbidden("software_estimates");
      setIsForbidden(false);
      setForbiddenDetail(null);
    }

    setEstimatesLoading(true);
    setEstimatesError(null);

    try {
      const [contRes, estRes, usersRes] = await Promise.allSettled([
        getSoftwareContracts(undefined, { forceRetry }),
        getSoftwareEstimates(undefined, { forceRetry }),
        getUsers(),
      ]);

      if (contRes.status === "fulfilled") {
        setContracts(Array.isArray(contRes.value) ? contRes.value : []);
        setIsForbidden(false);
        setForbiddenDetail(null);
      } else {
        const err = contRes.reason;
        if (err?.response?.status === 403 || err?.isCachedForbidden) {
          setIsForbidden(true);
          setForbiddenDetail(extractBackendDetail(err));
        } else {
          setError(extractBackendDetail(err));
        }
      }

      if (estRes.status === "fulfilled") {
        const estList = Array.isArray(estRes.value) ? estRes.value : [];
        setEstimates(estList);
        setEstimatesError(null);
      } else {
        setEstimates([]);
        setEstimatesError(extractBackendDetail(estRes.reason));
      }

      if (usersRes.status === "fulfilled") {
        setUsers(Array.isArray(usersRes.value) ? usersRes.value : []);
      }
    } finally {
      setLoading(false);
      setEstimatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    const handleSoftwareDataChanged = (e: any) => {
      const moduleKey = e?.detail?.moduleKey;
      if (!moduleKey || moduleKey === "software_estimates" || moduleKey === "software_contracts") {
        void loadData(true);
      }
    };
    window.addEventListener("scuilone:software_data_changed", handleSoftwareDataChanged);
    return () => {
      window.removeEventListener("scuilone:software_data_changed", handleSoftwareDataChanged);
    };
  }, [loadData]);

  const estMap = useMemo(() => new Map(estimates.map((e) => [e.id, e.title])), [estimates]);
  const contractedEstimateMap = useMemo(() => {
    const map = new Map<string, SoftwareContract>();
    for (const c of contracts) {
      if (c.software_estimate_id) {
        if (!editingItem || c.id !== editingItem.id) {
          map.set(c.software_estimate_id, c);
        }
      }
    }
    return map;
  }, [contracts, editingItem]);

  const selectedEstimate = useMemo(
    () => estimates.find((e) => e.id === formData.software_estimate_id),
    [estimates, formData.software_estimate_id]
  );
  const effectiveBillingType = editingItem?.billing_type || selectedEstimate?.billing_type || "Fixed Price";
  const effectiveHourlyRate = editingItem?.hourly_rate ?? selectedEstimate?.hourly_rate ?? null;
  const effectiveCurrency = editingItem?.currency || selectedEstimate?.currency || "INR";

  const selectedEstimateContract = useMemo(() => {
    if (!formData.software_estimate_id) return null;
    return contractedEstimateMap.get(formData.software_estimate_id) || null;
  }, [contractedEstimateMap, formData.software_estimate_id]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.full_name])), [users]);

  // Filtered List
  const filteredList = useMemo(() => {
    return contracts.filter((c) => {
      if (statusFilter && c.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const estTitle = estMap.get(c.software_estimate_id)?.toLowerCase() || "";
        const matchTitle = (c.title || "").toLowerCase().includes(q);
        const matchNum = (c.contract_number || "").toLowerCase().includes(q);
        const matchEst = estTitle.includes(q);
        if (!matchTitle && !matchNum && !matchEst) return false;
      }
      return true;
    });
  }, [contracts, statusFilter, searchTerm, estMap]);

  // Milestone sum in form (calculated with 2 decimal places precision)
  const milestoneTotalPercentage = useMemo(() => {
    const sum = (formData.payment_milestones || []).reduce(
      (acc, m) => acc + (Number(m.percentage) || 0),
      0
    );
    return Math.round(sum * 100) / 100;
  }, [formData.payment_milestones]);

  const handleOpenCreate = async () => {
    setEditingItem(null);
    setFormError(null);

    // Immediate initial state using currently loaded estimates
    const currentEligible =
      estimates.find(
        (e) => e.status === "Accepted" && !contractedEstimateMap.has(e.id)
      ) || estimates[0];

    setFormData({
      software_estimate_id: currentEligible?.id || "",
      title: currentEligible ? `${currentEligible.title} Contract` : "",
      description: currentEligible?.description || "",
      assigned_to: currentEligible?.assigned_to || users[0]?.id || null,
      issue_date: new Date().toISOString().slice(0, 10),
      start_date: new Date().toISOString().slice(0, 10),
      end_date: currentEligible?.expiry_date || "",
      scope_of_work: currentEligible?.description || "",
      deliverables: currentEligible ? `Deliverables as defined in ${currentEligible.title}` : "",
      payment_terms: currentEligible?.terms_and_conditions || "",
      terms_and_conditions: "",
      notes: currentEligible?.notes || "",
      status: "Draft",
      milestone_billing_mode: "Sequential",
      payment_milestones: [],
    });
    setIsModalOpen(true);

    clearSoftwareForbidden("software_estimates");
    const freshEstimates = await loadEstimates(true);
    if (freshEstimates.length > 0) {
      setFormData((prev) => {
        // Auto-select eligible estimate if user has not manually picked one
        if (!prev.software_estimate_id) {
          const freshEligible =
            freshEstimates.find(
              (e) => e.status === "Accepted" && !contractedEstimateMap.has(e.id)
            ) || freshEstimates[0];
          if (freshEligible) {
            return {
              ...prev,
              software_estimate_id: freshEligible.id,
              title: prev.title || `${freshEligible.title} Contract`,
              scope_of_work: prev.scope_of_work || freshEligible.description || "",
              deliverables:
                prev.deliverables || `Deliverables as defined in ${freshEligible.title}`,
              payment_terms:
                prev.payment_terms || freshEligible.terms_and_conditions || "",
              assigned_to: prev.assigned_to || freshEligible.assigned_to || null,
              end_date: prev.end_date || freshEligible.expiry_date || "",
            };
          }
        }
        return prev;
      });
    }
  };

  const handleOpenEdit = (item: SoftwareContract) => {
    setEditingItem(item);
    setFormError(null);
    setFormData({
      software_estimate_id: item.software_estimate_id,
      title: item.title,
      description: item.description || "",
      assigned_to: item.assigned_to || null,
      issue_date: item.issue_date || "",
      start_date: item.start_date || "",
      end_date: item.end_date || "",
      scope_of_work: item.scope_of_work,
      deliverables: item.deliverables,
      payment_terms: item.payment_terms || "",
      terms_and_conditions: item.terms_and_conditions || "",
      notes: item.notes || "",
      status: (item.status as SoftwareContractStatus) || "Draft",
      milestone_billing_mode: item.milestone_billing_mode || "Sequential",
      payment_milestones: [],
    });
    setIsModalOpen(true);
  };

  const handleAddMilestone = () => {
    const currentList = formData.payment_milestones || [];
    if (currentList.length >= 20) {
      alert("A contract cannot have more than 20 payment milestones.");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      payment_milestones: [
        ...(prev.payment_milestones || []),
        {
          name: "",
          percentage: 0,
          trigger_description: "",
        },
      ],
    }));
  };

  const handleRemoveMilestone = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      payment_milestones: (prev.payment_milestones || []).filter((_, idx) => idx !== index),
    }));
  };

  const handleMilestoneChange = (
    index: number,
    field: keyof SoftwareContractMilestoneCreate,
    val: any
  ) => {
    setFormData((prev) => {
      const updated = [...(prev.payment_milestones || [])];
      const current = updated[index] || { name: "", percentage: 0 };
      updated[index] = { ...current, [field]: val } as SoftwareContractMilestoneCreate;
      return { ...prev, payment_milestones: updated };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.software_estimate_id) {
      setFormError("Please select a linked Software Estimate.");
      return;
    }
    const matchEst = estimates.find((e) => e.id === formData.software_estimate_id);
    if (!editingItem && matchEst && matchEst.status !== "Accepted") {
      setFormError(
        `Estimate "${matchEst.title}" is in "${matchEst.status}" status. Backend business rules require an estimate to be in "Accepted" status to create a contract. Please accept the estimate in Software Estimates first.`
      );
      return;
    }
    if (!editingItem && selectedEstimateContract) {
      setFormError(
        `Contract "${selectedEstimateContract.contract_number}" already exists for this estimate. An estimate can only have one contract.`
      );
      return;
    }
    if (!formData.scope_of_work.trim()) {
      setFormError("Scope of work is required.");
      return;
    }
    if (!formData.deliverables.trim()) {
      setFormError("Deliverables are required.");
      return;
    }
    if (formData.start_date && formData.end_date && formData.end_date < formData.start_date) {
      setFormError("End date cannot precede the start date.");
      return;
    }

    // Billing-Type-Based Validations when creating a contract
    if (!editingItem) {
      if (effectiveBillingType === "Fixed Price") {
        if (!formData.payment_milestones || formData.payment_milestones.length === 0) {
          setFormError("Fixed Price contracts require at least one payment milestone. Please add a valid payment milestone plan totalling 100.00%.");
          return;
        }
        if (formData.payment_milestones.length > 20) {
          setFormError("Maximum 20 payment milestones allowed.");
          return;
        }

        for (const [i, m] of formData.payment_milestones.entries()) {
          if (!m.name.trim()) {
            setFormError(`Milestone #${i + 1} requires a valid name (1-120 characters).`);
            return;
          }
          if (m.name.length > 120) {
            setFormError(`Milestone #${i + 1} name must not exceed 120 characters.`);
            return;
          }
          const pct = Number(m.percentage);
          if (isNaN(pct) || pct <= 0 || pct > 100) {
            setFormError(`Milestone #${i + 1} percentage must be greater than 0% and at most 100%.`);
            return;
          }
        }

        if (milestoneTotalPercentage !== 100) {
          setFormError(
            `Payment milestone percentages must total exactly 100% (currently ${milestoneTotalPercentage.toFixed(2)}%).`
          );
          return;
        }
      } else if (effectiveBillingType === "Time & Material") {
        if (effectiveHourlyRate === null || effectiveHourlyRate === undefined || Number(effectiveHourlyRate) <= 0) {
          setFormError("Time & Material contracts require a valid positive hourly rate from the accepted estimate.");
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      if (editingItem) {
        const payload: SoftwareContractUpdate = {
          title: formData.title,
          description: formData.description,
          assigned_to: formData.assigned_to,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          status: formData.status,
          scope_of_work: formData.scope_of_work,
          deliverables: formData.deliverables,
          payment_terms: formData.payment_terms,
          milestone_billing_mode: editingItem.billing_type === "Fixed Price" ? (formData.milestone_billing_mode || "Sequential") : undefined,
          terms_and_conditions: formData.terms_and_conditions,
          notes: formData.notes,
        };
        const updated = await updateSoftwareContract(editingItem.id, payload);
        setContracts((prev) => prev.map((c) => (c.id === editingItem.id ? updated : c)));
        if (viewingItem?.id === editingItem.id) {
          setViewingItem(updated);
        }
        setActionMessage({ text: "Contract updated successfully.", type: "success" });
      } else {
        const payload: SoftwareContractCreate = {
          software_estimate_id: formData.software_estimate_id,
          title: formData.title || undefined,
          description: formData.description || undefined,
          assigned_to: formData.assigned_to || undefined,
          issue_date: formData.issue_date || undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          scope_of_work: formData.scope_of_work,
          deliverables: formData.deliverables,
          payment_terms: formData.payment_terms || undefined,
          milestone_billing_mode: effectiveBillingType === "Fixed Price" ? (formData.milestone_billing_mode || "Sequential") : undefined,
          terms_and_conditions: formData.terms_and_conditions || undefined,
          notes: formData.notes || undefined,
          payment_milestones:
            effectiveBillingType === "Fixed Price" && formData.payment_milestones && formData.payment_milestones.length > 0
              ? formData.payment_milestones.map((m) => ({
                name: m.name.trim(),
                percentage: Number(m.percentage),
                trigger_description: m.trigger_description?.trim() || null,
              }))
              : [],
        };
        const created = await createSoftwareContract(payload);
        setContracts((prev) => [created, ...prev]);
        setActionMessage({
          text: `Contract ${created.contract_number} created successfully with ${created.payment_milestones?.length || 0} milestones.`,
          type: "success",
        });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(extractBackendDetail(err) || "Failed to save contract");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setSubmitting(true);
    try {
      await deleteSoftwareContract(deletingItem.id);
      setContracts((prev) => prev.filter((c) => c.id !== deletingItem.id));
      if (viewingItem?.id === deletingItem.id) {
        setViewingItem(null);
      }
      setDeletingItem(null);
      setActionMessage({ text: `Contract ${deletingItem.contract_number} deleted.`, type: "success" });
    } catch (err: any) {
      alert("Failed to delete contract: " + (err?.response?.data?.detail || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  // Milestone Actions: Mark as Ready Dialog Handlers
  const handleOpenMarkReadyDialog = (contractId: string, milestone: SoftwareContractMilestone) => {
    setReadyModalError(null);
    setReadyingMilestone({
      contractId,
      milestone,
      notes: "",
    });
  };

  const handleConfirmMarkMilestoneReady = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!readyingMilestone) return;

    setSubmitting(true);
    setReadyModalError(null);
    try {
      await markContractMilestoneReady(
        readyingMilestone.contractId,
        readyingMilestone.milestone.id,
        { notes: readyingMilestone.notes.trim() || null }
      );

      // Refresh contract from backend to guarantee authoritative state
      const refreshedContract = await getSoftwareContract(readyingMilestone.contractId);
      setContracts((prev) =>
        prev.map((c) => (c.id === refreshedContract.id ? refreshedContract : c))
      );
      if (viewingItem?.id === readyingMilestone.contractId) {
        setViewingItem(refreshedContract);
      }

      setReadyingMilestone(null);
      setActionMessage({
        text: `Milestone "${readyingMilestone.milestone.name}" marked Ready for billing.`,
        type: "success",
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to mark milestone ready";
      setReadyModalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Milestone Actions: Generate Invoice Dialog Handlers
  const handleOpenMilestoneInvoiceModal = (
    contractId: string,
    milestone: SoftwareContractMilestone
  ) => {
    setInvoiceModalError(null);
    setInvoicingMilestone({ contractId, milestone });
    setMilestoneInvoiceForm({
      invoice_number: "", // Leave blank to allow backend auto-generation
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: `Billing for milestone: ${milestone.name} (${milestone.percentage}%)`,
    });
  };

  const handleGenerateMilestoneInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoicingMilestone) return;

    setSubmitting(true);
    setInvoiceModalError(null);
    try {
      const updatedMs = await invoiceContractMilestone(
        invoicingMilestone.contractId,
        invoicingMilestone.milestone.id,
        {
          invoice_number: milestoneInvoiceForm.invoice_number.trim() || null,
          due_date: milestoneInvoiceForm.due_date || null,
          notes: milestoneInvoiceForm.notes.trim() || null,
        }
      );

      // Refresh authoritative contract record from backend
      const refreshedContract = await getSoftwareContract(invoicingMilestone.contractId);
      setContracts((prev) =>
        prev.map((c) => (c.id === refreshedContract.id ? refreshedContract : c))
      );
      if (viewingItem?.id === invoicingMilestone.contractId) {
        setViewingItem(refreshedContract);
      }

      setInvoicingMilestone(null);
      setActionMessage({
        text: `Invoice generated successfully for milestone "${updatedMs.name}". Linked invoice ID: ${updatedMs.invoice_id || "assigned"}`,
        type: "success",
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || "Failed to generate invoice for milestone";
      setInvoiceModalError(msg);
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
            Software Contracts
            <span className="sw-count-badge">{contracts.length} Total</span>
          </h1>
          <p>
            Master Service Agreements, signed delivery scopes, deliverables, timelines, and payment
            milestones.
          </p>
        </div>
        {perms.canCreateContracts && (
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
            Create Contract
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
                : actionMessage.type === "info"
                ? "rgba(14, 165, 233, 0.15)"
                : "rgba(239, 68, 68, 0.15)",
            border: `1px solid ${
              actionMessage.type === "success"
                ? "rgba(16, 185, 129, 0.3)"
                : actionMessage.type === "info"
                ? "rgba(14, 165, 233, 0.3)"
                : "rgba(239, 68, 68, 0.3)"
            }`,
            color:
              actionMessage.type === "success"
                ? "#10b981"
                : actionMessage.type === "info"
                ? "#0284c7"
                : "#ef4444",
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
            placeholder="Search by title, contract number, or estimate..."
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
          {SOFTWARE_CONTRACT_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      {/* Contracts Table */}
      <div className="sw-table-card">
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            Loading software contracts...
          </div>
        ) : isForbidden ? (
          <div className="sw-forbidden-card">
            <div className="sw-forbidden-icon-box">🔒</div>
            <h3>Software Contracts Access Restricted</h3>
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
            <p>{error}</p>
            <button className="sw-btn-secondary" onClick={() => void loadData(true)}>
              Retry
            </button>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            No software contracts found matching your criteria.
          </div>
        ) : (
          <table className="sw-data-table">
            <thead>
              <tr>
                <th>Contract Title / Number</th>
                <th>Linked Estimate</th>
                <th>Billing</th>
                <th>Assigned To</th>
                <th>Contract Value</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Payment Milestones</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredList.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: "0.76rem", color: "#0ea5e9" }}>
                      {item.contract_number}
                    </div>
                  </td>
                  <td>
                    {estMap.get(item.software_estimate_id) ||
                      item.software_estimate_id.slice(0, 8)}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{item.billing_type || "Fixed Price"}</div>
                    {item.billing_type === "Time & Material" && item.hourly_rate != null ? (
                      <div style={{ fontSize: "0.75rem", color: "#0ea5e9" }}>
                        {formatCurrency(item.hourly_rate, item.currency)}/hr
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Fixed Price
                      </div>
                    )}
                  </td>
                  <td>
                    {item.assigned_to
                      ? userMap.get(item.assigned_to) || "Lead Delivery"
                      : "Unassigned"}
                  </td>
                  <td style={{ fontWeight: 700 }}>
                    {formatCurrency(item.contract_value, item.currency)}
                  </td>
                  <td>{item.start_date || "—"}</td>
                  <td>{item.end_date || "—"}</td>
                  <td>
                    <span className="sw-badge discovery">
                      {item.payment_milestones?.length || 0} Milestones
                    </span>
                  </td>
                  <td>
                    <span
                      className={`sw-badge ${item.status?.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="sw-row-actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="sw-btn-icon"
                        title="View Details & Payment Milestones"
                        onClick={() => setViewingItem(item)}
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
                      {perms.canUpdateContracts && (
                        <button
                          className="sw-btn-icon"
                          title="Edit Contract"
                          onClick={() => handleOpenEdit(item)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}
                      {perms.canDeleteContracts && (
                        <button
                          className="sw-btn-icon danger"
                          title="Delete Contract"
                          onClick={() => setDeletingItem(item)}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create / Edit Contract Modal */}
      {isModalOpen && (
        <div className="sw-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "820px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>{editingItem ? "Edit Contract" : "Create Software Contract"}</h2>
              <button className="sw-btn-icon" onClick={() => setIsModalOpen(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="sw-modal-body">
                {formError && <div className="sw-error-banner">{formError}</div>}

                {/* Section 1: Estimate & Title (2 columns) */}
                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "4px",
                      }}
                    >
                      <label style={{ margin: 0 }}>Software Estimate *</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {estimatesLoading && (
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                            ⏳ Loading...
                          </span>
                        )}
                        <button
                          type="button"
                          style={{
                            background: "none",
                            border: "none",
                            color: "#0ea5e9",
                            fontSize: "0.75rem",
                            cursor: "pointer",
                            padding: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            fontWeight: 600,
                          }}
                          onClick={async () => {
                            clearSoftwareForbidden("software_estimates");
                            const fresh = await loadEstimates(true);
                            if (fresh.length > 0 && !formData.software_estimate_id) {
                              const pref =
                                fresh.find(
                                  (e) => e.status === "Accepted" && !contractedEstimateMap.has(e.id)
                                ) || fresh[0];
                              if (pref) {
                                setFormData((prev) => ({
                                  ...prev,
                                  software_estimate_id: pref.id,
                                  title: prev.title || `${pref.title} Contract`,
                                  scope_of_work:
                                    prev.scope_of_work || pref.description || "",
                                  deliverables:
                                    prev.deliverables || `Deliverables as defined in ${pref.title}`,
                                  payment_terms:
                                    prev.payment_terms || pref.terms_and_conditions || "",
                                  assigned_to: prev.assigned_to || pref.assigned_to || null,
                                }));
                              }
                            }
                          }}
                          title="Refresh estimates from server"
                        >
                          🔄 Refresh
                        </button>
                      </div>
                    </div>

                    <select
                      className="sw-form-select"
                      required
                      value={formData.software_estimate_id}
                      onChange={(e) => {
                        const val = e.target.value;
                        const match = estimates.find((est) => est.id === val);
                        const isTM = match?.billing_type === "Time & Material";
                        setFormData((prev) => ({
                          ...prev,
                          software_estimate_id: val,
                          title: prev.title || (match ? `${match.title} Contract` : prev.title),
                          scope_of_work:
                            prev.scope_of_work || (match ? match.description || "" : prev.scope_of_work),
                          deliverables:
                            prev.deliverables || (match ? `Deliverables for ${match.title}` : prev.deliverables),
                          payment_terms:
                            prev.payment_terms || (match ? match.terms_and_conditions || "" : prev.payment_terms),
                          assigned_to: prev.assigned_to || match?.assigned_to || null,
                          payment_milestones: isTM ? [] : prev.payment_milestones,
                        }));
                      }}
                      disabled={!!editingItem}
                    >
                      <option value="">
                        {estimatesLoading
                          ? "⏳ Loading software estimates..."
                          : estimatesError
                          ? "⚠️ Failed to load estimates (click Refresh to retry)"
                          : estimates.length === 0
                          ? "-- No software estimates available --"
                          : "Select an Estimate..."}
                      </option>
                      {estimates.map((est) => {
                        const isContracted = contractedEstimateMap.has(est.id);
                        const isAccepted = est.status === "Accepted";
                        let statusTag = `[${est.status}]`;
                        if (isContracted) {
                          statusTag += " (Already Contracted)";
                        } else if (isAccepted) {
                          statusTag += " (✓ Ready)";
                        }
                        return (
                          <option key={est.id} value={est.id}>
                            {est.estimate_number ? `${est.estimate_number} — ` : ""}
                            {est.title} ({formatCurrency(est.total_amount, est.currency)}) {statusTag}
                          </option>
                        );
                      })}
                    </select>

                    {/* Feedback Messages */}
                    {estimatesError && (
                      <div
                        style={{
                          marginTop: "6px",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#ef4444",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span>{estimatesError}</span>
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
                          onClick={() => void loadEstimates(true)}
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!estimatesLoading && estimates.length === 0 && !estimatesError && (
                      <div
                        style={{
                          marginTop: "6px",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          background: "rgba(14, 165, 233, 0.1)",
                          border: "1px solid rgba(14, 165, 233, 0.3)",
                          color: "#38bdf8",
                        }}
                      >
                        ℹ️ No software estimates found. Create an estimate in the{" "}
                        <a
                          href="/software-estimates"
                          style={{ color: "#38bdf8", textDecoration: "underline", fontWeight: 600 }}
                        >
                          Software Estimates module
                        </a>{" "}
                        first.
                      </div>
                    )}

                    {selectedEstimateContract && (
                      <div
                        style={{
                          marginTop: "6px",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.3)",
                          color: "#f87171",
                        }}
                      >
                        ⚠️ Contract <strong>{selectedEstimateContract.contract_number}</strong> already exists for this estimate. An estimate can only have one contract.
                      </div>
                    )}

                    {selectedEstimate &&
                      selectedEstimate.status !== "Accepted" &&
                      !selectedEstimateContract && (
                        <div
                          style={{
                            marginTop: "6px",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            background: "rgba(245, 158, 11, 0.12)",
                            border: "1px solid rgba(245, 158, 11, 0.35)",
                            color: "#f59e0b",
                          }}
                        >
                          ℹ️ Note: This estimate is currently in <strong>{selectedEstimate.status}</strong> status. The contract creation API requires the estimate to be in <strong>Accepted</strong> status.
                        </div>
                      )}

                    {selectedEstimate &&
                      selectedEstimate.status === "Accepted" &&
                      !selectedEstimateContract && (
                        <div
                          style={{
                            marginTop: "6px",
                            padding: "6px 10px",
                            borderRadius: "6px",
                            fontSize: "0.75rem",
                            background: "rgba(16, 185, 129, 0.12)",
                            border: "1px solid rgba(16, 185, 129, 0.35)",
                            color: "#10b981",
                          }}
                        >
                          ✓ Ready for contract: Estimate is Accepted ({formatCurrency(selectedEstimate.total_amount, selectedEstimate.currency)}) • Inherited Billing: {selectedEstimate.billing_type || "Fixed Price"}{selectedEstimate.billing_type === "Time & Material" && selectedEstimate.hourly_rate != null ? ` (${formatCurrency(selectedEstimate.hourly_rate, selectedEstimate.currency)}/hr)` : ""}.
                        </div>
                      )}
                  </div>

                  <div className="sw-form-group">
                    <label>Contract Title *</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      placeholder="e.g. Master Service Agreement"
                      required
                      value={formData.title || ""}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    />
                  </div>
                </div>

                {/* Read-Only Inherited Billing Information */}
                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Billing Type (Inherited)</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      readOnly
                      disabled
                      value={effectiveBillingType}
                      style={{ cursor: "not-allowed", opacity: 0.85, fontWeight: 600 }}
                    />
                  </div>
                  <div className="sw-form-group">
                    <label>Hourly Rate (Inherited)</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      readOnly
                      disabled
                      value={
                        effectiveBillingType === "Time & Material"
                          ? effectiveHourlyRate != null
                            ? `${formatCurrency(effectiveHourlyRate, effectiveCurrency)}/hr`
                            : "⚠️ Missing Hourly Rate in Accepted Estimate"
                          : "Not Applicable (Fixed Price)"
                      }
                      style={{ cursor: "not-allowed", opacity: 0.85, fontWeight: 600 }}
                    />
                  </div>
                </div>

                {/* Section 2: Timeline Dates (2 columns) */}
                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Start Date</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      value={formData.start_date || ""}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>

                  <div className="sw-form-group">
                    <label>Target End Date</label>
                    <input
                      type="date"
                      className="sw-form-input"
                      value={formData.end_date || ""}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    />
                  </div>
                </div>

                {/* Section 3: Assignment & Contract Status (2 columns) */}
                <div className="sw-form-row">
                  <div className="sw-form-group">
                    <label>Assigned Lead / Project Manager</label>
                    <select
                      className="sw-form-select"
                      value={formData.assigned_to || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          assigned_to: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Contract Status</label>
                    <select
                      className="sw-form-select"
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as SoftwareContractStatus,
                        })
                      }
                    >
                      {SOFTWARE_CONTRACT_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Payment Milestones Definition — Fixed Price Only */}
                {effectiveBillingType === "Time & Material" ? (
                  <div
                    style={{
                      marginTop: "12px",
                      marginBottom: "16px",
                      padding: "14px 16px",
                      background: "rgba(14, 165, 233, 0.08)",
                      border: "1px solid rgba(14, 165, 233, 0.25)",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span style={{ fontSize: "1.2rem" }}>ℹ️</span>
                    <div>
                      <div style={{ fontWeight: 600, color: "#38bdf8", fontSize: "0.88rem" }}>
                        Time & Material Contract Billing
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "2px" }}>
                        Time & Material contracts are invoiced using approved billable project time entries. Payment milestones are not applicable.
                      </div>
                    </div>
                  </div>
                ) : !editingItem ? (
                  <div
                    style={{
                      marginTop: "12px",
                      marginBottom: "16px",
                      padding: "14px",
                      background: "rgba(14, 165, 233, 0.03)",
                      border: "1px solid rgba(14, 165, 233, 0.15)",
                      borderRadius: "8px",
                    }}
                  >
                    {/* Milestone Billing Mode selector */}
                    <div
                      style={{
                        marginBottom: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                        padding: "8px 12px",
                        background: "rgba(255, 255, 255, 0.02)",
                        borderRadius: "6px",
                        border: "1px solid rgba(255, 255, 255, 0.06)",
                      }}
                    >
                      <label style={{ fontWeight: 600, fontSize: "0.84rem", minWidth: "160px" }}>
                        Milestone Billing Mode:
                      </label>
                      <select
                        className="sw-form-select"
                        style={{ maxWidth: "200px" }}
                        value={formData.milestone_billing_mode || "Sequential"}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            milestone_billing_mode: e.target.value as "Sequential" | "Parallel",
                          })
                        }
                      >
                        <option value="Sequential">Sequential (Strict Order)</option>
                        <option value="Parallel">Parallel (Independent)</option>
                      </select>
                      <span style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                        {formData.milestone_billing_mode === "Parallel"
                          ? "Parallel: Milestones can be activated independently once contract is active."
                          : "Sequential: Each milestone can only be activated after preceding milestone is fully Paid."}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "10px",
                        flexWrap: "wrap",
                        gap: "8px",
                      }}
                    >
                      <div>
                        <label style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                          Payment Milestones *
                        </label>
                        <span style={{ fontSize: "0.78rem", color: "#94a3b8", display: "block" }}>
                          Fixed Price contracts require at least one milestone. Milestone
                          percentages must total exactly 100.00%.
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span
                          style={{
                            fontSize: "0.82rem",
                            fontWeight: 700,
                            padding: "4px 8px",
                            borderRadius: "4px",
                            background:
                              milestoneTotalPercentage === 100
                                ? "rgba(16, 185, 129, 0.15)"
                                : (formData.payment_milestones?.length || 0) > 0
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : "rgba(148, 163, 184, 0.15)",
                            color:
                              milestoneTotalPercentage === 100
                                ? "#10b981"
                                : (formData.payment_milestones?.length || 0) > 0
                                  ? "#ef4444"
                                  : "#94a3b8",
                            border: `1px solid ${milestoneTotalPercentage === 100
                                ? "rgba(16, 185, 129, 0.3)"
                                : (formData.payment_milestones?.length || 0) > 0
                                  ? "rgba(239, 68, 68, 0.3)"
                                  : "rgba(148, 163, 184, 0.3)"
                              }`,
                          }}
                        >
                          Total: {milestoneTotalPercentage.toFixed(2)}%{" "}
                          {milestoneTotalPercentage === 100
                            ? "✓"
                            : (formData.payment_milestones?.length || 0) > 0
                              ? "(Requires 100.00%)"
                              : ""}
                        </span>
                        <button
                          type="button"
                          className="sw-btn-secondary"
                          style={{ padding: "5px 10px", fontSize: "0.78rem" }}
                          onClick={handleAddMilestone}
                          disabled={(formData.payment_milestones?.length || 0) >= 20}
                        >
                          + Add Milestone
                        </button>
                      </div>
                    </div>

                    {(formData.payment_milestones?.length || 0) === 0 ? (
                      <div
                        style={{
                          padding: "16px",
                          textAlign: "center",
                          color: "#94a3b8",
                          fontSize: "0.84rem",
                          border: "1px dashed rgba(255, 255, 255, 0.1)",
                          borderRadius: "6px",
                        }}
                      >
                        No milestones added. Click <strong>+ Add Milestone</strong> to configure
                        milestone billing (must total 100%), or leave empty to create a
                        standard single-scope contract.
                      </div>
                    ) : (
                      <table
                        className="sw-data-table"
                        style={{
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          background: "rgba(0,0,0,0.1)",
                        }}
                      >
                        <thead>
                          <tr>
                            <th style={{ width: "45px" }}>Seq</th>
                            <th>Milestone Name *</th>
                            <th style={{ width: "110px" }}>% Allocation *</th>
                            <th>Trigger Condition</th>
                            <th style={{ width: "40px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {formData.payment_milestones!.map((ms, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600, color: "#0ea5e9" }}>#{idx + 1}</td>
                              <td>
                                <input
                                  type="text"
                                  className="sw-form-input"
                                  required
                                  maxLength={120}
                                  placeholder="e.g. Architecture Sign-off"
                                  value={ms.name}
                                  onChange={(e) =>
                                    handleMilestoneChange(idx, "name", e.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  className="sw-form-input"
                                  min="0.01"
                                  max="100"
                                  step="0.01"
                                  required
                                  placeholder="e.g. 25"
                                  value={ms.percentage || ""}
                                  onChange={(e) =>
                                    handleMilestoneChange(
                                      idx,
                                      "percentage",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="sw-form-input"
                                  placeholder="e.g. Advance upon signing"
                                  value={ms.trigger_description || ""}
                                  onChange={(e) =>
                                    handleMilestoneChange(idx, "trigger_description", e.target.value)
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="sw-btn-icon danger"
                                  title="Remove Milestone"
                                  onClick={() => handleRemoveMilestone(idx)}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "10px 14px",
                      marginBottom: "14px",
                      background: "rgba(148, 163, 184, 0.08)",
                      borderRadius: "6px",
                      fontSize: "0.82rem",
                      color: "#94a3b8",
                    }}
                  >
                    ℹ️ <em>Payment milestones are fixed upon contract creation according to commercial agreement terms and cannot be edited via standard contract update.</em>
                  </div>
                )}

                <div className="sw-form-group">
                  <label>Scope of Work *</label>
                  <textarea
                    className="sw-form-textarea"
                    required
                    placeholder="Specify project phases, architecture, integrations, milestones..."
                    value={formData.scope_of_work}
                    onChange={(e) => setFormData({ ...formData, scope_of_work: e.target.value })}
                  />
                </div>

                <div className="sw-form-group">
                  <label>Deliverables *</label>
                  <textarea
                    className="sw-form-textarea"
                    required
                    placeholder="List tangible artifacts (e.g. source code repo, build artifacts, test suites, docs)..."
                    value={formData.deliverables}
                    onChange={(e) => setFormData({ ...formData, deliverables: e.target.value })}
                  />
                </div>

                <div className="sw-form-group">
                  <label>Payment Terms</label>
                  <input
                    type="text"
                    className="sw-form-input"
                    placeholder="e.g. Net 30, milestone linked"
                    value={formData.payment_terms || ""}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingItem ? "Update Contract" : "Save Contract"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Contract Details Modal with Payment Milestones */}
      {viewingItem && (
        <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
          <div
            className="sw-modal-card sw-contract-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sw-modal-header sw-contract-modal-header">
              <div className="sw-contract-modal-title-wrap">
                <span className="sw-contract-modal-num">{viewingItem.contract_number}</span>
                <h2 className="sw-contract-modal-name">{viewingItem.title}</h2>
              </div>
              <button
                className="sw-btn-icon"
                onClick={() => setViewingItem(null)}
                title="Close contract details"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="sw-modal-body">
              {/* 1. Executive Contract Overview Grid */}
              <div className="sw-contract-overview-grid">
                <div className="sw-contract-overview-item">
                  <span className="sw-contract-overview-label">Status</span>
                  <div className="sw-contract-overview-val">
                    <span
                      className={`sw-badge ${viewingItem.status?.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {viewingItem.status}
                    </span>
                  </div>
                </div>

                <div className="sw-contract-overview-item">
                  <span className="sw-contract-overview-label">Contract Value</span>
                  <div className="sw-contract-overview-val" style={{ color: "#0ea5e9", fontWeight: 700 }}>
                    {formatCurrency(viewingItem.contract_value, viewingItem.currency)}
                  </div>
                </div>

                <div className="sw-contract-overview-item">
                  <span className="sw-contract-overview-label">Billing Type</span>
                  <div className="sw-contract-overview-val">
                    <span className="sw-badge discovery">
                      {viewingItem.billing_type || "Fixed Price"}
                    </span>
                    {viewingItem.billing_type === "Time & Material" && viewingItem.hourly_rate != null && (
                      <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                        ({formatCurrency(viewingItem.hourly_rate, viewingItem.currency)}/hr)
                      </span>
                    )}
                  </div>
                </div>

                {viewingItem.billing_type !== "Time & Material" && (
                  <div className="sw-contract-overview-item">
                    <span className="sw-contract-overview-label">Milestone Mode</span>
                    <div className="sw-contract-overview-val">
                      <span className="sw-badge planned">
                        {viewingItem.milestone_billing_mode || "Sequential"}
                      </span>
                    </div>
                  </div>
                )}

                <div className="sw-contract-overview-item">
                  <span className="sw-contract-overview-label">Timeline</span>
                  <div className="sw-contract-overview-val" style={{ fontSize: "0.84rem" }}>
                    {viewingItem.start_date || "—"} &rarr; {viewingItem.end_date || "—"}
                  </div>
                </div>

                <div className="sw-contract-overview-item">
                  <span className="sw-contract-overview-label">Assigned Lead</span>
                  <div className="sw-contract-overview-val">
                    {viewingItem.assigned_to
                      ? userMap.get(viewingItem.assigned_to) || viewingItem.assigned_to
                      : "Unassigned"}
                  </div>
                </div>

                {viewingItem.software_estimate_id && (
                  <div className="sw-contract-overview-item">
                    <span className="sw-contract-overview-label">Source Estimate</span>
                    <div className="sw-contract-overview-val" style={{ fontSize: "0.84rem" }}>
                      {estMap.get(viewingItem.software_estimate_id) || viewingItem.software_estimate_id.slice(0, 8)}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Payment Milestones Section */}
              <div className="sw-contract-milestones-section">
                <div className="sw-contract-section-header">
                  <h4>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    Payment Milestones &amp; Invoicing Progression
                  </h4>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {viewingItem.billing_type !== "Time & Material" && (
                      <span className="sw-contract-section-badge">
                        {viewingItem.milestone_billing_mode || "Sequential"} Mode
                      </span>
                    )}
                    <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                      Currency: {viewingItem.currency || "INR"}
                    </span>
                  </div>
                </div>

                {viewingItem.billing_type === "Time & Material" ? (
                  <div
                    className="sw-contract-info-panel"
                    style={{ borderLeft: "4px solid #0ea5e9", background: "rgba(14, 165, 233, 0.04)" }}
                  >
                    <h5 className="sw-contract-info-panel-title" style={{ color: "#0ea5e9" }}>
                      Time &amp; Material Contract Billing
                    </h5>
                    <p className="sw-contract-info-panel-body" style={{ color: "#94a3b8" }}>
                      This contract is billed against approved project time entries at{" "}
                      <strong style={{ color: "#0ea5e9" }}>
                        {formatCurrency(viewingItem.hourly_rate || 0, viewingItem.currency)}/hr
                      </strong>. Payment milestones are not applicable.
                    </p>
                  </div>
                ) : (
                  <>
                    {viewingItem.payment_milestones && viewingItem.payment_milestones.length > 0 ? (
                      <div className="sw-milestone-cards-stack">
                        {(() => {
                          const sortedMilestones = viewingItem.payment_milestones
                            .slice()
                            .sort((a, b) => a.sequence - b.sequence);

                          return sortedMilestones.map((ms) => {
                            const isContractActive =
                              viewingItem.status === "Signed" || viewingItem.status === "Active";
                            const isSequential = viewingItem.milestone_billing_mode !== "Parallel";
                            const priorMilestones = sortedMilestones
                              .filter((m) => m.sequence < ms.sequence)
                              .sort((a, b) => b.sequence - a.sequence);
                            const priorMilestone = priorMilestones[0];
                            const isPriorPaid = !isSequential || !priorMilestone || priorMilestone.status === "Paid";

                            const canReady = isContractActive && ms.status === "Pending" && isPriorPaid;
                            const isBlockedByPrior =
                              isContractActive && ms.status === "Pending" && isSequential && !isPriorPaid;
                            const canInvoice = ms.status === "Ready" && !ms.invoice_id;
                            const statusLower = (ms.status || "pending").toLowerCase();

                            return (
                              <div
                                key={ms.id}
                                className={`sw-milestone-card status-${statusLower}`}
                              >
                                {/* Top Row: Seq + Name + Status Badge */}
                                <div className="sw-milestone-card-header">
                                  <div className="sw-milestone-card-title-group">
                                    <span className="sw-milestone-seq-badge">#{ms.sequence}</span>
                                    <h5 className="sw-milestone-card-name">{ms.name}</h5>
                                  </div>
                                  <span className={`sw-milestone-status-badge ${statusLower}`}>
                                    <span
                                      style={{
                                        width: "6px",
                                        height: "6px",
                                        borderRadius: "50%",
                                        backgroundColor:
                                          statusLower === "paid"
                                            ? "#10b981"
                                            : statusLower === "ready"
                                            ? "#0ea5e9"
                                            : statusLower === "invoiced"
                                            ? "#6366f1"
                                            : "#f59e0b",
                                        display: "inline-block",
                                      }}
                                    />
                                    {ms.status}
                                  </span>
                                </div>

                                {/* Middle Row: Allocation, Amount, Trigger Condition */}
                                <div className="sw-milestone-card-body">
                                  <div className="sw-milestone-metric">
                                    <span className="sw-milestone-metric-label">Allocation</span>
                                    <span className="sw-milestone-metric-value">{ms.percentage}%</span>
                                  </div>

                                  <div className="sw-milestone-metric">
                                    <span className="sw-milestone-metric-label">Amount</span>
                                    <span className="sw-milestone-metric-value highlight">
                                      {formatCurrency(ms.amount, viewingItem.currency)}
                                    </span>
                                  </div>

                                  <div className="sw-milestone-metric full-width-on-tablet">
                                    <span className="sw-milestone-metric-label">Trigger Condition</span>
                                    <span
                                      className="sw-milestone-metric-value"
                                      style={{ fontSize: "0.82rem", color: "#64748b" }}
                                    >
                                      {ms.trigger_description || "— No trigger condition specified"}
                                    </span>
                                  </div>
                                </div>

                                {/* Bottom Row: Invoice Ref & Actions */}
                                <div className="sw-milestone-card-footer">
                                  <div className="sw-milestone-invoice-ref">
                                    <span style={{ fontSize: "0.72rem", textTransform: "uppercase", fontWeight: 600, color: "#64748b" }}>
                                      Invoice:
                                    </span>
                                    {ms.invoice_id ? (
                                      <span
                                        className="sw-milestone-invoice-pill"
                                        title={`Invoice UUID: ${ms.invoice_id} (Click to copy)`}
                                        onClick={() => {
                                          if (navigator.clipboard) {
                                            void navigator.clipboard.writeText(ms.invoice_id!);
                                            setActionMessage({
                                              text: `Copied invoice UUID: ${ms.invoice_id}`,
                                              type: "info",
                                            });
                                          }
                                        }}
                                      >
                                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                        {ms.invoice_id.slice(0, 8)}...
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>— Not Invoiced</span>
                                    )}
                                  </div>

                                  <div className="sw-milestone-actions-group">
                                    {isBlockedByPrior && (
                                      <span
                                        style={{
                                          fontSize: "0.72rem",
                                          color: "#f59e0b",
                                          background: "rgba(245, 158, 11, 0.1)",
                                          padding: "3px 8px",
                                          borderRadius: "4px",
                                          border: "1px solid rgba(245, 158, 11, 0.25)",
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: "4px",
                                          cursor: "help",
                                        }}
                                        title={`Sequential Mode: Milestone #${priorMilestone?.sequence} ("${priorMilestone?.name}") must be Paid before this milestone can become Ready.`}
                                      >
                                        🔒 Awaiting #{priorMilestone?.sequence} Paid
                                      </span>
                                    )}

                                    {canReady && perms.canMarkMilestoneReady && (
                                      <button
                                        type="button"
                                        className="sw-btn-secondary"
                                        style={{
                                          padding: "4px 10px",
                                          fontSize: "0.76rem",
                                          borderColor: "#10b981",
                                          color: "#10b981",
                                          fontWeight: 600,
                                        }}
                                        onClick={() => handleOpenMarkReadyDialog(viewingItem.id, ms)}
                                        title="Mark milestone ready for billing"
                                      >
                                        Mark Ready
                                      </button>
                                    )}

                                    {canInvoice && perms.canGenerateMilestoneInvoice && (
                                      <button
                                        type="button"
                                        className="sw-btn-primary"
                                        style={{ padding: "4px 10px", fontSize: "0.76rem", fontWeight: 600 }}
                                        onClick={() => handleOpenMilestoneInvoiceModal(viewingItem.id, ms)}
                                        title="Generate invoice for this milestone"
                                      >
                                        Generate Invoice
                                      </button>
                                    )}

                                    {ms.status === "Invoiced" && (
                                      <span style={{ fontSize: "0.78rem", color: "#6366f1", fontWeight: 600 }}>
                                        ✓ Invoiced
                                      </span>
                                    )}

                                    {ms.status === "Paid" && (
                                      <span style={{ fontSize: "0.78rem", color: "#10b981", fontWeight: 700 }}>
                                        ✓ Paid &amp; Settled
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    ) : (
                      <div className="sw-empty-state" style={{ padding: "20px 0", textAlign: "center" }}>
                        <p style={{ color: "#94a3b8", fontSize: "0.85rem", margin: 0 }}>
                          No payment milestones configured for this contract.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 3. Scope of Work Information Panel */}
              <div className="sw-contract-info-panel">
                <h5 className="sw-contract-info-panel-title">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  Scope of Work
                </h5>
                <p className="sw-contract-info-panel-body">
                  {viewingItem.scope_of_work || "No scope of work documented."}
                </p>
              </div>

              {/* 4. Deliverables Information Panel */}
              <div className="sw-contract-info-panel">
                <h5 className="sw-contract-info-panel-title">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Deliverables
                </h5>
                <p className="sw-contract-info-panel-body">
                  {viewingItem.deliverables || "No deliverables specified."}
                </p>
              </div>

              {/* 5. Payment Terms Information Panel (if present) */}
              {viewingItem.payment_terms && (
                <div className="sw-contract-info-panel">
                  <h5 className="sw-contract-info-panel-title">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="6" x2="12" y2="12" />
                      <line x1="12" y1="12" x2="16" y2="14" />
                    </svg>
                    Payment Terms
                  </h5>
                  <p className="sw-contract-info-panel-body">
                    {viewingItem.payment_terms}
                  </p>
                </div>
              )}

              {/* 6. Terms and Conditions (if present) */}
              {viewingItem.terms_and_conditions && (
                <div className="sw-contract-info-panel">
                  <h5 className="sw-contract-info-panel-title">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Terms &amp; Conditions
                  </h5>
                  <p className="sw-contract-info-panel-body">
                    {viewingItem.terms_and_conditions}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sw-modal-footer">
              <button
                type="button"
                className="sw-btn-secondary"
                onClick={() => setViewingItem(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Milestone Ready Confirmation Dialog */}
      {readyingMilestone && (
        <div className="sw-modal-overlay" onClick={() => setReadyingMilestone(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Confirm Milestone Completion</h2>
              <button className="sw-btn-icon" onClick={() => setReadyingMilestone(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleConfirmMarkMilestoneReady}>
              <div className="sw-modal-body">
                {readyModalError && <div className="sw-error-banner">{readyModalError}</div>}

                <p style={{ margin: "0 0 12px 0", fontSize: "0.88rem", color: "#94a3b8" }}>
                  Are you sure you want to mark milestone{" "}
                  <strong>"{readyingMilestone.milestone.name}"</strong> (#{readyingMilestone.milestone.sequence}) as <strong>Ready</strong> for client invoicing?
                </p>

                <div
                  style={{
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "6px",
                    marginBottom: "14px",
                    fontSize: "0.84rem",
                  }}
                >
                  <div>
                    <strong>Allocation:</strong> {readyingMilestone.milestone.percentage}%
                  </div>
                  <div>
                    <strong>Milestone Value:</strong>{" "}
                    {formatCurrency(
                      readyingMilestone.milestone.amount,
                      viewingItem?.currency || "INR"
                    )}
                  </div>
                  {readyingMilestone.milestone.trigger_description && (
                    <div>
                      <strong>Trigger:</strong> {readyingMilestone.milestone.trigger_description}
                    </div>
                  )}
                </div>

                <div className="sw-form-group">
                  <label>Completion Notes / Acceptance Remarks (Optional)</label>
                  <textarea
                    className="sw-form-textarea"
                    maxLength={2000}
                    placeholder="Document client sign-off, delivery ticket reference, or acceptance confirmation..."
                    value={readyingMilestone.notes}
                    onChange={(e) =>
                      setReadyingMilestone({ ...readyingMilestone, notes: e.target.value })
                    }
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
                  onClick={() => setReadyingMilestone(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sw-btn-primary"
                  style={{ background: "#10b981" }}
                  disabled={submitting}
                >
                  {submitting ? "Activating..." : "Confirm & Mark Ready"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Milestone Generate Invoice Modal */}
      {invoicingMilestone && (
        <div className="sw-modal-overlay" onClick={() => setInvoicingMilestone(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "500px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Generate Invoice for Milestone</h2>
              <button className="sw-btn-icon" onClick={() => setInvoicingMilestone(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleGenerateMilestoneInvoice}>
              <div className="sw-modal-body">
                {invoiceModalError && <div className="sw-error-banner">{invoiceModalError}</div>}

                <p style={{ margin: "0 0 12px 0", fontSize: "0.88rem", color: "#94a3b8" }}>
                  Generating a client invoice for milestone{" "}
                  <strong>"{invoicingMilestone.milestone.name}"</strong> (
                  {invoicingMilestone.milestone.percentage}% —{" "}
                  {formatCurrency(
                    invoicingMilestone.milestone.amount,
                    viewingItem?.currency || "INR"
                  )}
                  ).
                </p>

                <div className="sw-form-group">
                  <label>Invoice Number (Optional)</label>
                  <input
                    type="text"
                    className="sw-form-input"
                    maxLength={50}
                    placeholder="Leave blank to auto-generate (e.g. SINV-YYYYMMDD-...)"
                    value={milestoneInvoiceForm.invoice_number}
                    onChange={(e) =>
                      setMilestoneInvoiceForm({
                        ...milestoneInvoiceForm,
                        invoice_number: e.target.value,
                      })
                    }
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    If omitted, the backend generates an official formatted invoice number.
                  </span>
                </div>

                <div className="sw-form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    className="sw-form-input"
                    min={new Date().toISOString().slice(0, 10)}
                    value={milestoneInvoiceForm.due_date}
                    onChange={(e) =>
                      setMilestoneInvoiceForm({
                        ...milestoneInvoiceForm,
                        due_date: e.target.value,
                      })
                    }
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Due date cannot precede the invoice issue date.
                  </span>
                </div>

                <div className="sw-form-group">
                  <label>Invoice Notes / Terms (Optional)</label>
                  <textarea
                    className="sw-form-textarea"
                    maxLength={4000}
                    placeholder="Payment instructions, bank wire details, milestone reference..."
                    value={milestoneInvoiceForm.notes}
                    onChange={(e) =>
                      setMilestoneInvoiceForm({
                        ...milestoneInvoiceForm,
                        notes: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="sw-modal-footer">
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => setInvoicingMilestone(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="sw-btn-primary" disabled={submitting}>
                  {submitting ? "Generating..." : "Generate Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="sw-modal-overlay" onClick={() => setDeletingItem(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "420px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Confirm Deletion</h2>
              <button className="sw-btn-icon" onClick={() => setDeletingItem(null)}>
                ✕
              </button>
            </div>
            <div className="sw-modal-body">
              <p>
                Are you sure you want to delete contract{" "}
                <strong>{deletingItem.contract_number}</strong>?
              </p>
              <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "8px" }}>
                Contracts with active delivery projects or invoiced milestones cannot be deleted.
              </p>
            </div>
            <div className="sw-modal-footer">
              <button
                className="sw-btn-secondary"
                onClick={() => setDeletingItem(null)}
              >
                Cancel
              </button>
              <button
                className="sw-btn-primary"
                style={{ background: "#ef4444" }}
                onClick={handleDelete}
                disabled={submitting}
              >
                {submitting ? "Deleting..." : "Delete Contract"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
