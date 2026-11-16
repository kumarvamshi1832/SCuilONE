/**
 * SCuilONE Reusable Import & Export Service
 *
 * Implements RFC 4180 CSV parsing and generation, SpreadsheetML Excel generation,
 * spreadsheet formula injection protection (CSV injection prevention),
 * file validation, and controlled sequential batch import.
 */

export type FieldType = 'string' | 'number' | 'email' | 'date' | 'select' | 'boolean';

export interface ImportFieldConfig {
  key: string;
  label: string;
  aliases?: string[];
  required?: boolean;
  type?: FieldType;
  options?: string[];
  sampleValue?: string | number;
  description?: string;
  exportTransform?: (val: any, record: any) => string;
}

export interface ValidatedRow {
  rowNumber: number;
  data: Record<string, any>;
  rawValues: Record<string, string>;
  status: 'valid' | 'warning' | 'invalid';
  errors: string[];
  warnings: string[];
}

export interface ValidationSummary {
  totalRows: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
  missingHeaders: string[];
  duplicateCount: number;
}

export interface ImportExecutionResult {
  total: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  errors: { rowNumber: number; data: Record<string, any>; error: string }[];
}

/**
 * Strips or escapes characters that could trigger spreadsheet formula execution (CSV Injection).
 * Excel, LibreOffice, and Google Sheets evaluate cells starting with =, +, -, @, \t, or \r.
 */
export function sanitizeForFormulaInjection(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const trimmed = str.trimStart();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    trimmed.startsWith('\t') ||
    trimmed.startsWith('\r')
  ) {
    // Prefix with single quote so spreadsheet software treats it as literal text
    return `'${str}`;
  }
  return str;
}

/**
 * RFC 4180 compliant CSV Parser.
 * Properly parses multiline rows, quoted values, and escaped quotes.
 */
export function parseCSV(csvText: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let inQuotes = false;

  // Clean UTF-8 BOM if present
  let cleanText = csvText;
  if (cleanText.charCodeAt(0) === 0xfeff) {
    cleanText = cleanText.slice(1);
  }

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped double quote
          currentVal += '"';
          i++;
        } else {
          // Closing quote
          inQuotes = false;
        }
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',' || char === '\t') {
        row.push(currentVal.trim());
        currentVal = '';
      } else if (char === '\r') {
        // Handle CRLF
        if (nextChar === '\n') {
          i++;
        }
        row.push(currentVal.trim());
        result.push(row);
        row = [];
        currentVal = '';
      } else if (char === '\n') {
        row.push(currentVal.trim());
        result.push(row);
        row = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
  }

  // Push final cell and row
  if (currentVal.length > 0 || row.length > 0) {
    row.push(currentVal.trim());
    result.push(row);
  }

  // Filter out empty rows (e.g. trailing newlines)
  return result.filter((r) => r.some((c) => c.trim().length > 0));
}

/**
 * Format records into a sanitized RFC 4180 CSV string with UTF-8 BOM for Microsoft Excel.
 */
export function generateCSV<T extends Record<string, any>>(
  fields: ImportFieldConfig[],
  records: T[]
): string {
  const headers = fields.map((f) => escapeCSVCell(f.label));
  const lines: string[] = [headers.join(',')];

  // Sensitive field blacklist to protect against accidental credential leakage
  const SENSITIVE_KEYS = new Set([
    'password',
    'password_hash',
    'hashed_password',
    'token',
    'access_token',
    'refresh_token',
    'mfa_secret',
    'otp_secret',
    'secret',
    'api_key',
  ]);

  for (const record of records) {
    const row = fields.map((f) => {
      if (SENSITIVE_KEYS.has(f.key.toLowerCase())) {
        return '""';
      }

      let val = record[f.key];
      if (f.exportTransform) {
        val = f.exportTransform(val, record);
      } else if (val === null || val === undefined) {
        val = '';
      } else if (typeof val === 'object') {
        val = val.name || val.title || val.full_name || JSON.stringify(val);
      }

      const sanitized = sanitizeForFormulaInjection(val);
      return escapeCSVCell(sanitized);
    });
    lines.push(row.join(','));
  }

  // Prepend UTF-8 BOM (\uFEFF) so Excel opens UTF-8 without character corruption
  return '\uFEFF' + lines.join('\r\n');
}

function escapeCSVCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/**
 * Generates an Excel SpreadsheetML (.xls) document.
 * Microsoft Excel natively opens XML SpreadsheetML documents with full table styles.
 */
