'use client';
// Shared pieces for the Social Media screens: types, API helper, avatar, modal, toasts, segmented control, KPI card.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, NetLogo, type Net } from './icons';

export type { Net };
export type Account = { id: string; network: Net; ext_id: string; page_id: string; name: string; username?: string; picture?: string; followers?: number; business: string; error?: string };
export type MediaRef = { id: string; url: string; mime: string };
export type Target = { account_id: string; network: Net; name?: string; text?: string; status?: string; ext_post_id?: string; permalink?: string; error?: string; note?: string };
export type PostOptions = { yt_title?: string; yt_privacy?: 'public' | 'unlisted' | 'private'; yt_kids?: boolean; tt_mode?: 'direct' | 'inbox'; tt_privacy?: string };
export type Post = { id: string; version?: number; business: string; status: string; text: string; media: MediaRef[]; link?: string; labels?: string[]; content_type?: string; targets: Target[]; scheduled_at?: string | null; published_at?: string; error?: string; created_by?: string; options?: PostOptions };

export async function api<T = any>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const r = await fetch(url, { ...init, credentials: 'same-origin', headers: init.json !== undefined ? { 'content-type': 'application/json' } : init.headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || j?.message || 'Error ' + r.status);
  return j as T;
}
/** Upload with progress (fetch can't report upload progress). */
export function upload(file: File, onProgress: (p: number) => void): Promise<MediaRef> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api/social/media'); x.withCredentials = true;
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => { let j: any = {}; try { j = JSON.parse(x.responseText); } catch { /* not json */ } x.status < 300 ? resolve({ id: j.id, url: j.url, mime: j.mime }) : reject(new Error(j?.error?.message || 'Upload hoyni (' + x.status + ')')); };
    x.onerror = () => reject(new Error('Network e shomossa — abar chesta korun'));
    const fd = new FormData(); fd.append('file', file); x.send(fd);
  });
}

export const nf = (n: number | null | undefined, d = 0) => (n == null || !isFinite(n) ? '—' : n.toLocaleString('en-IN', { maximumFractionDigits: d }));
export const compact = (n: number | null | undefined) => (n == null ? '—' : n >= 1e6 ? nf(n / 1e6, 1) + 'M' : n >= 1e4 ? nf(n / 1e3, 1) + 'k' : nf(n));
export const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
export const ymdLocal = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const timeLocal = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const dateLabel = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const ago = (iso?: string | null) => { if (!iso) return 'kokhono na'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'ekhoni' : m < 60 ? m + ' min age' : m < 1440 ? Math.round(m / 60) + ' ghonta age' : Math.round(m / 1440) + ' din age'; };
export const WEEKDAYS = ['Robi', 'Shom', 'Mongol', 'Budh', 'Brihoshpoti', 'Shukro', 'Shoni'];
export const FORMAT_LABEL: Record<string, string> = { photo: 'Chobi', video: 'Video', reel: 'Reel', short: 'Short', carousel: 'Carousel', album: 'Album', text: 'Shudhu lekha', link: 'Link', other: 'Onnanno' };
export const TYPE_LABEL: Record<string, string> = { product: 'Product', offer: 'Offer', recipe_tips: 'Recipe / tips', education: 'Shekha', testimonial: 'Customer review', behind_scenes: 'Behind the scenes', festival: 'Utshob / din', question_engagement: 'Proshno', baby_moment: 'Baby moment', announcement: 'Ghoshona', other: 'Onnanno' };
export const STATUS: Record<string, [string, string]> = {
  draft: ['Draft', '#8A9993'], scheduled: ['Schedule', '#2F6FD1'], publishing: ['Jacche…', '#B8650E'],
  published: ['Post hoyeche', '#0E8A62'], partial: ['Kichu hoyni', '#B8650E'], failed: ['Hoyni', '#C2363F'],
};

