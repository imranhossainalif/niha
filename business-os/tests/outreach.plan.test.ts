import { describe, expect, it } from 'vitest';
import { applyActivity, DEFAULT_SETTINGS as S, mergeSettings, type Activity, type Prospect } from '@/lib/outreach/core';
import { BENCH, funnelRates, history, paceOf, plan, suggestions, tasksFor, workdaysBetween } from '@/lib/outreach/plan';

const WD = [1, 2, 3, 4, 5];
const P = (id: string, o: Partial<Prospect> = {}): Prospect => ({ id, business: 'lrf', name: id, profiles: [{ platform: 'linkedin', url: 'https://linkedin.com/in/' + id }], stage: 'cold', created_at: '2026-10-20T05:00:00.000Z', owner: 'a@x.com', ...o });
const A = (prospect: string, type: string, day: string, o: Partial<Activity> = {}): Activity => ({ business: 'lrf', prospect, type, platform: 'linkedin', at: day + 'T06:00:00.000Z', day, by: 'a@x.com', ...o });
/** Build prospects + log by replaying actions, the same way the server does. */
function world(spec: [string, [string, string, Partial<Activity>?][], Partial<Prospect>?][]) {
  const prospects: Prospect[] = [], acts: Activity[] = [];
  for (const [id, list, extra] of spec) { let p = P(id, extra); for (const [type, day, o] of list) { const r = applyActivity(p, A(id, type, day, o), S); p = r.prospect; acts.push(r.activity); } prospects.push(p); }
  return { prospects, acts };
}

describe('outreach plan: goal → targets', () => {
  it('counts working days', () => {
    expect(workdaysBetween('2026-11-01', '2026-11-30', WD)).toBe(21);
    expect(workdaysBetween('2026-11-07', '2026-11-08', WD)).toBe(0);
  });
  it('with no data the benchmark is used and the goal is divided back through the funnel', () => {
    const pl = plan({ clients: 2, workdays: WD }, [], [], '2026-11-02', S);
    const need = Object.fromEntries(pl.steps.map((x) => [x.key, x.need]));
    expect(need).toEqual({ won: 2, meeting: 4, positive: 10, reply: 25, reach: 125 }); // 2 /0.5 /0.4 /0.4 /0.2
    expect(pl.steps.every((x) => !x.rate || !x.rate.own)).toBe(true);
    expect(pl.wdTotal).toBe(21); expect(pl.wdLeft).toBe(21); expect(pl.wdPassed).toBe(0);
    expect(pl.daily.reach).toBe(Math.ceil(125 / 21));
    expect(pl.toAdd).toBe(125); // the list is empty
    expect(pl.active).toBe(true);
    expect(plan({ clients: 0, workdays: WD }, [], [], '2026-11-02', S).active).toBe(false);
  });
  it('uses the team\'s own rates once the sample is big enough', () => {
    const spec: Parameters<typeof world>[0] = [];
    for (let i = 0; i < 40; i++) spec.push(['p' + i, [['connect', '2026-10-05'], ...(i < 20 ? [['accepted', '2026-10-06'], ['msg', '2026-10-06'], ...(i < 16 ? [['reply', '2026-10-07', { sentiment: i < 8 ? 'positive' : 'not_now' }]] : [])] : [])] as any]);
    const { prospects } = world(spec);
    const r = funnelRates(prospects);
    expect(r.accept).toMatchObject({ own: true, v: 0.5 });
    expect(r.reply).toMatchObject({ own: true, v: 0.4 });
    expect(r.positive).toMatchObject({ own: true, v: 0.5 });
    expect(r.meeting.own).toBe(false); expect(r.meeting.v).toBe(BENCH.meeting);
  });
  it('tracks this month, the pace, and a catch-up target that grows when behind', () => {
    const { prospects, acts } = world([['a', [['connect', '2026-11-02'], ['msg', '2026-11-03']]], ['b', [['connect', '2026-10-30']]]]);
    const pl = plan({ clients: 1, workdays: WD }, prospects, acts, '2026-11-16', S); // 10 of 21 workdays passed
    const reach = pl.steps.find((x) => x.key === 'reach')!;
    expect(reach.done).toBe(1); // October activity is not this month
    expect(reach.need).toBe(65); expect(reach.expected).toBe(31); // 1 → 2 meetings → 5 positive → 13 replies → 65 reached
    expect(paceOf(reach)).toBe('behind');
    expect(pl.daily.reach).toBe(Math.ceil((65 - 1) / 11)); // more than the flat 3/day
    expect(pl.work.find((x) => x.key === 'connect')!.done).toBe(1);
  });
  it('flags a target above the accounts\' safe limit', () => {
    const s = mergeSettings({ senders: [{ id: 's', platform: 'linkedin', name: 'Me', day_connect: 5 }] });
    expect(plan({ clients: 5, workdays: WD }, [], [], '2026-11-02', s).overLimit).toBe(true);
  });
});

