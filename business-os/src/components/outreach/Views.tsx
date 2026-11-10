'use client';
// Outreach CRM: Dashboard, Aajker kaj (queues), Prospect list, Pipeline board, Report.
import { useMemo, useState } from 'react';
import { addDays, groupBy, queues, senderUsage, stats, type Counts, type Prospect, type QueueItem } from '@/lib/outreach/core';
import { Empty, Kpi, Seg } from '../social/ui';
import { dmy, opt, Pf, pf, Pill, rate, Sel, short, type Ctx } from './shared';

/* ---------- Dashboard ---------- */
type Range = 'today' | 'yesterday' | '7' | '30' | 'custom';
export function Dashboard({ c }: { c: Ctx }) {
  const s = c.settings;
  const [range, setRange] = useState<Range>('today');
  const [cf, setCf] = useState(addDays(c.today, -6)); const [ct, setCt] = useState(c.today);
  const [from, to] = range === 'today' ? [c.today, c.today] : range === 'yesterday' ? [addDays(c.today, -1), addDays(c.today, -1)] : range === '7' ? [addDays(c.today, -6), c.today] : range === '30' ? [addDays(c.today, -29), c.today] : [cf, ct];
  const st = useMemo(() => stats(c.prospects, c.activities, from, to, s), [c.prospects, c.activities, from, to, s]);
  const usage = useMemo(() => senderUsage(c.activities, c.today, s), [c.activities, c.today, s]);
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1);
  const t = st.total;
  const plats = s.platforms.filter((p) => st.byPlatform[p.id]);
  const reps = Object.entries(st.byRep).sort((a, b) => b[1].touch - a[1].touch);
  const steps = Object.entries(st.steps).map(([k, v]) => ({ k: Number(k), ...v })).sort((a, b) => a.k - b.k);
  const row = (x: Counts) => (<><td className="n">{x.connect}</td><td className="n">{x.accepted}</td><td className="n">{rate(x.accepted, x.connect)}</td><td className="n">{x.msg}</td><td className="n">{x.reply}</td><td className="n">{rate(x.reply, x.msg)}</td><td className="n">{x.positive}</td><td className="n">{x.meeting}</td></>);
  const head = <><th className="n">Follow / request</th><th className="n">Accept / follow back</th><th className="n">Accept %</th><th className="n">Message</th><th className="n">Reply</th><th className="n">Reply %</th><th className="n">Positive</th><th className="n">Meeting</th></>;
  return (
    <div className="sm-grid">
      <div className="row">
        <Seg value={range} onChange={setRange} items={[['today', 'Aaj'], ['yesterday', 'Gotokal'], ['7', '7 din'], ['30', '30 din'], ['custom', 'Nijer tarikh']]} />
        {range === 'custom' && <><input type="date" className="sm-input" style={{ width: 150 }} value={cf} max={ct} onChange={(e) => setCf(e.target.value)} /><input type="date" className="sm-input" style={{ width: 150 }} value={ct} min={cf} max={c.today} onChange={(e) => setCt(e.target.value)} /></>}
        <span className="muted xs">{dmy(from)}{from !== to ? ' → ' + dmy(to) : ''}</span>
      </div>
      <div className="or-kpis">
        <Kpi label="Notun prospect" value={String(st.newProspects)} icon="plus" />
        <Kpi label="Koto jon ke reach" value={String(st.contacted)} icon="users" />
        <Kpi label="Follow / request" value={String(t.connect)} note={'Accept ' + t.accepted + ' · ' + rate(t.accepted, t.connect)} />
        <Kpi label="Message" value={String(t.msg)} icon="send" />
        <Kpi label="Reply" value={String(t.reply)} note={'Reply rate ' + rate(t.reply, t.msg)} icon="comment" />
        <Kpi label="Positive" value={String(t.positive)} />
        <Kpi label="Meeting" value={String(t.meeting)} icon="calendar" />
        <Kpi label="Client (won)" value={String(t.won)} icon="check" />
      </div>
      <section className="sm-card stack">
        <h2>Platform onujayi</h2>
        {plats.length ? <div className="sm-scroll-x"><table className="or-tbl"><thead><tr><th>Platform</th>{head}</tr></thead>
          <tbody>{plats.map((p) => <tr key={p.id}><td><Pf s={s} id={p.id} /></td>{row(st.byPlatform[p.id])}</tr>)}<tr><td><b>Mot</b></td>{row(t)}</tr></tbody></table></div>
          : <p className="muted">Ei shomoy e kono kaj log kora hoyni. Prospect khule "Follow", "Message pathano" button chaplei ekhane ashbe.</p>}
        <p className="muted xs">Accept % = oi shomoy e accept ÷ oi shomoy e pathano request. Reply % = reply ÷ message.</p>
      </section>
      <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <section className="sm-card stack">
          <h2>Kon message e reply ashe</h2>
          {steps.length ? <table className="or-tbl"><thead><tr><th>Dhap</th><th className="n">Pathano</th><th className="n">Er por reply</th><th className="n">Reply %</th></tr></thead>
            <tbody>{steps.map((x) => <tr key={x.k}><td><b>Msg {x.k}{x.k >= 9 ? '+' : ''}</b></td><td className="n">{x.sent}</td><td className="n">{x.replies}</td><td className="n">{rate(x.replies, x.sent)}</td></tr>)}</tbody></table>
            : <p className="muted">Ekhono message log hoyni.</p>}
        </section>
        <section className="sm-card stack">
          <h2>Ke koto korlo</h2>
          {reps.length ? <table className="or-tbl"><thead><tr><th>Rep</th><th className="n">Request</th><th className="n">Message</th><th className="n">Mot touch</th><th className="n">Reply</th><th className="n">Meeting</th></tr></thead>
            <tbody>{reps.map(([k, x]) => <tr key={k}><td><b>{short(k)}</b></td><td className="n">{x.connect}<span className="muted xs"> / {s.targets.connect * days}</span></td><td className="n">{x.msg}<span className="muted xs"> / {s.targets.msg * days}</span></td><td className="n">{x.touch}<span className="muted xs"> / {s.targets.touch * days}</span></td><td className="n">{x.reply}</td><td className="n">{x.meeting}</td></tr>)}</tbody></table>
            : <p className="muted">Ekhono kichu nai.</p>}
          <p className="muted xs">Dhushor shonkha = target (din proti {s.targets.connect} request, {s.targets.msg} message, {s.targets.touch} touch). Settings e bodlano jay.</p>
        </section>
      </div>
      <section className="sm-card stack">
        <h2>Amader account er limit (aaj)</h2>
        {usage.length ? <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>{usage.map((u) => (
          <div key={u.sender.id} className="or-prof">
            <div className="row"><Pf s={s} id={u.sender.platform} /><b>{u.sender.name}</b></div>
            <Meter label="Aaj request" v={u.day_connect} max={u.sender.day_connect} />
            <Meter label="7 din e request" v={u.week_connect} max={u.sender.week_connect} />
            <Meter label="Aaj message" v={u.day_msg} max={u.sender.day_msg} />
          </div>))}</div>
          : <p className="muted">Settings → "Amader account" e nijeder LinkedIn/Instagram ID ar din-er limit boshale ekhane meter dekhabe (account block theke bachte).</p>}
      </section>
    </div>
  );
}
function Meter({ label, v, max }: { label: string; v: number; max?: number }) {
  if (!max) return <div className="row xs"><span className="grow muted">{label}</span><b>{v}</b></div>;
  const r = v / max;
  return <div className="stack" style={{ gap: 3 }}><div className="row xs"><span className="grow muted">{label}</span><b>{v} / {max}</b></div><div className={'or-meter' + (r >= 1 ? ' bad' : r >= 0.8 ? ' warn' : '')}><i style={{ width: Math.min(100, r * 100) + '%' }} /></div></div>;
}

