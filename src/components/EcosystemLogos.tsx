import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { brand } from '../config/brand';
import type { Copy } from '../content/copy';
import type { EcosystemParticles } from '../lib/ecosystemParticles';

const forms = [
  { name: 'XIYANGYANG', detail: 'MEME COMMUNITY', src: brand.logo },
  { name: 'POP', detail: 'ZYPHER ECOSYSTEM', src: brand.popLogo },
];

export default function EcosystemLogos({ t }: { t: Copy }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EcosystemParticles | null>(null);
  const selectedRef = useRef(0);
  const pausedRef = useRef(false);
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stage = stageRef.current, canvas = canvasRef.current;
    if (!stage || !canvas || !window.IntersectionObserver || !window.ResizeObserver) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, visible = false, initializing = false, failed = false;

    const onChange = (index: number) => {
      if (disposed) return;
      selectedRef.current = index;
      setSelected(index);
    };
    const onError = () => {
      failed = true;
      if (disposed) return;
      setReady(false);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
    async function initialize() {
      if (disposed || failed || initializing || engineRef.current || !visible || preference.matches) return;
      initializing = true;
      try {
        const { createEcosystemParticles } = await import('../lib/ecosystemParticles');
        if (disposed) return;
        const engine = await createEcosystemParticles(canvas!, [forms[0].src, forms[1].src], onChange, onError);
        if (disposed) { engine.destroy(); return; }
        engineRef.current = engine;
        engine.setPaused(pausedRef.current);
        engine.setReduced(preference.matches);
        engine.select(selectedRef.current);
        engine.setVisible(visible);
        setReady(true);
      } catch { onError(); }
      finally { initializing = false; }
    }
    const onPreference = () => {
      setReduced(preference.matches);
      engineRef.current?.setReduced(preference.matches);
      if (!preference.matches) void initialize();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      engineRef.current?.setVisible(visible);
      if (visible) void initialize();
    }, { threshold: 0.05 });
    observer.observe(stage);
    if (preference.addEventListener) preference.addEventListener('change', onPreference);
    else preference.addListener(onPreference);
    onPreference();
    return () => {
      disposed = true;
      observer.disconnect();
      if (preference.removeEventListener) preference.removeEventListener('change', onPreference);
      else preference.removeListener(onPreference);
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  function select(index: number) {
    selectedRef.current = index;
    setSelected(index);
    engineRef.current?.select(index);
  }
  function togglePaused() {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    engineRef.current?.setPaused(pausedRef.current);
  }

  const active = forms[selected];
  return <div className="eco-particles" data-rendered={ready && !reduced}>
    <div ref={stageRef} className="eco-particle-stage">
      <img className="eco-particle-fallback" src={active.src} width="300" height="300" alt={`${active.name} Logo`} loading="lazy" decoding="async" />
      <canvas ref={canvasRef} className="eco-particle-canvas" aria-hidden="true" />
    </div>
    <div className="eco-particle-caption"><span>{selected === 0 ? '01' : '02'} / 02</span><strong>{active.name}</strong><span>{active.detail}</span></div>
    <div className="eco-particle-toolbar">
      <div className="eco-particle-options" role="group" aria-label={t.particleForms}>
        {forms.map((form, index) => <button type="button" key={form.name} aria-pressed={selected === index}
          onClick={() => select(index)} onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const next = selected === 0 ? 1 : 0;
            select(next);
            const buttons = event.currentTarget.parentElement?.querySelectorAll('button');
            buttons?.[next].focus();
          }}><img src={form.src} width="22" height="22" alt="" loading="lazy" />{form.name}</button>)}
      </div>
      <span className="eco-particle-play-slot">{ready && !reduced && <button type="button" className="icon-button eco-particle-play" onClick={togglePaused}
        aria-label={paused ? t.playParticles : t.pauseParticles} title={paused ? t.playParticles : t.pauseParticles}>
        {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
      </button>}</span>
    </div>
  </div>;
}
