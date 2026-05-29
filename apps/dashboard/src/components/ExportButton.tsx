import { useState } from 'react';
import type { PlaceRow } from '@terramap/types';
import { exportPlaces, type ExportFormat } from '@terramap/ui';

/** Export the currently-filtered rows to CSV or XLSX (download). */
export function ExportButton({ rows }: { rows: PlaceRow[] }) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const disabled = rows.length === 0;

  return (
    <div className="inline-flex items-stretch overflow-hidden rounded border border-gray-300">
      <select
        className="border-r border-gray-300 bg-white px-2 py-1.5 text-sm"
        value={format}
        onChange={(e) => setFormat(e.target.value as ExportFormat)}
      >
        <option value="csv">CSV</option>
        <option value="xlsx">XLSX</option>
      </select>
      <button
        className="bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:bg-gray-400"
        onClick={() => exportPlaces(rows, format)}
        disabled={disabled}
        title={disabled ? 'No rows to export' : `Export ${rows.length} rows`}
      >
        Export
      </button>
    </div>
  );
}
