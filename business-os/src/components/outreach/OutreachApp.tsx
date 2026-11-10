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
import { GoalTab, TasksTab, TipsTab, type Go } from './Goals';
import { DEFAULT_GOAL, plan, suggestions, tasksFor } from '@/lib/outreach/plan';

type Tab = 'dash' | 'queue' | 'tasks' | 'goal' | 'list' | 'pipe' | 'report' | 'tips' | 'settings';
const TABS: [Tab, string, string][] = [['dash', 'Dashboard', 'chart'], ['goal', 'Target & Goal', 'spark'], ['tasks', 'Tasks', 'check'], ['queue', 'Today', 'clock'], ['list', 'Prospects', 'users'], ['pipe', 'Pipeline', 'list'], ['report', 'Reports', 'chart'], ['tips', 'Suggestions', 'spark'], ['settings', 'Settings', 'list']];

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

  if (err) return <div className="sm"><div className="sm-card">Outreach could not load: {err} <button className="sm-btn sm" onClick={load}>Try again</button></div></div>;
  if (!data) return <div className="sm"><div className="sm-card muted">Loading…</div></div>;

  const put = (p: Prospect) => setData((d) => (d ? { ...d, prospects: d.prospects.some((x) => x.id === p.id) ? d.prospects.map((x) => (x.id === p.id ? p : x)) : [p, ...d.prospects] } : d));
  const log = async (p: Prospect, type: string, platform?: string, extra: LogExtra = {}) => {
    // the account chosen last time on this platform is remembered, so one-click buttons (Today tab) are counted against it too
    let remembered: string | undefined;
    try { remembered = platform ? (JSON.parse(localStorage.getItem('bos_or_sender') || '{}') as Record<string, string>)[platform] : undefined; } catch { /* private mode */ }
    try {
      const r = await api<{ prospect: Prospect; activity: Activity }>('/api/outreach/log', { method: 'POST', json: { prospect: p.id, type, platform, ...(remembered ? { sender: remembered } : {}), ...extra } });
      setData((d) => (d ? { ...d, prospects: d.prospects.map((x) => (x.id === r.prospect.id ? r.prospect : x)), activities: [...d.activities, r.activity] } : d));
      toast(p.name + ': ' + actionLabel(type, data.settings) + (r.activity.step ? ' (Msg ' + r.activity.step + ')' : '') + ' — logged');
      return r.prospect;
    } catch (e: any) { toast(e.message, 'err'); return null; }
  };
  const move = async (p: Prospect, patch: Partial<Prospect>) => { try { const r = await api<{ prospect: Prospect }>('/api/outreach/prospects/' + p.id, { method: 'PATCH', json: patch }); put(r.prospect); } catch (e: any) { toast(e.message, 'err'); } };
  const bulk = async (ids: string[], patch: Partial<Prospect>) => {
    let ok = 0;
    for (const id of ids) { const cur = data.prospects.find((x) => x.id === id); if (!cur) continue; const body = patch.tags ? { tags: [...new Set([...(cur.tags || []), ...patch.tags])] } : patch; try { const r = await api<{ prospect: Prospect }>('/api/outreach/prospects/' + id, { method: 'PATCH', json: body }); put(r.prospect); ok++; } catch { /* counted below */ } }
    toast(ok + ' updated' + (ok < ids.length ? ' · ' + (ids.length - ok) + ' failed' : ''), ok < ids.length ? 'err' : 'ok');
  };
  // Goal → plan. With a goal set, the per-rep daily targets everywhere (Dashboard team table) come from it instead of the fixed numbers in Settings.
  const raw = data.settings;
  const pl = plan(raw.goal || DEFAULT_GOAL, data.prospects, data.activities, data.today, raw);
  const settings: Settings = pl.active ? { ...raw, targets: { connect: Math.max(1, pl.perRep.connect), msg: Math.max(1, pl.perRep.msg), touch: Math.max(1, pl.perRep.touch) } } : raw;
  const c: Ctx = { ...data, settings, log, open: (p) => setOpenId(p.id || null), reload: load };
  const go: Go = (t, flt) => { if (flt) setF(flt); setTab(t); };
  const openTasks = tasksFor(pl, data.prospects, data.activities, data.today, raw, data.me).filter((t) => (t.kind === 'clear' ? t.target > 0 : t.done < t.target)).length;
  const fixNow = suggestions(pl, data.prospects, data.activities, data.today, raw).filter((t) => t.tone === 'bad').length;
  const waiting = data.prospects.filter((p) => p.awaiting).length;

  return (
    <div ref={root} className="sm or-root">
      <header className="sm-card sm-head" style={{ padding: '14px 16px' }}>
        <div className="stack" style={{ gap: 2 }}><h1>Outreach</h1><span className="muted xs">{data.prospects.length} prospect{data.prospects.length === 1 ? '' : 's'} · {waiting} waiting for our reply · who we reached, where, what came back and what to do next</span></div>
        <span className="grow" />
        <button className="sm-btn" onClick={() => setImporting(true)}>Import</button>
        <button className="sm-btn primary" onClick={() => setAdding(true)} style={{ height: 40, padding: '0 18px', fontSize: 14.5 }}><Icon name="plus" />Add prospect</button>
      </header>
      <nav className="sm-seg" role="tablist" style={{ justifySelf: 'start' }}>
        {TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}><Icon name={ic} size={15} />{l}{k === 'queue' && waiting ? <span className="sm-badge" style={{ marginLeft: 4, background: 'var(--bad)', color: '#fff' }}>{waiting}</span> : null}{k === 'tasks' && openTasks ? <span className="sm-badge" style={{ marginLeft: 4 }}>{openTasks}</span> : null}{k === 'tips' && fixNow ? <span className="sm-badge" style={{ marginLeft: 4, background: 'var(--bad)', color: '#fff' }}>{fixNow}</span> : null}</button>)}
      </nav>
      <div key={tab} className="sm-fade">
        {tab === 'dash' && <Dashboard c={c} goto={(t, flt) => { if (flt) setF(flt); setTab(t); }} />}
        {tab === 'queue' && <Queue c={c} />}
        {tab === 'goal' && <GoalTab c={c} pl={pl} raw={raw} go={go} onSaved={(s: Settings) => setData((d) => (d ? { ...d, settings: s } : d))} />}
        {tab === 'tasks' && <TasksTab c={c} pl={pl} go={go} />}
        {tab === 'tips' && <TipsTab c={c} pl={pl} go={go} />}
        {tab === 'list' && <Prospects c={c} f={f} setF={setF} onAdd={() => setAdding(true)} onImport={() => setImporting(true)} bulk={bulk} />}
        {tab === 'pipe' && <Pipeline c={c} f={f} setF={setF} move={move} />}
        {tab === 'report' && <Report c={c} f={f} setF={setF} />}
        {tab === 'settings' && <SettingsTab c={{ ...c, settings: raw }} onSaved={(s: Settings) => setData((d) => (d ? { ...d, settings: s } : d))} />}
      </div>
      {adding && <AddProspect c={c} onClose={() => setAdding(false)} onSaved={(p) => { put(p); setAdding(false); setOpenId(p.id || null); }} />}
      {importing && <ImportBox onClose={() => setImporting(false)} onDone={() => { setImporting(false); load(); setTab('list'); }} />}
      {openId && <ProspectView key={openId} c={c} id={openId} onClose={() => setOpenId(null)} onChanged={put} onDeleted={() => { setData((d) => (d ? { ...d, prospects: d.prospects.filter((x) => x.id !== openId) } : d)); setOpenId(null); }} />}
    </div>
  );
}
