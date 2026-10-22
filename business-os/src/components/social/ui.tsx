'use client';
// Small shared pieces for the Social Media screens.
import { useEffect, useRef, type ReactNode } from 'react';

export type Net = 'facebook' | 'instagram';
export type Account = { id: string; network: Net; ext_id: string; page_id: string; name: string; username?: string; picture?: string; followers?: number; business: string };
export type MediaRef = { id: string; url: string; mime: string };
export type Target = { account_id: string; network: Net; name?: string; text?: string; status?: string; ext_post_id?: string; permalink?: string; error?: string };
export type Post = { id: string; version?: number; business: string; status: string; text: string; media: MediaRef[]; link?: string; labels?: string[]; content_type?: string; targets: Target[]; scheduled_at?: string | null; published_at?: string; error?: string; created_by?: string };

export async function api<T = any>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const r = await fetch(url, { ...init, credentials: 'same-origin', headers: init.json !== undefined ? { 'content-type': 'application/json' } : init.headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || j?.message || 'Error ' + r.status);
  return j as T;
}

export const nf = (n: number | null | undefined, d = 0) => (n == null || !isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: d }));
export const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
export const ymdLocal = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const timeLocal = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const dateLabel = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const WEEKDAYS = ['Robi', 'Shom', 'Mongol', 'Budh', 'Brihoshpoti', 'Shukro', 'Shoni'];
export const FORMAT_LABEL: Record<string, string> = { photo: 'Chobi', video: 'Video', reel: 'Reel', carousel: 'Carousel', album: 'Album (onek chobi)', text: 'Shudhu lekha', link: 'Link', other: 'Onnanno' };
export const TYPE_LABEL: Record<string, string> = { product: 'Product', offer: 'Offer', recipe_tips: 'Recipe / tips', education: 'Shekha (education)', testimonial: 'Customer review', behind_scenes: 'Behind the scenes', festival: 'Utshob / din', question_engagement: 'Proshno / engagement', baby_moment: 'Baby moment', announcement: 'Ghoshona', other: 'Onnanno' };
export const STATUS: Record<string, [string, string]> = {
  draft: ['Draft', '#8a9993'], scheduled: ['Schedule kora', '#2f7fd1'], publishing: ['Publish hocche…', '#d99a1e'],
  published: ['Publish hoyeche', '#1f9d6b'], partial: ['Kichu hoyeche', '#d99a1e'], failed: ['Hoyni', '#d64545'],
};

export function NetIcon({ net, size = 18 }: { net: Net | string; size?: number }) {
  const s = { width: size, height: size, borderRadius: size / 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: size * 0.6, flexShrink: 0, fontFamily: 'Arial, sans-serif' } as const;
  return net === 'instagram'
    ? <span title="Instagram" style={{ ...s, background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>◎</span>
    : <span title="Facebook" style={{ ...s, background: '#1877F2' }}>f</span>;
}

export function Avatar({ a, size = 32, on = true }: { a: Account; size?: number; on?: boolean }) {
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, opacity: on ? 1 : 0.35 }}>
      {a.picture ? <img src={a.picture} alt="" width={size} height={size} style={{ borderRadius: size / 2, objectFit: 'cover', width: size, height: size }} />
        : <span style={{ width: size, height: size, borderRadius: size / 2, background: 'var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>{a.name[0]}</span>}
      <span style={{ position: 'absolute', right: -3, bottom: -3 }}><NetIcon net={a.network} size={Math.max(14, size * 0.45)} /></span>
    </span>
  );
}

export function Pill({ children, color }: { children: ReactNode; color?: string }) {
  return <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: color ? color + '22' : 'var(--line)', color: color || 'inherit', whiteSpace: 'nowrap' }}>{children}</span>;
}
export function Label({ k }: { k?: 'FACT' | 'HYPOTHESIS' | string }) {
  if (!k) return null;
  return <Pill color={k === 'FACT' ? '#1f9d6b' : '#8a63d2'}>{k}</Pill>;
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useFrameDialog();
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="card" style={{ width: '100%', maxWidth: wide ? 1100 : 640, position: 'relative' }}>
        <button className="btn" style={{ position: 'absolute', right: 12, top: 12 }} onClick={onClose} aria-label="Bondho">✕</button>
        {children}
      </div>
    </div>
  );
}

export function Tile({ label, value, note, delta }: { label: string; value: string; note?: string; delta?: number | null }) {
  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 2 }}>
      <span className="muted text-xs" style={{ textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      <b style={{ fontSize: 24 }}>{value}{delta != null && <span style={{ fontSize: 12, marginLeft: 6, color: delta >= 0 ? '#1f9d6b' : '#d64545' }}>{delta > 0 ? '+' : ''}{delta}%</span>}</b>
      {note && <span className="muted text-xs">{note}</span>}
    </div>
  );
}

/** Inside the dashboard frame a dialog sits at the frame top: scroll the frame into view and make it tall enough. */
export function useFrameDialog<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (window.parent === window) return;
    const post = (h: number, focus = false) => window.parent.postMessage({ bosSocialDialog: h, ...(focus ? { bosSocialFocus: true } : {}) }, location.origin);
    const el = ref.current; post(el ? el.offsetHeight + 60 : 0, true);
    const ro = el ? new ResizeObserver(() => post(el.offsetHeight + 60)) : null; if (el) ro!.observe(el);
    return () => { ro?.disconnect(); post(0); };
  }, []);
  return ref;
}
