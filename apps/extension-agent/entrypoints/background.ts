import { supabase } from '@/lib/supabase';
import { fetchPlacesBySession } from '@terramap/supabase';
import { buildGmapsSearchUrl, pickZoomForRadius, nextSessionId } from '@terramap/area';
import {
  createAgentClient,
  runAgent,
  type AgentEvent,
  type Anthropic,
} from '@terramap/agent';
import type {
  AreaScrapeParams,
  AreaScrapeResult,
  PlaceRow,
  RunAreaScrape,
  PanelToBg,
  BgToPanel,
} from '@/lib/types';

/**
 * Agent background:
 *   side panel --Port("agent")--> background runs the Claude tool-use loop
 *   (runAgent from @terramap/agent), streaming AgentEvents back to the panel.
 *   executeTool maps each tool call to a real action — scrape_area drives the
 *   same gmaps tab/content flow as the classic extension; query/analyze read
 *   Supabase. Conversation history lives in chrome.storage.session so a SW
 *   idle-out between turns doesn't lose context.
 */

const API_KEY_STORE = 'anthropic_api_key';
const HISTORY_STORE = 'agent_history';
const GMAPS_URL_RE = /^https?:\/\/(www\.)?google\.[^/]+\/maps(\/|$|\?)|^https?:\/\/maps\.google\.[^/]+\//;

export default defineBackground(() => {
  console.log('[terramap/agent-bg] booted');

  // Heartbeat: keeps the SW alive across multi-minute scrapes (no-op handler).
  chrome.alarms.onAlarm.addListener(() => {});

  // Clicking the toolbar icon opens the side panel.
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.log('[terramap/agent-bg] setPanelBehavior:', e));

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'agent') return;
    port.onMessage.addListener((msg: PanelToBg) => {
      if (msg?.type === 'RESET') {
        chrome.storage.session.remove(HISTORY_STORE);
        return;
      }
      if (msg?.type === 'USER_MSG') {
        handleUserMessage(msg.text, port).catch((e) =>
          post(port, { kind: 'error', error: e?.message ?? String(e) }),
        );
      }
    });
  });
});

function post(port: chrome.runtime.Port, msg: BgToPanel): void {
  try {
    port.postMessage(msg);
  } catch {
    // Panel closed mid-turn; drop the event.
  }
}

async function handleUserMessage(text: string, port: chrome.runtime.Port): Promise<void> {
  const apiKey = (await chrome.storage.local.get(API_KEY_STORE))[API_KEY_STORE] as
    | string
    | undefined;
  if (!apiKey) {
    post(port, { kind: 'error', error: 'No Anthropic API key set. Open settings and paste one.' });
    post(port, { kind: 'done' });
    return;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    post(port, { kind: 'error', error: 'Not logged in.' });
    post(port, { kind: 'done' });
    return;
  }
  const userId = userData.user.id;

  const client = createAgentClient({ apiKey });
  const history = ((await chrome.storage.session.get(HISTORY_STORE))[HISTORY_STORE] ??
    []) as Anthropic.MessageParam[];

  // Keep the SW awake for the whole turn (scrape_area can take minutes).
  const alarmName = `agent-${Date.now()}`;
  await chrome.alarms.create(alarmName, { periodInMinutes: 0.4 });

  try {
    const gen = runAgent({
      client,
      userMessage: text,
      history,
      executeTool: (name, input) => executeTool(name, input, userId),
    });

    let res = await gen.next();
    while (!res.done) {
      relay(res.value, port);
      res = await gen.next();
    }
    const finalMessages = res.value;
    await chrome.storage.session.set({ [HISTORY_STORE]: finalMessages });
  } finally {
    await chrome.alarms.clear(alarmName);
    post(port, { kind: 'done' });
  }
}

function relay(ev: AgentEvent, port: chrome.runtime.Port): void {
  switch (ev.type) {
    case 'text_delta':
      post(port, { kind: 'text_delta', text: ev.text });
      break;
    case 'tool_use':
      post(port, { kind: 'tool_use', name: ev.name, input: ev.input });
      break;
    case 'tool_result':
      post(port, {
        kind: 'tool_result',
        name: ev.name,
        ok: ev.result.ok,
        summary: ev.result.ok ? summarize(ev.name, ev.result.data) : ev.result.error,
      });
      break;
    case 'error':
      post(port, { kind: 'error', error: ev.error });
      break;
    // turn_end: nothing to render.
  }
}

function summarize(name: string, data: unknown): string {
  const d = data as Record<string, unknown>;
  if (name === 'scrape_area') return `saved ${d.inserted} POI (session ${String(d.session_id).slice(0, 8)})`;
  if (name === 'query_places') return `${Array.isArray(d.places) ? d.places.length : 0} places`;
  if (name === 'analyze_session') return `count ${d.count}, avg ${d.avg_rating}`;
  return 'ok';
}

// --- Tool executor -------------------------------------------------------

