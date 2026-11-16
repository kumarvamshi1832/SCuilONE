import React, { useState } from 'react';
import { UploadIcon } from '../SupportPortalIcons';
import { MODULE_CONFIGS } from '../../../config/importExportConfig';
import ExportFormatMenu from './ExportFormatMenu';
import ImportDialog from './ImportDialog';
import './ImportExport.css';

export interface ImportExportActionsProps {
  moduleId: string;
  records: Record<string, any>[];
  fetchAllRecords?: () => Promise<Record<string, any>[]>;
  onImportSuccess?: () => void;
  canImport?: boolean;
  canExport?: boolean;
  customFilenamePrefix?: string;
  className?: string;
}

export const ImportExportActions: React.FC<ImportExportActionsProps> = ({
  moduleId,
  records,
  fetchAllRecords,
  onImportSuccess = () => {},
  canImport = true,
  canExport = true,
  customFilenamePrefix,
  className = '',
}) => {
  const [isImportOpen, setIsImportOpen] = useState(false);
  const config = MODULE_CONFIGS[moduleId];

  if (!config) {
    console.warn(`[ImportExportActions] No configuration found for moduleId: ${moduleId}`);
    return null;
  }

  const showImport = canImport && config.supportsImport;
  const showExport = canExport && config.supportsExport;

  if (!showImport && !showExport) {
    return null;
  }

  return (
    <div className={`import-export-actions ${className}`}>
      {/* Import Action */}
      {showImport && (
        <button
          type="button"
          className="ie-btn-action"
          onClick={() => setIsImportOpen(true)}
          title={`Import ${config.moduleName} from CSV`}
        >
          <UploadIcon size={15} />
          <span>Import</span>
        </button>
      )}

      {/* Export Dropdown Menu */}
      {showExport && (
        <ExportFormatMenu
          config={config}
          records={records}
          fetchAllRecords={fetchAllRecords}
          customFilenamePrefix={customFilenamePrefix}
        />
      )}

      {/* Import Modal Dialog */}
      {showImport && (
        <ImportDialog
          config={config}
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onSuccess={onImportSuccess}
        />
      )}
    </div>
  );
};

export default ImportExportActions;
