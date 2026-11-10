'use client';
// Outreach CRM (sidebar → Outreach): who we reached on which platform, what came back, and what to do next.
// Browser-only rendering; inside the dashboard frame it reports its height (same messages as the Social Media page).
import { useCallback, useEffect, useRef, useState } from 'react';
import '../social/social.css';
import './outreach.css';
import { actionLabel, type Activity, type Prospect, type Settings } from '@/lib/outreach/core';
import { Icon } from '../social/icons';
import { api, ToastHost, useToast } from '../social/ui';
import type { Ctx, Data, LogExtra } from './shared';
import { Dashboard, Pipeline, Prospects, Queue, Report } from './Views';
import { AddProspect, ImportBox, ProspectView } from './ProspectModal';
import { SettingsTab } from './SettingsTab';

type Tab = 'dash' | 'queue' | 'list' | 'pipe' | 'report' | 'settings';
const TABS: [Tab, string, string][] = [['dash', 'Dashboard', 'chart'], ['queue', 'Aajker kaj', 'check'], ['list', 'Prospect', 'users'], ['pipe', 'Pipeline', 'list'], ['report', 'Report', 'chart'], ['settings', 'Settings', 'spark']];

export function OutreachApp({ embed }: { embed?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (embed) {
      document.documentElement.classList.add('sm-embed');
      try { const t = window.parent.document.documentElement.getAttribute('data-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* not same origin */ }
    }
  }, [embed]);
  if (!mounted) return null;
  return <ToastHost><App /></ToastHost>;
}

function App() {
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem('bos_or_tab') as Tab | null; return t && TABS.some(([k]) => k === t) ? t : 'dash'; } catch { return 'dash'; } });
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false); const [importing, setImporting] = useState(false);
  const [f, setF] = useState<Record<string, string>>({});
  const load = useCallback(() => api<Data>('/api/outreach/all').then((d) => { setData(d); setErr(''); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { localStorage.setItem('bos_or_tab', tab); } catch { /* private mode */ } }, [tab]);
  useEffect(() => {
    if (window.parent === window || !root.current) return;
    const el = root.current;
    const send = () => window.parent.postMessage({ bosSocialHeight: el.offsetHeight + 24 }, location.origin);
    const ro = new ResizeObserver(send); ro.observe(el); send();
    return () => ro.disconnect();
  }, [data]);

  if (err) return <div className="sm"><div className="sm-card">Outreach load hoyni: {err} <button className="sm-btn sm" onClick={load}>Abar chesta</button></div></div>;
  if (!data) return <div className="sm"><div className="sm-card muted">Load hocche…</div></div>;

  const put = (p: Prospect) => setData((d) => (d ? { ...d, prospects: d.prospects.some((x) => x.id === p.id) ? d.prospects.map((x) => (x.id === p.id ? p : x)) : [p, ...d.prospects] } : d));
  const log = async (p: Prospect, type: string, platform?: string, extra: LogExtra = {}) => {
    try {
      const r = await api<{ prospect: Prospect; activity: Activity }>('/api/outreach/log', { method: 'POST', json: { prospect: p.id, type, platform, ...extra } });
      setData((d) => (d ? { ...d, prospects: d.prospects.map((x) => (x.id === r.prospect.id ? r.prospect : x)), activities: [...d.activities, r.activity] } : d));
      toast(p.name + ': ' + actionLabel(type, data.settings) + (r.activity.step ? ' (Msg ' + r.activity.step + ')' : '') + ' log hoyeche');
      return r.prospect;
    } catch (e: any) { toast(e.message, 'err'); return null; }
  };
  const move = async (p: Prospect, patch: Partial<Prospect>) => { try { const r = await api<{ prospect: Prospect }>('/api/outreach/prospects/' + p.id, { method: 'PATCH', json: patch }); put(r.prospect); } catch (e: any) { toast(e.message, 'err'); } };
  const c: Ctx = { ...data, log, open: (p) => setOpenId(p.id || null), reload: load };
  const waiting = data.prospects.filter((p) => p.awaiting).length;

  return (
    <div ref={root} className="sm">
      <header className="sm-card sm-head" style={{ padding: '14px 16px' }}>
        <div className="stack" style={{ gap: 2 }}><h1>Outreach</h1><span className="muted xs">{data.prospects.length} prospect · {waiting} jon er uttor baki · kake kobe kothay reach kora hoyeche, reply ar stage</span></div>
        <span className="grow" />
        <button className="sm-btn" onClick={() => setImporting(true)}>Import</button>
        <button className="sm-btn primary" onClick={() => setAdding(true)} style={{ height: 40, padding: '0 18px', fontSize: 14.5 }}><Icon name="plus" />Prospect add</button>
      </header>
      <nav className="sm-seg" role="tablist" style={{ justifySelf: 'start' }}>
        {TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}><Icon name={ic} size={15} />{l}{k === 'queue' && waiting ? <span className="sm-badge" style={{ marginLeft: 4, background: 'var(--bad)', color: '#fff' }}>{waiting}</span> : null}</button>)}
      </nav>
      <div key={tab} className="sm-fade">
        {tab === 'dash' && <Dashboard c={c} />}
        {tab === 'queue' && <Queue c={c} />}
        {tab === 'list' && <Prospects c={c} f={f} setF={setF} onAdd={() => setAdding(true)} onImport={() => setImporting(true)} />}
        {tab === 'pipe' && <Pipeline c={c} f={f} setF={setF} move={move} />}
        {tab === 'report' && <Report c={c} f={f} setF={setF} />}
        {tab === 'settings' && <SettingsTab c={c} onSaved={(s: Settings) => setData((d) => (d ? { ...d, settings: s } : d))} />}
      </div>
      {adding && <AddProspect c={c} onClose={() => setAdding(false)} onSaved={(p) => { put(p); setAdding(false); setOpenId(p.id || null); }} />}
      {importing && <ImportBox onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); setTab('list'); }} />}
      {openId && <ProspectView key={openId} c={c} id={openId} onClose={() => setOpenId(null)} onChanged={put} onDeleted={() => { setData((d) => (d ? { ...d, prospects: d.prospects.filter((x) => x.id !== openId) } : d)); setOpenId(null); }} />}
    </div>
  );
}