export function Avatar({ a, size = 32, ring }: { a: Pick<Account, 'name' | 'picture' | 'network'>; size?: number; ring?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: size, height: size, flex: 'none', borderRadius: '50%', boxShadow: ring ? '0 0 0 2px var(--panel)' : undefined }}>
      {a.picture && !broken ? <img src={a.picture} alt="" width={size} height={size} onError={() => setBroken(true)} style={{ borderRadius: '50%', objectFit: 'cover', width: size, height: size, display: 'block' }} />
        : <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--soft)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.42, color: 'var(--muted)' }}>{(a.name || '?')[0]}</span>}
      <span style={{ position: 'absolute', right: -3, bottom: -3, borderRadius: 6, boxShadow: '0 0 0 2px var(--panel)', display: 'flex' }}><NetLogo net={a.network} size={Math.max(13, Math.round(size * 0.45))} /></span>
    </span>
  );
}

export function Seg<T extends string>({ value, onChange, items, small }: { value: T; onChange: (v: T) => void; items: [T, ReactNode][]; small?: boolean }) {
  return <div className={'sm-seg' + (small ? ' small' : '')} role="group">{items.map(([k, l]) => <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Label({ k }: { k?: string }) {
  if (!k) return null;
  const fact = k === 'FACT';
  return <span className="sm-badge" style={{ background: fact ? 'color-mix(in srgb, var(--good) 14%, transparent)' : 'color-mix(in srgb, #8a63d2 14%, transparent)', color: fact ? 'var(--good)' : '#8a63d2' }}>{k}</span>;
}

export function Kpi({ label, value, delta, note, icon }: { label: string; value: string; delta?: number | null; note?: string; icon?: string }) {
  return (
    <div className="sm-card sm-kpi sm-fade">
      <span className="row muted xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>{icon && <Icon name={icon} size={14} />}{label}</span>
      <span className="row"><span className="v">{value}</span>{delta != null && <span className={'sm-delta ' + (delta >= 0 ? 'up' : 'down')}>{delta > 0 ? '▲' : delta < 0 ? '▼' : ''} {Math.abs(delta)}%</span>}</span>
      {note && <span className="muted xs">{note}</span>}
    </div>
  );
}

export function Empty({ icon = 'spark', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="sm-card sm-fade" style={{ textAlign: 'center', padding: '36px 20px', display: 'grid', gap: 8, justifyItems: 'center' }}>
      <span style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center' }}><Icon name={icon} size={24} /></span>
      <h3>{title}</h3>
      {children && <div className="muted" style={{ maxWidth: 520 }}>{children}</div>}
    </div>
  );
}

export const Skel = ({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) => <div className="sm-skel" style={{ height: h, width: w, borderRadius: r }} />;

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

export function Modal({ onClose, children, width = 640 }: { onClose: () => void; children: ReactNode; width?: number }) {
  const box = useFrameDialog();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="sm-modal-bg" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="sm-modal" style={{ maxWidth: width }}>
        <button type="button" className="sm-btn ghost icon" style={{ position: 'absolute', right: 10, top: 10, zIndex: 3 }} onClick={onClose} aria-label="Bondho"><Icon name="close" /></button>
        {children}
      </div>
    </div>
  );
}

/* toasts */
type ToastFn = (msg: string, kind?: 'ok' | 'err') => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }: { children: ReactNode }) {
  const [list, setList] = useState<{ id: number; msg: string; kind: 'ok' | 'err' }[]>([]);
  const push = useCallback<ToastFn>((msg, kind = 'ok') => {
    // inside the dashboard frame, the dashboard shows it (the frame top may be scrolled away)
    if (window.parent !== window) { window.parent.postMessage({ bosSocialToast: (kind === 'err' ? '⚠ ' : '') + msg }, location.origin); return; }
    const id = Date.now() + Math.random(); setList((l) => [...l, { id, msg, kind }]); setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), kind === 'err' ? 7000 : 4000); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="sm-toasts" aria-live="polite">{list.map((t) => <div key={t.id} className={'sm-toast' + (t.kind === 'err' ? ' err' : '')}><Icon name={t.kind === 'err' ? 'alert' : 'check'} />{t.msg}</div>)}</div></ToastCtx.Provider>;
}