export function generateExcelXML<T extends Record<string, any>>(
  fields: ImportFieldConfig[],
  records: T[],
  sheetName = 'Export'
): string {
  const sanitizeXml = (str: any) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const headerCells = fields
    .map(
      (f) =>
        `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${sanitizeXml(
          f.label
        )}</Data></Cell>`
    )
    .join('');

  const rowCells = records
    .map((record) => {
      const cells = fields
        .map((f) => {
          let val = record[f.key];
          if (f.exportTransform) {
            val = f.exportTransform(val, record);
          } else if (val === null || val === undefined) {
            val = '';
          } else if (typeof val === 'object') {
            val = val.name || val.title || val.full_name || JSON.stringify(val);
          }

          const sanitized = sanitizeForFormulaInjection(val);
          const isNum = f.type === 'number' && !isNaN(Number(sanitized)) && sanitized !== '';
          const dataType = isNum ? 'Number' : 'String';
          return `<Cell ss:StyleID="DataStyle"><Data ss:Type="${dataType}">${sanitizeXml(
            sanitized
          )}</Data></Cell>`;
        })
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1E293B"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="DataStyle">
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F1F5F9"/>
   </Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#334155"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${sanitizeXml(sheetName.slice(0, 31))}">
  <Table>
   <Row ss:Height="24">${headerCells}</Row>
   ${rowCells}
  </Table>
 </Worksheet>
</Workbook>`;
}

/**
 * Triggers a browser file download.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a sample CSV template for a given module.
 */
export function downloadSampleTemplate(
  moduleName: string,
  fields: ImportFieldConfig[],
  sampleRows?: Record<string, any>[]
): void {
  const headers = fields.map((f) => escapeCSVCell(f.label));
  const lines: string[] = [headers.join(',')];

  if (sampleRows && sampleRows.length > 0) {
    for (const sample of sampleRows) {
      const row = fields.map((f) => {
        const val = sample[f.key] !== undefined ? sample[f.key] : f.sampleValue || '';
        return escapeCSVCell(String(val));
      });
      lines.push(row.join(','));
    }
  } else {
    // Generate one default sample row from sample values
    const sampleRow = fields.map((f) => escapeCSVCell(String(f.sampleValue || '')));
    lines.push(sampleRow.join(','));
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const filename = `${moduleName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_import_template.csv`;
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
}

/**
 * Match a file header string to a configured ImportFieldConfig.
 */
export function findMatchingField(
  headerText: string,
  fields: ImportFieldConfig[]
): ImportFieldConfig | undefined {
  const cleanHeader = headerText.toLowerCase().replace(/[^a-z0-9]/g, '');
  return fields.find((f) => {
    const cleanKey = f.key.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanLabel = f.label.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanHeader === cleanKey || cleanHeader === cleanLabel) return true;

    if (f.aliases && f.aliases.length > 0) {
      return f.aliases.some((alias) => {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanHeader === cleanAlias;
      });
    }
    return false;
  });
}

/**
 * Validates parsed CSV data against the module's field configurations.
 */
export function validateImportData(
  fields: ImportFieldConfig[],
  parsedRows: string[][]
): {
  allRows: ValidatedRow[];
  validRows: ValidatedRow[];
  invalidRows: ValidatedRow[];
  summary: ValidationSummary;
} {
  if (parsedRows.length === 0) {
    return {
      allRows: [],
      validRows: [],
      invalidRows: [],
      summary: {
        totalRows: 0,
        validCount: 0,
        warningCount: 0,
        invalidCount: 0,
        missingHeaders: fields.filter((f) => f.required).map((f) => f.label),
        duplicateCount: 0,
      },
    };
  }

  const headerRow = parsedRows[0] || [];
  const columnMap: { field: ImportFieldConfig; colIndex: number }[] = [];
  const matchedFieldKeys = new Set<string>();

  headerRow.forEach((colText, idx) => {
    const matched = findMatchingField(colText, fields);
    if (matched && !matchedFieldKeys.has(matched.key)) {
      matchedFieldKeys.add(matched.key);
      columnMap.push({ field: matched, colIndex: idx });
    }
  });

  const missingHeaders: string[] = [];
  for (const f of fields) {
    if (f.required && !matchedFieldKeys.has(f.key)) {
      missingHeaders.push(f.label);
    }
  }

  const dataRows = parsedRows.slice(1);
  const validatedRows: ValidatedRow[] = [];
  const seenIdentities = new Set<string>();
  let duplicateCount = 0;

  dataRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // Row 1 is header
    const dataObj: Record<string, any> = {};
    const rawValues: Record<string, string> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    // Map column values
    for (const { field, colIndex } of columnMap) {
      const rawVal = (row[colIndex] || '').trim();
      rawValues[field.key] = rawVal;

      if (!rawVal) {
        if (field.required) {
          errors.push(`Missing required field "${field.label}"`);
        }
        dataObj[field.key] = null;
        continue;
      }

      // Format & Type validation
      switch (field.type) {
        case 'number': {
          const num = Number(rawVal.replace(/[^0-9.-]/g, ''));
          if (isNaN(num)) {
            errors.push(`"${field.label}" must be a valid number`);
          } else {
            dataObj[field.key] = num;
          }
          break;
        }
        case 'email': {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(rawVal)) {
            errors.push(`"${field.label}" is not a valid email address (${rawVal})`);
          } else {
            dataObj[field.key] = rawVal.toLowerCase();
          }
          break;
        }
        case 'date': {
          const d = new Date(rawVal);
          if (isNaN(d.getTime())) {
            errors.push(`"${field.label}" is not a valid date (${rawVal})`);
          } else {
            dataObj[field.key] = rawVal;
          }
          break;
        }
        case 'select': {
          if (field.options && field.options.length > 0) {
            const matchedOpt = field.options.find(
              (opt) => opt.toLowerCase() === rawVal.toLowerCase()
            );
            if (matchedOpt) {
              dataObj[field.key] = matchedOpt;
            } else {
              warnings.push(
                `"${field.label}" value "${rawVal}" is not in standard options (${field.options.slice(0, 3).join(', ')}...)`
              );
              dataObj[field.key] = rawVal;
            }
          } else {
            dataObj[field.key] = rawVal;
          }
          break;
        }
        case 'boolean': {
          const lower = rawVal.toLowerCase();
          dataObj[field.key] = lower === 'true' || lower === 'yes' || lower === '1';
          break;
        }
        default:
          dataObj[field.key] = rawVal;
      }
    }

    // In-file duplicate checking for unique fields (e.g. email, project_number, estimate_number, title)
    const uniqueIdentityVal =
      rawValues['email'] ||
      rawValues['project_number'] ||
      rawValues['invoice_number'] ||
      rawValues['contract_number'] ||
      rawValues['title'] ||
      rawValues['name'];

    if (uniqueIdentityVal) {
      const idKey = uniqueIdentityVal.toLowerCase();
      if (seenIdentities.has(idKey)) {
        duplicateCount++;
        warnings.push(`Duplicate record detected in uploaded file (${uniqueIdentityVal})`);
      } else {
        seenIdentities.add(idKey);
      }
    }

    // Determine row status
    const status: 'valid' | 'warning' | 'invalid' =
      errors.length > 0 ? 'invalid' : warnings.length > 0 ? 'warning' : 'valid';

    validatedRows.push({
      rowNumber,
      data: dataObj,
      rawValues,
      status,
      errors,
      warnings,
    });
  });

  const validRows = validatedRows.filter((r) => r.status === 'valid' || r.status === 'warning');
  const invalidRows = validatedRows.filter((r) => r.status === 'invalid');

  return {
    allRows: validatedRows,
    validRows,
    invalidRows,
    summary: {
      totalRows: dataRows.length,
      validCount: validatedRows.filter((r) => r.status === 'valid').length,
      warningCount: validatedRows.filter((r) => r.status === 'warning').length,
      invalidCount: invalidRows.length,
      missingHeaders,
      duplicateCount,
    },
  };
}

/**
 * Execute controlled sequential batch import using the module's existing create API.
 */
export async function executeBatchImport(
  validRows: ValidatedRow[],
  createHandler: (record: Record<string, any>) => Promise<any>,
  onProgress?: (processed: number, total: number) => void
): Promise<ImportExecutionResult> {
  const total = validRows.length;
  let successCount = 0;
  let failureCount = 0;
  const errors: { rowNumber: number; data: Record<string, any>; error: string }[] = [];

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    if (!row) continue;

    try {
      await createHandler(row.data);
      successCount++;
    } catch (err: any) {
      failureCount++;
      const errMsg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save record to server.';
      errors.push({
        rowNumber: row.rowNumber,
        data: row.data,
        error: typeof errMsg === 'object' ? JSON.stringify(errMsg) : String(errMsg),
      });
    }

    if (onProgress) {
      onProgress(i + 1, total);
    }

    // Small delay between sequential calls to prevent server saturation
    if (i < validRows.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  return {
    total,
    successCount,
    failureCount,
    skippedCount: 0,
    errors,
  };
}
