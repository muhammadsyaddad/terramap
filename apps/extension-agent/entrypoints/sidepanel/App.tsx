import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { BgToPanel, PanelToBg } from '@/lib/types';

const API_KEY_STORE = 'anthropic_api_key';

interface Chip {
  name: string;
  ok?: boolean;
  summary?: string;
}
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  chips: Chip[];
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!session) return <AuthScreen />;
  return <Chat />;
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authErr, setAuthErr] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr('');
    setAuthMsg('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) setAuthErr(error.message);
        else if (!data.session) {
          setAuthMsg('Account created. Confirm via email, then log in.');
          setMode('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setAuthErr(error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-lg font-bold">TerraMap Agent</h1>
      <p className="text-xs text-gray-500">Chat-driven area analyst</p>
      <form onSubmit={submit} className="space-y-2">
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          type="email" placeholder="email" value={email}
          onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          type="password" placeholder="password" value={password} minLength={6}
          onChange={(e) => setPassword(e.target.value)} required
        />
        <button
          className="w-full bg-blue-600 disabled:bg-gray-400 text-white rounded py-1 text-sm"
          type="submit" disabled={busy}
        >
          {busy ? 'Working…' : mode === 'signup' ? 'Sign up' : 'Log in'}
        </button>
        {authErr && <p className="text-red-600 text-xs">{authErr}</p>}
        {authMsg && <p className="text-green-600 text-xs">{authMsg}</p>}
      </form>
      <button
        className="text-xs text-blue-600 underline"
        onClick={() => {
          setMode(mode === 'signup' ? 'login' : 'signup');
          setAuthErr('');
          setAuthMsg('');
        }}
      >
        {mode === 'signup' ? 'Already have an account? Log in' : 'No account? Sign up'}
      </button>
    </div>
  );
}

function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chrome.storage.local.get(API_KEY_STORE).then((r) => {
      const k = r[API_KEY_STORE] as string | undefined;
      setHasKey(!!k);
      if (!k) setShowSettings(true);
    });

    const port = chrome.runtime.connect({ name: 'agent' });
    portRef.current = port;
    port.onMessage.addListener((ev: BgToPanel) => {
      setMessages((prev) => applyEvent(prev, ev));
      if (ev.kind === 'done') setBusy(false);
    });
    return () => port.disconnect();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text, chips: [] },
      { role: 'assistant', text: '', chips: [] },
    ]);
    setInput('');
    setBusy(true);
    portRef.current?.postMessage({ type: 'USER_MSG', text } satisfies PanelToBg);
  }

  function reset() {
    portRef.current?.postMessage({ type: 'RESET' } satisfies PanelToBg);
    setMessages([]);
    setBusy(false);
  }

  async function saveKey() {
    await chrome.storage.local.set({ [API_KEY_STORE]: apiKey.trim() });
    setHasKey(!!apiKey.trim());
    setApiKey('');
    setShowSettings(false);
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between px-3 py-2 border-b">
        <h1 className="text-sm font-bold">TerraMap Agent</h1>
        <div className="flex gap-2 text-xs text-gray-500">
          <button className="underline" onClick={reset}>new</button>
          <button className="underline" onClick={() => setShowSettings((s) => !s)}>settings</button>
          <button className="underline" onClick={() => supabase.auth.signOut()}>logout</button>
        </div>
      </header>

      {showSettings && (
        <div className="p-3 border-b bg-gray-50 space-y-2">
          <label className="block text-xs font-medium">Anthropic API key</label>
          <p className="text-[10px] text-amber-700">
            Stored in this browser only (chrome.storage). Shipped client-side — use a key you can rotate.
          </p>
          <input
            className="w-full border rounded px-2 py-1 text-sm font-mono"
            type="password" placeholder={hasKey ? '•••• saved ••••' : 'sk-ant-…'}
            value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          />
          <button
            className="bg-blue-600 disabled:bg-gray-400 text-white rounded px-3 py-1 text-xs"
            onClick={saveKey} disabled={!apiKey.trim()}
          >
            Save key
          </button>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400">
            Tanya apa aja, mis. "gimana saingan coffee shop di Dago, radius 1km?"
          </p>
        )}
        {messages.map((m, i) => (
          <MessageView key={i} msg={m} />
        ))}
      </div>

      <div className="border-t p-2 flex gap-2">
        <textarea
          className="flex-1 border rounded px-2 py-1 text-sm resize-none"
          rows={2} placeholder="Tanya soal area / kompetitor…"
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="bg-green-600 disabled:bg-gray-400 text-white rounded px-3 text-sm"
          onClick={send} disabled={busy || !input.trim()}
        >
          {busy ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function MessageView({ msg }: { msg: Msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={isUser ? 'text-right' : 'text-left'}>
      <div
        className={
          'inline-block max-w-[90%] rounded px-2 py-1 text-sm whitespace-pre-wrap ' +
          (isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900')
        }
      >
        {msg.text || (msg.chips.length ? '' : '…')}
      </div>
      {msg.chips.map((c, i) => (
        <div
          key={i}
          className={
            'mt-1 text-[10px] font-mono rounded px-1.5 py-0.5 inline-block ' +
            (c.ok === undefined
              ? 'bg-amber-100 text-amber-800'
              : c.ok
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800')
          }
        >
          {c.name}
          {c.summary ? ` — ${c.summary}` : c.ok === undefined ? ' …' : ''}
        </div>
      ))}
    </div>
  );
}

function applyEvent(prev: Msg[], ev: BgToPanel): Msg[] {
  if (ev.kind === 'done') return prev;
  const next = prev.slice();
  let last = next[next.length - 1];
  if (!last || last.role !== 'assistant') {
    last = { role: 'assistant', text: '', chips: [] };
    next.push(last);
  } else {
    last = { ...last, chips: last.chips.slice() };
    next[next.length - 1] = last;
  }

  switch (ev.kind) {
    case 'text_delta':
      last.text += ev.text;
      break;
    case 'tool_use':
      last.chips.push({ name: ev.name });
      break;
    case 'tool_result': {
      // Settle the most recent unresolved chip with this name.
      for (let i = last.chips.length - 1; i >= 0; i--) {
        if (last.chips[i].name === ev.name && last.chips[i].ok === undefined) {
          last.chips[i] = { name: ev.name, ok: ev.ok, summary: ev.summary };
          break;
        }
      }
      break;
    }
    case 'error':
      last.text += (last.text ? '\n\n' : '') + `⚠️ ${ev.error}`;
      break;
  }
  return next;
}
