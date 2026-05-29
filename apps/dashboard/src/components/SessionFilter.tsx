import type { SessionSummary } from '@terramap/supabase';

function fmtDate(v: string | null | undefined) {
  if (!v) return '';
  return new Date(v).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}

function label(s: SessionSummary): string {
  const kw = s.keyword ?? 'scrape';
  const radius = s.area_radius_m ? ` · ${Math.round(s.area_radius_m / 1000)}km` : '';
  return `${kw}${radius} · ${s.count} · ${fmtDate(s.latest_scraped_at)}`;
}

export interface SessionFilterProps {
  sessions: SessionSummary[];
  value: string; // '' = All
  onChange: (sessionId: string) => void;
}

/** Dropdown to scope the dashboard to a single area-scrape session. */
export function SessionFilter({ sessions, value, onChange }: SessionFilterProps) {
  return (
    <select
      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">All sessions</option>
      {sessions.map((s) => (
        <option key={s.scrape_session_id} value={s.scrape_session_id}>
          {label(s)}
        </option>
      ))}
    </select>
  );
}