describe('outreach plan: tasks', () => {
  const { prospects, acts } = world([
    ['r', [['connect', '2026-11-02'], ['accepted', '2026-11-03'], ['msg', '2026-11-03'], ['reply', '2026-11-09', { sentiment: 'positive' }]]],
    ['f', [['connect', '2026-11-02'], ['accepted', '2026-11-05']]],
    ['t', [['connect', '2026-11-10'], ['like', '2026-11-10']]],
    ['other', [['msg', '2026-11-10', { by: 'b@x.com' }]], { owner: 'b@x.com' }],
    ['fresh', []],
  ]);
  const pl = plan({ clients: 1, workdays: WD }, prospects, acts, '2026-11-10', S);
  it('lists what is waiting and today\'s goal numbers with live progress', () => {
    const t = Object.fromEntries(tasksFor(pl, prospects, acts, '2026-11-10', S).map((x) => [x.id, x]));
    expect(t.replies).toMatchObject({ target: 1, urgent: true });
    expect(t.first.target).toBe(1);
    expect(t.connect).toMatchObject({ done: 1, target: pl.daily.connect, kind: 'count' });
    expect(t.msg.done).toBe(1); expect(t.touch.done).toBe(3); expect(t.reach.done).toBe(2);
  });
  it('per rep: only their prospects and their own actions, against the per-rep share', () => {
    const t = Object.fromEntries(tasksFor(pl, prospects, acts, '2026-11-10', S, 'b@x.com').map((x) => [x.id, x]));
    expect(t.replies).toBeUndefined();
    expect(t.msg).toMatchObject({ done: 1, target: pl.perRep.msg });
    expect(pl.nReps).toBe(2);
  });
  it('no volume targets on a day off or without a goal', () => {
    expect(tasksFor(plan({ clients: 1, workdays: WD }, prospects, acts, '2026-11-08', S), prospects, acts, '2026-11-08', S).some((x) => x.kind === 'count')).toBe(false);
    expect(tasksFor(plan({ clients: 0, workdays: WD }, prospects, acts, '2026-11-10', S), prospects, acts, '2026-11-10', S).some((x) => x.kind === 'count')).toBe(false);
  });
  it('history lists working days only, newest first', () => {
    const h = history(pl, acts, '2026-11-10', S);
    expect(h[0]).toMatchObject({ day: '2026-11-10', connect: 1, msg: 1, touch: 3 });
    expect(h.map((x) => x.day)).not.toContain('2026-11-08');
  });
});

describe('outreach plan: suggestions', () => {
  const titles = (spec: Parameters<typeof world>[0], goal = 0, s = S, today = '2026-11-20') => { const { prospects, acts } = world(spec); return suggestions(plan({ clients: goal, workdays: WD }, prospects, acts, today, s), prospects, acts, today, s); };
  it('says there is nothing to analyse on an empty log', () => {
    const t = titles([]);
    expect(t[0].title).toMatch(/Nothing to analyse/); expect(t.some((x) => /No monthly goal/.test(x.title))).toBe(true);
  });
  it('flags a low accept rate and compares platforms', () => {
    const spec: Parameters<typeof world>[0] = [];
    for (let i = 0; i < 12; i++) spec.push(['l' + i, [['connect', '2026-11-10'], ...(i < 1 ? [['accepted', '2026-11-11']] : [])] as any]);
    for (let i = 0; i < 12; i++) spec.push(['i' + i, [['connect', '2026-11-10', { platform: 'instagram' }], ...(i < 8 ? [['accepted', '2026-11-11', { platform: 'instagram' }]] : [])] as any]);
    const t = titles(spec);
    expect(t.find((x) => /LinkedIn: only 8% of requests/.test(x.title))?.tone).toBe('bad');
    expect(t.some((x) => /Instagram accepts far more often than LinkedIn/.test(x.title))).toBe(true);
    expect(t.some((x) => /Instagram: 67% accept/.test(x.title))).toBe(true);
    expect(t[0].tone).toBe('bad'); // worst first
  });
  it('compares warm and cold first messages', () => {
    const spec: Parameters<typeof world>[0] = [];
    for (let i = 0; i < 10; i++) spec.push(['w' + i, [['comment', '2026-11-10'], ['msg', '2026-11-11'], ...(i < 6 ? [['reply', '2026-11-12', { sentiment: 'positive' }]] : [])] as any]);
    for (let i = 0; i < 10; i++) spec.push(['c' + i, [['msg', '2026-11-11'], ...(i < 1 ? [['reply', '2026-11-12', { sentiment: 'neutral' }]] : [])] as any]);
    const tip = titles(spec).find((x) => x.area === 'Warm-up')!;
    expect(tip.title).toMatch(/Engaging before messaging pays off/); expect(tip.fact).toContain('60%'); expect(tip.fact).toContain('10%');
  });
  it('reads the reply types, templates and lead types', () => {
    const spec: Parameters<typeof world>[0] = [];
    for (let i = 0; i < 24; i++) spec.push(['p' + i, [['msg', '2026-11-10', { template: i % 2 ? 't1' : 't2' }], ...((i % 2 ? i < 14 : i < 2) ? [['reply', '2026-11-12', { sentiment: 'has_agency' }]] : [])] as any, { industry: i % 2 ? 'Roofing' : 'Dental', city: 'Austin' }]);
    const s = mergeSettings({ templates: [{ id: 't1', label: 'Question', text: '' }, { id: 't2', label: 'Pitch', text: '' }] });
    const t = titles(spec, 0, s);
    expect(t.some((x) => /100% of replies say “Has an agency”/.test(x.title))).toBe(true);
    expect(t.some((x) => /“Question” beats “Pitch”/.test(x.title))).toBe(true);
    expect(t.some((x) => /By industry: Roofing replies most, Dental least/.test(x.title))).toBe(true);
  });
  it('warns when replies wait and when the goal is behind; every tip carries a fact and advice', () => {
    const t = titles([['r', [['msg', '2026-11-10'], ['reply', '2026-11-12', { sentiment: 'positive' }]]]], 3);
    expect(t.some((x) => /waited a day or more/.test(x.title))).toBe(true);
    expect(t.some((x) => /Behind on the monthly goal/.test(x.title))).toBe(true);
    expect(t.every((x) => x.fact.length > 5 && x.advice.length > 5)).toBe(true);
  });
});
