import { verifiedDeployment as deployment } from '../../src/config/verified';
import { fetchJson, isRecord, jsonResponse, type RequestContext } from '../_lib/http';

const quoteUrl = 'https://api.dexscreener.com/latest/dex/pairs/bsc/0xe5ce5bc4785cd2a246151364f5a190cee3fdb142';

function validMarket(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.pairs) || payload.pairs.length !== 1) return false;
  const pair: unknown = payload.pairs[0];
  return isRecord(pair) && pair.chainId === 'bsc' && pair.dexId === 'pancakeswap' &&
    typeof pair.pairAddress === 'string' && pair.pairAddress.toLowerCase() === '0xe5ce5bc4785cd2a246151364f5a190cee3fdb142' &&
    isRecord(pair.baseToken) && typeof pair.baseToken.address === 'string' && pair.baseToken.address.toLowerCase() === deployment.pop &&
    isRecord(pair.quoteToken) && typeof pair.quoteToken.address === 'string' &&
    pair.quoteToken.address.toLowerCase() === '0x55d398326f99059ff775485246999027b3197955' &&
    Array.isArray(pair.labels) && pair.labels.includes('v3') &&
    isRecord(pair.liquidity) && typeof pair.liquidity.usd === 'number' &&
    Number.isFinite(pair.liquidity.usd) && pair.liquidity.usd >= 50_000 &&
    typeof pair.priceUsd === 'string' && /^\d+(\.\d{1,30})?$/.test(pair.priceUsd) && /[1-9]/.test(pair.priceUsd);
}

export async function onRequest({ request }: RequestContext) {
  if (request.method !== 'GET') return jsonResponse({ error: 'GET is required' }, 405, { Allow: 'GET' });
  try {
    const payload = await fetchJson(quoteUrl, { method: 'GET', headers: { Accept: 'application/json' } }, 8_000);
    if (!validMarket(payload)) throw new Error('POP quote market does not match');
    return jsonResponse(payload);
  } catch { return jsonResponse({ error: 'POP price is temporarily unavailable' }, 502); }
}
