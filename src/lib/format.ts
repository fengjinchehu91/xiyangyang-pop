import { formatUnits } from 'viem';
import type { TokenAmount, UsdQuote } from '../data/types';

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatAmount(amount: TokenAmount, locale: string, precision = 6) {
  const { raw, decimals } = amount;
  const factor = 10n ** BigInt(decimals);
  const integer = raw / factor;
  const fraction = (raw % factor).toString().padStart(decimals, '0');
  const visible = fraction.slice(0, precision).replace(/0+$/, '');
  if (raw > 0n && integer === 0n && !visible) {
    return `< 0.${'0'.repeat(Math.min(decimals, precision) - 1)}1`;
  }
  const grouped = new Intl.NumberFormat(locale).format(integer);
  return visible ? `${grouped}.${visible}` : grouped;
}

export function exactAmount(amount: TokenAmount) {
  return formatUnits(amount.raw, amount.decimals);
}

export function toUsdAmount(amount: TokenAmount, quote: UsdQuote, tokenDivisor = 1n): TokenAmount {
  if (tokenDivisor <= 0n) throw new Error('Token divisor must be positive');
  const [whole, fraction = ''] = quote.usdPerToken.split('.');
  return {
    raw: amount.raw * BigInt(whole + fraction) / tokenDivisor,
    decimals: amount.decimals + fraction.length,
    symbol: 'USD',
  };
}

export function formatDollarAmount(amount: TokenAmount, locale: string, precision = 8) {
  const number = formatAmount(amount, locale, precision);
  return number.startsWith('< ') ? `< $${number.slice(2)}` : `$${number}`;
}

export function formatDateTime(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
    hourCycle: 'h23' }).format(timestamp);
}

export function formatUsd(amount: TokenAmount, quote: UsdQuote, locale: string) {
  const [whole, fraction = ''] = quote.usdPerToken.split('.');
  const scaledPrice = BigInt(whole + fraction);
  const cents = amount.raw * scaledPrice * 100n /
    (10n ** BigInt(amount.decimals + fraction.length));
  if (cents === 0n && amount.raw > 0n && scaledPrice > 0n) return '< $0.01';
  return `$${new Intl.NumberFormat(locale).format(cents / 100n)}.${
    (cents % 100n).toString().padStart(2, '0')}`;
}

export function formatTime(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZoneName: 'short',
  }).format(timestamp);
}
