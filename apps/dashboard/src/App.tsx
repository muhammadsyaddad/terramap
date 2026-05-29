import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { PlaceRow } from '@terramap/types';
import { fetchPlaces, fetchSessions, type SessionSummary } from '@terramap/supabase';
import { EmptyState } from '@terramap/ui';
import { StatCards } from '@/components/StatCards';
import { SessionFilter } from '@/components/SessionFilter';
import { ExportButton } from '@/components/ExportButton';
import { MapView } from '@/components/MapView';
import { AreaAnalysis } from '@/components/AreaAnalysis';
import { PlaceTable } from '@/components/PlaceTable';
import { supabase } from '../lib/supabase-browser';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <Centered>Loading…</Centered>;
  if (!session) return <LoginForm />;
  return <Viewer email={session.user.email ?? ''} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center text-gray-500">{children}</div>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setErr(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">TerraMap Dashboard</h1>
        <p className="text-sm text-gray-500">Log in to view your scraped data.</p>
        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            type="password"
            placeholder="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            className="w-full rounded bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:bg-gray-400"
            type="submit"
            disabled={busy}
          >
            {busy ? 'Working…' : 'Log in'}
          </button>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </form>
      </div>
    </div>
  );
}

function Viewer({ email }: { email: string }) {
  const [places, setPlaces] = useState<PlaceRow[] | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionId, setSessionId] = useState(''); // '' = All
  const [err, setErr] = useState('');

  useEffect(() => {
    Promise.all([fetchPlaces(supabase), fetchSessions(supabase)])
      .then(([plcs, sess]) => {
        setPlaces(plcs);
        setSessions(sess);
      })
      .catch((e) => setErr(e?.message ?? 'Failed to load'));
  }, []);

  const filtered = useMemo(() => {
    const rows = places ?? [];
    return sessionId ? rows.filter((r) => r.scrape_session_id === sessionId) : rows;
  }, [places, sessionId]);

  const loading = places == null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500">{email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SessionFilter sessions={sessions} value={sessionId} onChange={setSessionId} />
          <ExportButton rows={filtered} />
          <button
            className="text-sm text-gray-500 underline"
            onClick={() => supabase.auth.signOut()}
          >
            logout
          </button>
        </div>
      </header>

      {err && <p className="mb-4 text-sm text-red-600">{err}</p>}
      {loading && !err && <p className="text-gray-500">Loading…</p>}

      {!loading && !filtered.length && (
        <EmptyState title="No places" hint="Scrape a Google Maps results page with the extension." />
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-8">
          <StatCards rows={filtered} />
          <MapView rows={filtered} />
          <section>
            <h2 className="mb-3 text-lg font-semibold">Area analysis</h2>
            <AreaAnalysis rows={filtered} />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Places</h2>
            <PlaceTable rows={filtered} />
          </section>
        </div>
      )}
    </main>
  );
}
