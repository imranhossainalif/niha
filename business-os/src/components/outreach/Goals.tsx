'use client';
// Outreach CRM: Target & Goal (one monthly number → funnel targets), Tasks (today's list, ticked off automatically from
// what is logged) and Suggestions (what the numbers say to change). All three are calculated live — nothing to maintain.
import { useMemo, useState } from 'react';
import type { Settings } from '@/lib/outreach/core';
import { DEFAULT_GOAL, history, paceOf, suggestions, tasksFor, type Plan, type Step, type Tip } from '@/lib/outreach/plan';
import { api, Empty, Kpi, Label, Seg, useToast } from '../social/ui';
import { dmy, Sel, short, type Ctx } from './shared';

export type Go = (tab: 'queue' | 'list' | 'report' | 'settings' | 'goal' | 'tasks' | 'tips', filter?: Record<string, string>) => void;
const PACE = { done: ['Done', 'var(--good)'], on: ['On pace', 'var(--good)'], slow: ['Slightly behind', 'var(--warn)'], behind: ['Behind', 'var(--bad)'] } as const;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pctText = (v: number) => Math.round(v * 100) + '%';

function Bar({ done, need, expected, color }: { done: number; need: number; expected?: number; color: string }) {
  const w = need ? Math.min(100, (done / need) * 100) : 0;
  return <div style={{ position: 'relative', height: 10, borderRadius: 99, background: 'var(--soft)' }}><div style={{ width: w + '%', height: '100%', borderRadius: 99, background: color, transition: 'width .4s var(--ease)' }} />{expected != null && need > 0 && <i title={'Expected by today: ' + expected} style={{ position: 'absolute', top: -3, bottom: -3, left: Math.min(100, (expected / need) * 100) + '%', width: 2, background: 'var(--fg)', opacity: 0.55 }} />}</div>;
}

