import { ArrowDown, ArrowRight, ArrowUpRight, CircleDot } from 'lucide-react';
import { brand } from '../config/brand';
import { addressUrl, chainConfig } from '../config/chain';
import { shortAddress } from '../lib/format';
import type { Copy } from '../content/copy';
import { CopyButton, ExternalLink } from './ui';

export default function Hero({ t }: { t: Copy }) {
  return <>
    <section id="home" className="hero">
      <img src={brand.landscape} className="hero-landscape" alt="" fetchPriority="high" />
      <div className="container hero-layout">
        <div className="hero-copy">
          <p className="hero-label"><span />XIYANGYANG / POP</p>
          <h1><span>{t.heroTitle[0]}</span><span>{t.heroTitle[1]}</span></h1>
          <p className="hero-description">{t.heroDescription}</p>
          <div className="hero-buttons">
            <a href="#treasury" className="button button-green">{t.viewTreasury}<ArrowDown size={17} /></a>
            <a href="#mechanism" className="button button-outline">{t.viewMechanism}<ArrowRight size={17} /></a>
          </div>
          <div className="contract-inline">
            <span>{t.tokenContract}</span>
            <code title={chainConfig.tokens.xiyangyang}>{shortAddress(chainConfig.tokens.xiyangyang)}</code>
            <CopyButton value={chainConfig.tokens.xiyangyang} t={t} />
            <ExternalLink href={addressUrl(chainConfig.tokens.xiyangyang)!} className="icon-button"
              label={t.explorer}><ArrowUpRight size={17} /></ExternalLink>
          </div>
          <p className="hero-network"><CircleDot size={13} aria-hidden="true" />{t.network}<span>·</span>{t.readOnly}</p>
        </div>
        <div className="hero-character">
          <img src={brand.mascot} alt="喜羊羊：白色羊毛、金色羊角、POP墨镜、绿色围巾与点赞动作"
            width="1100" height="1100" fetchPriority="high" />
          <div className="character-caption"><span>XIYANGYANG</span><span>COMMUNITY × POP</span></div>
        </div>
      </div>
    </section>
    <section className="parameters" aria-label={t.params[0]}>
      <dl className="container parameter-grid">{t.params.map((label, index) =>
        <div className="parameter" key={label}>
          <dt>{label}</dt><dd>{t.paramValues[index]}</dd><p>{t.paramNotes[index]}</p>
        </div>)}
      </dl>
    </section>
  </>;
}
