import { useMemo } from 'react';
import type { PlaceRow } from '@terramap/types';

function fmt(v: number, digits = 0) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(v);
}

/** Summary tiles over the currently-filtered place rows. */
export function StatCards({ rows }: { rows: PlaceRow[] }) {
  const stats = useMemo(() => {
    const total = rows.length;
    const categories = new Set(rows.map((r) => (r.category ?? '').trim()).filter(Boolean)).size;
    const ratings = rows.map((r) => r.rating ?? 0).filter((n) => n > 0);
    const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const totalReviews = rows.reduce((a, r) => a + (r.review_count ?? 0), 0);
    const withCoords = rows.filter(
      (r) => typeof r.lat === 'number' && typeof r.lng === 'number',
    ).length;
    return { total, categories, avgRating, totalReviews, withCoords, noCoords: total - withCoords };
  }, [rows]);

  const cards = [
    { label: 'Places', value: fmt(stats.total) },
    { label: 'Categories', value: fmt(stats.categories) },
    { label: 'Avg rating', value: stats.avgRating ? fmt(stats.avgRating, 1) : '—' },
    { label: 'Total reviews', value: fmt(stats.totalReviews) },
    {
      label: 'On map',
      value: fmt(stats.withCoords),
      hint: stats.noCoords ? `${fmt(stats.noCoords)} missing coords` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{c.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{c.value}</div>
          {c.hint && <div className="mt-0.5 text-xs text-amber-600">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