/* ---------- Aajker kaj ---------- */
export function Queue({ c }: { c: Ctx }) {
  const q = useMemo(() => queues(c.prospects, c.today, c.settings), [c.prospects, c.today, c.settings]);
  const [mine, setMine] = useState(false);
  const f = (l: QueueItem[]) => (mine ? l.filter((x) => x.p.owner === c.me) : l);
  const groups: [string, string, QueueItem[], ((i: QueueItem) => { label: string; run: () => void }) | null][] = [
    ['Reply diyeche — uttor din', 'Shobcheye joruri: reply er por joto taratari uttor, toto bhalo.', f(q.replies), null],
    ['Tarikh par hoye geche', 'Next action er tarikh chole geche.', f(q.overdue), null],
    ['Aajker next action', '', f(q.due), null],
    ['Connect hoyeche — prothom message pathan', 'Accept / follow back korche, kintu ekhono message jay ni.', f(q.first_msg), (i) => ({ label: 'Msg 1 pathiyechi', run: () => c.log(i.p, 'msg', i.platform) })],
    ['Follow-up message', c.settings.followup_days + ' din reply nai → porer message.', f(q.followup), (i) => ({ label: 'Follow-up pathiyechi', run: () => c.log(i.p, 'msg', i.platform) })],
    ['Request onek din pending', c.settings.pending_days + '+ din accept kore ni. Tule nile account bhalo thake.', f(q.pending), (i) => ({ label: 'Request tule niyechi', run: () => c.log(i.p, 'withdrawn', i.platform) })],
    ['Thanda hoye jacche', c.settings.cooling_days + '+ din kono jogajog nai (Engaged / Warm / Hot).', f(q.cooling), null],
  ];
  const total = groups.reduce((n, g) => n + g[2].length, 0);
  return (
    <div className="sm-grid">
      <div className="row"><Seg value={mine ? 'me' : 'all'} onChange={(v) => setMine(v === 'me')} items={[['all', 'Shobar'], ['me', 'Shudhu amar']]} small /><span className="muted">{total} ta kaj</span></div>
      {!total && <Empty icon="check" title="Aaj kono baki kaj nai">Prospect add korun, ba prospect er "Next action" e tarikh din — tokhon ekhane ashbe.</Empty>}
      {groups.filter((g) => g[2].length).map(([title, sub, list, act]) => (
        <section key={title} className="sm-card stack">
          <div className="row"><h2>{title}</h2><span className="sm-badge">{list.length}</span><span className="grow" />{sub && <span className="muted xs">{sub}</span>}</div>
          <div className="or-list">{list.slice(0, 60).map((i, n) => { const a = act?.(i); return (
            <div key={i.p.id + (i.platform || '') + n} className="or-item">
              {i.platform && <Pf s={c.settings} id={i.platform} href={i.p.profiles.find((x) => x.platform === i.platform)?.url} />}
              <button className="sm-btn ghost sm" style={{ fontWeight: 700 }} onClick={() => c.open(i.p)}>{i.p.name}</button>
              <span className="muted xs grow">{i.p.company ? i.p.company + ' · ' : ''}{i.why}{i.days ? ' · ' + i.days + ' din' : ''}</span>
              <span className="muted xs">{short(i.p.owner)}</span>
              {a && <button className="sm-btn soft sm" onClick={a.run}>{a.label}</button>}
              <button className="sm-btn sm" onClick={() => c.open(i.p)}>Khulun</button>
            </div>); })}</div>
          {list.length > 60 && <span className="muted xs">Aro {list.length - 60} ta ache.</span>}
        </section>))}
    </div>
  );
}

