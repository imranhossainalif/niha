'use client';
// Outreach CRM: Dashboard, Today (work queues), Prospect list, Pipeline board, Report.
import { useMemo, useState } from 'react';
import { addDays, dayList, groupBy, queues, senderUsage, stats, type Counts, type Prospect, type QueueItem } from '@/lib/outreach/core';
import { api, Empty, Kpi, Label, Seg, useToast } from '../social/ui';
import { BarCell, Funnel, Shares, Trend } from './Charts';
import { dmy, opt, Pf, pf, Pill, rate, Sel, short, type Ctx } from './shared';

const pctNum = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const delta = (now: number, prev: number) => (prev ? Math.round(((now - prev) / prev) * 100) : null);

/* ---------- Dashboard ---------- */
type Range = 'today' | 'yesterday' | '7' | '30' | '90' | 'custom';
export function Dashboard({ c, goto }: { c: Ctx; goto: (tab: 'queue' | 'list' | 'settings', filter?: Record<string, string>) => void }) {
  const s = c.settings;
  const [range, setRange] = useState<Range>('7');
  const [cf, setCf] = useState(addDays(c.today, -6)); const [ct, setCt] = useState(c.today);
  const [from, to] = range === 'today' ? [c.today, c.today] : range === 'yesterday' ? [addDays(c.today, -1), addDays(c.today, -1)] : range === '7' ? [addDays(c.today, -6), c.today] : range === '30' ? [addDays(c.today, -29), c.today] : range === '90' ? [addDays(c.today, -89), c.today] : [cf, ct];
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1);
  const st = useMemo(() => stats(c.prospects, c.activities, from, to, s), [c.prospects, c.activities, from, to, s]);
  const prev = useMemo(() => stats(c.prospects, c.activities, addDays(from, -days), addDays(from, -1), s), [c.prospects, c.activities, from, days, s]);
  const usage = useMemo(() => senderUsage(c.activities, c.today, s), [c.activities, c.today, s]);
  const q = useMemo(() => queues(c.prospects, c.today, s), [c.prospects, c.today, s]);
  // the chart always shows at least two weeks so a single day still has context
  const chartFrom = days >= 14 ? from : addDays(to, -13);
  const chart = useMemo(() => { const st2 = stats(c.prospects, c.activities, chartFrom, to, s); const dl = dayList(chartFrom, to); return { dl, bars: dl.map((d) => st2.byDay[d]?.touch || 0), line: dl.map((d) => st2.byDay[d]?.reply || 0) }; }, [c.prospects, c.activities, chartFrom, to, s]);
  const t = st.total, p = prev.total;
  const plats = s.platforms.filter((x) => st.byPlatform[x.id]).sort((a, b) => st.byPlatform[b.id].touch - st.byPlatform[a.id].touch);
  const reps = Object.entries(st.byRep).sort((a, b) => b[1].touch - a[1].touch);
  const steps = Object.entries(st.steps).map(([k, v]) => ({ k: Number(k), ...v })).sort((a, b) => a.k - b.k);
  const tpls = Object.entries(st.templates).map(([k, v]) => ({ k, name: s.templates.find((x) => x.id === k)?.label || k, ...v })).sort((a, b) => b.sent - a.sent);
  const maxTouch = Math.max(1, ...plats.map((x) => st.byPlatform[x.id].touch));
  const active = c.prospects.filter((x) => x.stage !== 'dnc' && x.sales_stage !== 'won' && x.sales_stage !== 'lost');
  const noNext = active.filter((x) => x.touches && !x.next_due && !x.awaiting).length;

  const alerts: { tone: 'bad' | 'warn' | 'info'; text: string; action?: [string, () => void] }[] = [];
  if (q.replies.length) alerts.push({ tone: 'bad', text: `${q.replies.length} prospect${q.replies.length > 1 ? 's' : ''} replied and are waiting for our answer.`, action: ['Open Today', () => goto('queue')] });
  if (q.overdue.length) alerts.push({ tone: 'bad', text: `${q.overdue.length} next action${q.overdue.length > 1 ? 's are' : ' is'} overdue.`, action: ['Open Today', () => goto('queue')] });
  for (const u of usage) {
    const over = [['requests today', u.day_connect, u.sender.day_connect], ['requests in 7 days', u.week_connect, u.sender.week_connect], ['messages today', u.day_msg, u.sender.day_msg]].find(([, v, m]) => m && (v as number) >= (m as number) * 0.8);
    if (over) alerts.push({ tone: (over[1] as number) >= (over[2] as number) ? 'bad' : 'warn', text: `${u.sender.name} (${pf(s, u.sender.platform).label}) is at ${over[1]} of ${over[2]} ${over[0]}. Slow down to keep the account safe.` });
  }
  for (const x of plats) { const b = st.byPlatform[x.id]; if (b.connect >= 10 && b.accepted / b.connect < 0.2) alerts.push({ tone: 'warn', text: `${x.label}: only ${rate(b.accepted, b.connect)} of requests were accepted in this period. Check targeting and the request note before sending more.` }); }
  if (q.pending.length) alerts.push({ tone: 'info', text: `${q.pending.length} request${q.pending.length > 1 ? 's have' : ' has'} been pending for ${s.pending_days}+ days. Withdraw old ones.`, action: ['Open Today', () => goto('queue')] });
  if (noNext >= 5) alerts.push({ tone: 'info', text: `${noNext} contacted prospects have no next action set.`, action: ['Show them', () => goto('list', { quick: 'nonext' })] });
  const tone = { bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' };

  const head = <><th className="n">Requests</th><th className="n">Accepted</th><th className="n">Accept rate</th><th className="n">Messages</th><th className="n">Replies</th><th className="n">Reply rate</th><th className="n">Positive</th><th className="n">Meetings</th></>;
  const row = (x: Counts, bars = true) => (<>
    <td className="n">{x.connect}</td><td className="n">{x.accepted}</td>
    <td className="n">{bars ? <BarCell value={pctNum(x.accepted, x.connect)} max={100} color="var(--info)">{rate(x.accepted, x.connect)}</BarCell> : rate(x.accepted, x.connect)}</td>
    <td className="n">{x.msg}</td><td className="n">{x.reply}</td>
    <td className="n">{bars ? <BarCell value={pctNum(x.reply, x.msg)} max={100} color="var(--good)">{rate(x.reply, x.msg)}</BarCell> : rate(x.reply, x.msg)}</td>
    <td className="n">{x.positive}</td><td className="n">{x.meeting}</td></>);
  const best = (dim: 'city' | 'industry') => groupBy(c.prospects, (x) => x[dim] || '').filter((g) => g.k !== '—' && g.contacted >= 5).map((g) => ({ ...g, r: g.replied / g.contacted })).sort((a, b) => b.r - a.r).slice(0, 5);
  const bestCity = best('city'), bestInd = best('industry');

  return (
    <div className="sm-grid">
      <div className="row">
        <Seg value={range} onChange={setRange} items={[['today', 'Today'], ['yesterday', 'Yesterday'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['custom', 'Custom']]} />
        {range === 'custom' && <><input type="date" className="sm-input" style={{ width: 150 }} value={cf} max={ct} onChange={(e) => setCf(e.target.value)} /><input type="date" className="sm-input" style={{ width: 150 }} value={ct} min={cf} max={c.today} onChange={(e) => setCt(e.target.value)} /></>}
        <span className="muted xs">{dmy(from)}{from !== to ? ' → ' + dmy(to) : ''} · compared with the {days === 1 ? 'day' : days + ' days'} before</span>
      </div>

      {alerts.length > 0 && (
        <section className="sm-card stack" style={{ gap: 6 }}>
          <h2>Needs attention</h2>
          {alerts.map((a, i) => <div key={i} className="row" style={{ borderLeft: '3px solid ' + tone[a.tone], padding: '4px 0 4px 10px' }}><span className="grow">{a.text}</span>{a.action && <button className="sm-btn sm" onClick={a.action[1]}>{a.action[0]}</button>}</div>)}
        </section>)}

      <div className="or-kpis">
        <Kpi label="New prospects" value={String(st.newProspects)} delta={delta(st.newProspects, prev.newProspects)} icon="plus" />
        <Kpi label="People reached" value={String(st.contacted)} delta={delta(st.contacted, prev.contacted)} icon="users" />
        <Kpi label="Requests sent" value={String(t.connect)} delta={delta(t.connect, p.connect)} note={'Accepted ' + t.accepted + ' · ' + rate(t.accepted, t.connect)} />
        <Kpi label="Messages sent" value={String(t.msg)} delta={delta(t.msg, p.msg)} icon="send" />
        <Kpi label="Replies" value={String(t.reply)} delta={delta(t.reply, p.reply)} note={'Reply rate ' + rate(t.reply, t.msg)} icon="comment" />
        <Kpi label="Positive replies" value={String(t.positive)} delta={delta(t.positive, p.positive)} note={rate(t.positive, t.reply) + ' of replies'} />
        <Kpi label="Meetings" value={String(t.meeting)} delta={delta(t.meeting, p.meeting)} icon="calendar" />
        <Kpi label="Clients won" value={String(t.won)} delta={delta(t.won, p.won)} icon="check" />
      </div>

      <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
        <section className="sm-card stack"><h2>Funnel for this period</h2>
          <Funnel steps={[['Requests', t.connect], ['Accepted', t.accepted], ['First messages', st.steps[1]?.sent || 0], ['People replied', st.repliedPeople], ['Positive', t.positive], ['Meetings', t.meeting], ['Won', t.won]]} />
        </section>
        <section className="sm-card stack"><h2>Daily activity</h2>
          {chart.bars.some((v) => v) || chart.line.some((v) => v) ? <Trend days={chart.dl} bars={chart.bars} line={chart.line} barLabel="Touches" lineLabel="Replies" /> : <p className="muted">Nothing logged in these days yet.</p>}
        </section>
      </div>

      <section className="sm-card stack">
        <h2>By platform</h2>
        {plats.length ? <div className="sm-scroll-x"><table className="or-tbl"><thead><tr><th>Platform</th><th style={{ width: '14%' }}>Share of touches</th>{head}</tr></thead>
          <tbody>{plats.map((x) => <tr key={x.id}><td><Pf s={s} id={x.id} /></td><td><div className="or-meter"><i style={{ width: (st.byPlatform[x.id].touch / maxTouch) * 100 + '%', background: x.color }} /></div></td>{row(st.byPlatform[x.id])}</tr>)}<tr><td><b>Total</b></td><td />{row(t, false)}</tr></tbody></table></div>
          : <p className="muted">Nothing was logged in this period. Open a prospect and press “Follow sent” or “Msg 1 sent” and it shows up here.</p>}
        <p className="muted xs">Accept rate = accepted ÷ requests sent in this period. Reply rate = replies ÷ messages sent in this period.</p>
      </section>

      <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
        <section className="sm-card stack"><h2>Which message gets the reply</h2>
          {steps.length ? <table className="or-tbl"><thead><tr><th>Step</th><th className="n">Sent</th><th className="n">Replies after it</th><th className="n">Reply rate</th></tr></thead>
            <tbody>{steps.map((x) => <tr key={x.k}><td><b>Msg {x.k}{x.k >= 9 ? '+' : ''}</b></td><td className="n">{x.sent}</td><td className="n">{x.replies}</td><td className="n"><BarCell value={pctNum(x.replies, x.sent)} max={100} color="var(--good)">{rate(x.replies, x.sent)}</BarCell></td></tr>)}</tbody></table>
            : <p className="muted">No messages logged yet.</p>}
        </section>
        <section className="sm-card stack"><h2>Template performance</h2>
          {tpls.length ? <table className="or-tbl"><thead><tr><th>Template</th><th className="n">Sent</th><th className="n">Replies</th><th className="n">Reply rate</th></tr></thead>
            <tbody>{tpls.map((x) => <tr key={x.k}><td><b>{x.name}</b></td><td className="n">{x.sent}</td><td className="n">{x.replies}</td><td className="n"><BarCell value={pctNum(x.replies, x.sent)} max={100} color="var(--good)">{rate(x.replies, x.sent)}</BarCell></td></tr>)}</tbody></table>
            : <p className="muted">Add templates in Settings and pick one when logging a message to compare them here.</p>}
        </section>
        <section className="sm-card stack"><h2>What the replies say</h2>
          <Shares items={s.reply_statuses.filter((x) => x.id !== 'none').map((x) => ({ label: x.label, value: st.sentiments[x.id] || 0, color: x.color || '#8A9993' }))} />
        </section>
      </div>

      <section className="sm-card stack">
        <h2>Team</h2>
        {reps.length ? <div className="sm-scroll-x"><table className="or-tbl"><thead><tr><th>Rep</th><th style={{ width: '20%' }}>Touch target</th><th className="n">Requests</th><th className="n">Messages</th><th className="n">Touches</th><th className="n">Replies</th><th className="n">Reply rate</th><th className="n">Meetings</th></tr></thead>
          <tbody>{reps.map(([k, x]) => { const goal = s.targets.touch * days; const r = goal ? x.touch / goal : 0; return (
            <tr key={k}><td><b>{short(k)}</b></td>
              <td><div className={'or-meter' + (r >= 1 ? '' : r >= 0.6 ? ' warn' : ' bad')}><i style={{ width: Math.min(100, r * 100) + '%' }} /></div><span className="muted xs">{x.touch} / {goal}</span></td>
              <td className="n">{x.connect}<span className="muted xs"> / {s.targets.connect * days}</span></td><td className="n">{x.msg}<span className="muted xs"> / {s.targets.msg * days}</span></td><td className="n">{x.touch}</td><td className="n">{x.reply}</td><td className="n">{rate(x.reply, x.msg)}</td><td className="n">{x.meeting}</td></tr>); })}</tbody></table></div>
          : <p className="muted">Nothing yet.</p>}
        <p className="muted xs">Grey numbers are the target for this period ({s.targets.connect} requests, {s.targets.msg} messages, {s.targets.touch} touches per rep per day). {s.goal?.clients ? 'They are worked out from the monthly goal (Target & Goal tab).' : 'Change them in Settings, or set a monthly goal and they are worked out for you.'}</p>
      </section>

      <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
        <section className="sm-card stack"><h2>Pipeline now</h2><span className="muted xs">All {c.prospects.length} prospects by relationship stage.</span>
          <Shares items={s.stages.map((x) => ({ label: x.label, value: c.prospects.filter((y) => y.stage === x.id).length, color: x.color }))} />
        </section>
        <section className="sm-card stack"><h2>Where replies come from <Label k="FACT" /></h2>
          {bestCity.length || bestInd.length ? <div className="sm-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {[['City', bestCity], ['Industry', bestInd]].map(([title, list]) => <div key={title as string} className="stack" style={{ gap: 4 }}><b className="sm-t">{title as string}</b>{(list as typeof bestCity).length ? (list as typeof bestCity).map((g) => <div key={g.k} className="row xs"><span className="grow">{g.k}</span><b>{Math.round(g.r * 100)}%</b><span className="muted">{g.replied}/{g.contacted}</span></div>) : <span className="muted xs">Not enough data.</span>}</div>)}
          </div> : <p className="muted">Shown once a city or industry has at least 5 reached prospects.</p>}
          <span className="muted xs">Reply rate of reached prospects, all time. Small groups can mislead.</span>
        </section>
      </div>

      <section className="sm-card stack">
        <h2>Our account limits (today)</h2>
        {usage.length ? <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))' }}>{usage.map((u) => (
          <div key={u.sender.id} className="or-prof">
            <div className="row"><Pf s={s} id={u.sender.platform} /><b>{u.sender.name}</b></div>
            <Meter label="Requests today" v={u.day_connect} max={u.sender.day_connect} />
            <Meter label="Requests in 7 days" v={u.week_connect} max={u.sender.week_connect} />
            <Meter label="Messages today" v={u.day_msg} max={u.sender.day_msg} />
          </div>))}</div>
          : <div className="row"><span className="muted grow">Add your own LinkedIn / Instagram accounts and their daily limits to see a safety meter here.</span>{c.canAdmin && <button className="sm-btn sm" onClick={() => goto('settings')}>Open Settings</button>}</div>}
      </section>
    </div>
  );
}
function Meter({ label, v, max }: { label: string; v: number; max?: number }) {
  if (!max) return <div className="row xs"><span className="grow muted">{label}</span><b>{v}</b></div>;
  const r = v / max;
  return <div className="stack" style={{ gap: 3 }}><div className="row xs"><span className="grow muted">{label}</span><b>{v} / {max}</b></div><div className={'or-meter' + (r >= 1 ? ' bad' : r >= 0.8 ? ' warn' : '')}><i style={{ width: Math.min(100, r * 100) + '%' }} /></div></div>;
}

