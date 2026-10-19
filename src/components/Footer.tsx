import { ArrowUp, ArrowUpRight, MessageCircle, Send, Users } from 'lucide-react';
import type { Copy } from '../content/copy';
import { brand } from '../config/brand';
import { CopyButton, ExternalLink } from './ui';

export default function Footer({ t }: { t: Copy }) {
  return <>
    <section className="community-section">
      <img src={brand.goldCloud} className="community-cloud" width="1536" height="1024" alt="" loading="lazy" decoding="async" />
      <div className="container community-layout">
        <div><h2>{t.community}</h2><p>{t.communitySub}</p>
          <div className="community-links">
            <ExternalLink href={brand.telegramUrl} className="button button-white"><Send size={17} />{t.telegram}<ArrowUpRight size={15} /></ExternalLink>
            <ExternalLink href={brand.deboxUrl} className="button button-white"><MessageCircle size={17} />{t.debox}<ArrowUpRight size={15} /></ExternalLink>
            <div className="qq-group"><Users size={17} /><span>{t.qq} <strong>{brand.qqGroup}</strong></span><CopyButton value={brand.qqGroup} t={t} label={t.copyQq} /></div>
          </div>
          <ExternalLink href={brand.ecosystemXUrl} className="ecosystem-x">{t.x}<span>@Zypher_Network</span><ArrowUpRight size={15} /></ExternalLink>
        </div>
        <img src={brand.mascot} alt="" width="1536" height="1024" loading="lazy" decoding="async" className="community-character" />
      </div>
    </section>
    <footer className="site-footer"><div className="container footer-layout">
      <a href="#home" className="brand"><img src={brand.logo} alt="" width="50" height="50" /><span><strong>喜羊羊</strong><small>XIYANGYANG</small></span></a>
      <p>{t.footer}</p><span className="copyright">© {new Date().getFullYear()} XIYANGYANG</span>
      <a href="#home" className="icon-button back-top" aria-label={t.backTop} title={t.backTop}><ArrowUp size={19} /></a>
    </div></footer>
  </>;
}
