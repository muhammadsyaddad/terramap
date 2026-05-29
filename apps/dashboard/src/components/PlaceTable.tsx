import type { PlaceRow } from '@terramap/types';

function fmtNum(v: number | null | undefined) {
  return v == null ? '—' : new Intl.NumberFormat('id-ID').format(v);
}

function fmtDate(v: string | null | undefined) {
  if (!v) return '—';
  return new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export interface PlaceTableProps {
  rows: PlaceRow[];
}

export function PlaceTable({ rows }: PlaceTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-gray-600">
          <tr>
            <th className="px-3 py-2 font-medium">Place</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Address</th>
            <th className="px-3 py-2 font-medium text-right">Rating</th>
            <th className="px-3 py-2 font-medium text-right">Reviews</th>
            <th className="px-3 py-2 font-medium">Scraped</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="px-3 py-2">
                {p.maps_url ? (
                  <a
                    href={p.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-2 max-w-xs text-brand hover:underline"
                  >
                    {p.name}
                  </a>
                ) : (
                  <span className="line-clamp-2 max-w-xs">{p.name}</span>
                )}
              </td>
              <td className="px-3 py-2 capitalize text-gray-600">{p.category ?? '—'}</td>
              <td className="px-3 py-2 max-w-sm text-gray-600">
                <span className="line-clamp-2">{p.address ?? '—'}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{p.rating ?? '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.review_count)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{fmtDate(p.scraped_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
