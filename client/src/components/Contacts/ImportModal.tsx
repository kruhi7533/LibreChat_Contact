import React, { useState } from 'react';
import { useImportContactsMutation } from './queries';
import type { ImportSummary } from './types';

interface Props {
  onClose: () => void;
}

const ImportModal: React.FC<Props> = ({ onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const importMutation = useImportContactsMutation();

  const handleImport = async () => {
    if (!file) return;
    setError(null);
    setSummary(null);
    try {
      const result = await importMutation.mutateAsync(file);
      setSummary(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-surface-primary p-5 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Import contacts (CSV)</h2>
          <button
            aria-label="Close"
            className="text-text-secondary hover:text-text-primary"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-text-secondary">
          The CSV must have a header row. Columns named <code>name</code>, <code>company</code>,{' '}
          <code>role</code>, <code>email</code>, <code>notes</code> map to standard fields. Any
          other column becomes a custom attribute.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-text-primary"
        />
        {summary && (
          <div className="mt-3 rounded-md border border-border-light p-3 text-sm">
            <div>
              <span className="text-text-secondary">Imported:</span>{' '}
              <span className="font-medium text-text-primary">{summary.imported}</span>
            </div>
            <div>
              <span className="text-text-secondary">Failed:</span>{' '}
              <span className="font-medium text-text-primary">{summary.failed}</span>
            </div>
            <div>
              <span className="text-text-secondary">Duration:</span>{' '}
              <span className="text-text-primary">{summary.durationMs} ms</span>
            </div>
            {!!summary.errors?.length && (
              <ul className="mt-2 list-disc pl-5 text-xs text-red-500">
                {summary.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-md border border-border-light px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
            onClick={onClose}
          >
            Close
          </button>
          <button
            disabled={!file || importMutation.isLoading}
            className="rounded-md bg-text-primary px-3 py-1.5 text-sm text-surface-primary hover:opacity-90 disabled:opacity-50"
            onClick={handleImport}
          >
            {importMutation.isLoading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