/* ---------- Target & Goal ---------- */
export function GoalTab({ c, pl, raw, onSaved, go }: { c: Ctx; pl: Plan; raw: Settings; onSaved: (s: Settings) => void; go: Go }) {
  const toast = useToast();
  const [clients, setClients] = useState(String(raw.goal?.clients || ''));
  const [wd, setWd] = useState<number[]>(raw.goal?.workdays?.length ? raw.goal.workdays : DEFAULT_GOAL.workdays);
  const [busy, setBusy] = useState(false);
  const dirty = Number(clients || 0) !== (raw.goal?.clients || 0) || wd.slice().sort().join() !== (raw.goal?.workdays || DEFAULT_GOAL.workdays).slice().sort().join();
  const save = async () => {
    if (!wd.length) return toast('Pick at least one working day', 'err');
    setBusy(true);
    try { const r = await api<{ settings: Settings }>('/api/outreach/settings', { method: 'PUT', json: { ...raw, goal: { clients: Number(clients) || 0, workdays: wd } } }); onSaved(r.settings); toast('Goal saved — targets and tasks are recalculated'); }
    catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  const row = (st: Step) => { const p = paceOf(st); return (
    <tr key={st.key}><td><b>{st.label}</b>{st.rate && <div className="muted xs">{pctText(st.rate.v)} {st.rateLabel} · {st.rate.own ? <span style={{ color: 'var(--good)' }}>your own rate ({st.rate.n} in sample)</span> : <span style={{ color: 'var(--warn)' }}>assumed (not enough data yet)</span>}</div>}</td>
      <td style={{ width: '32%' }}><Bar done={st.done} need={st.need} expected={st.expected} color={PACE[p][1]} /></td>
      <td className="n"><b>{st.done}</b><span className="muted"> / {st.need}</span></td><td className="n muted">{st.expected}</td><td><span className="or-pill" style={{ color: PACE[p][1] }}>{PACE[p][0]}</span></td></tr>); };
  return (
    <div className="sm-grid">
      <section className="sm-card stack">
        <h2>Monthly goal</h2>
        <span className="muted">Enter one number. The targets below, the daily tasks and the Dashboard team targets are all worked out from it — and they re-calculate every day from what is actually logged.</span>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="or-f">New clients to win this month<input className="sm-input" style={{ width: 200, fontSize: 18, fontWeight: 700 }} type="number" min={0} max={500} disabled={!c.canAdmin} value={clients} placeholder="e.g. 2" onChange={(e) => setClients(e.target.value)} /></label>
          <div className="or-f">Working days<div className="row" style={{ gap: 4 }}>{DAYS.map((d, i) => <button key={d} type="button" className="sm-chip plain" disabled={!c.canAdmin} aria-pressed={wd.includes(i)} onClick={() => setWd(wd.includes(i) ? wd.filter((x) => x !== i) : [...wd, i])}>{d}</button>)}</div></div>
          {c.canAdmin ? <button className="sm-btn primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save goal'}</button> : <span className="muted xs">Only an owner or admin can change the goal.</span>}
        </div>
      </section>
      {!pl.active ? <Empty icon="spark" title="Set a goal to get targets">Enter how many clients you want this month. The system then tells you how many people to reach, how many requests and messages to send per day, and builds the task list.</Empty> : (<>
        <div className="or-kpis">
          <Kpi label="Goal" value={pl.goal.clients + ' client' + (pl.goal.clients === 1 ? '' : 's')} note={dmy(pl.from) + ' → ' + dmy(pl.to)} icon="check" />
          <Kpi label="Workdays left" value={String(pl.wdLeft)} note={pl.wdPassed + ' of ' + pl.wdTotal + ' done'} icon="calendar" />
          <Kpi label="Reach per day" value={String(pl.daily.reach)} note="new people, from today" icon="users" />
          <Kpi label="Requests per day" value={String(pl.daily.connect)} note={pl.overLimit ? '⚠ above safe limit ' + pl.limit : pl.limit ? 'safe limit ' + pl.limit : 'team total'} />
          <Kpi label="Messages per day" value={String(pl.daily.msg)} icon="send" />
          <Kpi label="Touches per day" value={String(pl.daily.touch)} note={pl.nReps > 1 ? pl.perRep.touch + ' per rep (' + pl.nReps + ' active)' : 'team total'} />
        </div>
        <section className="sm-card stack">
          <div className="row"><h2>The path to {pl.goal.clients} client{pl.goal.clients === 1 ? '' : 's'}</h2><span className="grow" /><button className="sm-btn sm" onClick={() => go('tasks')}>Today’s tasks</button></div>
          <div className="sm-scroll-x"><table className="or-tbl"><thead><tr><th>Step</th><th>Progress (line = expected by today)</th><th className="n">Done / needed</th><th className="n">Expected</th><th>Pace</th></tr></thead>
            <tbody>{pl.steps.map(row)}</tbody></table></div>
          <p className="muted xs"><Label k="FACT" /> “Done” counts what was logged this month. <Label k="HYPOTHESIS" /> “Needed” is the goal divided back through the conversion rates shown under each step. Rates marked “assumed” are a starting benchmark (self-reported industry figures, not a promise) and are replaced by your own as soon as enough is logged.</p>
        </section>
        <section className="sm-card stack">
          <h2>Work needed this month</h2>
          <div className="sm-scroll-x"><table className="or-tbl"><thead><tr><th>Activity</th><th>Progress</th><th className="n">Done / needed</th><th className="n">Expected</th><th>Pace</th></tr></thead><tbody>{pl.work.map(row)}</tbody></table></div>
          <p className="muted xs">Assumes one public engagement and one request per person, {pctText(pl.rates.accept.v)} of requests accepted ({pl.rates.accept.own ? 'your rate' : 'assumed'}) and {pl.rates.msgsPerPerson.toFixed(1)} messages per connected person.</p>
          {pl.toAdd > 0 && <div className="sm-warn">The list is too short for this goal: {pl.fresh} prospects have not been contacted yet, {pl.steps[0].need - pl.steps[0].done} more people must be reached. Add about <b>{pl.addPerDay} new prospects per workday</b>. <button className="sm-btn sm" onClick={() => go('list')}>Open Prospects</button></div>}
          {pl.overLimit && <div className="sm-warn err">The catch-up target ({pl.daily.connect} requests/day) is above the safe limit of your accounts ({pl.limit}/day). Add a sending account, lower the goal, or improve the accept and reply rates.</div>}
        </section>
      </>)}
    </div>
  );
}

/* ---------- Tasks ---------- */
export function TasksTab({ c, pl, go }: { c: Ctx; pl: Plan; go: Go }) {
  const reps = useMemo(() => [...new Set([c.me, ...pl.reps, ...c.prospects.map((p) => p.owner || '')].filter(Boolean))], [c.me, c.prospects, pl.reps]);
  const [who, setWho] = useState<string>('team');
  const rep = who === 'team' ? '' : who;
  const tasks = useMemo(() => tasksFor(pl, c.prospects, c.activities, c.today, c.settings, rep), [pl, c.prospects, c.activities, c.today, c.settings, rep]);
  const hist = useMemo(() => history(pl, c.activities, c.today, c.settings, rep), [pl, c.activities, c.today, c.settings, rep]);
  const tg = rep ? pl.perRep : pl.daily;
  const open = tasks.filter((t) => (t.kind === 'clear' ? t.target > 0 : t.done < t.target));
  const doneN = tasks.length - open.length;
  const cell = (v: number, t: number) => <td className="n" style={{ color: !pl.active || !t ? undefined : v >= t ? 'var(--good)' : v >= t * 0.6 ? 'var(--warn)' : 'var(--bad)', fontWeight: 600 }}>{v}{pl.active && t ? <span className="muted xs" style={{ fontWeight: 400 }}> / {t}</span> : null}</td>;
  return (
    <div className="sm-grid">
      <div className="row"><Sel value={who} onChange={setWho} items={[['team', 'Whole team'], ...reps.map((r): [string, string] => [r, r === c.me ? 'Me (' + short(r) + ')' : short(r)])]} className="sm-input" /><span className="muted">{open.length} open · {doneN} done today</span><span className="grow" />{!pl.active && <button className="sm-btn sm primary" onClick={() => go('goal')}>Set a goal</button>}</div>
      {!pl.active && <div className="sm-card tint">No monthly goal is set, so only the clean-up tasks are listed. Set a goal and the daily numbers (reach, requests, messages) are added automatically.</div>}
      {pl.active && !pl.isWorkday && <div className="sm-card tint">Today is not a working day in the goal settings, so there are no volume targets — only things that are waiting.</div>}
      {!tasks.length ? <Empty icon="check" title="Nothing to do right now">Add prospects or set a goal and tasks appear here by themselves.</Empty> : (
        <section className="sm-card stack">
          <h2>Today · {dmy(c.today)}</h2>
          <div className="or-list">{tasks.map((t) => { const done = t.kind === 'count' && t.done >= t.target; return (
            <div key={t.id} className="or-item" style={{ alignItems: 'flex-start', opacity: done ? 0.6 : 1, borderColor: t.urgent ? 'var(--bad)' : undefined }}>
              <span aria-hidden style={{ width: 22, height: 22, borderRadius: 7, border: '2px solid ' + (done ? 'var(--good)' : 'var(--line)'), background: done ? 'var(--good)' : 'transparent', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, flex: 'none', marginTop: 2 }}>{done ? '✓' : ''}</span>
              <div className="grow stack" style={{ gap: 4, minWidth: 180 }}>
                <b style={{ textDecoration: done ? 'line-through' : undefined }}>{t.title}</b><span className="muted xs">{t.detail}</span>
                {t.kind === 'count' && <div className="row" style={{ flexWrap: 'nowrap' }}><div className="grow"><Bar done={t.done} need={t.target} color={done ? 'var(--good)' : 'var(--accent)'} /></div><span className="xs" style={{ fontVariantNumeric: 'tabular-nums' }}><b>{t.done}</b> / {t.target}</span></div>}
              </div>
              {t.goto && !done && <button className="sm-btn sm" onClick={() => go(t.goto!.tab, t.goto!.quick ? { quick: t.goto!.quick } : undefined)}>Open</button>}
            </div>); })}</div>
          <span className="muted xs">Tasks tick themselves off as actions are logged on prospects. Nothing needs to be checked by hand.</span>
        </section>)}
      <section className="sm-card stack">
        <h2>Last working days</h2>
        <div className="sm-scroll-x"><table className="or-tbl"><thead><tr><th>Day</th><th className="n">Requests</th><th className="n">Messages</th><th className="n">Touches</th><th className="n">Replies</th></tr></thead>
          <tbody>{hist.map((h) => <tr key={h.day}><td><b>{new Date(h.day + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</b>{h.day === c.today ? ' · today' : ''}</td>{cell(h.connect, tg.connect)}{cell(h.msg, tg.msg)}{cell(h.touch, tg.touch)}<td className="n">{h.reply}</td></tr>)}</tbody></table></div>
        <span className="muted xs">{pl.active ? 'Grey numbers are today’s catch-up target (it moves as the month goes on), so earlier days are judged against the current target.' : 'Set a goal to see targets next to these numbers.'}</span>
      </section>
    </div>
  );
}

/* ---------- Suggestions ---------- */
const TONE: Record<Tip['tone'], [string, string]> = { bad: ['Fix now', 'var(--bad)'], warn: ['Improve', 'var(--warn)'], info: ['Insight', 'var(--info)'], good: ['Working', 'var(--good)'] };
export function TipsTab({ c, pl, go }: { c: Ctx; pl: Plan; go: Go }) {
  const tips = useMemo(() => suggestions(pl, c.prospects, c.activities, c.today, c.settings), [pl, c.prospects, c.activities, c.today, c.settings]);
  const [f, setF] = useState<'all' | Tip['tone']>('all');
  const shown = tips.filter((t) => f === 'all' || t.tone === f);
  const n = (k: Tip['tone']) => tips.filter((t) => t.tone === k).length;
  return (
    <div className="sm-grid">
      <div className="row"><Seg value={f} onChange={setF} items={[['all', 'All (' + tips.length + ')'], ['bad', 'Fix now (' + n('bad') + ')'], ['warn', 'Improve (' + n('warn') + ')'], ['info', 'Insights (' + n('info') + ')'], ['good', 'Working (' + n('good') + ')']]} /><span className="muted xs">Recalculated from the last 30 days every time the page opens.</span></div>
      {!shown.length && <Empty icon="spark" title="Nothing in this group" />}
      {shown.map((t, i) => (
        <section key={i} className="sm-card stack" style={{ borderLeft: '4px solid ' + TONE[t.tone][1], gap: 8 }}>
          <div className="row"><span className="or-pill" style={{ color: TONE[t.tone][1] }}>{TONE[t.tone][0]}</span><span className="muted xs" style={{ textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 700 }}>{t.area}</span></div>
          <h3>{t.title}</h3>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><Label k="FACT" /><span>{t.fact}</span></div>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}><Label k="HYPOTHESIS" /><span>{t.advice}</span></div>
          {t.goto && <div><button className="sm-btn sm" onClick={() => go(t.goto!.tab, t.goto!.quick ? { quick: t.goto!.quick } : undefined)}>{({ queue: 'Open Today', list: 'Open Prospects', report: 'Open Reports', settings: 'Open Settings', goal: 'Open Target & Goal' } as const)[t.goto.tab]}</button></div>}
        </section>))}
      <p className="muted xs">How to read this: the FACT line is counted from your own log. The HYPOTHESIS line is a suggestion to test, not a guarantee — small samples can mislead, so groups with too few prospects are left out.</p>
    </div>
  );
}
