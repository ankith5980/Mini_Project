const API_URL = 'http://localhost:3000/api/v1/analyze'; // TODO: Change this to your public Render URL before publishing

// Verdicts are cached per browser in chrome.storage.local, so an element gets the same verdict
// every time even when the backend has restarted and lost its own cache.
// Bump when the backend prompt/model changes; extension updates also clear the cache (see onInstalled).
const CACHE_VERSION = '2';
const CACHE_PREFIX = 'caal-verdict:';
const MAX_UNUSED_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedVerdict {
  verdict: Record<string, unknown>;
  lastUsed: number;
}

// Same normalization as the backend: drop markup that changes between page loads but not the element's meaning
function normalizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s(?:data-caal-[\w-]+|nonce)="[^"]*"/g, '')
    .replace(/:r[0-9a-z]+:|«r[0-9a-z]+»|_r_[0-9a-z]+_/g, ':id:') // React useId() values
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

async function cacheKey(elementHtml: string, parentHtml: string): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([CACHE_VERSION, normalizeHtml(elementHtml), normalizeHtml(parentHtml)]));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  return CACHE_PREFIX + hex;
}

async function getCachedVerdict(key: string): Promise<Record<string, unknown> | undefined> {
  const entry = (await chrome.storage.local.get(key))[key] as CachedVerdict | undefined;
  if (!entry) return undefined;
  if (Date.now() - entry.lastUsed > MAX_UNUSED_MS) {
    await chrome.storage.local.remove(key);
    return undefined;
  }
  await chrome.storage.local.set({ [key]: { ...entry, lastUsed: Date.now() } });
  return entry.verdict;
}

async function pruneCache(clearAll: boolean): Promise<number> {
  const all = await chrome.storage.local.get(null);
  const stale = Object.entries(all)
    .filter(([key, entry]) => key.startsWith(CACHE_PREFIX) && (clearAll || Date.now() - (entry as CachedVerdict).lastUsed > MAX_UNUSED_MS))
    .map(([key]) => key);
  if (stale.length > 0) await chrome.storage.local.remove(stale);
  return stale.length;
}

// When the user last pressed "Clear cache". Verdicts the backend produced before this are re-requested
// fresh, so clearing gives new results without wiping the backend's cache for everyone else.
const CLEARED_AT_KEY = 'caal-cleared-at';

async function clearCache(): Promise<number> {
  const cleared = await pruneCache(true);
  await chrome.storage.local.set({ [CLEARED_AT_KEY]: Date.now() });
  return cleared;
}

async function requestVerdict(elementHtml: string, parentHtml: string, pageUrl: string, noCache: boolean) {
  // Forward the request to our Node.js backend
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ elementHtml, parentHtml, pageUrl, noCache })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text.substring(0, 100)}`);
  }
  const data = await response.json();
  if (typeof data?.isAccessible !== 'boolean') {
    throw new Error('Backend returned an unexpected response');
  }
  return data;
}

// A new extension version may pair with a new backend prompt, so start fresh; otherwise just drop stale entries
chrome.runtime.onInstalled.addListener(details => {
  pruneCache(details.reason === 'update');
});
chrome.runtime.onStartup.addListener(() => {
  pruneCache(false);
});

async function analyze(payload: { elementHtml?: string; parentHtml?: string; pageUrl?: string; noCache?: boolean }, tabUrl?: string) {
  const elementHtml = payload.elementHtml || '';
  const parentHtml = payload.parentHtml || '';
  const key = await cacheKey(elementHtml, parentHtml);

  if (!payload.noCache) {
    const cached = await getCachedVerdict(key);
    if (cached) return { ...cached, cached: true };
  }

  const pageUrl = tabUrl || payload.pageUrl || '';
  const noCache = Boolean(payload.noCache);
  let data = await requestVerdict(elementHtml, parentHtml, pageUrl, noCache);

  // The backend's cached verdict predates the user's last "Clear cache": ask for a fresh one instead
  const clearedAt = (await chrome.storage.local.get(CLEARED_AT_KEY))[CLEARED_AT_KEY] as number | undefined;
  if (!noCache && data.cached && clearedAt && Date.now() - (data.ageMs ?? Infinity) < clearedAt) {
    data = await requestVerdict(elementHtml, parentHtml, pageUrl, true);
  }

  const { cached, ...verdict } = data;
  delete verdict.ageMs; // relative to this response only; meaningless once stored
  await chrome.storage.local.set({ [key]: { verdict, lastUsed: Date.now() } satisfies CachedVerdict });
  return { ...verdict, cached: Boolean(cached) };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'analyzeElement') {
    analyze(request.payload || {}, sender.tab?.url)
      .then(data => sendResponse(data))
      .catch(error => {
        console.error('Error analyzing element:', error);
        sendResponse({ error: 'Failed to analyze element', details: error instanceof Error ? error.message : String(error) });
      });
    return true; // Indicates we will send response asynchronously
  }

  if (request.action === 'clearCache') {
    clearCache()
      .then(cleared => sendResponse({ cleared }))
      .catch(error => sendResponse({ error: 'Failed to clear cache', details: error instanceof Error ? error.message : String(error) }));
    return true;
  }
});
