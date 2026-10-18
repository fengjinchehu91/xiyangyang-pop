import { describe, expect, it } from 'vitest';
import { exactAmount, formatAmount, formatDollarAmount, formatUsd, toUsdAmount } from '../src/lib/format';
import { backingDisplayTokenCount } from '../src/config/valuation';
import type { TokenAmount, UsdQuote } from '../src/data/types';

const amount = (raw: bigint, decimals: number): TokenAmount => ({ raw, decimals, symbol: 'POP' });
const quote = (usdPerToken: string): UsdQuote => ({
  usdPerToken, timestamp: Date.now(), sourceUrl: 'https://example.com/feed',
  tokenAddress: '0xa3cfb853339b77f385b994799b015cb04b208fe6',
});

describe('precision-preserving display', () => {
  it('formats 6-decimal assets without assuming 18 decimals', () => {
    expect(formatAmount(amount(12_345_678n, 6), 'en')).toBe('12.345678');
  });
  it('preserves whole-number precision beyond Number.MAX_SAFE_INTEGER', () => {
    expect(formatAmount(amount(900719925474099312345678n, 6), 'en'))
      .toBe('900,719,925,474,099,312.345678');
  });
  it('shows an actual zero as zero', () => {
    expect(formatAmount(amount(0n, 8), 'en')).toBe('0');
  });
  it('does not round a tiny nonzero balance to zero', () => {
    expect(formatAmount(amount(1n, 18), 'en')).toBe('< 0.000001');
    expect(formatAmount(amount(1n, 18), 'en', 12)).toBe('< 0.000000000001');
  });
  it('supports zero-decimal tokens', () => {
    expect(formatAmount(amount(12_345n, 0), 'en')).toBe('12,345');
  });
  it('keeps the exact full amount for accessible number details', () => {
    expect(exactAmount(amount(1234567890123456789n, 18))).toBe('1.234567890123456789');
  });
  it('computes USD values using integer arithmetic', () => {
    expect(formatUsd(amount(100_000_000n, 6), quote('0.123456'), 'en')).toBe('$12.34');
  });
  it('does not turn a tiny positive USD reference into zero', () => {
    expect(formatUsd(amount(1n, 6), quote('0.00003'), 'en')).toBe('< $0.01');
  });
  it('keeps a sub-cent POP unit price visible', () => {
    const usd = toUsdAmount(amount(1n, 0), quote('0.0003207'));
    expect(formatDollarAmount(usd, 'en')).toBe('$0.0003207');
  });
  it('uses the requested fixed 30 million denominator for the USD display only', () => {
    const reserve = amount(40_000_000n * 10n ** 18n, 18);
    const usd = toUsdAmount(reserve, quote('0.0003'), backingDisplayTokenCount);
    expect(formatDollarAmount(usd, 'en')).toBe('$0.0004');
    expect(reserve.raw).toBe(40_000_000n * 10n ** 18n);
  });
  it('converts large reserves without floating point or premature cent rounding', () => {
    const usd = toUsdAmount(amount(900719925474099312345678n, 6), quote('0.000000000123'));
    expect(formatDollarAmount(usd, 'en')).toBe('$110,788,550.83331421');
  });
  it('does not silently produce zero for a tiny positive USD display', () => {
    expect(formatDollarAmount(toUsdAmount(amount(1n, 18), quote('0.0003')), 'en'))
      .toBe('< $0.00000001');
  });
  it('rejects a zero valuation denominator', () => {
    expect(() => toUsdAmount(amount(1n, 0), quote('1'), 0n)).toThrow('positive');
  });
});
