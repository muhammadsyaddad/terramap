import { scrapeAreaOnPage } from '@terramap/scrapers/area';
import type { AreaScrapeResult, RunAreaScrape } from '@/lib/types';

export default defineContentScript({
  matches: ['https://www.google.com/maps/*', 'https://maps.google.com/*'],
  async main() {
    console.log('[terramap/content] gmaps-area content script loaded at', location.href);
    chrome.runtime.onMessage.addListener((msg: RunAreaScrape) => {
      if (msg?.type !== 'RUN_AREA_SCRAPE') return;
      console.log('[terramap/content] RUN_AREA_SCRAPE received, session', msg.sessionId);
      // Fire-and-forget: don't hold the channel open with `return true`.
      // Push the result back via runtime.sendMessage when scrape finishes —
      // MV3 closes long-lived sendResponse channels unpredictably.
      runAndPush(msg);
    });
  },
});

async function runAndPush(msg: RunAreaScrape): Promise<void> {
  try {
    const places = await scrapeAreaOnPage({ ...msg.params, sessionId: msg.sessionId });
    console.log('[terramap/content] scrape finished, places:', places.length, 'sample:', places[0]);
    const result: AreaScrapeResult = {
      type: 'AREA_SCRAPE_RESULT',
      sessionId: msg.sessionId,
      places,
    };
    await chrome.runtime.sendMessage(result);
  } catch (e: any) {
    console.log('[terramap/content] scrape threw:', e);
    await chrome.runtime.sendMessage({
      type: 'AREA_SCRAPE_RESULT',
      sessionId: msg.sessionId,
      places: [],
      error: e?.message ?? String(e),
    });
  }
}
