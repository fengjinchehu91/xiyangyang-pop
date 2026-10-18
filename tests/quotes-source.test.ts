import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePopUsdQuote, quoteSource } from '../src/config/quotes';

const market = () => ({
  chainId: 'bsc',
  dexId: 'pancakeswap',
  pairAddress: '0xE5ce5bc4785CD2a246151364f5A190ceE3FDb142',
  labels: ['v3'],
  baseToken: { address: '0xA3cfB853339b77F385B994799B015cB04b208Fe6' },
  quoteToken: { address: '0x55d398326f99059fF775485246999027B3197955' },
  priceUsd: '0.000320700000000000000001',
  liquidity: { usd: 716282.56 },
  pairCreatedAt: 1757398614000,
});

afterEach(() => vi.restoreAllMocks());

describe('confirmed POP/USD quote source', () => {
  it('keeps the decimal price intact and reports retrieval time, not pool creation time', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1792324210000);
    expect(parsePopUsdQuote({ pairs: [market()] })).toEqual({
      usdPerToken: '0.000320700000000000000001', timestamp: 1792324210000,
    });
    expect(quoteSource?.timestampKind).toBe('retrieved');
  });

  it.each([
    { chainId: 'ethereum' },
    { dexId: 'uniswap' },
    { pairAddress: '0xD69AeB830435594C7D3A9B133Af96dD02E65F431' },
    { baseToken: { address: '0x4dda46c9dd7e794b99eebdcfd3c82bfbd3207777' } },
    { quoteToken: { address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c' } },
    { labels: ['v2'] },
  ])('rejects an unconfirmed market: %j', (mismatch) => {
    expect(() => parsePopUsdQuote({ pairs: [{ ...market(), ...mismatch }] })).toThrow();
  });

  it.each([0, 49999.99, NaN, Infinity, null, '716282.56'])('rejects insufficient or invalid liquidity: %s', (usd) => {
    expect(() => parsePopUsdQuote({ pairs: [{ ...market(), liquidity: { usd } }] })).toThrow();
  });

  it.each(['0', '0.0000', '-0.001', '1e-4', 'NaN', '', 0.0003207, null])('rejects an invalid price: %s', (priceUsd) => {
    expect(() => parsePopUsdQuote({ pairs: [{ ...market(), priceUsd }] })).toThrow();
  });

  it.each([null, {}, { pairs: [] }, { pairs: [market(), market()] }])('rejects missing or ambiguous market payloads: %j', (payload) => {
    expect(() => parsePopUsdQuote(payload)).toThrow();
  });
});
