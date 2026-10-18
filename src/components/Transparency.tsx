import { ArrowUpRight, Database, FileText, Flame, Link2, Wallet } from 'lucide-react';
import { addressUrl, chainConfig } from '../config/chain';
import { blackholeRecordsUrl } from '../config/blackhole';
import { shortAddress } from '../lib/format';
import type { Copy } from '../content/copy';
import { CopyButton, ExternalLink, SectionHeading } from './ui';

const icons = [FileText, FileText, Database, Wallet, Flame, Link2];

export default function Transparency({ t }: { t: Copy }) {
  const items = [
    { value: chainConfig.tokens.xiyangyang, url: addressUrl(chainConfig.tokens.xiyangyang), address: true },
    { value: chainConfig.tokens.pop, url: addressUrl(chainConfig.tokens.pop), address: true },
    { value: chainConfig.treasuryAddress, url: addressUrl(chainConfig.treasuryAddress), address: true },
    { value: chainConfig.buybackAddress, url: addressUrl(chainConfig.buybackAddress), address: true },
    { value: undefined, url: blackholeRecordsUrl(), address: false },
    { value: chainConfig.tradingPoolAddress, url: addressUrl(chainConfig.tradingPoolAddress), address: true },
  ];
  return <section id="transparency" className="section transparency-section">
    <div className="container"><SectionHeading title={t.transparencyTitle} description={t.transparencySub} />
      <div className="transparency-list">{items.map((item, index) => {
        const Icon = icons[index];
        return <div className="transparency-row" key={t.transparencyItems[index]}>
          <div className="transparency-label"><Icon size={19} strokeWidth={1.5} /><h3>{t.transparencyItems[index]}</h3></div>
          {item.url ? <div className="transparency-value">
            {item.address && item.value && <><code title={item.value}>{shortAddress(item.value)}</code><CopyButton value={item.value} t={t} /></>}
            <ExternalLink href={item.url} className="text-link" label={`${t.inspect} ${t.transparencyItems[index]}`}>
              <span>{t.inspect}</span><ArrowUpRight size={17} /></ExternalLink>
          </div> : <span className="pending-link">{t.pendingAddress}</span>}
        </div>;
      })}</div>
      <p className="transparency-note">{t.transparencyNote}</p>
      <div className="faq"><h3>{t.faqTitle}</h3><div>{t.faq.map(([question, answer]) =>
        <details key={question}><summary>{question}<span className="faq-icon" aria-hidden="true" /></summary><p>{answer}</p></details>)}</div></div>
    </div>
  </section>;
}
