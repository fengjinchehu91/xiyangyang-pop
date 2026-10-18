import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy as CopyIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Copy } from '../content/copy';

export function ExternalLink({ href, children, className = '', label }: {
  href: string; children: ReactNode; className?: string; label?: string;
}) {
  return <a href={href} target="_blank" rel="noopener noreferrer"
    className={className} aria-label={label}>{children}</a>;
}

export function CopyButton({ value, t, label, showLabel = false }: {
  value: string; t: Copy; label?: string; showLabel?: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus('copied');
    } catch { setStatus('failed'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2500);
  }
  return <span className="copy-control">
    <button type="button" className={showLabel ? 'text-button' : 'icon-button'}
      onClick={() => void copy()} aria-label={status === 'copied' ? t.copied : label || t.copy}
      title={label || t.copy}>
      {status === 'copied' ? <Check size={16} /> : <CopyIcon size={16} />}
      {showLabel && <span>{status === 'copied' ? t.copied : label || t.copy}</span>}
    </button>
    <span className={`copy-feedback ${status === 'idle' ? '' : 'visible'}`} role="status">
      {status === 'copied' ? t.copied : status === 'failed' ? t.copyFailed : ''}
    </span>
  </span>;
}

export function SectionHeading({ title, description, english, light = false }: {
  title: string; description?: string; english?: string; light?: boolean;
}) {
  return <div className={`section-heading ${light ? 'on-dark' : ''}`}>
    <div className="heading-line"><h2>{title}</h2>{english && <span className="section-english">{english}</span>}</div>
    {description && <p>{description}</p>}
  </div>;
}

export function TextLink({ href, children, className = '' }: {
  href: string; children: ReactNode; className?: string;
}) {
  return <ExternalLink href={href} className={`text-link ${className}`}>
    {children}<ArrowUpRight size={17} aria-hidden="true" />
  </ExternalLink>;
}
