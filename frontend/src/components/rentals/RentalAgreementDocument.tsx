import React from "react";
import { DownloadIcon, FileTextIcon, PrinterIcon } from "../common/SupportPortalIcons";
import { RentalStatusBadge } from "./RentalWidgets";
import { formatPdfCurrency } from "../../utils/rentalAgreementPdfGenerator";
import { formatDay } from "../../utils/rentalHelpers";
import { formatBookingDateTime } from "../../utils/bookingJourney";
import type { RentalAgreement } from "../../types/rental";
import "./RentalAgreementDocument.css";

export interface RentalAgreementDocumentProps {
  agreement: RentalAgreement;
  propertyName?: string | null;
  companyName?: string;
  portalName?: string;
  onDownloadPdf?: () => void;
  isDownloading?: boolean;
  className?: string;
}

export const RentalAgreementDocument: React.FC<RentalAgreementDocumentProps> = ({
  agreement: a,
  propertyName,
  companyName = "SCuilONE Real Estate",
  portalName = "Rentals & Leases Management Portal",
  onDownloadPdf,
  isDownloading = false,
  className = "",
}) => {
  const agreementNumber = a.id ? a.id.slice(0, 8).toUpperCase() : "AGR-OFFICIAL";
  const propName = propertyName || `${a.agreement_type || "Rental"} Property`;
  const tenantName = a.customer_name || "Tenant";

  // Financial values with tight, clean currency formatting (no excessive character spacing)
  const rentFormatted = formatPdfCurrency(a.rent_amount, a.rent_frequency);
  const depositFormatted = formatPdfCurrency(a.deposit_amount);
  const maintenanceFormatted =
    Number(a.maintenance_amount) > 0
      ? formatPdfCurrency(a.maintenance_amount, a.maintenance_frequency)
      : "None";

  const startDate = formatDay(a.agreement_start);
  const endDate = a.agreement_end ? formatDay(a.agreement_end) : "Open-ended";
  const lockIn = `${a.lock_in_months} month${a.lock_in_months === 1 ? "" : "s"}`;
  const noticePeriod = `${a.notice_period_days} days`;
  const dueDay = `Day ${a.due_day} of each month`;
  const lateFee =
    Number(a.late_fee_amount) > 0
      ? `${a.late_fee_type === "Percentage" ? `${a.late_fee_amount}%` : formatPdfCurrency(a.late_fee_amount)} after ${a.late_fee_grace_days} grace days`
      : "None";
  const escalation =
    a.escalation_percentage != null
      ? `${a.escalation_percentage}% every ${a.escalation_interval_months} months`
      : "None";
  const customerSigned = a.customer_signed_at
    ? `${formatBookingDateTime(a.customer_signed_at)} (${a.customer_signature_name ?? "Verified"})`
    : "Not yet signed";
  const signatureMethod = a.customer_signature_method ?? "Digital Portal Verification";
  const ownerSigned = a.signed_at ? formatBookingDateTime(a.signed_at) : "Verified by Management";
  const activated = a.activated_at ? formatBookingDateTime(a.activated_at) : "Active";

  const handlePrint = () => {
    window.print();
  };

  const tableRows: Array<{ clause: string; term: string }> = [
    { clause: "Agreement Type", term: `${a.agreement_type || "Rental"} Agreement` },
    { clause: "Tenancy Duration", term: `${startDate} to ${endDate}` },
    { clause: "Agreed Rent", term: rentFormatted },
    { clause: "Security Deposit Held", term: depositFormatted },
    { clause: "Maintenance Charges", term: maintenanceFormatted },
    { clause: "Rent Payment Due Day", term: dueDay },
    { clause: "Late Payment Terms", term: lateFee },
    { clause: "Lock-in Period", term: lockIn },
    { clause: "Notice Period for Vacating", term: noticePeriod },
    { clause: "Annual Escalation", term: escalation },
    { clause: "Tenant / Customer Signature", term: customerSigned },
    { clause: "Electronic Signature Method", term: signatureMethod },
    { clause: "Owner / Property Authorization", term: ownerSigned },
    { clause: "Agreement Activation Record", term: activated },
    { clause: "Tenancy Lifecycle Status", term: a.status || "Active" },
  ];

  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className={`rad-container ${className}`}>
      {/* Action Bar (Hidden on print) */}
      <div className="rad-action-bar no-print">
        <div className="rad-action-info">
          <FileTextIcon size={16} />
          <span>Official Agreement Document View (A4 Print Ready)</span>
        </div>
        <div className="rad-action-buttons">
          <button
            type="button"
            className="btn-secondary rad-btn"
            onClick={handlePrint}
            title="Print agreement on A4 paper"
          >
            <PrinterIcon size={14} />
            <span>Print Document</span>
          </button>
          {onDownloadPdf && (
            <button
              type="button"
              className="btn-primary rad-btn"
              onClick={onDownloadPdf}
              disabled={isDownloading}
              title="Download official PDF copy"
            >
              <DownloadIcon size={14} />
              <span>{isDownloading ? "Generating PDF..." : "Download PDF"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Printable Document Sheet (A4 Proportion) */}
      <article className="rad-document-sheet" id="printable-rental-agreement">
        {/* Top Dual-Tone Branding Accent Bar */}
        <div className="rad-accent-bar" aria-hidden="true">
          <div className="rad-accent-primary" />
          <div className="rad-accent-secondary" />
        </div>

        {/* 1. Header Section */}
        <header className="rad-header">
          <div className="rad-header-left">
            <h1 className="rad-company-title">{companyName}</h1>
            <p className="rad-portal-subtitle">{portalName}</p>
            <p className="rad-document-tagline">Official Tenancy Agreement Summary &amp; Tenancy Record</p>
          </div>
          <div className="rad-header-right">
            <h2 className="rad-doc-type">{(a.agreement_type || "Rental").toUpperCase()} AGREEMENT</h2>
            <div className="rad-doc-meta">
              <span className="rad-meta-num">Agreement #: <strong>{agreementNumber}</strong></span>
              <span className="rad-meta-date">Generated: {generatedDate}</span>
            </div>
          </div>
        </header>

        <hr className="rad-divider" />

        {/* 2. Property & Tenant Details and Tenancy Term & Status Cards */}
        <section className="rad-info-cards-row" aria-label="Agreement Details">
          {/* Left Card: Property & Tenant Details */}
          <div className="rad-info-card">
            <h3 className="rad-card-title">PROPERTY &amp; TENANT DETAILS</h3>
            <div className="rad-card-body">
              <div className="rad-card-field property-name">
                <span className="rad-field-val font-highlight">{propName}</span>
              </div>
              <div className="rad-card-field">
                <span className="rad-field-label">Tenant:</span>
                <span className="rad-field-val">{tenantName}</span>
              </div>
              <div className="rad-card-field">
                <span className="rad-field-label">Phone:</span>
                <span className="rad-field-val">{a.customer_phone || "Not specified"}</span>
              </div>
              <div className="rad-card-field email-field">
                <span className="rad-field-label">Email:</span>
                <span className="rad-field-val text-break">{a.customer_email || "Not specified"}</span>
              </div>
            </div>
          </div>

          {/* Right Card: Tenancy Term & Status */}
          <div className="rad-info-card">
            <h3 className="rad-card-title">TENANCY TERM &amp; STATUS</h3>
            <div className="rad-card-body">
              <div className="rad-card-field dates-field">
                <span className="rad-field-val font-highlight">{startDate} to {endDate}</span>
              </div>
              <div className="rad-card-field">
                <span className="rad-field-label">Lock-in Period:</span>
                <span className="rad-field-val">{lockIn}</span>
                <span className="rad-field-sep">•</span>
                <span className="rad-field-label">Notice:</span>
                <span className="rad-field-val">{noticePeriod}</span>
              </div>
              <div className="rad-card-field">
                <span className="rad-field-label">Payment Due:</span>
                <span className="rad-field-val">{dueDay}</span>
              </div>
              <div className="rad-card-field status-field">
                <span className="rad-field-label">Status:</span>
                <RentalStatusBadge status={a.status} />
                <span className="rad-field-sub">
                  (Activated: {activated.split(" ")[0] ?? activated})
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Financial Summary Cards (3 Equal-Width Tiles) */}
        <section className="rad-financial-cards-row" aria-label="Financial Summary">
          {/* Tile 1: Rent Amount */}
          <div className="rad-financial-card rent-card">
            <span className="rad-fin-label">RENT AMOUNT</span>
            <span className="rad-fin-amount">{rentFormatted}</span>
            <span className="rad-fin-note">Due on {dueDay}</span>
          </div>

          {/* Tile 2: Security Deposit */}
          <div className="rad-financial-card deposit-card">
            <span className="rad-fin-label">SECURITY DEPOSIT</span>
            <span className="rad-fin-amount">{depositFormatted}</span>
            <span className="rad-fin-note">Refundable upon tenancy end</span>
          </div>

          {/* Tile 3: Maintenance Charges */}
          <div className="rad-financial-card maintenance-card">
            <span className="rad-fin-label">MAINTENANCE CHARGES</span>
            <span className="rad-fin-amount">{maintenanceFormatted}</span>
            <span className="rad-fin-note">
              {a.maintenance_frequency ? `Billed ${a.maintenance_frequency.toLowerCase()}` : "Included in tenancy"}
            </span>
          </div>
        </section>

        {/* 4. Agreement Terms & Conditions Table */}
        <section className="rad-terms-section" aria-label="Agreement Clauses and Conditions">
          <table className="rad-terms-table">
            <thead>
              <tr>
                <th className="col-clause">Agreement Clause / Parameter</th>
                <th className="col-terms">Terms &amp; Conditions Specified</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, idx) => (
                <tr key={idx} className={idx % 2 === 1 ? "zebra-row" : ""}>
                  <td className="col-clause">{row.clause}</td>
                  <td className="col-terms">{row.term}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 5. Electronic Execution & Legal Verification Box */}
        <section className="rad-execution-box" aria-label="Legal Execution">
          <h4 className="rad-execution-title">ELECTRONIC EXECUTION &amp; LEGAL VERIFICATION</h4>
          <div className="rad-execution-grid">
            <div className="rad-execution-row">
              <span className="rad-exec-item">
                <strong>Tenant Signature:</strong> {customerSigned}
              </span>
              <span className="rad-exec-sep">|</span>
              <span className="rad-exec-item">
                <strong>Method:</strong> {signatureMethod}
              </span>
            </div>
            <div className="rad-execution-row">
              <span className="rad-exec-item">
                <strong>Management Authorization:</strong> {ownerSigned}
              </span>
              <span className="rad-exec-sep">|</span>
              <span className="rad-exec-item">
                <strong>Tenancy Status:</strong> {a.status || "Active"}
              </span>
            </div>
            <div className="rad-execution-row rad-exec-meta">
              <span>
                <strong>System Reference:</strong> AGR-{agreementNumber} • Digitally Certified by SCuilONE Real Estate Management
              </span>
            </div>
          </div>
        </section>

        {/* 6. Footer Notice */}
        <footer className="rad-footer">
          <hr className="rad-divider" />
          <p className="rad-footer-line">
            Official System-Generated Agreement Summary • SCuilONE Real Estate Management Portal
          </p>
          <p className="rad-footer-sub">
            Agreement #: {agreementNumber} • Property: {propName} • Issued: {new Date().toLocaleString("en-IN")}
          </p>
        </footer>
      </article>
    </div>
  );
};
