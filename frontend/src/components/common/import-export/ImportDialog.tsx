import React, { useState, useRef } from 'react';
import {
  UploadIcon,
  XIcon,
  DownloadIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshIcon,
} from '../SupportPortalIcons';
import {
  parseCSV,
  validateImportData,
  executeBatchImport,
  downloadSampleTemplate,
  ValidatedRow,
  ValidationSummary,
  ImportExecutionResult,
} from '../../../services/importExportService';
import { ModuleImportExportConfig } from '../../../config/importExportConfig';

interface ImportDialogProps {
  config: ModuleImportExportConfig;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  config,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);

  // Validation state
  const [validationResult, setValidationResult] = useState<{
    allRows: ValidatedRow[];
    validRows: ValidatedRow[];
    invalidRows: ValidatedRow[];
    summary: ValidationSummary;
  } | null>(null);

  const [previewFilter, setPreviewFilter] = useState<'all' | 'errors'>('all');
  const [executionResult, setExecutionResult] = useState<ImportExecutionResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setFile(null);
    setValidationResult(null);
    setExecutionResult(null);
    setProgress(null);
    setImporting(false);
    setParsing(false);
  };

  const handleClose = () => {
    if (importing) return;
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    downloadSampleTemplate(config.moduleName, config.fields, config.sampleRows);
  };

  const processFile = (selectedFile: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setParsing(true);
    setValidationResult(null);
    setExecutionResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        const validated = validateImportData(config.fields, parsed);
        setValidationResult(validated);
      } catch (err: any) {
        console.error('Failed to parse CSV:', err);
        alert('Could not parse the selected file. Please ensure it is a valid CSV format.');
      } finally {
        setParsing(false);
      }
    };
    reader.onerror = () => {
      setParsing(false);
      alert('Error reading file. Please check file permissions.');
    };
    reader.readAsText(selectedFile);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleConfirmImport = async () => {
    if (!validationResult || !config.createHandler || importing) return;
    if (validationResult.validRows.length === 0) {
      alert('No valid records found to import.');
      return;
    }

    setImporting(true);
    setProgress({ processed: 0, total: validationResult.validRows.length });

    try {
      const result = await executeBatchImport(
        validationResult.validRows,
        config.createHandler,
        (processed, total) => {
          setProgress({ processed, total });
        }
      );
      setExecutionResult(result);
      if (result.successCount > 0) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Batch import failed:', err);
      alert('An unexpected error occurred during import processing.');
    } finally {
      setImporting(false);
    }
  };

  const filteredPreviewRows = validationResult
    ? previewFilter === 'errors'
      ? validationResult.allRows.filter((r) => r.status === 'invalid' || r.warnings.length > 0)
      : validationResult.allRows
    : [];

  return (
    <div className="ie-modal-backdrop" role="dialog" aria-modal="true">
      <div className="ie-modal-dialog">
        {/* Header */}
        <div className="ie-modal-header">
          <div>
            <h2>Import {config.moduleName}</h2>
            <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: 2 }}>
              Upload a CSV spreadsheet to import records into your CRM workspace.
            </div>
          </div>
          <button
            type="button"
            className="ie-modal-close-btn"
            onClick={handleClose}
            disabled={importing}
            aria-label="Close dialog"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="ie-modal-body">
          {/* Step 1: File Upload */}
          {!executionResult && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, .txt, .tsv, text/csv, text/plain"
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />

              <div
                className={`ie-dropzone ${isDragging ? 'drag-active' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="ie-dropzone-icon">
                  <UploadIcon size={32} />
                </div>
                <h3 className="ie-dropzone-title">
                  {file ? file.name : 'Click or drag CSV file here to upload'}
                </h3>
                <p className="ie-dropzone-subtitle">
                  {file
                    ? `${(file.size / 1024).toFixed(1)} KB • Click to replace file`
                    : 'Supported formats: Standard CSV or TSV files (.csv, .tsv)'}
                </p>

                {parsing && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#3b82f6', fontSize: '0.875rem' }}>
                    <RefreshIcon size={16} className="animate-spin" />
                    <span>Parsing and validating records...</span>
                  </div>
                )}
              </div>

              {/* Sample Template Download */}
              <div className="ie-template-download-box">
                <div className="ie-template-desc">
                  Need the correct column structure? Download our ready-to-use template.
                </div>
                <button
                  type="button"
                  className="ie-btn-template"
                  onClick={handleDownloadTemplate}
                >
                  <DownloadIcon size={14} />
                  <span>Download Sample Template</span>
                </button>
              </div>
            </>
          )}

          {/* Step 2: Validation Summary & Preview */}
          {validationResult && !executionResult && (
            <div style={{ marginTop: 24 }}>
              {/* Missing Headers Alert */}
              {validationResult.summary.missingHeaders.length > 0 && (
                <div
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    padding: '12px 16px',
                    color: '#991b1b',
                    fontSize: '0.8125rem',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <AlertCircleIcon size={18} />
                  <div>
                    <strong>Missing Required Columns:</strong>{' '}
                    {validationResult.summary.missingHeaders.join(', ')}
                  </div>
                </div>
              )}

              {/* Summary Bar */}
              <div className="ie-summary-bar">
                <div className="ie-pill">
                  <div className="ie-pill-label">Total Rows</div>
                  <div className="ie-pill-val">{validationResult.summary.totalRows}</div>
                </div>
                <div className="ie-pill success">
                  <div className="ie-pill-label">Valid Records</div>
                  <div className="ie-pill-val" style={{ color: '#10b981' }}>
                    {validationResult.summary.validCount}
                  </div>
                </div>
                {validationResult.summary.warningCount > 0 && (
                  <div className="ie-pill warning">
                    <div className="ie-pill-label">Warnings</div>
                    <div className="ie-pill-val" style={{ color: '#f59e0b' }}>
                      {validationResult.summary.warningCount}
                    </div>
                  </div>
                )}
                {validationResult.summary.invalidCount > 0 && (
                  <div className="ie-pill error">
                    <div className="ie-pill-label">Invalid Rows</div>
                    <div className="ie-pill-val" style={{ color: '#ef4444' }}>
                      {validationResult.summary.invalidCount}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Table Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  Data Preview ({filteredPreviewRows.length} rows)
                </div>
                {validationResult.summary.invalidCount > 0 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className={`btn-secondary ${previewFilter === 'all' ? 'active' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => setPreviewFilter('all')}
                    >
                      All Rows
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary ${previewFilter === 'errors' ? 'active' : ''}`}
                      style={{ padding: '4px 10px', fontSize: '0.75rem', color: '#dc2626' }}
                      onClick={() => setPreviewFilter('errors')}
                    >
                      Errors Only ({validationResult.summary.invalidCount})
                    </button>
                  </div>
                )}
              </div>

              {/* Preview Table */}
              <div className="ie-preview-wrapper">
                <table className="ie-preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Row</th>
                      <th style={{ width: 90 }}>Status</th>
                      {config.fields.slice(0, 4).map((f) => (
                        <th key={f.key}>{f.label}</th>
                      ))}
                      <th>Issues / Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreviewRows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={row.status === 'invalid' ? 'row-invalid' : ''}
                      >
                        <td>#{row.rowNumber}</td>
                        <td>
                          <span className={`ie-preview-badge ${row.status}`}>
                            {row.status}
                          </span>
                        </td>
                        {config.fields.slice(0, 4).map((f) => (
                          <td key={f.key}>
                            {String(row.data[f.key] ?? row.rawValues[f.key] ?? '—')}
                          </td>
                        ))}
                        <td>
                          {row.errors.length > 0 && (
                            <div className="ie-row-error-hint">
                              {row.errors.join('; ')}
                            </div>
                          )}
                          {row.warnings.length > 0 && (
                            <div style={{ color: '#b45309', fontSize: '0.75rem' }}>
                              {row.warnings.join('; ')}
                            </div>
                          )}
                          {row.errors.length === 0 && row.warnings.length === 0 && (
                            <span style={{ color: '#10b981', fontSize: '0.75rem' }}>Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Progress bar during batch execution */}
              {importing && progress && (
                <div className="ie-progress-container">
                  <div className="ie-progress-bar-bg">
                    <div
                      className="ie-progress-bar-fill"
                      style={{
                        width: `${Math.round((progress.processed / progress.total) * 100)}%`,
                      }}
                    />
                  </div>
                  <div className="ie-progress-text">
                    <span>Importing records sequentially...</span>
                    <span>
                      {progress.processed} of {progress.total} (
                      {Math.round((progress.processed / progress.total) * 100)}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Execution Result Summary */}
          {executionResult && (
            <div style={{ padding: '10px 0' }}>
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 0',
                }}
              >
                {executionResult.failureCount === 0 ? (
                  <div style={{ color: '#10b981', margin: '0 auto 12px' }}>
                    <CheckCircleIcon size={48} />
                  </div>
                ) : (
                  <div style={{ color: '#f59e0b', margin: '0 auto 12px' }}>
                    <AlertCircleIcon size={48} />
                  </div>
                )}
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 6px 0' }}>
                  {executionResult.failureCount === 0
                    ? 'Import Completed Successfully!'
                    : 'Import Finished with Partial Failures'}
                </h3>
                <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
                  Processed {executionResult.total} records into {config.moduleName}.
                </p>
              </div>

              <div className="ie-summary-bar">
                <div className="ie-pill">
                  <div className="ie-pill-label">Total Valid</div>
                  <div className="ie-pill-val">{executionResult.total}</div>
                </div>
                <div className="ie-pill success">
                  <div className="ie-pill-label">Imported</div>
                  <div className="ie-pill-val" style={{ color: '#10b981' }}>
                    {executionResult.successCount}
                  </div>
                </div>
                {executionResult.failureCount > 0 && (
                  <div className="ie-pill error">
                    <div className="ie-pill-label">Failed</div>
                    <div className="ie-pill-val" style={{ color: '#ef4444' }}>
                      {executionResult.failureCount}
                    </div>
                  </div>
                )}
              </div>

              {/* Failures Table if any */}
              {executionResult.errors.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#dc2626', margin: '0 0 8px 0' }}>
                    Failed Records ({executionResult.errors.length})
                  </h4>
                  <div className="ie-preview-wrapper" style={{ maxHeight: 180 }}>
                    <table className="ie-preview-table">
                      <thead>
                        <tr>
                          <th style={{ width: 80 }}>Row #</th>
                          <th>Error Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executionResult.errors.map((err, i) => (
                          <tr key={i} className="row-invalid">
                            <td>Row {err.rowNumber}</td>
                            <td style={{ color: '#dc2626' }}>{err.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ie-modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClose}
            disabled={importing}
          >
            {executionResult ? 'Close' : 'Cancel'}
          </button>

          {!executionResult ? (
            <button
              type="button"
              className="btn-primary"
              disabled={
                !validationResult ||
                validationResult.validRows.length === 0 ||
                importing ||
                parsing
              }
              onClick={handleConfirmImport}
            >
              {importing ? (
                <>
                  <RefreshIcon size={16} className="animate-spin" />
                  <span>Importing...</span>
                </>
              ) : (
                <>
                  <UploadIcon size={16} />
                  <span>
                    Confirm Import (
                    {validationResult ? validationResult.validRows.length : 0}{' '}
                    records)
                  </span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={handleClose}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportDialog;
