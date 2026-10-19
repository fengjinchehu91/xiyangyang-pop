import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { brand } from '../config/brand';
import type { Copy } from '../content/copy';
import { createMorphParticles, interpolateMorphDot, type LogoDot, type MorphParticle } from '../lib/logoMorph';

function sampleLogo(image: HTMLImageElement, root: DOMRect, columns: number): LogoDot[] {
  const surface = document.createElement('canvas');
  surface.width = columns;
  surface.height = columns;
  const context = surface.getContext('2d', { willReadFrequently: true });
  if (!context) return [];
  const scale = Math.min(columns / image.naturalWidth, columns / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (columns - width) / 2, (columns - height) / 2, width, height);
  const { data } = context.getImageData(0, 0, columns, columns);
  const box = image.getBoundingClientRect();
  const dots: LogoDot[] = [];
  for (let y = 0; y < columns; y++) {
    for (let x = 0; x < columns; x++) {
      const offset = (y * columns + x) * 4;
      if (data[offset + 3] < 48) continue;
      dots.push({
        x: box.left - root.left + (x + 0.5) * box.width / columns,
        y: box.top - root.top + (y + 0.5) * box.height / columns,
        r: data[offset], g: data[offset + 1], b: data[offset + 2], a: data[offset + 3] / 255,
      });
    }
  }
  return dots;
}

export default function EcosystemLogos({ t }: { t: Copy }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLImageElement>(null);
  const secondRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const replayRef = useRef<() => void>(() => {});
  const playedRef = useRef(false);
  const [motionAllowed, setMotionAllowed] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const first = firstRef.current;
    const second = secondRef.current;
    const canvas = canvasRef.current;
    if (!root || !first || !second || !canvas || !window.IntersectionObserver || !window.ResizeObserver) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let frame = 0;
    let disposed = false;
    let width = root.clientWidth;
    let height = root.clientHeight;
    let prepared: { particles: MorphParticle[]; radius: number; width: number; bottom: number } | undefined;

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      context!.clearRect(0, 0, canvas!.width, canvas!.height);
      if (!disposed) setPlaying(false);
    }

    function play() {
      if (disposed || frame || !visible || document.hidden || preference.matches) return;
      if (![first!, second!].every(image => image.complete && image.naturalWidth > 0)) return;
      try {
        if (!prepared) {
          const box = root!.getBoundingClientRect();
          const mobile = window.matchMedia('(max-width: 767px)').matches;
          const density = mobile ? 26 : 36;
          const dpr = mobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
          canvas!.width = Math.round(box.width * dpr);
          canvas!.height = Math.round(box.height * dpr);
          context!.setTransform(dpr, 0, 0, dpr, 0, 0);
          prepared = {
            particles: createMorphParticles(sampleLogo(first!, box, density), sampleLogo(second!, box, density)),
            radius: mobile ? 1.55 : 1.65,
            width: box.width,
            bottom: Math.max(first!.getBoundingClientRect().bottom, second!.getBoundingClientRect().bottom) - box.top + 4,
          };
        }
        if (!prepared.particles.length) return;
      } catch {
        stop();
        return;
      }

      const { particles, radius, width: drawingWidth, bottom } = prepared;
      const startedAt = performance.now();
      playedRef.current = true;
      setPlaying(true);

      // Both groups exchange shapes and positions, ending at the original branded layout.
      const paint = (now: number) => {
        if (disposed || !visible || document.hidden || preference.matches) { stop(); return; }
        const elapsed = now - startedAt;
        if (elapsed >= 3400) { stop(); return; }
        context!.clearRect(0, 0, canvas!.width, canvas!.height);
        context!.save();
        context!.beginPath();
        context!.rect(0, 0, drawingWidth, bottom);
        context!.clip();
        const progress = (elapsed - 200) / 2650;
        for (const particle of particles) {
          const dot = interpolateMorphDot(particle, progress);
          context!.fillStyle = `rgba(${dot.r},${dot.g},${dot.b},${dot.a})`;
          context!.beginPath();
          context!.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
          context!.fill();
        }
        context!.restore();
        frame = requestAnimationFrame(paint);
      };
      frame = requestAnimationFrame(paint);
    }

    function maybeAutoplay() { if (!playedRef.current) play(); }
    function onImageLoad() {
      prepared = undefined;
      maybeAutoplay();
    }
    function onVisibility() { if (document.hidden) stop(); }
    function onPreference() {
      setMotionAllowed(!preference.matches);
      if (preference.matches) stop();
    }

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      if (visible) maybeAutoplay();
      else stop();
    }, { threshold: [0, 0.5] });
    const resize = new ResizeObserver(() => {
      if (root!.clientWidth === width && root!.clientHeight === height) return;
      width = root!.clientWidth;
      height = root!.clientHeight;
      prepared = undefined;
      stop();
    });
    intersection.observe(root);
    resize.observe(root);
    first.addEventListener('load', onImageLoad);
    second.addEventListener('load', onImageLoad);
    document.addEventListener('visibilitychange', onVisibility);
    if (preference.addEventListener) preference.addEventListener('change', onPreference);
    else preference.addListener(onPreference);
    onPreference();
    replayRef.current = play;

    return () => {
      disposed = true;
      stop();
      intersection.disconnect();
      resize.disconnect();
      first.removeEventListener('load', onImageLoad);
      second.removeEventListener('load', onImageLoad);
      document.removeEventListener('visibilitychange', onVisibility);
      if (preference.removeEventListener) preference.removeEventListener('change', onPreference);
      else preference.removeListener(onPreference);
      replayRef.current = () => {};
    };
  }, []);

  return <div ref={rootRef} className="ecosystem-connection" data-morphing={playing}>
    <canvas ref={canvasRef} className="eco-morph-canvas" aria-hidden="true" />
    <div className="eco-brand"><img ref={firstRef} src={brand.logo} width="144" height="144" alt="喜羊羊 XIYANGYANG Logo" loading="lazy" decoding="async" />
      <strong>XIYANGYANG</strong><span>MEME COMMUNITY</span></div>
    <div className="eco-connector"><span />{motionAllowed
      ? <button type="button" className="icon-button eco-morph-control" onClick={() => replayRef.current()}
        disabled={playing} aria-label={playing ? t.logoMorphPlaying : t.replayLogoMorph}
        title={playing ? t.logoMorphPlaying : t.replayLogoMorph}>
        <ArrowLeftRight size={29} strokeWidth={1.5} aria-hidden="true" />
      </button>
      : <span className="eco-static-arrow"><ArrowLeftRight size={29} strokeWidth={1.5} aria-hidden="true" /></span>}<span /></div>
    <div className="eco-brand"><img ref={secondRef} className="pop-logo" src={brand.popLogo} width="144" height="144" alt="POP / Zypher Logo" loading="lazy" decoding="async" />
      <strong>POP</strong><span>ZYPHER ECOSYSTEM</span></div>
  </div>;
}
