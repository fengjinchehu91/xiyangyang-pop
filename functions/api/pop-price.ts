import { parseMarketPayload, parseQuotePayload, popUsdPool,
  type QuoteEnvelope, type QuoteProvider } from '../../src/config/popMarket';
import { isRecord, jsonResponse, readJsonLimited, type RequestContext } from '../_lib/http';
import { readOnchainQuote } from '../_lib/onchainQuote';

type HttpProvider = Exclude<QuoteProvider, 'pancakeswap-chainlink'>;
const providers: { id: HttpProvider; url: string; accept: string }[] = [
  { id: 'dexscreener', url: `https://api.dexscreener.com/latest/dex/pairs/bsc/${popUsdPool}`,
    accept: 'application/json' },
  { id: 'geckoterminal', url: `https://api.geckoterminal.com/api/v2/networks/bsc/pools/${popUsdPool}?include=base_token,quote_token,dex`,
    accept: 'application/json;version=20230203' },
];

// Cache API shares state in a region; module state only coordinates this isolate.
let cached: QuoteEnvelope | undefined;
let inFlight: Promise<QuoteEnvelope> | undefined;
const cooldownUntil: Record<HttpProvider, number> = { dexscreener: 0, geckoterminal: 0 };

function retryDelay(value: string | null, now: number) {
  const delay = value && /^\d+$/.test(value) ? Number(value) * 1000
    : value ? Date.parse(value) - now : 0;
  return Number.isFinite(delay) ? Math.max(60_000, delay) : 60_000;
}

async function matchCache(cache: Cache | undefined, key: string) {
  try { return cache ? await cache.match(key) : undefined; } catch { return undefined; }
}

async function putCache(cache: Cache | undefined, key: string, value: unknown, seconds: number) {
  try { await cache?.put(key, jsonResponse(value, 200, { 'Cache-Control': `public, max-age=${seconds}` })); }
  catch { /* A cache outage must not hide a successfully validated quote. */ }
}

async function loadQuote(cache: Cache | undefined, origin: string): Promise<QuoteEnvelope> {
  const deadline = Date.now() + 8_000;
  for (const provider of providers) {
    const cooldownKey = `${origin}/api/pop-price/_cooldown/${provider.id}`;
    const savedCooldown = await matchCache(cache, cooldownKey);
    if (savedCooldown) {
      try {
        const value: unknown = await savedCooldown.json();
        if (isRecord(value) && typeof value.until === 'number' && Number.isFinite(value.until)) {
          cooldownUntil[provider.id] = Math.max(cooldownUntil[provider.id], value.until);
        }
      } catch { /* Keep the in-isolate cooldown when shared state is unavailable. */ }
    }
    if (Date.now() < cooldownUntil[provider.id]) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const payload = await Promise.race([
        (async () => {
          const response = await fetch(provider.url, { method: 'GET',
            headers: { Accept: provider.accept }, redirect: 'manual', signal: controller.signal });
          if (response.status === 429) {
            const now = Date.now();
            cooldownUntil[provider.id] = now + retryDelay(response.headers.get('Retry-After'), now);
            await putCache(cache, cooldownKey, { until: cooldownUntil[provider.id] },
              Math.ceil((cooldownUntil[provider.id] - now) / 1000));
          }
          if (!response.ok) throw new Error(`Upstream HTTP request failed (${response.status})`);
          return readJsonLimited(response.body, 1_048_576);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Upstream request timed out')); },
            Math.min(2_000, remaining));
        }),
      ]);
      parseMarketPayload(provider.id, payload);
      return { provider: provider.id, retrievedAt: Date.now(), payload };
    } catch (error) {
      console.warn(`POP quote ${provider.id} unavailable:`, error instanceof Error ? error.message : 'Unknown upstream error');
    } finally { clearTimeout(timer); }
  }
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('No confirmed POP quote available');
  const payload = await readOnchainQuote(Math.min(6_000, remaining));
  return { provider: 'pancakeswap-chainlink', retrievedAt: Date.now(), payload };
}

async function readQuote(cache: Cache | undefined, origin: string): Promise<QuoteEnvelope> {
  const key = `${origin}/api/pop-price`;
  const saved = await matchCache(cache, key);
  if (saved) {
    try {
      const value: unknown = await saved.json();
      if (isRecord(value) && (value.provider === 'dexscreener' || value.provider === 'geckoterminal' ||
          value.provider === 'pancakeswap-chainlink') &&
          typeof value.retrievedAt === 'number' && Date.now() - value.retrievedAt >= 0 &&
          Date.now() - value.retrievedAt < 15_000) {
        parseQuotePayload(value);
        return { provider: value.provider, retrievedAt: value.retrievedAt, payload: value.payload };
      }
    } catch { /* Ignore expired or invalid cached values and read the fixed providers. */ }
  }
  const value = await loadQuote(cache, origin);
  await putCache(cache, key, value, 15);
  return value;
}

export async function onRequest({ request }: RequestContext) {
  if (request.method !== 'GET') return jsonResponse({ error: 'GET is required' }, 405, { Allow: 'GET' });
  try {
    if (!cached || Date.now() - cached.retrievedAt >= 15_000) {
      const cache = (globalThis as typeof globalThis & { caches?: CacheStorage & { default?: Cache } }).caches?.default;
      inFlight ??= readQuote(cache, new URL(request.url).origin).then((value) => { cached = value; return value; })
        .finally(() => { inFlight = undefined; });
      await inFlight;
    }
    const ttl = Math.max(0, Math.ceil((15_000 - (Date.now() - cached!.retrievedAt)) / 1000));
    return jsonResponse(cached, 200, { 'Cache-Control': `public, max-age=${ttl}` });
  } catch {
    return jsonResponse({ error: 'POP price is temporarily unavailable' }, 502);
  }
}