/* ---------- Today ---------- */
export function Queue({ c }: { c: Ctx }) {
  const q = useMemo(() => queues(c.prospects, c.today, c.settings), [c.prospects, c.today, c.settings]);
  const [mine, setMine] = useState(false);
  const f = (l: QueueItem[]) => (mine ? l.filter((x) => x.p.owner === c.me) : l);
  const groups: [string, string, QueueItem[], ((i: QueueItem) => { label: string; run: () => void }) | null][] = [
    ['Replied — answer them', 'Most urgent: the faster the answer, the better.', f(q.replies), null],
    ['Overdue', 'The next-action date has passed.', f(q.overdue), null],
    ['Due today', '', f(q.due), null],
    ['Connected — send the first message', 'They accepted or followed back, but no message has gone out yet.', f(q.first_msg), (i) => ({ label: 'Msg 1 sent', run: () => c.log(i.p, 'msg', i.platform) })],
    ['Follow-up message', `No reply for ${c.settings.followup_days}+ days → send the next message.`, f(q.followup), (i) => ({ label: 'Follow-up sent', run: () => c.log(i.p, 'msg', i.platform) })],
    ['Requests pending too long', `Not accepted for ${c.settings.pending_days}+ days. Withdrawing keeps the account healthy.`, f(q.pending), (i) => ({ label: 'Withdrawn', run: () => c.log(i.p, 'withdrawn', i.platform) })],
    ['Going cold', `No contact for ${c.settings.cooling_days}+ days (Engaged / Warm / Hot).`, f(q.cooling), null],
  ];
  const total = groups.reduce((n, g) => n + g[2].length, 0);
  return (
    <div className="sm-grid">
      <div className="row"><Seg value={mine ? 'me' : 'all'} onChange={(v) => setMine(v === 'me')} items={[['all', 'Everyone'], ['me', 'Only mine']]} small /><span className="muted">{total} task{total === 1 ? '' : 's'}</span></div>
      {!total && <Empty icon="check" title="Nothing left for today">Add prospects, or set a date in a prospect’s “Next action” — it will appear here on that day.</Empty>}
      {groups.filter((g) => g[2].length).map(([title, sub, list, act]) => (
        <section key={title} className="sm-card stack">
          <div className="row"><h2>{title}</h2><span className="sm-badge">{list.length}</span><span className="grow" />{sub && <span className="muted xs">{sub}</span>}</div>
          <div className="or-list">{list.slice(0, 60).map((i, n) => { const a = act?.(i); return (
            <div key={i.p.id + (i.platform || '') + n} className="or-item">
              {i.platform && <Pf s={c.settings} id={i.platform} href={i.p.profiles.find((x) => x.platform === i.platform)?.url} />}
              <button className="sm-btn ghost sm" style={{ fontWeight: 700 }} onClick={() => c.open(i.p)}>{i.p.name}</button>
              <span className="muted xs grow">{i.p.company ? i.p.company + ' · ' : ''}{i.why}{i.days ? ' · ' + i.days + (i.days === 1 ? ' day' : ' days') : ''}</span>
              <span className="muted xs">{short(i.p.owner)}</span>
              {a && <button className="sm-btn soft sm" onClick={a.run}>{a.label}</button>}
              <button className="sm-btn sm" onClick={() => c.open(i.p)}>Open</button>
            </div>); })}</div>
          {list.length > 60 && <span className="muted xs">{list.length - 60} more.</span>}
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
  if (f.quick === 'mine' && p.owner !== c.me) return false;
  if (f.quick === 'waiting' && !p.awaiting) return false;
  if (f.quick === 'fresh' && p.touches) return false;
  if (f.quick === 'nonext' && !(p.touches && !p.next_due && !p.awaiting && p.stage !== 'dnc' && p.sales_stage !== 'won' && p.sales_stage !== 'lost')) return false;
  if (f.quick === 'due' && !(p.next_due && p.next_due <= c.today)) return false;
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
      <div className="row"><input className="sm-input grow" style={{ minWidth: 200 }} placeholder="Search name, business, city, link, tag…" value={f.q || ''} onChange={(e) => set('q')(e.target.value)} />{n > 0 && <button className="sm-btn sm" onClick={() => setF({ q: f.q || '' })}>Clear filters ({n})</button>}</div>
      <div className="row">{([['', 'All'], ['mine', 'Mine'], ['waiting', 'Reply waiting'], ['due', 'Due / overdue'], ['fresh', 'Not contacted'], ['nonext', 'No next action']] as [string, string][]).map(([k, l]) => <button key={k} type="button" className="sm-chip plain" aria-pressed={(f.quick || '') === k} onClick={() => set('quick')(k)}>{l}</button>)}</div>
      <div className="or-filters">
        <Sel value={f.platform || ''} onChange={set('platform')} items={plats} any="Platform: any" />
        <Sel value={f.connected || ''} onChange={set('connected')} items={plats} any="Connected on: any" />
        <Sel value={f.source || ''} onChange={set('source')} items={plats} any="First source: any" />
        <Sel value={f.stage || ''} onChange={set('stage')} items={s.stages.map((x) => [x.id, x.label])} any="Stage: any" />
        <Sel value={f.reply_status || ''} onChange={set('reply_status')} items={s.reply_statuses.map((x) => [x.id, x.label])} any="Reply: any" />
        <Sel value={f.sales_stage || ''} onChange={set('sales_stage')} items={s.sales_stages.map((x) => [x.id, x.label])} any="Sales stage: any" />
        <Sel value={f.industry || ''} onChange={set('industry')} items={uniq([...s.industries, ...P.map((p) => p.industry)])} any="Industry: any" />
        <Sel value={f.size || ''} onChange={set('size')} items={uniq([...s.sizes, ...P.map((p) => p.size)])} any="Business size: any" />
        <Sel value={f.role || ''} onChange={set('role')} items={uniq([...s.roles, ...P.map((p) => p.role)])} any="Role: any" />
        <Sel value={f.country || ''} onChange={set('country')} items={uniq(P.map((p) => p.country))} any="Country: any" />
        <Sel value={f.city || ''} onChange={set('city')} items={uniq(P.filter((p) => !f.country || p.country === f.country).map((p) => p.city))} any="City: any" />
        <Sel value={f.owner || ''} onChange={set('owner')} items={uniq(P.map((p) => p.owner)).map((o) => [o, short(o)])} any="Rep: any" />
        <Sel value={f.brand || ''} onChange={set('brand')} items={uniq([...s.brands, ...P.map((p) => p.brand)])} any="Our brand: any" />
        <Sel value={f.tag || ''} onChange={set('tag')} items={uniq(P.flatMap((p) => p.tags || []))} any="Tag: any" />
        {s.fields.filter((x) => x.type === 'select').map((x) => <Sel key={x.id} value={f['cf_' + x.id] || ''} onChange={set('cf_' + x.id)} items={x.options || []} any={x.label + ': any'} />)}
      </div>
    </div>
  );
}
// a cell that starts with = + - @ would run as a formula when the CSV is opened in Excel / Sheets: prefix it
const esc = (v: unknown) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = "'" + t; return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const download = (name: string, text: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); };
function csvOf(list: Prospect[], c: Ctx) {
  const cols = ['name', 'company', 'role', 'industry', 'size', 'country', 'city', 'website', 'email', 'phone', 'brand', 'source', 'stage', 'reply_status', 'sales_stage', 'owner', 'next_action', 'next_due', 'touches'] as const;
  const pl = c.settings.platforms.map((x) => x.id);
  return [[...cols, ...pl, 'tags', 'notes'].join(','), ...list.map((p) => [...cols.map((k) => esc(p[k])), ...pl.map((id) => esc(p.profiles.find((x) => x.platform === id)?.url)), esc((p.tags || []).join('; ')), esc(p.notes)].join(','))].join('\n');
}
const SORTS: [string, string, (a: Prospect, b: Prospect) => number][] = [
  ['recent', 'Latest activity', (a, b) => (b.last_touch || b.created_at).localeCompare(a.last_touch || a.created_at)],
  ['new', 'Newest added', (a, b) => b.created_at.localeCompare(a.created_at)],
  ['due', 'Next action date', (a, b) => (a.next_due || '9999').localeCompare(b.next_due || '9999')],
  ['name', 'Name A–Z', (a, b) => a.name.localeCompare(b.name)],
  ['touch', 'Most touches', (a, b) => (b.touches || 0) - (a.touches || 0)],
];
export function Prospects({ c, f, setF, onAdd, onImport, bulk }: { c: Ctx; f: F; setF: (f: F) => void; onAdd: () => void; onImport: () => void; bulk: (ids: string[], patch: Partial<Prospect>) => Promise<void> }) {
  const s = c.settings;
  const [lim, setLim] = useState(100);
  const [sort, setSort] = useState('recent');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const list = useMemo(() => c.prospects.filter((p) => match(p, f, c)).sort(SORTS.find((x) => x[0] === sort)![2]), [c, f, sort]);
  const shown = list.slice(0, lim);
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const allOn = shown.length > 0 && shown.every((p) => sel.has(p.id!));
  const run = async (patch: Partial<Prospect>) => { await bulk([...sel], patch); setSel(new Set()); };
  const reps = uniq([c.me, ...s.reps, ...c.prospects.map((p) => p.owner)]);
  return (
    <div className="sm-grid">
      <section className="sm-card stack">
        <Filters c={c} f={f} setF={setF} />
        <div className="row"><b>{list.length}</b><span className="muted">prospect{list.length === 1 ? '' : 's'}{list.length !== c.prospects.length ? ' of ' + c.prospects.length : ''}</span><span className="grow" />
          <Sel value={sort} onChange={setSort} items={SORTS.map((x) => [x[0], 'Sort: ' + x[1]])} className="sm-input" />
          <button className="sm-btn sm" onClick={() => download('outreach-prospects-' + c.today + '.csv', csvOf(list, c))} disabled={!list.length}>Download CSV</button><button className="sm-btn sm" onClick={onImport}>Import</button><button className="sm-btn primary sm" onClick={onAdd}>+ Prospect</button></div>
        {sel.size > 0 && (
          <div className="row sm-card flat tint" style={{ padding: 10 }}><b>{sel.size} selected</b>
            <Sel value="" onChange={(v) => v && run({ stage: v })} items={s.stages.map((x) => [x.id, x.label])} any="Set stage…" className="sm-input" />
            <Sel value="" onChange={(v) => v && run({ owner: v })} items={reps.map((r) => [r, short(r)])} any="Assign rep…" className="sm-input" />
            <Sel value="" onChange={(v) => v && run({ brand: v })} items={s.brands} any="Set brand…" className="sm-input" />
            <button className="sm-btn sm" onClick={() => { const t = prompt('Tag to add to the selected prospects'); if (t?.trim()) run({ tags: [t.trim()] }); }}>Add tag</button>
            <span className="grow" /><button className="sm-btn ghost sm" onClick={() => setSel(new Set())}>Clear selection</button></div>)}
      </section>
      {!c.prospects.length ? <Empty icon="users" title="No prospects yet">Press “+ Prospect” to add the first one, or copy rows from a Google Sheet and paste them into “Import”.</Empty> : (
        <section className="sm-card" style={{ padding: 0 }}><div className="sm-scroll-x"><table className="or-tbl">
          <thead><tr><th style={{ width: 28 }}><input type="checkbox" aria-label="Select all shown" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((p) => p.id!)))} /></th><th>Prospect</th><th>Platforms</th><th>Stage</th><th>Messages</th><th>Reply</th><th>Location</th><th>Industry · size</th><th>Next action</th><th>Last touch</th><th>Rep</th></tr></thead>
          <tbody>{shown.map((p) => { const msgs = p.profiles.reduce((n, x) => n + (x.msgs || 0), 0); return (
            <tr key={p.id} className="click" onClick={() => c.open(p)}>
              <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={'Select ' + p.name} checked={sel.has(p.id!)} onChange={() => toggle(p.id!)} /></td>
              <td><b>{p.name}</b>{p.awaiting && <span className="sm-badge" style={{ marginLeft: 6, background: 'color-mix(in srgb, var(--bad) 14%, transparent)', color: 'var(--bad)' }}>reply waiting</span>}<div className="muted xs">{[p.company, p.role].filter(Boolean).join(' · ') || '—'}</div></td>
              <td><span className="row" style={{ gap: 4 }}>{p.profiles.map((x, i) => <Pf key={i} s={s} id={x.platform} href={x.url} off={!(x.connected || x.back)}>{x.back ? ' ✓' : x.out ? ' …' : ''}</Pf>)}</span></td>
              <td><Pill o={opt(s.stages, p.stage)} fallback={p.stage} /></td>
              <td>{msgs ? <span className="or-pill">Msg {msgs}</span> : <span className="muted">—</span>}</td>
              <td>{p.reply_status && p.reply_status !== 'none' ? <Pill o={opt(s.reply_statuses, p.reply_status)} fallback={p.reply_status} /> : <span className="muted">—</span>}</td>
              <td>{[p.city, p.country].filter(Boolean).join(', ') || '—'}</td>
              <td>{[p.industry, p.size].filter(Boolean).join(' · ') || '—'}</td>
              <td>{p.next_due ? <span style={{ color: p.next_due < c.today ? 'var(--bad)' : undefined }}>{dmy(p.next_due)} · {p.next_action || '—'}</span> : <span className="muted">{p.next_action || '—'}</span>}</td>
              <td className="muted">{dmy(p.last_touch)}</td>
              <td className="muted">{short(p.owner)}</td>
            </tr>); })}</tbody></table></div>
          {list.length > lim && <div style={{ padding: 10, textAlign: 'center' }}><button className="sm-btn sm" onClick={() => setLim(lim + 200)}>Show more ({list.length - lim})</button></div>}
        </section>)}
      <p className="muted xs">Platform badge: ✓ = accepted / followed back · … = request pending · faded = not connected yet.</p>
    </div>
  );
}

