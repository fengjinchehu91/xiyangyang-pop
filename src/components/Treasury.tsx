import type { ReactNode } from 'react';
import { ArrowUpRight, Clock3, Database, LoaderCircle, RefreshCw, Wallet } from 'lucide-react';
import type { Copy, Locale } from '../content/copy';
import type { Dashboard, ReadResult, TokenAmount } from '../data/types';
import { chainConfig } from '../config/chain';
import { brand } from '../config/brand';
import { quoteSource } from '../config/quotes';
import { backingDisplayTokenCount } from '../config/valuation';
import type { BuybackFlows } from '../data/buybackFlows';
import { exactAmount, formatAmount, formatDateTime, formatDollarAmount, formatTime, formatUsd, toUsdAmount } from '../lib/format';
import { SectionHeading, TextLink } from './ui';

function Metric({ t, locale, result, label, note, unit = 'POP', usd = false, onRetry, children }: {
  t: Copy; locale: Locale; result: ReadResult<TokenAmount>; label: string;
  note: string; unit?: string; usd?: boolean; onRetry: () => void; children?: ReactNode;
}) {
  const ready = result.status === 'ready';
  const number = ready ? usd ? formatDollarAmount(result.data, locale) : formatAmount(result.data, locale) : '—';
  const labels = { ready: usd ? t.usdEstimate : t.ready, loading: t.loading, error: t.failed, unconfigured: t.pending };
  return <div className="treasury-metric" data-status={result.status}>
    <dt>{label}<span className={`read-status ${result.status}`}>
      {result.status === 'loading' && <LoaderCircle className="spin" size={11} />}{labels[result.status]}</span></dt>
    <dd className={`metric-number ${number.length > 12 ? 'long-number' : ''}`}
      title={ready ? exactAmount(result.data) : undefined}>
      <span>{number}</span><span className="metric-unit">{unit}</span>
    </dd>
    {children}
    <p className="metric-note">{note}</p>
    {result.status === 'error' && <button className="retry-button" type="button" onClick={onRetry}>
      <RefreshCw size={13} />{t.retry}</button>}
  </div>;
}

