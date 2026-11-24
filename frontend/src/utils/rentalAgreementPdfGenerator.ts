import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBookingDateTime } from "./bookingJourney";
import { formatDay } from "./rentalHelpers";
import type { RentalAgreement } from "../types/rental";

export interface RentalAgreementPdfOptions {
  agreement: RentalAgreement;
  propertyName?: string | null;
  companyName?: string;
  portalName?: string;
}

const sanitizeFileName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
};

/**
 * Formats a currency value with proper typography, e.g.:
 * ₹64,990 / month, ₹1,00,000, ₹1,500 / month
 * Without letter-spacing, extra spaces, or displacement.
 */
export const formatPdfCurrency = (
  value: string | number | null | undefined,
  frequency?: string | null
): string => {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "None";
  const numStr = n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const freq =
    frequency === "Monthly"
      ? " / month"
      : frequency === "Quarterly"
      ? " / quarter"
      : frequency === "Yearly"
      ? " / year"
      : "";
  return `₹${numStr}${freq}`;
};

/**
 * Generates an executive, enterprise-grade PDF containing the complete agreement details
 * visible in the Agreement card with perfect alignment, spacing, and typography.
 */
export async function generateRentalAgreementPdf(
  options: RentalAgreementPdfOptions
): Promise<{ fileName: string; blob: Blob }> {
  const { agreement: a, propertyName } = options;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = 210;
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2; // 182 mm

  const company = options.companyName || "SCuilONE Real Estate";
  const portal = options.portalName || "Rentals & Leases Management Portal";
  const agreementNumber = a.id ? a.id.slice(0, 8).toUpperCase() : "AGR-OFFICIAL";
  const propName = propertyName || `${a.agreement_type || "Rental"} Property`;
  const tenantName = a.customer_name || "Tenant";

  // Financial values with tight, proper currency typography
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
  const statusUpper = (a.status || "Active").toUpperCase();

  let y = 12;

  // 1. TOP BRANDING ACCENT LINE
  doc.setFillColor(15, 23, 42); // Navy slate #0f172a
  doc.rect(marginX, y, usableWidth, 2.2, "F");
  doc.setFillColor(2, 132, 199); // Brand sky blue #0284c7
  doc.rect(marginX, y, 48, 2.2, "F");
  y += 7;

  // 2. HEADER
  // Left: Company Branding, Portal & Subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(company, marginX, y + 4.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(2, 132, 199);
  doc.text(portal, marginX, y + 9.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Official Tenancy Agreement Summary & Tenancy Record", marginX, y + 14);

  // Right: Document Title, Agreement Number & Date
  const rightX = pageWidth - marginX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(`${(a.agreement_type || "Rental").toUpperCase()} AGREEMENT`, rightX, y + 4.5, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Agreement #: ${agreementNumber}`, rightX, y + 9.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`, rightX, y + 14, { align: "right" });

  y += 19;

  // Header Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(marginX, y, rightX, y);
  y += 5;

  // 3. TWO BALANCED CARDS: PROPERTY & TENANT / TENANCY TERM & STATUS
  const cardGap = 6;
  const cardWidth = (usableWidth - cardGap) / 2; // 88 mm each
  const cardHeight = 31;

  // --- Left Card: Property & Tenant Details ---
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("PROPERTY & TENANT DETAILS", marginX + 4, y + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  const truncatedProp = doc.splitTextToSize(propName, cardWidth - 8)[0] ?? propName;
  doc.text(truncatedProp, marginX + 4, y + 10.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Tenant: ${tenantName}`, marginX + 4, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Phone: ${a.customer_phone || "Not specified"}`, marginX + 4, y + 21);

  const truncatedEmail = a.customer_email
    ? doc.splitTextToSize(`Email: ${a.customer_email}`, cardWidth - 8)[0] ?? `Email: ${a.customer_email}`
    : "Email: Not specified";
  doc.text(truncatedEmail, marginX + 4, y + 26);

  // --- Right Card: Tenancy Term & Status ---
  const rightColX = marginX + cardWidth + cardGap;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightColX, y, cardWidth, cardHeight, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("TENANCY TERM & STATUS", rightColX + 4, y + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`${startDate}   to   ${endDate}`, rightColX + 4, y + 10.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Lock-in: ${lockIn}   •   Notice: ${noticePeriod}`, rightColX + 4, y + 16);

  doc.text(`Payment Due: ${dueDay}`, rightColX + 4, y + 21);

  // Status Badge inside Right Card
  doc.text("Status: ", rightColX + 4, y + 26);
  doc.setFont("helvetica", "bold");
  if (statusUpper === "ACTIVE") {
    doc.setTextColor(22, 163, 74); // green-600
  } else if (statusUpper.includes("PENDING") || statusUpper === "DRAFT") {
    doc.setTextColor(217, 119, 6); // amber-600
  } else {
    doc.setTextColor(2, 132, 199);
  }
  doc.text(statusUpper, rightColX + 15, y + 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`(Activated: ${activated.split(" ")[0] ?? activated})`, rightColX + 44, y + 26);

  y += cardHeight + 5;

  // 4. FINANCIAL SUMMARY TILES (3 EQUAL COLUMNS)
  const statGap = 4;
  const statWidth = (usableWidth - statGap * 2) / 3; // ~58 mm each
  const statHeight = 22;

  // Tile 1: Rent Amount (Soft Green)
  doc.setFillColor(240, 253, 244); // green-50
  doc.setDrawColor(187, 247, 208); // green-200
  doc.roundedRect(marginX, y, statWidth, statHeight, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(21, 128, 61); // green-700
  doc.text("RENT AMOUNT", marginX + 4, y + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(22, 101, 52); // green-800
  doc.text(rentFormatted, marginX + 4, y + 12.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(21, 128, 61);
  doc.text(`Due on ${dueDay}`, marginX + 4, y + 18);

  // Tile 2: Security Deposit (Soft Blue)
  const tile2X = marginX + statWidth + statGap;
  doc.setFillColor(239, 246, 255); // blue-50
  doc.setDrawColor(191, 219, 254); // blue-200
  doc.roundedRect(tile2X, y, statWidth, statHeight, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(29, 78, 216); // blue-700
  doc.text("SECURITY DEPOSIT", tile2X + 4, y + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 58, 138); // blue-900
  doc.text(depositFormatted, tile2X + 4, y + 12.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(29, 78, 216);
  doc.text("Refundable upon tenancy end", tile2X + 4, y + 18);

  // Tile 3: Maintenance Charges (Soft Slate)
  const tile3X = tile2X + statWidth + statGap;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(tile3X, y, statWidth, statHeight, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text("MAINTENANCE CHARGES", tile3X + 4, y + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(maintenanceFormatted, tile3X + 4, y + 12.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(100, 116, 139);
  doc.text(a.maintenance_frequency ? `Billed ${a.maintenance_frequency.toLowerCase()}` : "Included in tenancy", tile3X + 4, y + 18);

  y += statHeight + 6;

  // 5. ITEMIZED AGREEMENT TERMS TABLE (AUTOTABLE)
  // First column: ~38% (69 mm), Second column: ~62% (113 mm) -> Total: 182 mm
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: "plain",
    head: [["Agreement Clause / Parameter", "Terms & Conditions Specified"]],
    body: [
      ["Agreement Type", `${a.agreement_type || "Rental"} Agreement`],
      ["Tenancy Duration", `${startDate} to ${endDate}`],
      ["Agreed Rent", rentFormatted],
      ["Security Deposit Held", depositFormatted],
      ["Maintenance Charges", maintenanceFormatted],
      ["Rent Payment Due Day", dueDay],
      ["Late Payment Terms", lateFee],
      ["Lock-in Period", lockIn],
      ["Notice Period for Vacating", noticePeriod],
      ["Annual Escalation", escalation],
      ["Tenant / Customer Signature", customerSigned],
      ["Electronic Signature Method", signatureMethod],
      ["Owner / Property Authorization", ownerSigned],
      ["Agreement Activation Record", activated],
      ["Tenancy Lifecycle Status", a.status || "Active"],
    ],
    headStyles: {
      fillColor: [15, 23, 42], // #0f172a
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
      valign: "middle",
      cellPadding: 3,
    },
    columnStyles: {
      0: {
        cellWidth: 69,
        fontStyle: "bold",
        textColor: [51, 65, 85],
        cellPadding: 2.8,
        valign: "middle",
      },
      1: {
        cellWidth: 113,
        textColor: [15, 23, 42],
        cellPadding: 2.8,
        valign: "middle",
      },
    },
    bodyStyles: {
      fontSize: 8,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // subtle zebra row
    },
  });

  // Calculate position after table
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y + 75;
  y = finalY + 4;

  // 6. EXECUTION & LEGAL RECORD NOTICE BOX
  if (y + 18 < 282) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, y, usableWidth, 16, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text("ELECTRONIC EXECUTION & LEGAL VERIFICATION", marginX + 4, y + 4.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Tenant Signature: ${customerSigned}    |    Method: ${signatureMethod}`,
      marginX + 4,
      y + 9
    );
    doc.text(
      `Management Authorization: ${ownerSigned}    |    Status: ${statusUpper}`,
      marginX + 4,
      y + 13
    );
  }

  // 7. FOOTER & VERIFICATION NOTICE
  const footerY = 286;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, footerY, rightX, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184); // #94a3b8
  doc.text(
    "Official System-Generated Agreement Summary • SCuilONE Real Estate Management Portal",
    pageWidth / 2,
    footerY + 3.8,
    { align: "center" }
  );
  doc.text(
    `Agreement #: ${agreementNumber}   •   Property: ${propName}   •   Issued: ${new Date().toLocaleString("en-IN")}`,
    pageWidth / 2,
    footerY + 7.2,
    { align: "center" }
  );

  const cleanNum = sanitizeFileName(agreementNumber);
  const fileName = `Agreement_${cleanNum}.pdf`;
  const blob = doc.output("blob");

  return { fileName, blob };
}

/**
 * Generates and downloads the complete agreement details PDF directly to the user's browser.
 */
export async function downloadRentalAgreementPdf(
  options: RentalAgreementPdfOptions
): Promise<string> {
  const { fileName, blob } = await generateRentalAgreementPdf(options);

  if (typeof window !== "undefined") {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return fileName;
}