/* ---------- Pipeline ---------- */
export function Pipeline({ c, f, setF, move }: { c: Ctx; f: F; setF: (f: F) => void; move: (p: Prospect, patch: Partial<Prospect>) => void }) {
  const s = c.settings;
  const [mode, setMode] = useState<'stage' | 'sales_stage'>('stage');
  const [drag, setDrag] = useState<string | null>(null); const [over, setOver] = useState<string | null>(null);
  const cols = mode === 'stage' ? s.stages : s.sales_stages;
  const list = useMemo(() => c.prospects.filter((p) => match(p, f, c)), [c, f]);
  // a stage that was deleted in Settings must not make its prospects vanish from the board: they sit in the first column
  const colOf = (p: Prospect) => (cols.some((x) => x.id === p[mode]) ? (p[mode] as string) : cols[0].id);
  const drop = (col: string) => { const p = c.prospects.find((x) => x.id === drag); if (p && colOf(p) !== col) move(p, { [mode]: col }); setDrag(null); setOver(null); };
  return (
    <div className="sm-grid">
      <section className="sm-card stack"><div className="row"><Seg value={mode} onChange={setMode} items={[['stage', 'Relationship'], ['sales_stage', 'Sales']]} /><span className="muted xs">Drag a card to another column, or click it to open.</span></div><Filters c={c} f={f} setF={setF} /></section>
      <div className="or-kan">{cols.map((col) => { const items = list.filter((p) => colOf(p) === col.id); const value = items.reduce((n, p) => n + (p.deal_value || 0), 0); return (
        <div key={col.id} className="or-col" style={over === col.id ? { outline: '2px dashed var(--accent)' } : undefined} onDragOver={(e) => { e.preventDefault(); setOver(col.id); }} onDragLeave={() => setOver(null)} onDrop={() => drop(col.id)}>
          <div className="row"><b style={{ color: col.color }}>{col.label}</b><span className="sm-badge">{items.length}</span>{mode === 'sales_stage' && value > 0 && <span className="muted xs">{value.toLocaleString('en-US')}</span>}</div>
          {items.slice(0, 40).map((p) => (
            <div key={p.id} className="or-kcard" draggable onDragStart={() => setDrag(p.id!)} onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => c.open(p)}>
              <b>{p.name}{p.awaiting ? ' •' : ''}</b><span className="muted xs">{[p.company, p.city].filter(Boolean).join(' · ') || '—'}</span>
              <span className="row" style={{ gap: 4 }}>{p.profiles.slice(0, 3).map((x, i) => <Pf key={i} s={s} id={x.platform} off={!(x.connected || x.back)} />)}</span>
              <select className="sm-input" style={{ height: 28, fontSize: 12 }} aria-label="Move to" value={colOf(p)} onClick={(e) => e.stopPropagation()} onChange={(e) => move(p, { [mode]: e.target.value })}>{cols.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            </div>))}
          {items.length > 40 && <span className="muted xs">+{items.length - 40} more</span>}
        </div>); })}</div>
    </div>
  );
}

