import { ArrowDown, ArrowRight, History, RefreshCw } from 'lucide-react';
import type { Copy, Locale } from '../content/copy';
import type { Dashboard } from '../data/types';
import { chainConfig, confirmedUrl } from '../config/chain';
import { brand } from '../config/brand';
import { buybackExecutionReview, verifiedDeployment } from '../config/verified';
import { formatAmount, formatTime } from '../lib/format';
import { SectionHeading, TextLink } from './ui';
import BlackholeBurn from './BlackholeBurn';

export default function Mechanism({ t, locale, data, onRetry }: {
  t: Copy; locale: Locale; data: Dashboard; onRetry: () => void;
}) {
  const burnedLabel = data.burned.status === 'ready'
    ? formatAmount(data.burned.data, locale) : data.burned.status === 'error' ? t.failed :
      data.burned.status === 'loading' ? t.loading : t.pending;
  const recordsUrl = confirmedUrl(chainConfig.burnRecordsUrl);
  return <section id="mechanism" className="section mechanism-section">
    <div className="container">
      <SectionHeading title={t.mechanismTitle} description={t.mechanismSub} />
      <div className="mechanism-flow">
        <div className="flow-origin"><span>{t.mechanismLabel}</span><strong>{t.mechanismTax}</strong><ArrowDown size={18} /></div>
        <div className="flow-branches">
          <article className="flow-branch reserve-branch">
            <div className="flow-branch-top"><span className="flow-percentage">1.5<span>%</span></span>
              <img className="flow-art" src={brand.reserveArt} width="1254" height="1254" alt="" loading="lazy" decoding="async" /></div>
            <h3>{t.reserveFlow}</h3><p>{t.reserveFlowDescription}</p>
            <a href="#treasury" className="text-link">{t.viewTreasury}<ArrowRight size={16} /></a>
          </article>
          <article className="flow-branch burn-branch">
            <div className="flow-branch-top"><span className="flow-percentage">0.5<span>%</span></span>
              <img className="flow-art" src={brand.burnArt} width="512" height="512" alt="" loading="lazy" decoding="async" /></div>
            <h3>{t.buybackFlow}</h3><p>{t.buybackFlowDescription}</p>
            <a href="#execution-records" className="text-link">{t.execution}<ArrowRight size={16} /></a>
          </article>
        </div>
      </div>
      <p className="tax-note">{t.taxNote}</p>
      <div className="mechanism-details" id="execution-records">
        <div className="trigger-detail"><span>{t.trigger}</span><strong>5<span>%</span></strong><p>{t.triggerNote}</p></div>
        <div className="burn-detail"><span>{t.burned}</span><strong className={data.burned.status === 'ready' ? '' : 'pending-value'}>{burnedLabel}</strong>
          {data.burned.status === 'ready' && <span className="small-unit">XIYANGYANG</span>}
          {data.burned.status === 'error' && <button className="text-button" onClick={onRetry}><RefreshCw size={13} />{t.retry}</button>}
        </div>
        <div className="history-detail"><span><History size={15} />{t.lastBuyback}</span>
          {data.recentBuyback.status === 'ready' ? data.recentBuyback.data ?
            <><strong className="record-amount">{formatAmount(data.recentBuyback.data.amount, locale)} {data.recentBuyback.data.amount.symbol}</strong>
              <TextLink href={`${chainConfig.explorerUrl}/tx/${data.recentBuyback.data.transactionHash}`}>
                {formatTime(data.recentBuyback.data.timestamp, locale)}</TextLink></> : <p>{t.noBuyback}</p>
            : <strong className="pending-value">{data.recentBuyback.status === 'error' ? t.failed : data.recentBuyback.status === 'loading' ? t.loading : t.pending}</strong>}
          {data.recentBuyback.status === 'error' && <button className="text-button" onClick={onRetry}><RefreshCw size={13} />{t.retry}</button>}
          {recordsUrl ? <TextLink href={recordsUrl}>{t.execution}</TextLink> : <span className="muted-detail">{t.unconfiguredRecords}</span>}
        </div>
      </div>
      <div className="execution-verification"><p>{t.buybackVerification}</p>
        {chainConfig.buybackAddress?.toLowerCase() === verifiedDeployment.buybackRecipient && <>
          <p>{t.buybackReview}: {buybackExecutionReview.checkedThrough} · #{buybackExecutionReview.blockNumber.toString()}</p>
          <p>{t.buybackReviewScope} <TextLink href={`${chainConfig.explorerUrl}/address/${verifiedDeployment.buybackRecipient}`}>{t.recipientRecords}</TextLink></p>
        </>}
      </div>
      <BlackholeBurn t={t} locale={locale} total={data.blackholeBurned} onRetry={onRetry} />
    </div>
  </section>;
}
