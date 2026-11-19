import React, { useState, useRef, useEffect } from 'react';
import { DownloadIcon, RefreshIcon } from '../SupportPortalIcons';
import {
  generateCSV,
  generateExcelXML,
  downloadFile,
} from '../../../services/importExportService';
import { ModuleImportExportConfig } from '../../../config/importExportConfig';

interface ExportFormatMenuProps {
  config: ModuleImportExportConfig;
  records: Record<string, any>[];
  fetchAllRecords?: () => Promise<Record<string, any>[]>;
  customFilenamePrefix?: string;
  disabled?: boolean;
}

export const ExportFormatMenu: React.FC<ExportFormatMenuProps> = ({
  config,
  records,
  fetchAllRecords,
  customFilenamePrefix,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleExport = async (format: 'csv' | 'excel') => {
    if (isExporting || disabled) return;
    setIsExporting(true);
    setIsOpen(false);

    try {
      let dataToExport = records;
      if (fetchAllRecords) {
        try {
          const fullData = await fetchAllRecords();
          if (Array.isArray(fullData) && fullData.length > 0) {
            dataToExport = fullData;
          }
        } catch (fetchErr) {
          console.warn('Could not fetch complete dataset for export, using visible records:', fetchErr);
        }
      }

      if (!dataToExport || dataToExport.length === 0) {
        alert(`No ${config.moduleName.toLowerCase()} records available to export.`);
        return;
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const prefix = customFilenamePrefix || `${config.moduleId}_export_${dateStr}`;

      if (format === 'csv') {
        const csvContent = generateCSV(config.fields, dataToExport);
        downloadFile(csvContent, `${prefix}.csv`, 'text/csv;charset=utf-8;');
      } else {
        const excelContent = generateExcelXML(config.fields, dataToExport, config.moduleName);
        downloadFile(excelContent, `${prefix}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
      }
    } catch (err: any) {
      console.error('Export failed:', err);
      alert('Failed to generate export file. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="ie-export-container" ref={containerRef}>
      <button
        type="button"
        className="ie-btn-action"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled || isExporting}
        title={`Export ${config.moduleName}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        {isExporting ? (
          <RefreshIcon size={15} className="animate-spin" />
        ) : (
          <DownloadIcon size={15} />
        )}
        <span>{isExporting ? 'Exporting...' : 'Export'}</span>
      </button>

      {isOpen && (
        <div className="ie-export-dropdown" role="menu">
          <button
            type="button"
            className="ie-dropdown-item"
            onClick={() => handleExport('csv')}
            role="menuitem"
          >
            <span>Comma-Separated Values</span>
            <span className="ie-item-ext-badge">.CSV</span>
          </button>
          <button
            type="button"
            className="ie-dropdown-item"
            onClick={() => handleExport('excel')}
            role="menuitem"
          >
            <span>Microsoft Excel</span>
            <span className="ie-item-ext-badge">.XLS</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ExportFormatMenu;

