import { useEffect, useState } from 'react';
import { copy, type Locale } from './content/copy';
import { useTreasury } from './hooks/useTreasury';
import { useBuybackFlows } from './hooks/useBuybackFlows';
import Header from './components/Header';
import Hero from './components/Hero';
import Treasury from './components/Treasury';
import Mechanism from './components/Mechanism';
import Ecosystem from './components/Ecosystem';
import Transparency from './components/Transparency';
import Footer from './components/Footer';

function initialLocale(): Locale {
  try { return localStorage.getItem('xiyangyang-language') === 'en' ? 'en' : 'zh'; }
  catch { return 'zh'; }
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const treasury = useTreasury();
  const buybackFlows = useBuybackFlows();
  const t = copy[locale];
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    document.title = locale === 'zh' ? '喜羊羊 XIYANGYANG | POP 动态托底金库' : 'XIYANGYANG | POP Reserve Treasury';
    try { localStorage.setItem('xiyangyang-language', locale); } catch { /* Storage is optional. */ }
  }, [locale]);

  return <div className={`site locale-${locale}`}>
    <a href="#main-content" className="skip-link">{t.skip}</a>
    <Header t={t} locale={locale} onLocale={setLocale} />
    <main id="main-content">
      <Hero t={t} />
      <Treasury t={t} locale={locale} data={treasury.data} refreshing={treasury.refreshing}
        configured={treasury.configured} onRefresh={() => void treasury.refresh()}
        flows={buybackFlows.data} refreshingFlows={buybackFlows.refreshing}
        onRefreshFlows={() => void buybackFlows.refresh()} />
      <Mechanism t={t} locale={locale} data={treasury.data} onRetry={() => void treasury.refresh()} />
      <Ecosystem t={t} />
      <Transparency t={t} />
    </main>
    <Footer t={t} />
  </div>;
}
