import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  SoftwareInvoice,
  SoftwareInvoiceItem,
  SoftwareInvoicePayment,
  SoftwareCreditNote,
} from "../types/softwareInvoice";
import type { SoftwareProject } from "../types/softwareProject";
import type { SoftwareContract } from "../types/softwareContract";
import type { SoftwareEstimate } from "../types/softwareEstimate";

export interface SoftwareInvoicePdfContext {
  invoice: SoftwareInvoice;
  project?: SoftwareProject | null;
  contract?: SoftwareContract | null;
  estimate?: SoftwareEstimate | null;
  clientName?: string | null;
  clientAddress?: string | null;
  clientEmail?: string | null;
}

let cachedFontNormal: string | null = null;
let cachedFontBold: string | null = null;
let fontLoadAttempted = false;

/**
 * Attempt to load Arial TrueType fonts from public directory for Unicode/Rupee support.
 * Gracefully falls back to null if running offline or in restricted environments.
 */
async function loadUnicodeFonts(): Promise<{ normal: string; bold: string } | null> {
  if (cachedFontNormal && cachedFontBold) {
    return { normal: cachedFontNormal, bold: cachedFontBold };
  }
  if (fontLoadAttempted) {
    return null;
  }
  fontLoadAttempted = true;

  try {
    if (typeof window === "undefined" || typeof fetch === "undefined") {
      return null;
    }
    const [resNormal, resBold] = await Promise.all([
      fetch("/fonts/arial.ttf"),
      fetch("/fonts/arialbd.ttf"),
    ]);

    if (!resNormal.ok || !resBold.ok) {
      return null;
    }

    const [bufNormal, bufBold] = await Promise.all([
      resNormal.arrayBuffer(),
      resBold.arrayBuffer(),
    ]);

    const toBinaryString = (buffer: ArrayBuffer): string => {
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, len)));
      }
      return binary;
    };

    cachedFontNormal = toBinaryString(bufNormal);
    cachedFontBold = toBinaryString(bufBold);
    return { normal: cachedFontNormal, bold: cachedFontBold };
  } catch {
    return null;
  }
}

/**
 * Format currency with proper symbols or ISO fallback code.
 */
export function formatPdfCurrency(
  amount: number | string | undefined | null,
  currencyCode: string = "INR",
  hasUnicodeFont: boolean = true
): string {
  const num = typeof amount === "number" ? amount : parseFloat(String(amount || "0")) || 0;
  const curr = (currencyCode || "INR").toUpperCase();

  const formattedNum = num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (!hasUnicodeFont) {
    return `${curr} ${formattedNum}`;
  }

  switch (curr) {
    case "INR":
      return `₹ ${formattedNum}`;
    case "USD":
      return `$ ${formattedNum}`;
    case "EUR":
      return `€ ${formattedNum}`;
    case "GBP":
      return `£ ${formattedNum}`;
    default:
      return `${curr} ${formattedNum}`;
  }
}

/**
 * Sanitize filename for filesystem compatibility.
 */