/* ---------- Prospect list ---------- */
type F = Record<string, string>;
const uniq = (l: (string | undefined)[]) => [...new Set(l.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b));
export function match(p: Prospect, f: F, c: Ctx): boolean {
  const q = (f.q || '').toLowerCase();
  if (q && ![p.name, p.company, p.city, p.country, p.industry, p.email, p.notes, ...(p.tags || []), ...p.profiles.map((x) => x.url)].some((v) => (v || '').toLowerCase().includes(q))) return false;
  if (f.platform && !p.profiles.some((x) => x.platform === f.platform)) return false;
  if (f.connected && !p.profiles.some((x) => x.platform === f.connected && (x.connected || x.back))) return false;
  for (const k of ['source', 'stage', 'reply_status', 'sales_stage', 'industry', 'size', 'role', 'country', 'city', 'owner', 'brand'] as const) if (f[k] && (p[k] || '') !== f[k]) return false;
  if (f.tag && !(p.tags || []).includes(f.tag)) return false;
  for (const cf of c.settings.fields) if (f['cf_' + cf.id] && String(p.custom?.[cf.id] ?? '') !== f['cf_' + cf.id]) return false;
  return true;
}
export function Filters({ c, f, setF }: { c: Ctx; f: F; setF: (f: F) => void }) {
  const s = c.settings, P = c.prospects;
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const plats: [string, string][] = s.platforms.map((x) => [x.id, x.label]);
  const n = Object.entries(f).filter(([k, v]) => v && k !== 'q').length;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row"><input className="sm-input grow" style={{ minWidth: 200 }} placeholder="Khujun: nam, business, city, link, tag…" value={f.q || ''} onChange={(e) => set('q')(e.target.value)} />{n > 0 && <button className="sm-btn sm" onClick={() => setF({ q: f.q || '' })}>Filter muchun ({n})</button>}</div>
      <div className="or-filters">
        <Sel value={f.platform || ''} onChange={set('platform')} items={plats} any="Platform: shob" />
        <Sel value={f.connected || ''} onChange={set('connected')} items={plats} any="Connected: shob" />
        <Sel value={f.source || ''} onChange={set('source')} items={plats} any="Prothom source: shob" />
        <Sel value={f.stage || ''} onChange={set('stage')} items={s.stages.map((x) => [x.id, x.label])} any="Stage: shob" />
        <Sel value={f.reply_status || ''} onChange={set('reply_status')} items={s.reply_statuses.map((x) => [x.id, x.label])} any="Reply: shob" />
        <Sel value={f.sales_stage || ''} onChange={set('sales_stage')} items={s.sales_stages.map((x) => [x.id, x.label])} any="Sales: shob" />
        <Sel value={f.industry || ''} onChange={set('industry')} items={uniq([...s.industries, ...P.map((p) => p.industry)])} any="Industry: shob" />
        <Sel value={f.size || ''} onChange={set('size')} items={uniq([...s.sizes, ...P.map((p) => p.size)])} any="Business size: shob" />
        <Sel value={f.role || ''} onChange={set('role')} items={uniq([...s.roles, ...P.map((p) => p.role)])} any="Role: shob" />
        <Sel value={f.country || ''} onChange={set('country')} items={uniq(P.map((p) => p.country))} any="Country: shob" />
        <Sel value={f.city || ''} onChange={set('city')} items={uniq(P.filter((p) => !f.country || p.country === f.country).map((p) => p.city))} any="City: shob" />
        <Sel value={f.owner || ''} onChange={set('owner')} items={uniq(P.map((p) => p.owner)).map((o) => [o, short(o)])} any="Rep: shob" />
        <Sel value={f.brand || ''} onChange={set('brand')} items={uniq([...s.brands, ...P.map((p) => p.brand)])} any="Amader brand: shob" />
        <Sel value={f.tag || ''} onChange={set('tag')} items={uniq(P.flatMap((p) => p.tags || []))} any="Tag: shob" />
        {s.fields.filter((x) => x.type === 'select').map((x) => <Sel key={x.id} value={f['cf_' + x.id] || ''} onChange={set('cf_' + x.id)} items={x.options || []} any={x.label + ': shob'} />)}
      </div>
    </div>
  );
}
function csvOf(list: Prospect[], c: Ctx) {
  const cols = ['name', 'company', 'role', 'industry', 'size', 'country', 'city', 'website', 'email', 'phone', 'brand', 'source', 'stage', 'reply_status', 'sales_stage', 'owner', 'next_action', 'next_due', 'touches'] as const;
  const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const pl = c.settings.platforms.map((x) => x.id);
  return [[...cols, ...pl, 'tags', 'notes'].join(','), ...list.map((p) => [...cols.map((k) => esc(p[k])), ...pl.map((id) => esc(p.profiles.find((x) => x.platform === id)?.url)), esc((p.tags || []).join('; ')), esc(p.notes)].join(','))].join('\n');
}
export function Prospects({ c, f, setF, onAdd, onImport }: { c: Ctx; f: F; setF: (f: F) => void; onAdd: () => void; onImport: () => void }) {
  const s = c.settings;
  const [lim, setLim] = useState(100);
  const list = useMemo(() => c.prospects.filter((p) => match(p, f, c)).sort((a, b) => (b.last_touch || b.created_at).localeCompare(a.last_touch || a.created_at)), [c, f]);
  const dl = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csvOf(list, c)], { type: 'text/csv' })); a.download = 'outreach-prospects-' + c.today + '.csv'; a.click(); };
  return (
    <div className="sm-grid">
      <section className="sm-card stack">
        <Filters c={c} f={f} setF={setF} />
        <div className="row"><b>{list.length}</b><span className="muted">prospect{list.length !== c.prospects.length ? ' (mot ' + c.prospects.length + ')' : ''}</span><span className="grow" />
          <button className="sm-btn sm" onClick={dl} disabled={!list.length}>CSV download</button><button className="sm-btn sm" onClick={onImport}>Import (CSV / sheet)</button><button className="sm-btn primary sm" onClick={onAdd}>+ Prospect</button></div>
      </section>
      {!c.prospects.length ? <Empty icon="users" title="Ekhono kono prospect nai">"+ Prospect" chepe prothom jon ke add korun, ba Google Sheet theke copy kore "Import" e paste korun.</Empty> : (
        <section className="sm-card" style={{ padding: 0 }}><div className="sm-scroll-x"><table className="or-tbl">
          <thead><tr><th>Prospect</th><th>Platform</th><th>Stage</th><th>Message</th><th>Reply</th><th>Jayga</th><th>Industry · size</th><th>Next action</th><th>Rep</th></tr></thead>
          <tbody>{list.slice(0, lim).map((p) => { const msgs = p.profiles.reduce((n, x) => n + (x.msgs || 0), 0); return (
            <tr key={p.id} className="click" onClick={() => c.open(p)}>
              <td><b>{p.name}</b>{p.awaiting && <span className="sm-badge" style={{ marginLeft: 6, background: 'color-mix(in srgb, var(--bad) 14%, transparent)', color: 'var(--bad)' }}>uttor baki</span>}<div className="muted xs">{[p.company, p.role].filter(Boolean).join(' · ') || '—'}</div></td>
              <td><span className="row" style={{ gap: 4 }}>{p.profiles.map((x, i) => <Pf key={i} s={s} id={x.platform} href={x.url} off={!(x.connected || x.back)}>{x.back ? ' ✓' : x.out ? ' …' : ''}</Pf>)}</span></td>
              <td><Pill o={opt(s.stages, p.stage)} fallback={p.stage} /></td>
              <td>{msgs ? <span className="or-pill">Msg {msgs}</span> : <span className="muted">—</span>}</td>
              <td>{p.reply_status && p.reply_status !== 'none' ? <Pill o={opt(s.reply_statuses, p.reply_status)} fallback={p.reply_status} /> : <span className="muted">—</span>}</td>
              <td>{[p.city, p.country].filter(Boolean).join(', ') || '—'}</td>
              <td>{[p.industry, p.size].filter(Boolean).join(' · ') || '—'}</td>
              <td>{p.next_due ? <span style={{ color: p.next_due < c.today ? 'var(--bad)' : undefined }}>{dmy(p.next_due)} · {p.next_action || '—'}</span> : <span className="muted">{p.next_action || '—'}</span>}</td>
              <td className="muted">{short(p.owner)}</td>
            </tr>); })}</tbody></table></div>
          {list.length > lim && <div style={{ padding: 10, textAlign: 'center' }}><button className="sm-btn sm" onClick={() => setLim(lim + 200)}>Aro dekhun ({list.length - lim})</button></div>}
        </section>)}
      <p className="muted xs">Platform badge: ✓ = accept / follow back korche · … = request pending · halka = ekhono connected na.</p>
    </div>
  );
}