/* ---------- Report ---------- */
const DIMS: [string, string][] = [['city', 'City'], ['country', 'Country'], ['industry', 'Industry'], ['size', 'Business size'], ['role', 'Role'], ['source', 'First source'], ['platform', 'Platform (has a profile)'], ['connected', 'Connected platform'], ['owner', 'Rep'], ['brand', 'Our brand'], ['stage', 'Stage'], ['tag', 'Tag']];
type Row = ReturnType<typeof groupBy>[number];
const COLS: [string, string, (r: Row) => number, ((r: Row) => string)?][] = [
  ['n', 'Prospects', (r) => r.n], ['contacted', 'Reached', (r) => r.contacted], ['connected', 'Connected', (r) => r.connected], ['replied', 'Replied', (r) => r.replied],
  ['rr', 'Reply rate', (r) => pctNum(r.replied, r.contacted), (r) => rate(r.replied, r.contacted)], ['positive', 'Positive', (r) => r.positive], ['meeting', 'Meetings', (r) => r.meeting],
  ['mr', 'Meeting rate', (r) => pctNum(r.meeting, r.contacted), (r) => rate(r.meeting, r.contacted)], ['won', 'Clients', (r) => r.won], ['value', 'Value', (r) => r.value, (r) => (r.value ? r.value.toLocaleString('en-US') : '—')],
];
export function Report({ c, f, setF }: { c: Ctx; f: F; setF: (f: F) => void }) {
  const s = c.settings;
  const [dim, setDim] = useState('city');
  const [sort, setSort] = useState('n'); const [min, setMin] = useState('1');
  const [af, setAf] = useState(''); const [at, setAt] = useState('');
  const dims: [string, string][] = [...DIMS, ...s.fields.filter((x) => x.type === 'select' || x.type === 'check').map((x): [string, string] => ['cf_' + x.id, x.label])];
  const list = useMemo(() => c.prospects.filter((p) => match(p, f, c) && (!af || p.created_at.slice(0, 10) >= af) && (!at || p.created_at.slice(0, 10) <= at)), [c, f, af, at]);
  const all = useMemo(() => groupBy(list, () => 'all')[0], [list]);
  const key = (p: Prospect) => dim === 'platform' ? p.profiles.map((x) => x.platform) : dim === 'connected' ? p.profiles.filter((x) => x.connected || x.back).map((x) => x.platform) : dim === 'tag' ? (p.tags || []) : dim.startsWith('cf_') ? String(p.custom?.[dim.slice(3)] ?? '') : String((p as any)[dim] || '');
  const col = COLS.find((x) => x[0] === sort)!;
  const rows = useMemo(() => groupBy(list, key).filter((r) => r.n >= Number(min)).sort((a, b) => col[2](b) - col[2](a)), [list, dim, min, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = (k: string) => (['platform', 'connected', 'source'].includes(dim) ? pf(s, k).label : dim === 'stage' ? opt(s.stages, k)?.label || k : dim === 'owner' ? short(k) : k);
  const maxOf = (fn: (r: Row) => number) => Math.max(1, ...rows.map(fn));
  const solid = rows.filter((r) => r.k !== '—' && r.contacted >= 5).map((r) => ({ ...r, rr: r.replied / r.contacted })).sort((a, b) => b.rr - a.rr);
  const dimName = dims.find((d) => d[0] === dim)?.[1] || dim;
  const csv = () => download('outreach-report-' + dim + '-' + c.today + '.csv', [[dimName, ...COLS.map((x) => x[1])].join(','), ...rows.map((r) => [esc(name(r.k)), ...COLS.map((x) => esc(x[3] ? x[3](r) : x[2](r)))].join(','))].join('\n'));
  return (
    <div className="sm-grid">
      <section className="sm-card stack">
        <div className="row"><b>Group by</b><Sel value={dim} onChange={setDim} items={dims} className="sm-input" /><Sel value={min} onChange={setMin} items={[['1', 'All groups'], ['3', 'Groups of 3+'], ['5', 'Groups of 5+'], ['10', 'Groups of 10+']]} className="sm-input" />
          <label className="row xs muted" style={{ gap: 4 }}>Added from<input type="date" className="sm-input" style={{ width: 150 }} value={af} onChange={(e) => setAf(e.target.value)} /></label><label className="row xs muted" style={{ gap: 4 }}>to<input type="date" className="sm-input" style={{ width: 150 }} value={at} onChange={(e) => setAt(e.target.value)} /></label>
          <span className="grow" /><button className="sm-btn sm" disabled={!rows.length} onClick={csv}>Download CSV</button></div>
        <Filters c={c} f={f} setF={setF} />
      </section>
      {!all ? <Empty icon="chart" title="No prospects match">Change the filters or add prospects first.</Empty> : (<>
        <div className="or-kpis">
          <Kpi label="Prospects" value={String(all.n)} />
          <Kpi label="Reached" value={String(all.contacted)} note={rate(all.contacted, all.n) + ' of prospects'} />
          <Kpi label="Connected" value={String(all.connected)} note={rate(all.connected, all.contacted) + ' of reached'} />
          <Kpi label="Replied" value={String(all.replied)} note={'Reply rate ' + rate(all.replied, all.contacted)} />
          <Kpi label="Positive" value={String(all.positive)} note={rate(all.positive, all.replied) + ' of replies'} />
          <Kpi label="Meetings" value={String(all.meeting)} note={rate(all.meeting, all.contacted) + ' of reached'} />
          <Kpi label="Clients" value={String(all.won)} note={all.value ? 'Value ' + all.value.toLocaleString('en-US') : rate(all.won, all.meeting) + ' of meetings'} />
        </div>
        <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))' }}>
          <section className="sm-card stack"><h2>Funnel (these prospects)</h2><Funnel steps={[['Prospects', all.n], ['Reached', all.contacted], ['Connected', all.connected], ['Replied', all.replied], ['Positive', all.positive], ['Meetings', all.meeting], ['Clients', all.won]]} /></section>
          <section className="sm-card stack"><h2>What stands out <Label k="FACT" /></h2>
            {solid.length >= 2 ? <>
              <p><b>Best reply rate by {dimName.toLowerCase()}:</b> {name(solid[0].k)} — {Math.round(solid[0].rr * 100)}% ({solid[0].replied} of {solid[0].contacted} reached).</p>
              <p><b>Lowest:</b> {name(solid[solid.length - 1].k)} — {Math.round(solid[solid.length - 1].rr * 100)}% ({solid[solid.length - 1].replied} of {solid[solid.length - 1].contacted} reached).</p>
              <p><b>Most prospects:</b> {name([...rows].sort((a, b) => b.n - a.n)[0].k)} ({[...rows].sort((a, b) => b.n - a.n)[0].n}).</p>
              <p className="muted xs">Only groups with at least 5 reached prospects are compared. <Label k="HYPOTHESIS" /> A higher reply rate may come from the message or the rep, not the {dimName.toLowerCase()} itself — test before shifting effort.</p>
            </> : <p className="muted">Needs at least two {dimName.toLowerCase()} groups with 5+ reached prospects each to compare.</p>}
          </section>
        </div>
        <section className="sm-card" style={{ padding: 0 }}>{rows.length ? <div className="sm-scroll-x"><table className="or-tbl">
          <thead><tr><th>{dimName}</th>{COLS.map((x) => <th key={x[0]} className="n" style={{ cursor: 'pointer', color: sort === x[0] ? 'var(--accent)' : undefined }} onClick={() => setSort(x[0])} title="Sort by this column">{x[1]}{sort === x[0] ? ' ↓' : ''}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.k} className={['city', 'country', 'industry', 'size', 'role', 'owner', 'brand', 'stage', 'source'].includes(dim) && r.k !== '—' ? 'click' : ''} onClick={() => { if (['city', 'country', 'industry', 'size', 'role', 'owner', 'brand', 'stage', 'source'].includes(dim) && r.k !== '—') setF({ ...f, [dim]: r.k }); }}>
            <td><b>{name(r.k)}</b></td>{COLS.map((x) => <td key={x[0]} className="n">{x[0] === 'n' || x[0] === 'rr' || x[0] === 'mr' ? <BarCell value={x[2](r)} max={x[0] === 'n' ? maxOf(x[2]) : 100} color={x[0] === 'n' ? 'var(--accent)' : 'var(--good)'}>{x[3] ? x[3](r) : x[2](r)}</BarCell> : x[3] ? x[3](r) : x[2](r)}</td>)}</tr>)}</tbody></table></div>
          : <p className="muted" style={{ padding: 16 }}>No groups of this size.</p>}</section>
        <p className="muted xs">Click a column title to sort. Click a row to filter everything to that group. Reply rate and meeting rate are out of reached prospects.</p>
      </>)}
    </div>
  );
}
