import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface RentalReceiptPdfOptions {
  companyName?: string;
  portalName?: string;
  receiptNumber?: string | null;
  propertyName?: string | null;
  tenantName?: string | null;
  paymentType?: string | null;
  amount: number | string;
  currency?: string;
  paymentMethod?: string | null;
  paymentDate?: string | null;
  paymentStatus?: string | null;
  transactionReference?: string | null;
  paymentId?: string | null;
  agreementId?: string | null;
  notes?: string | null;
  verifiedAt?: string | null;
}

const sanitizeFileName = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_");
};

/**
 * Generates an executive, professional PDF receipt for rental and lease payments.
 */
export async function generateRentalReceiptPdf(
  options: RentalReceiptPdfOptions
): Promise<{ fileName: string; blob: Blob }> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = 210;
  const marginX = 16;
  const usableWidth = pageWidth - marginX * 2; // 178 mm

  const company = options.companyName || "SCuilONE Real Estate";
  const portal = options.portalName || "Rentals & Leases Portal";
  const rawAmount = Number(options.amount) || 0;
  const formattedAmount = `INR ${rawAmount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const receiptNum =
    options.receiptNumber ||
    options.transactionReference ||
    (options.paymentId ? `REC-${options.paymentId.slice(0, 8).toUpperCase()}` : "REC-OFFICIAL");

  const propName = options.propertyName || "Rental Property";
  const tenant = options.tenantName || "Tenant";
  const payType = options.paymentType || "Rent Payment";
  const payMethod = options.paymentMethod || "Direct Payment";
  const payDate = options.paymentDate
    ? new Date(options.paymentDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const status = (options.paymentStatus || "Verified").toUpperCase();
  const txRef = options.transactionReference || options.paymentId || "—";
  const agreementRef = options.agreementId
    ? `AGR-${options.agreementId.slice(0, 8).toUpperCase()}`
    : "—";

  let y = 14;

  // 1. TOP BRANDING BAR
  doc.setFillColor(2, 132, 199); // Sky blue #0284c7
  doc.rect(marginX, y, usableWidth, 2.5, "F");
  y += 7;

  // 2. HEADER
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text(company, marginX, y + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139); // #64748b
  doc.text(portal, marginX, y + 9);
  doc.text("Official Payment & Tenancy Receipt", marginX, y + 13);

  // Right Header Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(2, 132, 199); // #0284c7
  doc.text("RECEIPT", pageWidth - marginX, y + 4, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Receipt #: ${receiptNum}`, pageWidth - marginX, y + 9.5, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Issued Date: ${payDate}`, pageWidth - marginX, y + 14, { align: "right" });

  y += 20;

  // 3. TWO CARDS: TENANT & PROPERTY / PAYMENT DETAILS
  const colGap = 6;
  const colWidth = (usableWidth - colGap) / 2;
  const cardHeight = 36;

  // Left Card: Property & Tenant
  doc.setFillColor(248, 250, 252); // #f8fafc
  doc.setDrawColor(226, 232, 240); // #e2e8f0
  doc.roundedRect(marginX, y, colWidth, cardHeight, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("PROPERTY & TENANT DETAILS", marginX + 4, y + 5.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  const truncatedProp = doc.splitTextToSize(propName, colWidth - 8)[0];
  doc.text(truncatedProp, marginX + 4, y + 11.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Tenant: ${tenant}`, marginX + 4, y + 17);
  doc.text(`Agreement Ref: ${agreementRef}`, marginX + 4, y + 22.5);
  doc.text(`Payment Purpose: ${payType}`, marginX + 4, y + 28);

  // Right Card: Transaction & Status
  const rightColX = marginX + colWidth + colGap;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(rightColX, y, colWidth, cardHeight, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("PAYMENT DETAILS", rightColX + 4, y + 5.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Payment Date: ${payDate}`, rightColX + 4, y + 11.5);
  doc.text(`Payment Method: ${payMethod}`, rightColX + 4, y + 17);

  const truncatedTx = doc.splitTextToSize(`Txn / Ref: ${txRef}`, colWidth - 8)[0];
  doc.text(truncatedTx, rightColX + 4, y + 22.5);

  doc.text(`Status: `, rightColX + 4, y + 28);
  doc.setFont("helvetica", "bold");
  if (status === "VERIFIED" || status === "PAID") {
    doc.setTextColor(22, 163, 74); // #16a34a green
    doc.text(`${status}`, rightColX + 16, y + 28);
  } else {
    doc.setTextColor(217, 119, 6); // amber
    doc.text(`${status}`, rightColX + 16, y + 28);
  }

  y += cardHeight + 6;

  // 4. AMOUNT PAID HIGHLIGHT BOX
  doc.setFillColor(240, 253, 244); // green-50 #f0fdf4
  doc.setDrawColor(187, 247, 208); // green-200 #bbf7d0
  doc.roundedRect(marginX, y, usableWidth, 22, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(21, 128, 61); // #15803d
  doc.text("TOTAL AMOUNT RECEIVED", marginX + 6, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(22, 101, 52); // #166534
  doc.text(formattedAmount, marginX + 6, y + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(22, 163, 74);
  doc.text("[VERIFIED PAYMENT]", pageWidth - marginX - 6, y + 13, { align: "right" });

  y += 28;

  // 5. ITEMIZED TABLE USING AUTOTABLE
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    theme: "striped",
    head: [["Item / Description", "Category", "Payment Method", "Reference / ID", "Amount"]],
    body: [
      [
        `${payType} for ${propName}`,
        payType,
        payMethod,
        txRef,
        formattedAmount,
      ],
    ],
    headStyles: {
      fillColor: [15, 23, 42], // #0f172a
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
      cellPadding: 3.5,
    },
    columnStyles: {
      0: { cellWidth: 58 },
      1: { cellWidth: 28 },
      2: { cellWidth: 32 },
      3: { cellWidth: 30 },
      4: { cellWidth: 30, halign: "right", fontStyle: "bold" },
    },
    bodyStyles: {
      textColor: [30, 41, 59],
      fontSize: 8.5,
      cellPadding: 4,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  // Calculate position after table
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || y + 30;
  y = finalY + 8;

  // 6. NOTES (IF PRESENT)
  if (options.notes) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, y, usableWidth, 14, 2, 2, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("PAYMENT NOTES:", marginX + 4, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const splitNotes = doc.splitTextToSize(options.notes, usableWidth - 8);
    doc.text(splitNotes.slice(0, 2), marginX + 4, y + 9.5);

    y += 18;
  }

  // 7. FOOTER & VERIFICATION NOTICE
  const footerY = 270;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginX, footerY, pageWidth - marginX, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // #94a3b8
  doc.text(
    "This is a system-generated electronic receipt issued via SCuilONE Real Estate Portal. No signature required.",
    pageWidth / 2,
    footerY + 5,
    { align: "center" }
  );
  doc.text(
    `Receipt Ref: ${receiptNum} • Payment ID: ${options.paymentId || "—"} • Generated on: ${new Date().toLocaleString("en-IN")}`,
    pageWidth / 2,
    footerY + 9,
    { align: "center" }
  );

  const cleanNum = sanitizeFileName(receiptNum);
  const fileName = `Receipt_${cleanNum}.pdf`;
  const blob = doc.output("blob");

  return { fileName, blob };
}

/**
 * Downloads the rental payment receipt PDF directly to the user's browser.
 */
export async function downloadRentalReceiptPdf(options: RentalReceiptPdfOptions): Promise<string> {
  const { fileName, blob } = await generateRentalReceiptPdf(options);

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
