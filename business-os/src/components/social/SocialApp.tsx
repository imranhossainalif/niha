'use client';
// Social Media (Kids Care → Social Media tab): Calendar · Analytics · Suggestions · Accounts, plus the composer.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Avatar, dateLabel, NetIcon, STATUS, useFrameDialog, type Account, type Post } from './ui';
import { Composer, type Draft } from './Composer';
import { Calendar } from './Calendar';
import { Analytics } from './Analytics';
import { Suggestions } from './Suggestions';
import { Accounts } from './Accounts';

type Tab = 'calendar' | 'analytics' | 'ideas' | 'accounts';
const TABS: [Tab, string][] = [['calendar', 'Calendar'], ['analytics', 'Analytics'], ['ideas', 'Suggestions'], ['accounts', 'Accounts']];

export function SocialApp({ business, canAdmin }: { business: string; canAdmin: boolean }) {
  // browser-only (dates use the viewer's clock, the tab comes from localStorage): nothing is rendered on the server
  const [mounted, setMounted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('calendar');
  useEffect(() => { try { const t = localStorage.getItem('bos_social_tab') as Tab | null; if (t && TABS.some(([k]) => k === t)) setTab(t); } catch { /* private mode */ } setMounted(true); }, []);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [compose, setCompose] = useState<{ initial?: Draft; time?: string } | null>(null);
  const [view, setView] = useState<Post | null>(null);
  const [refresh, setRefresh] = useState(0); const [toast, setToast] = useState('');
  const loadAccounts = useCallback(() => api<{ connected: Account[] }>(`/api/social/${business}/accounts`).then((r) => setAccounts(r.connected)).catch(() => setAccounts([])), [business]);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { if (mounted) try { localStorage.setItem('bos_social_tab', tab); } catch { /* private mode */ } }, [tab, mounted]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 5000); return () => clearTimeout(t); }, [toast]);
  // the legacy dashboard shows this page in an iframe: tell it our height
  // (the content's own height: the page height would include the frame height and only ever grow)
  useEffect(() => {
    if (!mounted || window.parent === window || !root.current) return;
    const el = root.current;
    const send = () => window.parent.postMessage({ bosSocialHeight: el.offsetHeight + 16 }, location.origin);
    const ro = new ResizeObserver(send); ro.observe(el); send();
    return () => ro.disconnect();
  }, [mounted]);
  const nextHour = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d.toISOString(); };
  const open = (p: Post) => (['draft', 'scheduled', 'failed'].includes(p.status) ? setCompose({ initial: p }) : setView(p)); // published/partial: view + retry
  const done = (m: string) => { setCompose(null); setToast(m); setRefresh((x) => x + 1); };

  if (!mounted) return <p className="muted text-sm">Load hocche…</p>;
  return (
    <div ref={root} className="grid gap-3">
      <section className="card flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">{(accounts ?? []).map((a) => <Avatar key={a.id} a={a} size={30} />)}{accounts && !accounts.length && <span className="muted text-sm">Kono account connect kora nai</span>}</div>
        <nav className="flex flex-wrap gap-1">{TABS.map(([k, l]) => <button key={k} className={'btn' + (tab === k ? ' btn-primary' : '')} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCompose({ time: nextHour() })}>＋ Notun post</button>
      </section>
      {toast && <p className="card text-sm" style={{ borderColor: 'var(--accent)' }}>{toast}</p>}
      {tab === 'calendar' && <Calendar business={business} refresh={refresh} onOpen={open} onNew={(day) => setCompose({ time: new Date(day + 'T20:00').toISOString() })} />}
      {tab === 'analytics' && <Analytics business={business} refresh={refresh} />}
      {tab === 'ideas' && <Suggestions business={business} onUse={(d) => setCompose({ initial: d, time: nextHour() })} />}
      {tab === 'accounts' && <Accounts business={business} accounts={accounts ?? []} canAdmin={canAdmin} onChange={loadAccounts} />}
      {compose && accounts && <Composer business={business} accounts={accounts} initial={compose.initial} defaultTime={compose.time} onClose={() => setCompose(null)} onSaved={done} />}
      {view && <PostView p={view} onClose={() => setView(null)} onChanged={(m) => { setView(null); done(m); }} />}
    </div>
  );
}

function PostView({ p, onClose, onChanged }: { p: Post; onClose: () => void; onChanged: (m: string) => void }) {
  const box = useFrameDialog();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [l, c] = STATUS[p.status] ?? [p.status, '#888'];
  const retry = async () => { setBusy(true); try { const r = await api<{ status: string }>('/api/social/posts/' + p.id + '/publish', { method: 'POST' }); onChanged(r.status === 'published' ? 'Post hoye geche ✓' : 'Ekhono kichu jaygay hoyni'); } catch (e) { setErr((e as Error).message); setBusy(false); } };
  const del = async () => { if (!confirm('Calendar theke muchben? (Facebook/Instagram e thaka post page theke nije muchte hobe)')) return; await api('/api/social/posts/' + p.id, { method: 'DELETE' }); onChanged('Muche fela hoyeche'); };
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: 24, overflowY: 'auto' }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="card grid gap-3" style={{ maxWidth: 560, width: '100%' }}>
        <div className="flex items-center justify-between"><b style={{ color: c }}>{l}</b><button className="btn" onClick={onClose}>✕</button></div>
        <span className="muted text-sm">{p.published_at ? 'Publish: ' + dateLabel(p.published_at) : p.scheduled_at ? 'Schedule: ' + dateLabel(p.scheduled_at) : ''}{p.created_by ? ' · ' + p.created_by : ''}</span>
        {p.media[0] && (p.media[0].mime.startsWith('video/') ? <video src={p.media[0].url} controls style={{ width: '100%', borderRadius: 8 }} /> : <img src={p.media[0].url} alt="" style={{ width: '100%', borderRadius: 8 }} />)}
        <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{p.text}</p>
        <div className="grid gap-1">{p.targets.map((t) => <div key={t.account_id} className="flex flex-wrap items-center gap-2 text-sm"><NetIcon net={t.network} /> {t.name} · <b style={{ color: (STATUS[t.status === 'published' ? 'published' : t.status === 'failed' ? 'failed' : 'scheduled'] ?? ['', '#888'])[1] }}>{t.status}</b>{t.permalink && <a className="link" href={t.permalink} target="_blank" rel="noreferrer">dekhun ↗</a>}{t.error && <span style={{ color: '#d64545' }}>{t.error}</span>}</div>)}</div>
        {err && <p className="text-sm" style={{ color: '#d64545' }}>{err}</p>}
        <div className="flex gap-2">{p.targets.some((t) => t.status !== 'published') && <button className="btn btn-primary" disabled={busy} onClick={retry}>Abar chesta korun</button>}<button className="btn" onClick={del}>Calendar theke muchun</button></div>
      </div>
    </div>
  );
}
