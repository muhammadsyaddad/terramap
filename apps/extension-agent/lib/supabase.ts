import { createTerramapClient } from '@terramap/supabase';

const url = import.meta.env.WXT_SUPABASE_URL as string;
const anonKey = import.meta.env.WXT_SUPABASE_ANON_KEY as string;

const chromeStorage = {
  getItem: (key: string) =>
    chrome.storage.local.get(key).then((r) => r[key] ?? null),
  setItem: (key: string, value: string) =>
    chrome.storage.local.set({ [key]: value }),
  removeItem: (key: string) => chrome.storage.local.remove(key),
};

export const supabase = createTerramapClient({ url, anonKey, storage: chromeStorage });
