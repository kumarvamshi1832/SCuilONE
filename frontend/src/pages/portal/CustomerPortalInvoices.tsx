import { useState, useEffect, useCallback } from "react";
import {
  FileTextIcon,
  RefreshIcon,
  AlertCircleIcon,
  XIcon,
  SearchIcon,
} from "../../components/common/SupportPortalIcons";
import {
  getPortalInvoices,
  getPortalInvoice,
} from "../../services/customerPortalCommercialService";
import type { PortalInvoice } from "../../types/customerPortal";
import "./CustomerPortalTickets.css";

const INVOICE_STATUSES = ["Sent", "Partially Paid", "Paid", "Credited"];

export default function CustomerPortalInvoices() {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const [selectedInvoice, setSelectedInvoice] = useState<PortalInvoice | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPortalInvoices();
      setInvoices(data || []);
    } catch (err: any) {
      console.error("Failed to load invoices:", err);
      setError(err?.response?.data?.detail || "Unable to load customer billing invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleOpenDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await getPortalInvoice(id);
      setSelectedInvoice(data);
    } catch (err: any) {
      console.error("Failed to load invoice details:", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const filtered = invoices.filter((inv) => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return inv.invoice_number.toLowerCase().includes(q);
  });

  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (isOverdue && status !== "Paid") {
      return (
        <span className="badge-status" style={{ background: "rgba(239, 68, 68, 0.12)", color: "#ef4444" }}>
          Overdue
        </span>
      );
    }
    switch (status) {
      case "Paid":
        return <span className="badge-status status-resolved">Paid</span>;
      case "Partially Paid":
        return <span className="badge-status status-waiting">Partially Paid</span>;
      case "Sent":
        return <span className="badge-status status-open">Sent</span>;
      case "Credited":
        return <span className="badge-status" style={{ background: "rgba(168, 85, 247, 0.12)", color: "#a855f7" }}>Credited</span>;
      default:
        return <span className="badge-status">{status}</span>;
    }
  };

  return (
    <div className="cp-tickets-page">
      <div className="cp-tickets-header">
        <div>
          <h1>Invoices & Billing Statements</h1>
          <p>
            Inspect itemized billing records, payment histories, credit notes, and outstanding balances.
          </p>
        </div>
        <button className="btn-secondary" onClick={fetchInvoices} title="Refresh invoices">
          <RefreshIcon size={16} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="cp-tickets-toolbar">
        <div className="cp-search-box" style={{ flex: 1 }}>
          <SearchIcon size={16} className="cp-search-icon" />
          <input
            type="text"
            placeholder="Search by invoice #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="cp-filters-group">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="cp-select"
          >
            <option value="">All Statuses</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {statusFilter && (
            <button className="btn-secondary" onClick={() => setStatusFilter("")}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="cp-tickets-card">
        {error ? (
          <div className="support-alert error">
            <AlertCircleIcon size={18} />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#64748b" }}>
            <RefreshIcon size={24} className="animate-spin" style={{ margin: "0 auto 10px" }} />
            <div>Loading billing invoices...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cp-empty-state">
            <FileTextIcon size={36} style={{ color: "#94a3b8", margin: "0 auto 12px" }} />
            <h3>No invoices found</h3>
            <p>There are no billing records matching your filters.</p>
          </div>
        ) : (
          <div className="cp-table-responsive">
            <table className="cp-tickets-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Status</th>
                  <th>Issue Date</th>
                  <th>Due Date</th>
                  <th>Total Amount</th>
                  <th>Amount Paid</th>
                  <th>Balance Due</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong style={{ color: "#2563eb" }}>{item.invoice_number}</strong>
                    </td>
                    <td>{getStatusBadge(item.status, item.is_overdue)}</td>
                    <td style={{ color: "#64748b", fontSize: "0.8125rem" }}>{item.issue_date}</td>
                    <td style={{ color: item.is_overdue ? "#ef4444" : "#64748b", fontSize: "0.8125rem" }}>
                      {item.due_date || "Upon Receipt"}
                      {item.is_overdue && item.days_overdue > 0 && (
                        <div style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: 600 }}>
                          {item.days_overdue} days overdue
                        </div>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {item.currency} {Number(item.total_amount).toFixed(2)}
                    </td>
                    <td style={{ color: "#16a34a", fontWeight: 600 }}>
                      {item.currency} {Number(item.amount_paid).toFixed(2)}
                    </td>
                    <td style={{ fontWeight: 700, color: Number(item.balance_due) > 0 ? "#f59e0b" : "#16a34a" }}>
                      {item.currency} {Number(item.balance_due).toFixed(2)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleOpenDetail(item.id)}
                        disabled={loadingDetail}
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 840, width: "100%" }}>
            <div className="modal-header">
              <div>
                <h2>Invoice #{selectedInvoice.invoice_number}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 2 }}>
                  Status: {getStatusBadge(selectedInvoice.status, selectedInvoice.is_overdue)} &bull; Due: {selectedInvoice.due_date || "Upon Receipt"}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedInvoice(null)}>
                <XIcon size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: "75vh", overflowY: "auto" }}>
              {/* Overview Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 20 }}>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Total Invoiced</small>
                  <strong>{selectedInvoice.currency} {Number(selectedInvoice.total_amount).toFixed(2)}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Total Paid</small>
                  <strong style={{ color: "#16a34a" }}>{selectedInvoice.currency} {Number(selectedInvoice.amount_paid).toFixed(2)}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Credited Amount</small>
                  <strong>{selectedInvoice.currency} {Number(selectedInvoice.credited_amount).toFixed(2)}</strong>
                </div>
                <div>
                  <small style={{ color: "#64748b", display: "block" }}>Balance Due</small>
                  <strong style={{ color: Number(selectedInvoice.balance_due) > 0 ? "#f59e0b" : "#16a34a", fontSize: "1.05rem" }}>
                    {selectedInvoice.currency} {Number(selectedInvoice.balance_due).toFixed(2)}
                  </strong>
                </div>
              </div>

              {/* Line Items */}
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "16px 0 8px 0" }}>
                Itemized Invoice Charges
              </h3>
              <div className="cp-table-responsive" style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 20 }}>
                <table className="cp-tickets-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Quantity</th>
                      <th>Unit Price</th>
                      <th>Tax %</th>
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedInvoice.items?.map((it) => (
                      <tr key={it.id}>
                        <td><strong>{it.description}</strong></td>
                        <td>{Number(it.quantity)}</td>
                        <td>{selectedInvoice.currency} {Number(it.unit_price).toFixed(2)}</td>
                        <td>{Number(it.tax_percent)}%</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {selectedInvoice.currency} {Number(it.line_total).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Payment Receipts History */}
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "16px 0 8px 0" }}>
                Payment Receipts ({selectedInvoice.payments?.length || 0})
              </h3>
              {(!selectedInvoice.payments || selectedInvoice.payments.length === 0) ? (
                <div style={{ color: "#64748b", fontStyle: "italic", padding: 12, background: "rgba(0,0,0,0.02)", borderRadius: 8, marginBottom: 20 }}>
                  No recorded payment receipts for this invoice.
                </div>
              ) : (
                <div className="cp-table-responsive" style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 20 }}>
                  <table className="cp-tickets-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Reference #</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.payments.map((p) => (
                        <tr key={p.id}>
                          <td style={{ color: "#64748b", fontSize: "0.8125rem" }}>{p.payment_date}</td>
                          <td>{p.payment_method}</td>
                          <td style={{ fontSize: "0.8125rem", fontFamily: "monospace" }}>{p.transaction_reference || "—"}</td>
                          <td><span className="badge-status status-resolved">{p.status}</span></td>
                          <td style={{ textAlign: "right", fontWeight: 700, color: "#16a34a" }}>
                            {selectedInvoice.currency} {Number(p.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Credit Notes */}
              {selectedInvoice.credit_notes && selectedInvoice.credit_notes.length > 0 && (
                <div>
                  <h3 style={{ fontSize: "0.95rem", fontWeight: 700, margin: "16px 0 8px 0" }}>
                    Applied Credit Notes
                  </h3>
                  <div className="cp-table-responsive" style={{ border: "1px solid #e2e8f0", borderRadius: 8 }}>
                    <table className="cp-tickets-table">
                      <thead>
                        <tr>
                          <th>Credit Note #</th>
                          <th>Issue Date</th>
                          <th>Reason</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.credit_notes.map((cn) => (
                          <tr key={cn.id}>
                            <td><strong>{cn.credit_note_number}</strong></td>
                            <td style={{ color: "#64748b", fontSize: "0.8125rem" }}>{cn.issue_date}</td>
                            <td style={{ fontSize: "0.8125rem", color: "#475569" }}>{cn.reason}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: "#a855f7" }}>
                              {selectedInvoice.currency} {Number(cn.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setSelectedInvoice(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