type ToolResult = { ok: true; data: unknown } | { ok: false; error: string };

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  try {
    if (name === 'scrape_area') {
      const params: AreaScrapeParams = {
        keyword: String(input.keyword),
        lat: Number(input.lat),
        lng: Number(input.lng),
        radiusM: Number(input.radius_m),
      };
      const r = await runAreaScrapeSession(params, userId);
      if (r.error) return { ok: false, error: r.error };
      return { ok: true, data: { session_id: r.sessionId, inserted: r.inserted } };
    }

    if (name === 'query_places') {
      const sessionId = String(input.session_id);
      const limit = typeof input.limit === 'number' ? input.limit : 10;
      const rows = await fetchPlacesBySession(supabase, sessionId);
      const places = rows.slice(0, limit).map((p) => ({
        name: p.name,
        category: p.category,
        rating: p.rating,
        review_count: p.review_count,
        address: p.address,
        price_level: p.price_level,
        is_closed: p.is_closed,
        maps_url: p.maps_url,
      }));
      return { ok: true, data: { session_id: sessionId, places } };
    }

    if (name === 'analyze_session') {
      const sessionId = String(input.session_id);
      const rows = await fetchPlacesBySession(supabase, sessionId);
      return { ok: true, data: analyze(sessionId, rows) };
    }

    return { ok: false, error: `Unknown tool: ${name}` };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

function analyze(sessionId: string, rows: PlaceRow[]) {
  const count = rows.length;
  const rated = rows.filter((r) => typeof r.rating === 'number') as Array<PlaceRow & { rating: number }>;
  const avg_rating = rated.length
    ? Number((rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(2))
    : null;
  const total_reviews = rows.reduce((s, r) => s + (r.review_count ?? 0), 0);

  const catMap = new Map<string, { count: number; ratingSum: number; ratingN: number }>();
  for (const r of rows) {
    const key = r.category ?? 'unknown';
    const e = catMap.get(key) ?? { count: 0, ratingSum: 0, ratingN: 0 };
    e.count++;
    if (typeof r.rating === 'number') {
      e.ratingSum += r.rating;
      e.ratingN++;
    }
    catMap.set(key, e);
  }
  const top_categories = Array.from(catMap.entries())
    .map(([category, e]) => ({
      category,
      count: e.count,
      avg_rating: e.ratingN ? Number((e.ratingSum / e.ratingN).toFixed(2)) : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const closed = rows.filter((r) => r.is_closed === true).length;
  const percent_closed = count ? Number(((closed / count) * 100).toFixed(1)) : 0;

  const priceMap = new Map<string, number>();
  for (const r of rows) {
    const key = r.price_level ?? 'unknown';
    priceMap.set(key, (priceMap.get(key) ?? 0) + 1);
  }
  const price_level_distribution = Object.fromEntries(priceMap);

  return {
    session_id: sessionId,
    count,
    avg_rating,
    total_reviews,
    top_categories,
    percent_closed,
    price_level_distribution,
  };
}

// --- Scrape orchestration (drives the gmaps tab + content script) --------

async function runAreaScrapeSession(
  params: AreaScrapeParams,
  userId: string,
): Promise<{ sessionId: string; inserted: number; error?: string }> {
  const sessionId = nextSessionId();
  const { keyword, lat, lng, radiusM } = params;
  const url = buildGmapsSearchUrl({ keyword, lat, lng, zoom: pickZoomForRadius(radiusM) });
  const alarmName = `scrape-${sessionId}`;
  await chrome.alarms.create(alarmName, { periodInMinutes: 0.4 });

  let tab: chrome.tabs.Tab;
  try {
    const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (active?.id && active.url && GMAPS_URL_RE.test(active.url)) {
      tab = await chrome.tabs.update(active.id, { url, active: true });
      if (active.windowId !== undefined) {
        await chrome.windows.update(active.windowId, { focused: true });
      }
    } else {
      tab = await chrome.tabs.create({ url, active: true });
    }
  } catch (e: any) {
    await chrome.alarms.clear(alarmName);
    return { sessionId, inserted: 0, error: `tab open: ${e?.message ?? e}` };
  }
  const tabId = tab.id!;

  try {
    await waitForTabComplete(tabId, 20_000);
    const runMsg: RunAreaScrape = { type: 'RUN_AREA_SCRAPE', params, sessionId };
    const resultPromise = waitForResultPush(sessionId, 180_000);
    try {
      await sendWithRetry(tabId, runMsg, 5, 800);
    } catch (e: any) {
      console.log('[terramap/agent-bg] sendMessage to content failed:', e);
    }
    const result = await resultPromise;
    const rows = result.places.map((p) => ({ ...p, user_id: userId }));
    if (!rows.length) {
      const err = (result as any).error;
      return {
        sessionId,
        inserted: 0,
        error: err ?? 'Scrape returned 0 places (selectors stale, or none inside radius).',
      };
    }
    const { error } = await supabase.from('places').insert(rows);
    if (error) throw error;
    return { sessionId, inserted: rows.length };
  } catch (e: any) {
    return { sessionId, inserted: 0, error: e?.message ?? String(e) };
  } finally {
    await chrome.alarms.clear(alarmName);
  }
}

function waitForResultPush(
  sessionId: string,
  timeoutMs: number,
): Promise<AreaScrapeResult & { error?: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      reject(new Error(`Timeout waiting for AREA_SCRAPE_RESULT (${timeoutMs}ms)`));
    }, timeoutMs);
    const handler = (incoming: any) => {
      if (incoming?.type === 'AREA_SCRAPE_RESULT' && incoming.sessionId === sessionId) {
        clearTimeout(timer);
        chrome.runtime.onMessage.removeListener(handler);
        resolve(incoming);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
  });
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timeout waiting for tab to load'));
    }, timeoutMs);
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function sendWithRetry(
  tabId: number,
  msg: unknown,
  attempts: number,
  delayMs: number,
): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}
