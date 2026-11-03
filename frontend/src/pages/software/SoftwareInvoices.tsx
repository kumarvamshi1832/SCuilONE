import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  getSoftwareInvoices,
  getSoftwareInvoice,
  createSoftwareInvoice,
  updateSoftwareInvoiceStatus,
  recordSoftwareInvoicePayment,
  getBillingSummary,
  reverseSoftwareInvoicePayment,
  createSoftwareInvoiceCreditNote,
} from "../../services/softwareInvoiceService";
import { getSoftwareProjects } from "../../services/softwareProjectService";
import { getSoftwareContracts } from "../../services/softwareContractService";
import { getSoftwareEstimates } from "../../services/softwareEstimateService";
import { getAccounts } from "../../services/accountService";
import { getLeads } from "../../services/leadService";
import { downloadSoftwareInvoicePdf } from "../../utils/softwareInvoicePdfGenerator";
import type { SoftwareEstimate } from "../../types/softwareEstimate";
import { getSoftwarePermissions } from "../../utils/softwarePermissions";
import { getActivities } from "../../services/activityService";
import { getTimeEntries } from "../../services/softwareTimeEntryService";
import type { Activity } from "../../types/activity";
import type { SoftwareTimeEntry } from "../../types/softwareTimeEntry";

import type {
  SoftwareInvoice,
  SoftwareInvoiceCreate,
  SoftwareInvoiceItemCreate,
  SoftwareInvoicePaymentCreate,
  SoftwareInvoicePayment,
  SoftwareCreditNote,
  BillingSummaryResponse,
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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projectTimeEntries, setProjectTimeEntries] = useState<SoftwareTimeEntry[]>([]);
  const [timeEntriesLoading, setTimeEntriesLoading] = useState(false);
  const [timeEntriesError, setTimeEntriesError] = useState<string | null>(null);
  const [billingSummary, setBillingSummary] = useState<BillingSummaryResponse | null>(null);
  const [estimates, setEstimates] = useState<SoftwareEstimate[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

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

  // Reversal Modal
  const [reversingPayment, setReversingPayment] = useState<{
    invoice: SoftwareInvoice;
    payment: SoftwareInvoicePayment;
  } | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalSubmitting, setReversalSubmitting] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Credit Note Modal
  const [creditNoteInvoice, setCreditNoteInvoice] = useState<SoftwareInvoice | null>(null);
  const [creditNoteForm, setCreditNoteForm] = useState<{
    amount: number;
    reason: string;
    issue_date: string;
  }>({
    amount: 0,
    reason: "",
    issue_date: new Date().toISOString().slice(0, 10),
  });
  const [creditNoteSubmitting, setCreditNoteSubmitting] = useState(false);
  const [creditNoteError, setCreditNoteError] = useState<string | null>(null);

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
      const [invData, projData, contData, summaryData, actData, estData, accData, leadData] = await Promise.all([
        getSoftwareInvoices(),
        getSoftwareProjects().catch(() => []),
        getSoftwareContracts().catch(() => []),
        getBillingSummary(projectFilter || undefined).catch(() => null),
        getActivities().catch(() => []),
        getSoftwareEstimates().catch(() => []),
        getAccounts().catch(() => []),
        getLeads().catch(() => []),
      ]);

      setInvoices(invData);
      setProjects(projData);
      setContracts(contData);
      setBillingSummary(summaryData);
      setActivities(actData);
      setEstimates(estData);
      setAccounts(accData);
      setLeads(leadData);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load software invoices");
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // When projectFilter changes, update billing summary
  useEffect(() => {
    getBillingSummary(projectFilter || undefined)
      .then((res) => setBillingSummary(res))
      .catch(() => {});
  }, [projectFilter]);

  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const contractMap = useMemo(
    () => new Map(contracts.map((c) => [c.id, `${c.contract_number} - ${c.title}`])),
    [contracts]
  );
  const activityMap = useMemo(
    () => new Map(activities.map((a) => [a.id, a.title])),
    [activities]
  );
  const accountMap = useMemo(() => new Map(accounts.map((a: any) => [a.id, a])), [accounts]);
  const leadMap = useMemo(() => new Map(leads.map((l: any) => [l.id, l])), [leads]);
  const estimateMap = useMemo(() => new Map(estimates.map((e: any) => [e.id, e])), [estimates]
  );

  const formSelectedContract = useMemo(() => {
    return contracts.find((c) => c.id === formData.software_contract_id) || null;
  }, [contracts, formData.software_contract_id]);

  const formSelectedProject = useMemo(() => {
    return projects.find((p) => p.id === formData.project_id) || null;
  }, [projects, formData.project_id]);

  const compatibleProjects = useMemo(() => {
    if (!formData.software_contract_id) return projects;
    return projects.filter((p) => p.software_contract_id === formData.software_contract_id);
  }, [projects, formData.software_contract_id]);

  const alreadyInvoicedTimeEntryIds = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((inv) => {
      (inv.items || []).forEach((it) => {
        if (it.time_entry_id) {
          set.add(it.time_entry_id);
        }
      });
    });
    return set;
  }, [invoices]);

  const eligibleTimeEntries = useMemo(() => {
    return projectTimeEntries.filter((entry) => {
      if (!entry.is_billable) return false;
      if (entry.billing_status !== "Approved") return false;
      if (entry.duration_minutes === null || entry.duration_minutes === undefined || entry.duration_minutes <= 0) return false;
      if (entry.source === "timer" && !entry.stopped_at) return false;
      if (alreadyInvoicedTimeEntryIds.has(entry.id)) return false;
      return true;
    });
  }, [projectTimeEntries, alreadyInvoicedTimeEntryIds]);

  const eligibleTimeEntryMap = useMemo(() => {
    return new Map(eligibleTimeEntries.map((e) => [e.id, e]));
  }, [eligibleTimeEntries]);

  const fetchProjectTimeEntries = useCallback(async (projId: string) => {
    if (!projId) {
      setProjectTimeEntries([]);
      return;
    }
    setTimeEntriesLoading(true);
    setTimeEntriesError(null);
    try {
      const data = await getTimeEntries({ project_id: projId });
      setProjectTimeEntries(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setTimeEntriesError(err?.message || "Failed to load project time entries");
      setProjectTimeEntries([]);
    } finally {
      setTimeEntriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCreateModalOpen && formSelectedContract?.billing_type === "Time & Material" && formData.project_id) {
      fetchProjectTimeEntries(formData.project_id);
    } else {
      setProjectTimeEntries([]);
      setTimeEntriesError(null);
    }
  }, [isCreateModalOpen, formSelectedContract?.billing_type, formData.project_id, fetchProjectTimeEntries]);

  // Primary active summary from backend billing summary API
  const activeSummary = useMemo(() => {
    if (billingSummary?.items && billingSummary.items.length > 0) {
      return billingSummary.items[0];
    }
    return null;
  }, [billingSummary]);

  // Financial Stats (Calculated strictly from authoritative backend data)
  const stats = useMemo(() => {
    let localInvoiced = 0;
    let localPaid = 0;
    let localCredited = 0;
    let localBalance = 0;
    let localOverdueCount = 0;
    const today = new Date().toISOString().slice(0, 10);

    invoices.forEach((inv) => {
      if (inv.status !== "Void") {
        localInvoiced += Number(inv.total_amount) || 0;
        localPaid += Number(inv.amount_paid) || 0;
        localCredited += Number(inv.credited_amount) || 0;
        localBalance += Number(inv.balance_due) || 0;
        if (
          inv.is_overdue ||
          (Number(inv.balance_due) > 0 && inv.due_date && inv.due_date < today)
        ) {
          localOverdueCount++;
        }
      }
    });

    return {
      totalInvoiced: activeSummary ? Number(activeSummary.invoiced) : localInvoiced,
      totalPaid: activeSummary ? Number(activeSummary.received) : localPaid,
      totalCredited: activeSummary ? Number(activeSummary.credited) : localCredited,
      totalBalance: activeSummary ? Number(activeSummary.outstanding) : localBalance,
      overdueCount: activeSummary ? activeSummary.overdue_invoice_count : localOverdueCount,
      overdueAmount: activeSummary ? Number(activeSummary.overdue_amount) : 0,
      currency: activeSummary?.currency || invoices[0]?.currency || "INR",
    };
  }, [invoices, activeSummary]);

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
    const tmContract = contracts.find((c) => c.billing_type === "Time & Material") || contracts[0];
    const initialContractId = tmContract?.id || "";
    const matchingProjects = projects.filter((p) => p.software_contract_id === initialContractId);
    const initialProjectId = matchingProjects[0]?.id || projects[0]?.id || "";

    setFormData({
      invoice_number: "",
      software_contract_id: initialContractId,
      project_id: initialProjectId,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: "",
      items: [],
    });
    setIsCreateModalOpen(true);
  };

  const handleContractChange = (contractId: string) => {
    const validProjects = projects.filter((p) => p.software_contract_id === contractId);
    const currentMatches = validProjects.some((p) => p.id === formData.project_id);
    const newProjectId = currentMatches ? formData.project_id : validProjects[0]?.id || "";

    setFormData((prev) => ({
      ...prev,
      software_contract_id: contractId,
      project_id: newProjectId,
      items: [],
    }));
  };

  const handleProjectChange = (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    const matchedContractId = proj?.software_contract_id || formData.software_contract_id;
    const contract = contracts.find((c) => c.id === matchedContractId);

    setFormData((prev) => ({
      ...prev,
      project_id: projectId,
      software_contract_id: matchedContractId,
      items: contract?.billing_type === "Time & Material" ? [] : prev.items,
    }));
  };

  const handleAddTMItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          time_entry_id: "",
          description: "",
          quantity: 1,
          unit_price: Number(formSelectedContract?.hourly_rate || 0),
          tax_percent: 0,
        },
      ],
    }));
  };

  const handleSelectTimeEntry = (index: number, entryId: string) => {
    const entry = eligibleTimeEntryMap.get(entryId);
    setFormData((prev) => {
      const updated = [...prev.items];
      if (!entry) {
        updated[index] = {
          ...updated[index],
          time_entry_id: "",
          description: "",
          quantity: 1,
          unit_price: Number(formSelectedContract?.hourly_rate || 0),
        };
        return { ...prev, items: updated };
      }

      const taskTitle = activityMap.get(entry.activity_id) || entry.activity_title || "Development Task";
      const durationHours = parseFloat((Number(entry.duration_minutes || 0) / 60).toFixed(4));
      const rate = Number(formSelectedContract?.hourly_rate || 0);

      updated[index] = {
        ...updated[index],
        time_entry_id: entry.id,
        description: `${entry.work_date}: ${taskTitle}${entry.notes ? ` — ${entry.notes}` : ""}`,
        quantity: durationHours,
        unit_price: rate,
      };
      return { ...prev, items: updated };
    });
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

    if (!formData.software_contract_id) {
      setFormError("Please select the linked software contract.");
      return;
    }
    if (!formData.project_id) {
      setFormError("Please select a project.");
      return;
    }
    if (formSelectedProject && formSelectedContract && formSelectedProject.software_contract_id !== formSelectedContract.id) {
      setFormError("The selected project is not linked to this contract.");
      return;
    }
    if (formSelectedContract?.billing_type === "Fixed Price") {
      setFormError("Fixed Price contracts must be invoiced through payment milestones in the Software Contracts module. Please open Software Contracts and generate the milestone invoice.");
      return;
    }
    if (formSelectedContract?.billing_type === "Time & Material") {
      if (!formSelectedContract.hourly_rate || Number(formSelectedContract.hourly_rate) <= 0) {
        setFormError("Time & Material contracts require a valid positive hourly rate from the contract.");
        return;
      }
      if (formData.items.length === 0) {
        setFormError("Please add at least one approved billable time entry to create a Time & Material invoice.");
        return;
      }
      for (const [i, it] of formData.items.entries()) {
        if (!it.time_entry_id) {
          setFormError(`Line item #${i + 1} must reference an approved billable time entry.`);
          return;
        }
        if (!it.description.trim()) {
          setFormError(`Line item #${i + 1} requires a description.`);
          return;
        }
        if (Number(it.quantity) <= 0) {
          setFormError(`Line item #${i + 1} quantity must be greater than 0.`);
          return;
        }
      }
      const selectedIds = formData.items.map((it) => it.time_entry_id).filter(Boolean);
      if (new Set(selectedIds).size !== selectedIds.length) {
        setFormError("The same time entry cannot be selected more than once in an invoice.");
        return;
      }
    } else {
      if (formData.items.length === 0) {
        setFormError("At least one line item is required.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: SoftwareInvoiceCreate = {
        invoice_number: formData.invoice_number.trim() || null,
        project_id: formData.project_id,
        software_contract_id: formData.software_contract_id,
        issue_date: formData.issue_date || null,
        due_date: formData.due_date || null,
        notes: formData.notes.trim() || null,
        items: formData.items.map((it) => ({
          time_entry_id: it.time_entry_id || null,
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
      getBillingSummary(projectFilter || undefined).then((res) => setBillingSummary(res)).catch(() => {});
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || "Failed to create invoice");
    } finally {
      setSubmitting(false);
    }
  };

  // Download Invoice PDF
  const handleDownloadPdf = async (inv: SoftwareInvoice) => {
    if (downloadingInvoiceId) return;

    setDownloadingInvoiceId(inv.id);
    setActionMessage(null);

    try {
      let fullInvoice = inv;
      if (!Array.isArray(inv.items) || inv.items.length === 0 || !inv.payments) {
        try {
          fullInvoice = await getSoftwareInvoice(inv.id);
        } catch {
          fullInvoice = inv;
        }
      }

      const project = projects.find((p) => p.id === fullInvoice.project_id) || null;
      const contract = contracts.find((c) => c.id === fullInvoice.software_contract_id) || null;
      const estimate = contract?.software_estimate_id
        ? estimateMap.get(contract.software_estimate_id) || null
        : null;

      let clientName = "";
      let clientEmail = "";
      let clientAddress = "";

      if (contract?.account_id && accountMap.has(contract.account_id)) {
        const acc = accountMap.get(contract.account_id);
        clientName = acc?.name || "";
        clientEmail = acc?.email || "";
        clientAddress = acc?.billing_address || acc?.address || "";
      } else if (contract?.lead_id && leadMap.has(contract.lead_id)) {
        const ld = leadMap.get(contract.lead_id);
        clientName = ld?.name || `${ld?.first_name || ""} ${ld?.last_name || ""}`.trim();
        clientEmail = ld?.email || "";
      } else if (project?.name) {
        clientName = `${project.name} Client`;
      }

      const downloadedFileName = await downloadSoftwareInvoicePdf({
        invoice: fullInvoice,
        project,
        contract,
        estimate,
        clientName: clientName || undefined,
        clientEmail: clientEmail || undefined,
        clientAddress: clientAddress || undefined,
      });

      setActionMessage({
        text: `Invoice ${fullInvoice.invoice_number || fullInvoice.id} downloaded successfully as ${downloadedFileName}`,
        type: "success",
      });
    } catch (err: any) {
      console.error("PDF download error:", err);
      setActionMessage({
        text: err?.message || "Failed to generate invoice PDF. Please try again.",
        type: "error",
      });
    } finally {
      setDownloadingInvoiceId(null);
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
      getBillingSummary(projectFilter || undefined).then((res) => setBillingSummary(res)).catch(() => {});
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
        )} recorded successfully for ${refreshedInvoice.invoice_number}. Current status: ${refreshedInvoice.status}.`,
        type: "success",
      });
      getBillingSummary(projectFilter || undefined).then((res) => setBillingSummary(res)).catch(() => {});
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to record invoice payment receipt";
      setPaymentFormError(detail);
    } finally {
      setSubmitting(false);
    }
  };

  // Open Payment Reversal Modal
  const handleOpenReversePayment = (
    invoice: SoftwareInvoice,
    payment: SoftwareInvoicePayment
  ) => {
    setReversingPayment({ invoice, payment });
    setReversalReason("");
    setReversalError(null);
  };

  // Submit Payment Reversal
  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingPayment) return;

    if (reversalReason.trim().length < 3) {
      setReversalError("Reversal reason must be at least 3 characters long.");
      return;
    }

    setReversalSubmitting(true);
    setReversalError(null);
    try {
      const updated = await reverseSoftwareInvoicePayment(
        reversingPayment.invoice.id,
        reversingPayment.payment.id,
        { reason: reversalReason.trim() }
      );

      const refreshed = await getSoftwareInvoice(updated.id);
      setInvoices((prev) => prev.map((inv) => (inv.id === refreshed.id ? refreshed : inv)));
      if (viewingItem?.id === refreshed.id) {
        setViewingItem(refreshed);
      }

      getBillingSummary(projectFilter || undefined).then((res) => setBillingSummary(res)).catch(() => {});

      setReversingPayment(null);
      setActionMessage({
        text: `Payment of ${formatCurrency(
          reversingPayment.payment.amount,
          refreshed.currency
        )} reversed successfully.`,
        type: "success",
      });
    } catch (err: any) {
      setReversalError(
        err?.response?.data?.detail || err?.message || "Failed to reverse payment"
      );
    } finally {
      setReversalSubmitting(false);
    }
  };

  // Open Credit Note Modal
  const handleOpenCreditNoteModal = (invoice: SoftwareInvoice) => {
    setCreditNoteInvoice(invoice);
    setCreditNoteError(null);
    setCreditNoteForm({
      amount: Number(invoice.balance_due),
      reason: "",
      issue_date: new Date().toISOString().slice(0, 10),
    });
  };

  // Submit Credit Note
  const handleCreditNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditNoteInvoice) return;

    const amount = Number(creditNoteForm.amount);
    if (isNaN(amount) || amount <= 0) {
      setCreditNoteError("Credit note amount must be greater than zero.");
      return;
    }

    if (amount > Number(creditNoteInvoice.balance_due)) {
      setCreditNoteError(
        `Credit note amount cannot exceed the outstanding balance of ${formatCurrency(
          creditNoteInvoice.balance_due,
          creditNoteInvoice.currency
        )}.`
      );
      return;
    }

    if (creditNoteForm.reason.trim().length < 3) {
      setCreditNoteError("Credit note reason must be at least 3 characters long.");
      return;
    }

    setCreditNoteSubmitting(true);
    setCreditNoteError(null);
    try {
      const updated = await createSoftwareInvoiceCreditNote(creditNoteInvoice.id, {
        amount,
        reason: creditNoteForm.reason.trim(),
      });

      const refreshed = await getSoftwareInvoice(updated.id);
      setInvoices((prev) => prev.map((inv) => (inv.id === refreshed.id ? refreshed : inv)));
      if (viewingItem?.id === refreshed.id) {
        setViewingItem(refreshed);
      }

      getBillingSummary(projectFilter || undefined).then((res) => setBillingSummary(res)).catch(() => {});

      setCreditNoteInvoice(null);
      setActionMessage({
        text: `Credit note of ${formatCurrency(
          amount,
          refreshed.currency
        )} issued successfully for ${refreshed.invoice_number}. Status: ${refreshed.status}.`,
        type: "success",
      });
    } catch (err: any) {
      setCreditNoteError(
        err?.response?.data?.detail || err?.message || "Failed to issue credit note"
      );
    } finally {
      setCreditNoteSubmitting(false);
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
            Client billing, payment milestone progress invoices, receipts, payment reversals,
            credit notes, and revenue collection.
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
            border: `1px solid ${
              actionMessage.type === "success"
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

      {/* Authoritative Financial KPI Summary Cards */}
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
            {formatCurrency(stats.totalInvoiced, stats.currency)}
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
            {formatCurrency(stats.totalPaid, stats.currency)}
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
            Credited / Adjusted
          </div>
          <div
            style={{
              fontSize: "1.8rem",
              fontWeight: 700,
              color: "#a855f7",
              marginTop: "4px",
            }}
          >
            {formatCurrency(stats.totalCredited, stats.currency)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
            Issued credit notes
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
            {formatCurrency(stats.totalBalance, stats.currency)}
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
            {stats.overdueAmount > 0
              ? `${formatCurrency(stats.overdueAmount, stats.currency)} past due`
              : "Past due payment date"}
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
          <option value="Credited">Credited</option>
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
                  Boolean(inv.is_overdue) ||
                  (Number(inv.balance_due) > 0 &&
                    Boolean(inv.due_date) &&
                    inv.due_date! < new Date().toISOString().slice(0, 10));

                const canMarkSent = inv.status === "Draft" && perms.canSendInvoices;
                const canPay =
                  (inv.status === "Sent" || inv.status === "Partially Paid") &&
                  Number(inv.balance_due) > 0 &&
                  perms.canRecordPayment;
                const canCredit =
                  (inv.status === "Sent" || inv.status === "Partially Paid") &&
                  Number(inv.balance_due) > 0 &&
                  perms.canCreateCreditNote;
                const canVoid =
                  perms.canCancelInvoices &&
                  (inv.status === "Draft" ||
                    (inv.status === "Sent" &&
                      Number(inv.amount_paid || 0) <= 0 &&
                      (!inv.credit_notes || inv.credit_notes.length === 0)));

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
                          <span
                            className="sw-badge overdue"
                            style={{ marginLeft: "6px", padding: "1px 6px", fontSize: "0.65rem" }}
                          >
                            Overdue {inv.days_overdue ? `(${inv.days_overdue}d)` : ""}
                          </span>
                        )}
                      </span>
                    </td>

                    <td style={{ fontWeight: 700 }}>
                      {formatCurrency(inv.total_amount, inv.currency)}
                    </td>

                    <td style={{ color: "#10b981", fontWeight: 600 }}>
                      {formatCurrency(inv.amount_paid, inv.currency)}
                    </td>

                    <td>
                      <div
                        style={{
                          fontWeight: 700,
                          color: Number(inv.balance_due) > 0 ? "#f59e0b" : "#10b981",
                        }}
                      >
                        {formatCurrency(inv.balance_due, inv.currency)}
                      </div>
                      {Number(inv.credited_amount) > 0 && (
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "#a855f7",
                            fontWeight: 500,
                            marginTop: "2px",
                          }}
                        >
                          Credited: {formatCurrency(inv.credited_amount, inv.currency)}
                        </div>
                      )}
                    </td>

                    <td>
                      <span
                        className={`sw-badge ${
                          inv.status === "Paid"
                            ? "accepted"
                            : inv.status === "Sent"
                            ? "proposal"
                            : inv.status === "Partially Paid"
                            ? "under-review"
                            : inv.status === "Credited"
                            ? "credited"
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
                          title="View Invoice Details"
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

                        <button
                          className="sw-btn-icon"
                          title="Download Invoice PDF"
                          disabled={downloadingInvoiceId === inv.id}
                          onClick={() => handleDownloadPdf(inv)}
                          style={{
                            color: "#0284c7",
                            cursor: downloadingInvoiceId === inv.id ? "not-allowed" : "pointer",
                            opacity: downloadingInvoiceId === inv.id ? 0.6 : 1,
                          }}
                        >
                          {downloadingInvoiceId === inv.id ? (
                            <svg
                              className="sw-spin"
                              viewBox="0 0 24 24"
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              width="16"
                              height="16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          )}
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
                            title="Record Payment Receipt"
                            onClick={() => handleOpenPaymentModal(inv)}
                          >
                            Payment
                          </button>
                        )}

                        {canCredit && (
                          <button
                            className="sw-btn-secondary"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.72rem",
                              borderColor: "#a855f7",
                              color: "#a855f7",
                            }}
                            title="Issue Credit Note"
                            onClick={() => handleOpenCreditNoteModal(inv)}
                          >
                            Credit Note
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
                  <div className="sw-form-group span-2">
                    <label>Linked Software Contract *</label>
                    <select
                      className="sw-form-select"
                      required
                      value={formData.software_contract_id}
                      onChange={(e) => handleContractChange(e.target.value)}
                    >
                      <option value="">Select Linked Contract...</option>
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.contract_number} — {c.title} [{c.billing_type || "Fixed Price"}]
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sw-form-group">
                    <label>Software Project *</label>
                    <select
                      className="sw-form-select"
                      required
                      value={formData.project_id}
                      onChange={(e) => handleProjectChange(e.target.value)}
                    >
                      <option value="">Select Linked Project...</option>
                      {compatibleProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {compatibleProjects.length === 0 && formData.software_contract_id && (
                      <span style={{ fontSize: "0.75rem", color: "#f59e0b", marginTop: "4px", display: "block" }}>
                        ⚠️ No project is currently linked to this contract.
                      </span>
                    )}
                  </div>

                  <div className="sw-form-group">
                    <label>Invoice Number (Optional)</label>
                    <input
                      type="text"
                      className="sw-form-input"
                      placeholder="Leave blank to auto-generate (or enter custom)"
                      value={formData.invoice_number}
                      onChange={(e) =>
                        setFormData({ ...formData, invoice_number: e.target.value })
                      }
                    />
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

                {/* Contract Billing Rules Notice */}
                {formSelectedContract?.billing_type === "Fixed Price" ? (
                  <div
                    style={{
                      margin: "14px 0",
                      padding: "16px",
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      borderRadius: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 600, color: "#f59e0b", fontSize: "0.9rem", marginBottom: "4px" }}>
                      📌 Fixed Price Contract Invoicing
                    </div>
                    <div style={{ fontSize: "0.84rem", color: "#94a3b8", lineHeight: 1.5 }}>
                      Fixed Price contracts must be invoiced through payment milestones in the Software Contracts module.
                      To invoice a milestone, please go to{" "}
                      <a href="/software-contracts" style={{ color: "#38bdf8", textDecoration: "underline" }}>
                        Software Contracts
                      </a>
                      , open contract details, and click <strong>"Invoice"</strong> on a Ready milestone. Manual line item generation is disabled for Fixed Price contracts.
                    </div>
                  </div>
                ) : formSelectedContract?.billing_type === "Time & Material" ? (
                  <div
                    style={{
                      margin: "14px 0",
                      padding: "12px 16px",
                      background: "rgba(14, 165, 233, 0.08)",
                      border: "1px solid rgba(14, 165, 233, 0.25)",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: "#38bdf8", fontSize: "0.88rem" }}>
                        ⏱️ Time & Material Invoicing
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                        Invoiced using approved billable time entries at the contract hourly rate:{" "}
                        <strong style={{ color: "#10b981" }}>
                          {formatCurrency(formSelectedContract?.hourly_rate || 0, formSelectedContract?.currency)}/hr
                        </strong>
                      </div>
                    </div>
                    {(!formSelectedContract?.hourly_rate || Number(formSelectedContract.hourly_rate) <= 0) && (
                      <span style={{ fontSize: "0.8rem", color: "#ef4444", fontWeight: 600 }}>
                        ⚠️ Missing contract hourly rate
                      </span>
                    )}
                  </div>
                ) : null}

                {/* Line Items for Time & Material */}
                {formSelectedContract?.billing_type === "Time & Material" && (
                  <div className="sw-invoice-items-section">
                    <div className="sw-invoice-items-section-header">
                      <div className="sw-invoice-items-title">
                        <h3>Time Entry Line Items</h3>
                        <span className="sw-items-count-badge">
                          {formData.items.length} {formData.items.length === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="sw-btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "0.8rem" }}
                        onClick={handleAddTMItem}
                        disabled={
                          timeEntriesLoading ||
                          formData.items.length >= eligibleTimeEntries.length
                        }
                      >
                        + Add Time Entry Line
                      </button>
                    </div>

                    {timeEntriesLoading && (
                      <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "0.85rem" }}>
                        ⏳ Loading project time entries...
                      </div>
                    )}

                    {timeEntriesError && (
                      <div className="sw-error-banner" style={{ margin: "10px 0" }}>
                        ⚠️ {timeEntriesError}
                        {formData.project_id && (
                          <button
                            type="button"
                            className="sw-btn-secondary"
                            style={{ marginLeft: "12px", padding: "2px 8px", fontSize: "0.75rem" }}
                            onClick={() => fetchProjectTimeEntries(formData.project_id)}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    )}

                    {!timeEntriesLoading && !timeEntriesError && eligibleTimeEntries.length === 0 && (
                      <div
                        style={{
                          padding: "14px",
                          background: "rgba(255, 255, 255, 0.02)",
                          borderRadius: "6px",
                          fontSize: "0.82rem",
                          color: "#94a3b8",
                          marginBottom: "12px",
                        }}
                      >
                        ℹ️ No uninvoiced approved billable time entries found for project "
                        <strong>{formSelectedProject?.name || "Selected Project"}</strong>".
                        Ensure time entries are marked <strong>Billable</strong> and have <strong>Approved</strong> billing status in Software Time Tracking.
                      </div>
                    )}

                    <div className="sw-invoice-items-list">
                      {formData.items.map((item, idx) => {
                        const selectedEntry = eligibleTimeEntryMap.get(item.time_entry_id || "");
                        const taskTitle = selectedEntry
                          ? activityMap.get(selectedEntry.activity_id) || selectedEntry.activity_title || "Development Task"
                          : "";
                        const lineSub = Number(item.quantity || 0) * Number(item.unit_price || 0);
                        const lineTax = (lineSub * Number(item.tax_percent || 0)) / 100;
                        const lineTotal = lineSub + lineTax;

                        // Unselected entries for this line
                        const availableEntries = eligibleTimeEntries.filter(
                          (entry) =>
                            entry.id === item.time_entry_id ||
                            !formData.items.some((it, oIdx) => oIdx !== idx && it.time_entry_id === entry.id)
                        );

                        return (
                          <div
                            key={idx}
                            style={{
                              padding: "12px",
                              marginBottom: "10px",
                              background: "rgba(255, 255, 255, 0.02)",
                              border: "1px solid rgba(255, 255, 255, 0.06)",
                              borderRadius: "8px",
                            }}
                          >
                            <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: "0.78rem", color: "#94a3b8", display: "block", marginBottom: "4px" }}>
                                  Select Approved Time Entry *
                                </label>
                                <select
                                  className="sw-form-select"
                                  required
                                  value={item.time_entry_id || ""}
                                  onChange={(e) => handleSelectTimeEntry(idx, e.target.value)}
                                >
                                  <option value="">-- Choose Approved Time Entry --</option>
                                  {availableEntries.map((e) => {
                                    const title = activityMap.get(e.activity_id) || e.activity_title || "Task";
                                    const hrs = (Number(e.duration_minutes || 0) / 60).toFixed(2);
                                    return (
                                      <option key={e.id} value={e.id}>
                                        {e.work_date} — {title} ({hrs} hrs) [Approved]
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              <button
                                type="button"
                                className="sw-btn-icon danger"
                                style={{ marginTop: "22px" }}
                                title="Remove Line"
                                onClick={() => handleRemoveItem(idx)}
                              >
                                ✕
                              </button>
                            </div>

                            {selectedEntry && (
                              <div
                                style={{
                                  marginTop: "8px",
                                  padding: "8px 12px",
                                  background: "rgba(14, 165, 233, 0.05)",
                                  borderRadius: "6px",
                                  border: "1px solid rgba(14, 165, 233, 0.15)",
                                  display: "flex",
                                  gap: "16px",
                                  flexWrap: "wrap",
                                  fontSize: "0.78rem",
                                }}
                              >
                                <span>📅 <strong>Date:</strong> {selectedEntry.work_date}</span>
                                <span>📝 <strong>Task:</strong> {taskTitle}</span>
                                <span>⏱️ <strong>Duration:</strong> {selectedEntry.duration_minutes} min ({(Number(selectedEntry.duration_minutes) / 60).toFixed(4)} hrs)</span>
                                <span>✓ <strong>Status:</strong> Approved • Billable</span>
                                <span>💵 <strong>Rate:</strong> {formatCurrency(item.unit_price, formSelectedContract?.currency)}/hr</span>
                              </div>
                            )}

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "3fr 1fr 1fr 1fr 1fr",
                                gap: "10px",
                                marginTop: "8px",
                              }}
                            >
                              <div>
                                <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Description *</label>
                                <input
                                  type="text"
                                  className="sw-form-input"
                                  required
                                  value={item.description}
                                  onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Hours (Qty)</label>
                                <input
                                  type="number"
                                  className="sw-form-input"
                                  readOnly
                                  disabled
                                  value={item.quantity}
                                  style={{ cursor: "not-allowed", opacity: 0.8 }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Rate/hr</label>
                                <input
                                  type="number"
                                  className="sw-form-input"
                                  readOnly
                                  disabled
                                  value={item.unit_price}
                                  style={{ cursor: "not-allowed", opacity: 0.8 }}
                                />
                              </div>
                              <div>
                                <label style={{ fontSize: "0.75rem", color: "#64748b" }}>Tax %</label>
                                <input
                                  type="number"
                                  className="sw-form-input"
                                  min="0"
                                  max="100"
                                  value={item.tax_percent}
                                  onChange={(e) => handleItemChange(idx, "tax_percent", parseFloat(e.target.value) || 0)}
                                />
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <label style={{ fontSize: "0.75rem", color: "#64748b", display: "block" }}>Line Total</label>
                                <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#0ea5e9", lineHeight: "34px" }}>
                                  {formatCurrency(lineTotal, formSelectedContract?.currency)}
                                </span>
                              </div>
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
                            {formatCurrency(formTotals.subtotal, formSelectedContract?.currency)}
                          </span>
                        </div>
                        <div className="sw-invoice-total-row">
                          <span>Tax Amount:</span>
                          <span className="value">
                            {formatCurrency(formTotals.taxAmount, formSelectedContract?.currency)}
                          </span>
                        </div>
                        <div className="sw-invoice-total-row grand">
                          <span>Grand Total:</span>
                          <span className="value">
                            {formatCurrency(formTotals.totalAmount, formSelectedContract?.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

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
                <button type="submit" className="sw-btn-primary" disabled={submitting || formSelectedContract?.billing_type === "Fixed Price"}>
                  {submitting ? "Saving..." : "Create Invoice"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice Details Modal with Balances, Credit Notes & Payment History */}
      {viewingItem && (
        <div className="sw-modal-overlay" onClick={() => setViewingItem(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "860px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Invoice {viewingItem.invoice_number}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  className="sw-btn-download-pdf"
                  disabled={downloadingInvoiceId === viewingItem.id}
                  onClick={() => handleDownloadPdf(viewingItem)}
                  title="Download Invoice as PDF"
                >
                  {downloadingInvoiceId === viewingItem.id ? (
                    <>
                      <svg className="sw-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                      </svg>
                      <span>Generating PDF...</span>
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      <span>Download PDF</span>
                    </>
                  )}
                </button>
                <button className="sw-btn-icon" onClick={() => setViewingItem(null)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="sw-modal-body">
              {/* Badges Bar */}
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginBottom: "16px",
                }}
              >
                <span
                  className={`sw-badge ${
                    viewingItem.status === "Credited"
                      ? "credited"
                      : viewingItem.status?.toLowerCase().replace(/\s+/g, "-")
                  }`}
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

              {/* Overdue Warning Alert */}
              {(viewingItem.is_overdue ||
                (Number(viewingItem.balance_due) > 0 &&
                  Boolean(viewingItem.due_date) &&
                  viewingItem.due_date! < new Date().toISOString().slice(0, 10))) && (
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: "6px",
                    background: "rgba(239, 68, 68, 0.15)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    color: "#ef4444",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    marginBottom: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>⚠️</span>
                  <span>
                    This invoice is past due ({viewingItem.due_date}). Overdue by{" "}
                    {viewingItem.days_overdue ||
                      Math.max(
                        1,
                        Math.floor(
                          (Date.now() - new Date(viewingItem.due_date!).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      )}{" "}
                    days.
                  </span>
                </div>
              )}

              {/* Financial Balances Summary — 4 Core Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "12px",
                  padding: "16px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.08)",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    TOTAL INVOICE
                  </div>
                  <div
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 700,
                      color: "#0ea5e9",
                      marginTop: "2px",
                    }}
                  >
                    {formatCurrency(viewingItem.total_amount, viewingItem.currency)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    AMOUNT PAID
                  </div>
                  <div
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 700,
                      color: "#10b981",
                      marginTop: "2px",
                    }}
                  >
                    {formatCurrency(viewingItem.amount_paid, viewingItem.currency)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    CREDITED AMOUNT
                  </div>
                  <div
                    style={{
                      fontSize: "1.35rem",
                      fontWeight: 700,
                      color: "#a855f7",
                      marginTop: "2px",
                    }}
                  >
                    {formatCurrency(viewingItem.credited_amount || 0, viewingItem.currency)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
                    BALANCE DUE
                  </div>
                  <div
                    style={{
                      fontSize: "1.35rem",
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
              <h4 style={{ margin: "16px 0 8px 0" }}>Billed Items</h4>
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
                          it.line_total ?? Number(it.quantity) * Number(it.unit_price),
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

              {/* Credit Notes Section */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  margin: "24px 0 8px 0",
                }}
              >
                <h4 style={{ margin: 0 }}>Credit Notes & Adjustments</h4>
                {Number(viewingItem.balance_due) > 0 &&
                  (viewingItem.status === "Sent" || viewingItem.status === "Partially Paid") &&
                  perms.canCreateCreditNote && (
                    <button
                      className="sw-btn-secondary"
                      style={{
                        padding: "4px 10px",
                        fontSize: "0.75rem",
                        borderColor: "#a855f7",
                        color: "#a855f7",
                      }}
                      onClick={() => handleOpenCreditNoteModal(viewingItem)}
                    >
                      + Issue Credit Note
                    </button>
                  )}
              </div>

              <table className="sw-data-table">
                <thead>
                  <tr>
                    <th>Credit Note #</th>
                    <th>Issue Date</th>
                    <th>Reason</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingItem.credit_notes || []).map((cn: SoftwareCreditNote) => (
                    <tr key={cn.id}>
                      <td style={{ fontWeight: 600, color: "#a855f7", fontFamily: "monospace" }}>
                        {cn.credit_note_number}
                      </td>
                      <td>{cn.issue_date || cn.created_at?.slice(0, 10)}</td>
                      <td style={{ fontSize: "0.82rem", color: "#94a3b8" }}>{cn.reason}</td>
                      <td style={{ textAlign: "right", fontWeight: 700, color: "#a855f7" }}>
                        {formatCurrency(cn.amount, viewingItem.currency)}
                      </td>
                    </tr>
                  ))}
                  {(!viewingItem.credit_notes || viewingItem.credit_notes.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", color: "#94a3b8", padding: "14px" }}>
                        No credit notes issued for this invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Payment History Table with Reversal Support */}
              {perms.canViewInvoicePayments && (
                <>
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
                    <th>Date</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th>Status</th>
                    <th>Reversal Details / Remarks</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewingItem.payments || []).map((pm: SoftwareInvoicePayment) => {
                    const isReversed = pm.status === "Reversed";
                    const canReverse =
                      !isReversed &&
                      viewingItem.status !== "Draft" &&
                      viewingItem.status !== "Void" &&
                      perms.canReversePayment;

                    return (
                      <tr key={pm.id} style={{ opacity: isReversed ? 0.7 : 1 }}>
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
                        <td>
                          <span className={`sw-badge ${isReversed ? "reversed" : "active"}`}>
                            {pm.status || "Received"}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
                          {isReversed ? (
                            <span style={{ color: "#ef4444" }}>
                              Reversed: {pm.reversal_reason || "Cancelled receipt"}{" "}
                              {pm.reversed_at ? `(${pm.reversed_at.slice(0, 10)})` : ""}
                            </span>
                          ) : (
                            pm.notes || "—"
                          )}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: isReversed ? "#94a3b8" : "#10b981",
                            textDecoration: isReversed ? "line-through" : "none",
                          }}
                        >
                          {formatCurrency(pm.amount, viewingItem.currency)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {canReverse && (
                            <button
                              className="sw-btn-secondary"
                              style={{
                                padding: "3px 8px",
                                fontSize: "0.7rem",
                                borderColor: "#ef4444",
                                color: "#ef4444",
                              }}
                              title="Reverse Payment"
                              onClick={() => handleOpenReversePayment(viewingItem, pm)}
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(!viewingItem.payments || viewingItem.payments.length === 0) && (
                    <tr>
                      <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8", padding: "18px" }}>
                        No payment receipts recorded yet for this invoice.
                      </td>
                    </tr>
                  )}
                </tbody>
                  </table>
                </>
              )}

              {viewingItem.notes && (
                <div style={{ marginTop: "16px", fontSize: "0.85rem", color: "#94a3b8" }}>
                  <strong>Notes:</strong> {viewingItem.notes}
                </div>
              )}
            </div>

            <div className="sw-modal-footer">
              {viewingItem.status === "Draft" && perms.canSendInvoices && (
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
              {Number(viewingItem.balance_due) > 0 &&
                (viewingItem.status === "Sent" || viewingItem.status === "Partially Paid") &&
                perms.canCreateCreditNote && (
                  <button
                    className="sw-btn-secondary"
                    style={{ borderColor: "#a855f7", color: "#a855f7" }}
                    onClick={() => handleOpenCreditNoteModal(viewingItem)}
                  >
                    Issue Credit Note
                  </button>
                )}
              <button
                className="sw-btn-download-pdf"
                disabled={downloadingInvoiceId === viewingItem.id}
                onClick={() => handleDownloadPdf(viewingItem)}
                title="Download Invoice as PDF"
              >
                {downloadingInvoiceId === viewingItem.id ? (
                  <>
                    <svg className="sw-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
                    </svg>
                    <span>Generating PDF...</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>Download PDF</span>
                  </>
                )}
              </button>

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
                    Enter bank UTR, UPI transaction ID, cheque number, or gateway reference. Must be unique per tenant.
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

      {/* Payment Reversal Modal */}
      {reversingPayment && (
        <div className="sw-modal-overlay" onClick={() => setReversingPayment(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "480px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Reverse Payment Receipt</h2>
              <button className="sw-btn-icon" onClick={() => setReversingPayment(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleReverseSubmit}>
              <div className="sw-modal-body">
                {reversalError && (
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
                    <strong>Reversal Error:</strong> {reversalError}
                  </div>
                )}

                <p style={{ fontSize: "0.88rem", color: "#94a3b8", marginBottom: "14px" }}>
                  You are about to reverse a payment of{" "}
                  <strong style={{ color: "#10b981" }}>
                    {formatCurrency(
                      reversingPayment.payment.amount,
                      reversingPayment.invoice.currency
                    )}
                  </strong>{" "}
                  recorded on {reversingPayment.payment.payment_date}. The payment record will be
                  marked as <em>Reversed</em> and the invoice outstanding balance will be restored.
                </p>

                <div className="sw-form-group">
                  <label>Reason for Reversal *</label>
                  <textarea
                    className="sw-form-textarea"
                    required
                    minLength={3}
                    maxLength={1000}
                    rows={4}
                    placeholder="State the reason (e.g. Bounced cheque, erroneous duplicate entry, client chargeback)..."
                    value={reversalReason}
                    onChange={(e) => setReversalReason(e.target.value)}
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Minimum 3 characters, maximum 1,000 characters.
                  </span>
                </div>
              </div>

              <div className="sw-modal-footer">
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => setReversingPayment(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sw-btn-primary"
                  style={{ background: "#ef4444" }}
                  disabled={reversalSubmitting}
                >
                  {reversalSubmitting ? "Reversing..." : "Confirm Reversal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Credit Note Modal */}
      {creditNoteInvoice && (
        <div className="sw-modal-overlay" onClick={() => setCreditNoteInvoice(null)}>
          <div
            className="sw-modal-card"
            style={{ maxWidth: "520px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sw-modal-header">
              <h2>Issue Credit Note for {creditNoteInvoice.invoice_number}</h2>
              <button className="sw-btn-icon" onClick={() => setCreditNoteInvoice(null)}>
                ✕
              </button>
            </div>
            <form onSubmit={handleCreditNoteSubmit}>
              <div className="sw-modal-body">
                {creditNoteError && (
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
                    <strong>Credit Note Error:</strong> {creditNoteError}
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
                    <span>Total Invoice:</span>
                    <span style={{ fontWeight: 600 }}>
                      {formatCurrency(
                        creditNoteInvoice.total_amount,
                        creditNoteInvoice.currency
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
                    <span>Outstanding Balance:</span>
                    <span style={{ fontWeight: 700, color: "#f59e0b" }}>
                      {formatCurrency(
                        creditNoteInvoice.balance_due,
                        creditNoteInvoice.currency
                      )}
                    </span>
                  </div>
                </div>

                <div className="sw-form-group">
                  <label>
                    Credit Note Amount ({creditNoteInvoice.currency || "INR"}) *
                  </label>
                  <input
                    type="number"
                    className="sw-form-input"
                    required
                    min="0.01"
                    step="0.01"
                    max={Number(creditNoteInvoice.balance_due)}
                    value={creditNoteForm.amount || ""}
                    onChange={(e) =>
                      setCreditNoteForm({
                        ...creditNoteForm,
                        amount: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                  <span style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                    Cannot exceed the current outstanding balance of{" "}
                    {formatCurrency(
                      creditNoteInvoice.balance_due,
                      creditNoteInvoice.currency
                    )}
                    .
                  </span>
                </div>

                <div className="sw-form-group">
                  <label>Issue Date</label>
                  <input
                    type="date"
                    className="sw-form-input"
                    value={creditNoteForm.issue_date}
                    onChange={(e) =>
                      setCreditNoteForm({
                        ...creditNoteForm,
                        issue_date: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="sw-form-group">
                  <label>Reason for Credit Note *</label>
                  <textarea
                    className="sw-form-textarea"
                    required
                    minLength={3}
                    maxLength={1000}
                    rows={4}
                    placeholder="Explain the reason for adjustment (e.g. Scope reduction, SLA settlement discount, waived fee)..."
                    value={creditNoteForm.reason}
                    onChange={(e) =>
                      setCreditNoteForm({
                        ...creditNoteForm,
                        reason: e.target.value,
                      })
                    }
                  />
                  <span style={{ fontSize: "0.72rem", color: "#64748b" }}>
                    Minimum 3 characters, maximum 1,000 characters.
                  </span>
                </div>
              </div>

              <div className="sw-modal-footer">
                <button
                  type="button"
                  className="sw-btn-secondary"
                  onClick={() => setCreditNoteInvoice(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sw-btn-primary"
                  style={{ background: "#a855f7" }}
                  disabled={creditNoteSubmitting}
                >
                  {creditNoteSubmitting ? "Issuing..." : "Issue Credit Note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
