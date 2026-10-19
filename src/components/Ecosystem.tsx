import { ArrowLeftRight, ArrowUpRight, BookOpen, Database } from 'lucide-react';
import { brand } from '../config/brand';
import type { Copy } from '../content/copy';
import { ExternalLink, SectionHeading } from './ui';
import EcosystemLogos from './EcosystemLogos';

const ecoIcons = [ArrowLeftRight, Database, BookOpen];

export default function Ecosystem({ t }: { t: Copy }) {
  return <section id="ecosystem" className="section ecosystem-section">
    <img src={brand.ecosystemLandscape} className="ecosystem-landscape" width="1983" height="793" alt="" loading="lazy" decoding="async" />
    <div className="container ecosystem-content">
      <SectionHeading title={t.ecosystemTitle} description={t.ecosystemSub} />
      <EcosystemLogos t={t} />
      <div className="eco-items">{t.ecoItems.map((title, index) => {
        const Icon = ecoIcons[index];
        return <article key={title}><Icon size={24} strokeWidth={1.5} /><h3>{title}</h3><p>{t.ecoDescriptions[index]}</p></article>;
      })}</div>
      <div className="eco-action"><ExternalLink href={brand.zypherUrl} className="button button-outline">
        {t.learnZypher}<ArrowUpRight size={17} /></ExternalLink></div>
    </div>
  </section>;
}
