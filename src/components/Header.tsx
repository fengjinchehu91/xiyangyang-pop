import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Globe2, Menu, X } from 'lucide-react';
import { brand } from '../config/brand';
import type { Copy, Locale } from '../content/copy';
import { ExternalLink } from './ui';

export const sectionIds = ['home', 'treasury', 'mechanism', 'ecosystem', 'transparency'];

export default function Header({ t, locale, onLocale }: {
  t: Copy; locale: Locale; onLocale: (value: Locale) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('home');
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
    }, { rootMargin: '-15% 0px -65% 0px' });
    for (const id of sectionIds) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus(); }
    };
    const resize = () => { if (window.innerWidth >= 1100) setOpen(false); };
    window.addEventListener('keydown', close);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  return <header className="site-header">
    <div className="container header-inner">
      <a className="brand" href="#home" onClick={() => setOpen(false)} aria-label="喜羊羊 XIYANGYANG">
        <img src={brand.logo} width="56" height="56" alt="" />
        <span><strong>喜羊羊</strong><small>XIYANGYANG</small></span>
      </a>
      <nav className="desktop-nav" aria-label={locale === 'zh' ? '主要导航' : 'Main navigation'}>
        {sectionIds.map((id, index) => <a key={id} href={`#${id}`}
          className={active === id ? 'active' : ''} aria-current={active === id ? 'location' : undefined}>
          {t.nav[index]}</a>)}
      </nav>
      <div className="header-actions">
        <div className="language-switch" aria-label={locale === 'zh' ? '选择语言' : 'Choose language'}>
          <Globe2 size={15} aria-hidden="true" />
          <button type="button" lang="zh-CN" aria-pressed={locale === 'zh'} onClick={() => onLocale('zh')}>中文</button>
          <span aria-hidden="true">/</span>
          <button type="button" lang="en" aria-pressed={locale === 'en'} onClick={() => onLocale('en')}>EN</button>
        </div>
        <ExternalLink href={brand.tradeUrl} className="button button-green header-trade">
          {t.trade}<ArrowUpRight size={16} aria-hidden="true" />
        </ExternalLink>
        <button type="button" ref={menuButton} className="icon-button menu-toggle"
          aria-label={open ? t.closeMenu : t.menu} aria-expanded={open}
          aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
          {open ? <X size={23} /> : <Menu size={23} />}
        </button>
      </div>
    </div>
    {open && <nav id="mobile-navigation" className="mobile-nav" aria-label={t.menu}>
      <div className="container">{sectionIds.map((id, index) =>
        <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{t.nav[index]}<ArrowUpRight size={16} /></a>)}
        <ExternalLink href={brand.tradeUrl} className="mobile-trade">{t.trade}<ArrowUpRight size={16} /></ExternalLink>
      </div>
    </nav>}
    {open && <button className="menu-backdrop" tabIndex={-1} aria-label={t.closeMenu} onClick={() => setOpen(false)} />}
  </header>;
}
