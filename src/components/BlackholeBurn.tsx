import { RefreshCw } from 'lucide-react';
import type { Copy, Locale } from '../content/copy';
import type { ReadResult, TokenAmount } from '../data/types';
import { blackholeRecordsUrl } from '../config/blackhole';
import { exactAmount, formatAmount, formatTime } from '../lib/format';
import { TextLink } from './ui';

export default function BlackholeBurn({ t, locale, total, onRetry }: {
  t: Copy; locale: Locale; total: ReadResult<TokenAmount>; onRetry: () => void;
}) {
  const label = total.status === 'ready' ? formatAmount(total.data, locale) :
    total.status === 'error' ? t.failed : total.status === 'loading' ? t.loading : t.pending;
  const recordsUrl = blackholeRecordsUrl();
  return <section className="blackhole-burn" id="blackhole-burn" aria-labelledby="blackhole-burn-title">
    <div><h3 id="blackhole-burn-title">{t.blackholeBurned}</h3>
      <p className="blackhole-burn-value" aria-live="polite" title={total.status === 'ready' ? exactAmount(total.data) : undefined}>
        <strong>{label}</strong><span>XIYANGYANG</span>
      </p>
      {total.status === 'ready' && <p className="blackhole-burn-updated">{t.update}: {formatTime(total.updatedAt, locale)}</p>}
    </div>
    <div className="blackhole-burn-links">
      {recordsUrl && <TextLink href={recordsUrl}>{t.blackholeRecords}</TextLink>}
      <button type="button" className={total.status === 'error' ? 'text-button' : 'icon-button'} onClick={onRetry}
        disabled={total.status === 'loading' || total.status === 'unconfigured'} aria-label={total.status === 'error' ? t.retry : t.refresh}
        title={total.status === 'error' ? t.retry : t.refresh}><RefreshCw size={16} />{total.status === 'error' && t.retry}</button>
    </div>
  </section>;
}