export default function Treasury({ t, locale, data, onRefresh, refreshing, configured, flows, refreshingFlows, onRefreshFlows }: {
  t: Copy; locale: Locale; data: Dashboard; onRefresh: () => void;
  refreshing: boolean; configured: boolean; flows: ReadResult<BuybackFlows>;
  refreshingFlows: boolean; onRefreshFlows: () => void;
}) {
  const quote = data.quote.status === 'ready' &&
    Date.now() - data.quote.data.timestamp <= (quoteSource?.maxAgeMs ?? 60_000) ? data.quote.data : null;
  const quoteLabel = data.quote.status === 'loading' ? t.quoteLoading :
    data.quote.status === 'unconfigured' ? t.quotePending : t.quoteUnavailable;
  const floor: ReadResult<TokenAmount> = data.reserve.status !== 'ready' ? data.reserve :
    data.quote.status !== 'ready' ? data.quote : !quote ? { status: 'error', message: 'Stale quote' } :
      { status: 'ready', data: toUsdAmount(data.reserve.data, quote, backingDisplayTokenCount),
        updatedAt: data.reserve.updatedAt };
  const collected: ReadResult<TokenAmount> = flows.status === 'ready' ?
    { status: 'ready', data: flows.data.amount, updatedAt: flows.updatedAt } : flows;

  function usdDetail(amount: ReadResult<TokenAmount>, label: string) {
    return <p className="metric-valuation"><span>{label}</span>
      <strong>{quote && amount.status === 'ready' ? `≈ ${formatUsd(amount.data, quote, locale)} USD` : '— USD'}</strong>
    </p>;
  }
  return <section id="treasury" className="treasury-section">
    <img src={brand.landscape} className="treasury-landscape" alt="" loading="lazy" />
    <div className="container treasury-content">
      <div className="treasury-heading">
        <SectionHeading title={t.treasury} description={t.treasurySub} english="RESERVE TREASURY" light />
        <div className="treasury-symbol" aria-hidden="true"><Database size={27} /></div>
      </div>
      <dl className="treasury-grid" aria-live="polite">
        <Metric t={t} locale={locale} result={data.reserve} label={t.reserve} note={t.reserveNote} onRetry={onRefresh}>
          <p className="metric-valuation"><span>{t.popPrice}</span><strong>{quote ?
            `${formatDollarAmount(toUsdAmount({ raw: 1n, decimals: 0, symbol: 'POP' }, quote), locale)} / POP` : quoteLabel}</strong></p>
          {usdDetail(data.reserve, t.reserveUsd)}
        </Metric>
        <Metric t={t} locale={locale} result={floor} label={t.floor} note={t.floorNote}
          unit="USD / XIYANGYANG" usd onRetry={onRefresh}>
          <p className="metric-contract"><span>{t.contractPrice}</span>
            <strong>{data.floor.status === 'ready' ? formatAmount(data.floor.data, locale, 12) :
              data.floor.status === 'error' ? t.failed : data.floor.status === 'loading' ? t.loading : t.pending}</strong>
            <span>POP / XIYANGYANG</span>
          </p>
        </Metric>
        <Metric t={t} locale={locale} result={collected} label={t.buyback} note={t.buybackNote} onRetry={onRefreshFlows}>
          {usdDetail(collected, t.buybackUsd)}
          {flows.status === 'loading' && <p className="metric-note">{t.flowUpdating}</p>}
          {flows.status === 'ready' && <div className="metric-window">
            <p><strong>{flows.data.transactionCount}</strong> {t.flowTransactions}</p>
            <p>{t.flowWindow}<br />{formatDateTime(flows.data.windowStart, locale)} – {formatDateTime(flows.data.windowEnd, locale)}</p>
            <TextLink href={`${chainConfig.explorerUrl}/token/${chainConfig.tokens.pop}?a=${chainConfig.buybackAddress}`}>
              {t.flowRecords}</TextLink>
          </div>}
          {flows.status === 'ready' && <p className="metric-note">{t.flowUpdated}: {formatTime(flows.updatedAt, locale)}</p>}
        </Metric>
      </dl>
      <div className="quote-reference">
        {quote ? <><span>{quote.timestampKind === 'retrieved' ? t.quoteRetrieved : t.quoteTime}: {formatDateTime(quote.timestamp, locale)} (UTC+8)</span>
          <TextLink href={quote.sourceUrl}>{t.quoteSource}</TextLink></> : <><span>{quoteLabel}</span>
          {data.quote.status === 'error' && <button type="button" className="retry-button" onClick={onRefresh}><RefreshCw size={13} />{t.retry}</button>}</>}
      </div>
      <div className="treasury-bottom">
        <p><Clock3 size={14} /><span>{t.update}：</span>
          <span>{data.updatedAt ? formatTime(data.updatedAt, locale) : t.pending}</span>
          {data.blockNumber !== undefined && <span className="block-number">#{data.blockNumber.toString()}</span>}
        </p>
        <div className="treasury-tools">
          <button type="button" className="icon-button refresh-button" onClick={() => { onRefresh(); onRefreshFlows(); }}
            disabled={(!configured || refreshing) && refreshingFlows} aria-label={refreshing || refreshingFlows ? t.refreshing : t.refresh}
            title={t.refresh}>
            <RefreshCw size={16} className={refreshing || refreshingFlows ? 'spin' : ''} />
          </button>
          <a href="#transparency" className="text-link">{t.onchainRecords}<ArrowUpRight size={17} /></a>
        </div>
      </div>
      <p className="read-only-note"><Wallet size={12} aria-hidden="true" />{t.readOnly}</p>
    </div>
  </section>;
}
