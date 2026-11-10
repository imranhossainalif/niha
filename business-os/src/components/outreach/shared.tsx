'use client';
// Shared bits of the Outreach CRM screens: the data bundle, small badges and formatters.
import type { ReactNode } from 'react';
import type { Activity, Prospect, Settings } from '@/lib/outreach/core';

export type Data = { prospects: Prospect[]; activities: Activity[]; settings: Settings; today: string; me: string; canAdmin: boolean };
export type LogExtra = { sender?: string; note?: string; sentiment?: string; template?: string; at?: string; next_action?: string; next_due?: string };
export type Ctx = Data & {
  log: (p: Prospect, type: string, platform?: string, extra?: LogExtra) => Promise<Prospect | null>;
  open: (p: Prospect) => void;
  reload: () => void;
};

export const pf = (s: Settings, id?: string) => s.platforms.find((x) => x.id === id) || { id: id || 'other', label: id || '—', color: '#5F7A74', connect: 'Connect', back: 'Connect back' };
export const opt = (list: { id: string; label: string; color?: string }[], id?: string) => list.find((x) => x.id === id);
export const rate = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');
export const short = (email?: string) => (email || '—').split('@')[0];
export const dmy = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—');

export function Pf({ s, id, href, off, children }: { s: Settings; id?: string; href?: string; off?: boolean; children?: ReactNode }) {
  const x = pf(s, id); const cls = 'or-pf' + (off ? ' off' : '');
  const url = href && !/^https?:\/\//i.test(href) && href.includes('.') ? 'https://' + href : href;
  return url && /^https?:\/\//i.test(url) ? <a className={cls} style={{ background: x.color }} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{x.label}{children} ↗</a>
    : <span className={cls} style={{ background: x.color }}>{x.label}{children}</span>;
}
export function Pill({ o, fallback }: { o?: { label: string; color?: string }; fallback?: string }) {
  if (!o) return fallback ? <span className="or-pill">{fallback}</span> : null;
  return <span className="or-pill" style={o.color ? { background: `color-mix(in srgb, ${o.color} 16%, transparent)`, color: o.color } : undefined}>{o.label}</span>;
}
export const Sel = ({ value, onChange, items, any, className = 'sm-input' }: { value: string; onChange: (v: string) => void; items: (string | [string, string])[]; any?: string; className?: string }) => (
  <select className={className} value={value} onChange={(e) => onChange(e.target.value)}>
    {any != null && <option value="">{any}</option>}
    {items.map((i) => { const [v, l] = typeof i === 'string' ? [i, i] : i; return <option key={v} value={v}>{l}</option>; })}
  </select>
);