/* ---------- Pipeline ---------- */
export function Pipeline({ c, f, setF, move }: { c: Ctx; f: F; setF: (f: F) => void; move: (p: Prospect, patch: Partial<Prospect>) => void }) {
  const s = c.settings;
  const [mode, setMode] = useState<'stage' | 'sales_stage'>('stage');
  const cols = mode === 'stage' ? s.stages : s.sales_stages;
  const list = useMemo(() => c.prospects.filter((p) => match(p, f, c)), [c, f]);
  return (
    <div className="sm-grid">
      <section className="sm-card stack"><div className="row"><Seg value={mode} onChange={setMode} items={[['stage', 'Shomporko (relationship)'], ['sales_stage', 'Sales']]} /><span className="muted xs">Card e click → khulbe · niche theke stage bodlan</span></div><Filters c={c} f={f} setF={setF} /></section>
      <div className="or-kan">{cols.map((col) => { const items = list.filter((p) => (p[mode] || cols[0].id) === col.id); return (
        <div key={col.id} className="or-col">
          <div className="row"><b style={{ color: col.color }}>{col.label}</b><span className="sm-badge">{items.length}</span></div>
          {items.slice(0, 40).map((p) => (
            <div key={p.id} className="or-kcard" onClick={() => c.open(p)}>
              <b>{p.name}</b><span className="muted xs">{[p.company, p.city].filter(Boolean).join(' · ') || '—'}</span>
              <span className="row" style={{ gap: 4 }}>{p.profiles.slice(0, 3).map((x, i) => <Pf key={i} s={s} id={x.platform} off={!(x.connected || x.back)} />)}</span>
              <select className="sm-input" style={{ height: 28, fontSize: 12 }} value={col.id} onClick={(e) => e.stopPropagation()} onChange={(e) => move(p, { [mode]: e.target.value })}>{cols.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            </div>))}
          {items.length > 40 && <span className="muted xs">+{items.length - 40} aro</span>}
        </div>); })}</div>
    </div>
  );
}

/* ---------- Report ---------- */
const DIMS: [string, string][] = [['city', 'City'], ['country', 'Country'], ['industry', 'Industry'], ['size', 'Business size'], ['role', 'Role'], ['source', 'Prothom source'], ['platform', 'Platform (je je te ache)'], ['connected', 'Connected platform'], ['owner', 'Rep'], ['brand', 'Amader brand'], ['stage', 'Stage'], ['tag', 'Tag']];
export function Report({ c, f, setF }: { c: Ctx; f: F; setF: (f: F) => void }) {
  const s = c.settings;
  const [dim, setDim] = useState('city');
  const dims: [string, string][] = [...DIMS, ...s.fields.filter((x) => x.type === 'select' || x.type === 'check').map((x): [string, string] => ['cf_' + x.id, x.label])];
  const list = useMemo(() => c.prospects.filter((p) => match(p, f, c)), [c, f]);
  const rows = useMemo(() => groupBy(list, (p) => dim === 'platform' ? p.profiles.map((x) => x.platform) : dim === 'connected' ? p.profiles.filter((x) => x.connected || x.back).map((x) => x.platform) : dim === 'tag' ? (p.tags || []) : dim.startsWith('cf_') ? String(p.custom?.[dim.slice(3)] ?? '') : String((p as any)[dim] || '')), [list, dim]);
  const name = (k: string) => (['platform', 'connected', 'source'].includes(dim) ? pf(s, k).label : dim === 'stage' ? opt(s.stages, k)?.label || k : dim === 'owner' ? short(k) : k);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="sm-grid">
      <section className="sm-card stack"><div className="row"><b>Bhag korun:</b><Sel value={dim} onChange={setDim} items={dims} className="sm-input" /><span className="muted xs">{list.length} prospect</span></div><Filters c={c} f={f} setF={setF} /></section>
      <section className="sm-card" style={{ padding: 0 }}>{rows.length ? <div className="sm-scroll-x"><table className="or-tbl">
        <thead><tr><th>{dims.find((d) => d[0] === dim)?.[1]}</th><th style={{ width: '22%' }}></th><th className="n">Prospect</th><th className="n">Reach kora</th><th className="n">Reply</th><th className="n">Reply %</th><th className="n">Positive</th><th className="n">Meeting</th><th className="n">Client</th><th className="n">Value</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.k}><td><b>{name(r.k)}</b></td><td><div className="or-meter"><i style={{ width: (r.n / max) * 100 + '%', background: 'var(--accent)' }} /></div></td><td className="n">{r.n}</td><td className="n">{r.contacted}</td><td className="n">{r.replied}</td><td className="n">{rate(r.replied, r.contacted)}</td><td className="n">{r.positive}</td><td className="n">{r.meeting}</td><td className="n">{r.won}</td><td className="n">{r.value ? r.value.toLocaleString('en-US') : '—'}</td></tr>)}</tbody></table></div>
        : <p className="muted" style={{ padding: 16 }}>Kono data nai.</p>}</section>
      <p className="muted xs">FACT: ei shonkha gulo apnader log kora data theke. Reply % = reply diyeche ÷ jader reach kora hoyeche. Kom prospect er group e % dekhe shiddhanto niben na.</p>
    </div>
  );
}