export function sanitizePdfFileName(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

/**
 * Main PDF Generation Engine for Software Invoices.
 * Generates an executive A4-sized branded invoice PDF completely client-side.
 */
export async function generateSoftwareInvoicePdf(
  context: SoftwareInvoicePdfContext
): Promise<{ fileName: string; blob: Blob }> {
  const { invoice, project, contract, estimate, clientName, clientAddress, clientEmail } = context;

  // Initialize A4 document (portrait, 210 x 297 mm)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  // Attempt to load TrueType Unicode font
  const fonts = await loadUnicodeFonts();
  let fontNormal = "helvetica";
  let fontBold = "helvetica";
  let hasUnicode = false;

  if (fonts) {
    try {
      doc.addFileToVFS("arial.ttf", fonts.normal);
      doc.addFont("arial.ttf", "Arial", "normal");
      doc.addFileToVFS("arialbd.ttf", fonts.bold);
      doc.addFont("arialbd.ttf", "Arial", "bold");
      doc.setFont("Arial", "normal");
      fontNormal = "Arial";
      fontBold = "Arial";
      hasUnicode = true;
    } catch {
      fontNormal = "helvetica";
      fontBold = "helvetica";
      hasUnicode = false;
    }
  }

  const pageWidth = 210;
  const marginX = 14;
  const usableWidth = pageWidth - marginX * 2; // 182 mm
  const currency = invoice.currency || "INR";

  let y = 14;

  // ==========================================
  // TOP ACCENT BRANDING BAR
  // ==========================================
  doc.setFillColor(2, 132, 199); // Sky blue #0284c7
  doc.rect(marginX, y, usableWidth, 2, "F");
  y += 7;

  // ==========================================
  // SECTION 1: HEADER & INVOICE IDENTIFIERS
  // ==========================================
  const headerStartY = y;

  // Left: SCuilONE Branding
  doc.setFont(fontBold, "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42); // Deep navy #0f172a
  doc.text("SCuil", marginX, y + 6);
  const scuilWidth = doc.getTextWidth("SCuil");

  doc.setTextColor(2, 132, 199); // Cyan-blue #0284c7
  doc.text("ONE", marginX + scuilWidth, y + 6);

  // Subtitle
  doc.setFont(fontBold, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139); // Slate #64748b
  doc.text("ENTERPRISE SOFTWARE SOLUTIONS", marginX, y + 11);

  doc.setFont(fontNormal, "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("SCuilONE CRM • Invoicing & Financial Operations", marginX, y + 16);

  // Right: Document Title, Invoice Number, Status & Dates
  const rightX = marginX + usableWidth;
  const isDraft = invoice.status === "Draft";
  const docTitle = isDraft ? "INVOICE" : "TAX INVOICE";

  doc.setFont(fontBold, "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(docTitle, rightX, y + 5, { align: "right" });

  doc.setFont(fontBold, "bold");
  doc.setFontSize(10);
  doc.setTextColor(2, 132, 199);
  doc.text(`#${invoice.invoice_number || invoice.id}`, rightX, y + 10.5, { align: "right" });

  // Status Badge Pill
  const statusStr = String(invoice.status || "Draft");
  let statusBg: [number, number, number] = [241, 245, 249]; // default slate
  let statusBorder: [number, number, number] = [203, 213, 225];
  let statusText: [number, number, number] = [71, 85, 105];

  if (statusStr === "Paid") {
    statusBg = [236, 253, 245];
    statusBorder = [167, 243, 208];
    statusText = [5, 150, 105];
  } else if (statusStr === "Partially Paid") {
    statusBg = [255, 251, 235];
    statusBorder = [253, 230, 138];
    statusText = [217, 119, 6];
  } else if (statusStr === "Sent") {
    statusBg = [240, 249, 255];
    statusBorder = [186, 230, 253];
    statusText = [2, 132, 199];
  } else if (statusStr === "Credited") {
    statusBg = [250, 245, 255];
    statusBorder = [233, 213, 255];
    statusText = [124, 58, 237];
  } else if (statusStr === "Void") {
    statusBg = [255, 241, 242];
    statusBorder = [254, 205, 211];
    statusText = [225, 29, 72];
  }

  doc.setFontSize(8);
  doc.setFont(fontBold, "bold");
  const badgeWidth = doc.getTextWidth(statusStr.toUpperCase()) + 8;
  const badgeHeight = 5.5;
  const badgeX = rightX - badgeWidth;
  const badgeY = y + 12.5;

  doc.setFillColor(statusBg[0], statusBg[1], statusBg[2]);
  doc.setDrawColor(statusBorder[0], statusBorder[1], statusBorder[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 1.5, 1.5, "FD");

  doc.setTextColor(statusText[0], statusText[1], statusText[2]);
  doc.text(statusStr.toUpperCase(), badgeX + badgeWidth / 2, badgeY + 4, { align: "center" });

  // Dates
  doc.setFont(fontNormal, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Issue Date: ${invoice.issue_date || "—"}`, rightX, y + 23.5, { align: "right" });
  doc.text(
    `Due Date: ${invoice.due_date || "Upon Receipt"}`,
    rightX,
    y + 28,
    { align: "right" }
  );

  y = headerStartY + 33;

  // Thin separator line
  doc.setDrawColor(226, 232, 240); // #e2e8f0
  doc.setLineWidth(0.35);
  doc.line(marginX, y, rightX, y);
  y += 5;

  // ==========================================
  // SECTION 2: CLIENT & PROJECT INFORMATION
  // ==========================================
  const boxWidth = (usableWidth - 6) / 2; // 88 mm
  const boxHeight = 28;

  // Left Box: Billed To
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, boxWidth, boxHeight, 2, 2, "FD");

  doc.setFont(fontBold, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("BILLED TO / CUSTOMER", marginX + 4, y + 5.5);

  const resolvedClient = clientName || "Valued Enterprise Client";
  doc.setFont(fontBold, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(resolvedClient, marginX + 4, y + 11.5);

  doc.setFont(fontNormal, "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  let clientY = y + 16.5;
  if (clientAddress) {
    const addressLines = doc.splitTextToSize(clientAddress, boxWidth - 8);
    doc.text(addressLines.slice(0, 2), marginX + 4, clientY);
    clientY += addressLines.length * 4;
  }
  if (clientEmail) {
    doc.text(`Email: ${clientEmail}`, marginX + 4, clientY);
  }

  // Right Box: Project & Contract Reference
  const rightBoxX = marginX + boxWidth + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightBoxX, y, boxWidth, boxHeight, 2, 2, "FD");

  doc.setFont(fontBold, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("PROJECT & CONTRACT REFERENCE", rightBoxX + 4, y + 5.5);

  const projName = project?.name || "Software Development Project";
  const projRef = project?.project_number ? ` (#${project.project_number})` : "";
  doc.setFont(fontBold, "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(doc.splitTextToSize(`${projName}${projRef}`, boxWidth - 8)[0], rightBoxX + 4, y + 11.5);

  doc.setFont(fontNormal, "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  const contractTitle = contract
    ? `Contract: ${contract.contract_number} • ${contract.title || ""}`
    : `Contract ID: ${invoice.software_contract_id ? invoice.software_contract_id.slice(0, 8) + "..." : "—"}`;
  doc.text(doc.splitTextToSize(contractTitle, boxWidth - 8)[0], rightBoxX + 4, y + 16.5);

  const estimateRef = estimate?.estimate_number
    ? `Estimate: ${estimate.estimate_number}`
    : contract?.billing_type
    ? `Billing Model: ${contract.billing_type}`
    : "Model: Software Delivery Billing";
  doc.text(estimateRef, rightBoxX + 4, y + 21);

  y += boxHeight + 5;

  // ==========================================
  // SECTION 3: FINANCIAL SUMMARY METRIC CARDS
  // ==========================================
  const statBoxWidth = (usableWidth - 3 * 3.5) / 4; // ~42.8 mm
  const statBoxHeight = 16;

  const statMetrics: Array<{
    label: string;
    val: string;
    color: [number, number, number];
  }> = [
    {
      label: "TOTAL INVOICE",
      val: formatPdfCurrency(invoice.total_amount, currency, hasUnicode),
      color: [15, 23, 42],
    },
    {
      label: "AMOUNT PAID",
      val: formatPdfCurrency(invoice.amount_paid, currency, hasUnicode),
      color: [5, 150, 105], // Green
    },
    {
      label: "CREDITED AMOUNT",
      val: formatPdfCurrency(invoice.credited_amount || 0, currency, hasUnicode),
      color: [124, 58, 237], // Purple
    },
    {
      label: "BALANCE DUE",
      val: formatPdfCurrency(invoice.balance_due, currency, hasUnicode),
      color: Number(invoice.balance_due) > 0 ? [217, 119, 6] : [5, 150, 105], // Amber or Green
    },
  ];

  statMetrics.forEach((stat, idx) => {
    const statX = marginX + idx * (statBoxWidth + 3.5);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(statX, y, statBoxWidth, statBoxHeight, 1.8, 1.8, "FD");

    // Top subtle bar
    doc.setFillColor(stat.color[0], stat.color[1], stat.color[2]);
    doc.roundedRect(statX, y, statBoxWidth, 1.2, 0.6, 0.6, "F");

    doc.setFont(fontBold, "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(stat.label, statX + 3.5, y + 5.5);

    doc.setFont(fontBold, "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(stat.color[0], stat.color[1], stat.color[2]);
    doc.text(stat.val, statX + 3.5, y + 11.5);
  });

  y += statBoxHeight + 6;

  // ==========================================
  // SECTION 4: BILLED ITEMS TABLE
  // ==========================================
  const items = Array.isArray(invoice.items) && invoice.items.length > 0 ? invoice.items : [];

  const tableRows = items.map((it: SoftwareInvoiceItem, index: number) => {
    const qty = typeof it.quantity === "number" ? it.quantity : parseFloat(String(it.quantity || "1"));
    const unitPrice = formatPdfCurrency(it.unit_price, currency, hasUnicode);
    const taxPct = `${Number(it.tax_percent || 0).toFixed(1)}%`;
    const lineTotal = formatPdfCurrency(it.line_total, currency, hasUnicode);

    return [
      String(index + 1),
      it.description || "Software Engineering Service",
      qty % 1 === 0 ? String(qty) : qty.toFixed(2),
      unitPrice,
      taxPct,
      lineTotal,
    ];
  });

  // Fallback if no line items exist
  if (tableRows.length === 0) {
    tableRows.push([
      "1",
      "Software Development & Professional Services",
      "1",
      formatPdfCurrency(invoice.subtotal || invoice.total_amount, currency, hasUnicode),
      "0%",
      formatPdfCurrency(invoice.total_amount, currency, hasUnicode),
    ]);
  }

  autoTable(doc, {
    startY: y,
    head: [["#", "Item & Description", "Qty", "Unit Price", "Tax %", "Line Total"]],
    body: tableRows,
    theme: "plain",
    margin: { left: marginX, right: marginX, bottom: 24 },
    tableWidth: usableWidth,
    showHead: "everyPage",
    styles: {
      font: fontNormal,
      fontSize: 8.5,
      textColor: [51, 65, 85],
      cellPadding: { top: 3.2, bottom: 3.2, left: 2.5, right: 2.5 },
      overflow: "linebreak",
      lineWidth: 0.15,
      lineColor: [226, 232, 240],
    },
    headStyles: {
      font: fontBold,
      fontStyle: "bold",
      fillColor: [15, 23, 42], // Deep navy #0f172a
      textColor: [255, 255, 255],
      fontSize: 8.5,
      halign: "left",
      cellPadding: { top: 3.5, bottom: 3.5, left: 2.5, right: 2.5 },
    },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: "auto", halign: "left" },
      2: { cellWidth: 16, halign: "right" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 18, halign: "right" },
      5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // ==========================================
  // SECTION 5: INVOICE TOTALS SUMMARY BLOCK
  // ==========================================
  const totalsBlockWidth = 76;
  const totalsBlockX = marginX + usableWidth - totalsBlockWidth;

  // Check vertical space: totals block needs ~38mm
  if (y + 40 > 270) {
    doc.addPage();
    y = 18;
  }

  const totalsData: Array<{ label: string; value: string; isBold?: boolean; color?: number[] }> = [
    {
      label: "Subtotal",
      value: formatPdfCurrency(invoice.subtotal, currency, hasUnicode),
    },
    {
      label: "Tax Amount / GST",
      value: formatPdfCurrency(invoice.tax_total, currency, hasUnicode),
    },
  ];

  if (Number(invoice.credited_amount) > 0) {
    totalsData.push({
      label: "Credits Applied",
      value: `-${formatPdfCurrency(invoice.credited_amount, currency, hasUnicode)}`,
      color: [124, 58, 237],
    });
  }

  totalsData.push(
    {
      label: "Grand Total",
      value: formatPdfCurrency(invoice.total_amount, currency, hasUnicode),
      isBold: true,
      color: [15, 23, 42],
    },
    {
      label: "Amount Received",
      value: formatPdfCurrency(invoice.amount_paid, currency, hasUnicode),
      color: [5, 150, 105],
    },
    {
      label: "Outstanding Balance",
      value: formatPdfCurrency(invoice.balance_due, currency, hasUnicode),
      isBold: true,
      color: Number(invoice.balance_due) > 0 ? [217, 119, 6] : [5, 150, 105],
    }
  );

  autoTable(doc, {
    startY: y,
    margin: { left: totalsBlockX, right: marginX, bottom: 24 },
    body: totalsData.map((row) => [row.label, row.value]),
    theme: "plain",
    tableWidth: totalsBlockWidth,
    styles: {
      font: fontNormal,
      fontSize: 8.5,
      textColor: [71, 85, 105],
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineWidth: 0.1,
      lineColor: [241, 245, 249],
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 40 },
      1: { halign: "right", cellWidth: 36, font: fontBold },
    },
    didParseCell: (data) => {
      const rowIndex = data.row.index;
      const target = totalsData[rowIndex];
      if (target?.isBold) {
        data.cell.styles.font = fontBold;
        data.cell.styles.fontStyle = "bold";
      }
      if (target?.color) {
        data.cell.styles.textColor = target.color as any;
      }
      if (target?.label === "Grand Total" || target?.label === "Outstanding Balance") {
        data.cell.styles.fillColor = [248, 250, 252];
        data.cell.styles.lineColor = [203, 213, 225];
        data.cell.styles.lineWidth = 0.2;
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  // ==========================================
  // SECTION 6: CREDIT NOTES & ADJUSTMENTS
  // ==========================================
  const creditNotes = invoice.credit_notes || [];

  if (y + 24 > 270) {
    doc.addPage();
    y = 18;
  }

  doc.setFont(fontBold, "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("CREDIT NOTES & ADJUSTMENTS", marginX, y);
  y += 3;

  if (creditNotes.length > 0) {
    const cnRows = creditNotes.map((cn: SoftwareCreditNote) => [
      cn.credit_note_number,
      cn.issue_date || "—",
      cn.reason || "Invoice Adjustment",
      formatPdfCurrency(cn.amount, currency, hasUnicode),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Credit Note #", "Issue Date", "Reason", "Credit Amount"]],
      body: cnRows,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: 24 },
      tableWidth: usableWidth,
      styles: {
        font: fontNormal,
        fontSize: 8,
        textColor: [51, 65, 85],
        cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
        lineWidth: 0.1,
        lineColor: [226, 232, 240],
      },
      headStyles: {
        font: fontBold,
        fillColor: [241, 245, 249],
        textColor: [71, 85, 105],
        fontSize: 8,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 35, font: fontBold },
        1: { cellWidth: 28 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 30, halign: "right", font: fontBold, textColor: [124, 58, 237] },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginX, y, usableWidth, 9, 1.5, 1.5, "FD");

    doc.setFont(fontNormal, "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No credit notes issued for this invoice.", marginX + 4, y + 5.8);
    y += 15;
  }

  // ==========================================
  // SECTION 7: PAYMENT HISTORY & REVERSALS
  // ==========================================
  const payments = invoice.payments || [];

  if (y + 24 > 270) {
    doc.addPage();
    y = 18;
  }

  doc.setFont(fontBold, "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text("PAYMENT HISTORY & REVERSALS", marginX, y);
  y += 3;

  if (payments.length > 0) {
    const payRows = payments.map((pm: SoftwareInvoicePayment) => {
      const isReversed = pm.status === "Reversed";
      const statusLabel = isReversed ? "REVERSED" : "RECEIVED";
      const reversalDetail = isReversed && pm.reversal_reason
        ? `\nReason: ${pm.reversal_reason}${pm.reversed_at ? ` (${pm.reversed_at.slice(0, 10)})` : ""}`
        : "";

      return [
        pm.payment_date || "—",
        pm.payment_method || "Bank Transfer",
        (pm.transaction_reference || "—") + reversalDetail,
        statusLabel,
        (isReversed ? "[-] " : "[+] ") + formatPdfCurrency(pm.amount, currency, hasUnicode),
      ];
    });

    autoTable(doc, {
      startY: y,
      head: [["Payment Date", "Method", "Reference / Reversal Details", "Status", "Amount"]],
      body: payRows,
      theme: "plain",
      margin: { left: marginX, right: marginX, bottom: 24 },
      tableWidth: usableWidth,
      styles: {
        font: fontNormal,
        fontSize: 8,
        textColor: [51, 65, 85],
        cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
        lineWidth: 0.1,
        lineColor: [226, 232, 240],
      },
      headStyles: {
        font: fontBold,
        fillColor: [241, 245, 249],
        textColor: [71, 85, 105],
        fontSize: 8,
        fontStyle: "bold",
      },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 30 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 24, halign: "center", font: fontBold },
        4: { cellWidth: 32, halign: "right", font: fontBold },
      },
      didParseCell: (data) => {
        if (data.section === "body") {
          const rowIndex = data.row.index;
          const pm = payments[rowIndex];
          if (pm?.status === "Reversed") {
            if (data.column.index === 3) {
              data.cell.styles.textColor = [225, 29, 72]; // Red for reversed
            } else if (data.column.index === 4) {
              data.cell.styles.textColor = [100, 116, 139]; // Muted for reversed amount
            }
          } else {
            if (data.column.index === 3) {
              data.cell.styles.textColor = [5, 150, 105]; // Green for received
            } else if (data.column.index === 4) {
              data.cell.styles.textColor = [5, 150, 105];
            }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginX, y, usableWidth, 9, 1.5, 1.5, "FD");

    doc.setFont(fontNormal, "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No payments recorded yet for this invoice.", marginX + 4, y + 5.8);
    y += 15;
  }

  // ==========================================
  // SECTION 8: NOTES & BILLING INSTRUCTIONS
  // ==========================================
  if (invoice.notes && invoice.notes.trim()) {
    if (y + 22 > 270) {
      doc.addPage();
      y = 18;
    }

    doc.setFont(fontBold, "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("NOTES & BILLING INSTRUCTIONS", marginX, y);
    y += 3;

    doc.setFont(fontNormal, "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);

    const noteLines = doc.splitTextToSize(invoice.notes.trim(), usableWidth - 8);
    const boxH = Math.max(10, noteLines.length * 4.2 + 5);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(marginX, y, usableWidth, boxH, 1.5, 1.5, "FD");

    doc.text(noteLines, marginX + 4, y + 5);
    y += boxH + 6;
  }

  // ==========================================
  // SECTION 9: FOOTER ON EVERY PAGE
  // ==========================================
  const totalPages = doc.getNumberOfPages();
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);

    const footerY = 286;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(marginX, footerY, rightX, footerY);

    doc.setFont(fontNormal, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate #94a3b8

    // Left footer
    doc.text("SCuilONE CRM • Enterprise Invoicing & Billing System", marginX, footerY + 4.5);

    // Center footer
    const invIdDisplay = invoice.invoice_number || invoice.id;
    doc.text(`Invoice #${invIdDisplay}`, pageWidth / 2, footerY + 4.5, { align: "center" });

    // Right footer: Page X of Y
    doc.text(`Page ${pageNum} of ${totalPages}`, rightX, footerY + 4.5, { align: "right" });
  }

  // Generate file name & output
  const rawNum = invoice.invoice_number ? invoice.invoice_number : invoice.id;
  const fileName = `Invoice_${sanitizePdfFileName(rawNum)}.pdf`;

  // Output blob
  const pdfBlob = doc.output("blob");

  return { fileName, blob: pdfBlob };
}

/**
 * Convenience helper to generate and automatically trigger browser download.
 */
export async function downloadSoftwareInvoicePdf(
  context: SoftwareInvoicePdfContext
): Promise<string> {
  const { fileName, blob } = await generateSoftwareInvoicePdf(context);

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

