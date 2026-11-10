import { describe, expect, it } from 'vitest';
import { applyActivity, cleanProspect, DEFAULT_SETTINGS as S, dupKeys, groupBy, mergeSettings, rebuild, normUrl, parseCsv, platformOf, queues, rowToProspect, senderUsage, stats, type Activity, type Prospect } from '@/lib/outreach/core';

const P = (o: Partial<Prospect> = {}): Prospect => ({ id: 'p1', business: 'lrf', name: 'John', profiles: [{ platform: 'linkedin', url: 'https://www.linkedin.com/in/john/' }, { platform: 'instagram', url: 'instagram.com/john' }], stage: 'cold', created_at: '2026-11-01T05:00:00.000Z', ...o });
const A = (type: string, platform: string | undefined, at: string, o: Partial<Activity> = {}): Activity => ({ business: 'lrf', prospect: 'p1', type, platform, at, day: at.slice(0, 10), by: 'niha@x.com', ...o });
function run(p: Prospect, acts: Activity[]) { const out: Activity[] = []; for (const a of acts) { const r = applyActivity(p, a, S); p = r.prospect; out.push(r.activity); } return { p, acts: out }; }

describe('outreach: links', () => {
  it('treats the same profile written differently as one', () => {
    expect(normUrl('https://www.LinkedIn.com/in/john/?utm=1')).toBe('linkedin.com/in/john');
    expect(normUrl('http://m.instagram.com/abc#x')).toBe(normUrl('instagram.com/abc/'));
    expect(normUrl('twitter.com/a')).toBe('x.com/a');
  });
  it('guesses the platform', () => {
    expect(platformOf('https://www.linkedin.com/in/a')).toBe('linkedin');
    expect(platformOf('x.com/a')).toBe('x');
    expect(platformOf('a@b.com')).toBe('email');
    expect(platformOf('https://example.com')).toBe('other');
  });
  it('duplicate keys cover links, email and phone', () => {
    expect(dupKeys({ profiles: [{ platform: 'instagram', url: 'https://instagram.com/J/' }], email: 'A@b.com', phone: '+1 (256) 555-0100' })).toEqual(['instagram.com/j', 'mail:a@b.com', 'tel:2565550100']);
  });
});

describe('outreach: logging an action', () => {
  it('follow → follow back → Msg 1 → Msg 2 → reply moves state and numbers the messages', () => {
    const { p, acts } = run(P(), [
      A('connect', 'instagram', '2026-11-10T04:00:00.000Z'), A('accepted', 'instagram', '2026-11-11T04:00:00.000Z'),
      A('msg', 'instagram', '2026-11-11T05:00:00.000Z'), A('msg', 'instagram', '2026-11-14T05:00:00.000Z'),
      A('reply', 'instagram', '2026-11-15T05:00:00.000Z', { sentiment: 'positive' }),
    ]);
    const ig = p.profiles.find((x) => x.platform === 'instagram')!;
    expect(ig).toMatchObject({ out: '2026-11-10T04:00:00.000Z', back: '2026-11-11T04:00:00.000Z', connected: true, msgs: 2, replies: 1 });
    expect(acts[2].step).toBe(1); expect(acts[3].step).toBe(2); expect(acts[4].after_step).toBe(2);
    expect(p).toMatchObject({ stage: 'warm', reply_status: 'positive', awaiting: true, touches: 3 });
    expect(p.profiles.find((x) => x.platform === 'linkedin')!.msgs).toBeUndefined();
  });
  it('a message after a reply clears "uttor baki"; meeting and won move the sales stage; stage never goes down', () => {
    const { p } = run(P({ stage: 'hot', awaiting: true }), [A('msg', 'linkedin', '2026-11-10T04:00:00.000Z'), A('meeting', undefined, '2026-11-11T04:00:00.000Z'), A('won', undefined, '2026-11-20T04:00:00.000Z')]);
    expect(p).toMatchObject({ awaiting: false, stage: 'hot', sales_stage: 'won' });
  });
  it('logging on a platform the prospect has no profile for adds it; withdrawn clears the request', () => {
    const { p } = run(P({ profiles: [] }), [A('connect', 'x', '2026-11-10T04:00:00.000Z'), A('withdrawn', 'x', '2026-11-25T04:00:00.000Z')]);
    expect(p.profiles).toHaveLength(1); expect(p.profiles[0].out).toBeNull();
  });
  it('custom actions from settings count as touch or message', () => {
    const s = mergeSettings({ actions: [{ id: 'a_story', label: 'Story reply', kind: 'msg' }] });
    const r = applyActivity(P(), A('a_story', 'instagram', '2026-11-10T04:00:00.000Z'), s);
    expect(r.activity.step).toBe(1); expect(r.prospect.touches).toBe(1);
  });
});

describe('outreach: numbers', () => {
  const { p, acts } = run(P(), [
    A('connect', 'linkedin', '2026-11-10T04:00:00.000Z', { sender: 's1' }), A('accepted', 'linkedin', '2026-11-10T09:00:00.000Z'),
    A('msg', 'linkedin', '2026-11-10T10:00:00.000Z', { sender: 's1' }), A('reply', 'linkedin', '2026-11-10T11:00:00.000Z', { sentiment: 'positive' }),
    A('connect', 'instagram', '2026-11-09T04:00:00.000Z'), A('meeting', undefined, '2026-11-10T12:00:00.000Z'),
  ]);
  it('dashboard counts per platform, step and rep for the chosen days only', () => {
    const st = stats([p], acts, '2026-11-10', '2026-11-10', S);
    expect(st.total).toMatchObject({ connect: 1, accepted: 1, msg: 1, reply: 1, positive: 1, meeting: 1, touch: 2 });
    expect(st.byPlatform.linkedin).toMatchObject({ connect: 1, accepted: 1, msg: 1, reply: 1 });
    expect(st.byPlatform.instagram).toBeUndefined();
    expect(st.steps[1]).toEqual({ sent: 1, replies: 1 });
    expect(st.byRep['niha@x.com'].touch).toBe(2);
    expect(st.contacted).toBe(1);
    expect(stats([p], acts, '2026-11-09', '2026-11-10', S).total.connect).toBe(2);
  });
  it('sender usage for today and 7 days', () => {
    const s = mergeSettings({ senders: [{ id: 's1', platform: 'linkedin', name: 'Imran LI', day_connect: 20, week_connect: 100 }] });
    expect(senderUsage(acts, '2026-11-10', s)[0]).toMatchObject({ day_connect: 1, week_connect: 1, day_msg: 1 });
    expect(senderUsage(acts, '2026-11-12', s)[0]).toMatchObject({ day_connect: 0, week_connect: 1 });
  });
  it('report groups by any dimension, multi-value included', () => {
    const list = [P({ id: 'a', city: 'Austin', touches: 2, last_in: 'x', reply_status: 'positive', sales_stage: 'won', deal_value: 500 }), P({ id: 'b', city: 'Austin', touches: 1 }), P({ id: 'c', city: '' })];
    const g = groupBy(list, (x) => x.city || '');
    expect(g[0]).toMatchObject({ k: 'Austin', n: 2, contacted: 2, replied: 1, positive: 1, won: 1, value: 500 });
    expect(g[1].k).toBe('—');
    expect(groupBy(list, (x) => x.profiles.map((y) => y.platform)).map((x) => x.k).sort()).toEqual(['instagram', 'linkedin']);
  });
});

describe('outreach: work queues', () => {
  const today = '2026-11-20';
  it('finds replies waiting, first message, follow-up, old pending requests, overdue and cooling', () => {
    const list = [
      P({ id: 'r', awaiting: true, last_in: '2026-11-19T05:00:00.000Z' }),
      P({ id: 'f', profiles: [{ platform: 'linkedin', url: 'a', back: '2026-11-18T05:00:00.000Z' }] }),
      P({ id: 'u', profiles: [{ platform: 'linkedin', url: 'b', msgs: 1, last_msg: '2026-11-16T05:00:00.000Z' }] }),
      P({ id: 'done', profiles: [{ platform: 'linkedin', url: 'c', msgs: 3, last_msg: '2026-11-01T05:00:00.000Z' }] }),
      P({ id: 'pend', profiles: [{ platform: 'linkedin', url: 'd', out: '2026-11-01T05:00:00.000Z' }] }),
      P({ id: 'o', next_due: '2026-11-18', next_action: 'Audit pathabo' }),
      P({ id: 'cool', stage: 'warm', last_touch: '2026-11-01T05:00:00.000Z', profiles: [] }),
      P({ id: 'dnc', stage: 'dnc', awaiting: true }),
      P({ id: 'snooze', next_due: '2026-12-20', profiles: [{ platform: 'linkedin', url: 'e', back: '2026-11-18T05:00:00.000Z' }] }),
    ];
    const q = queues(list, today, S);
    const ids = (k: keyof typeof q) => q[k].map((x) => x.p.id);
    expect(ids('replies')).toEqual(['r']); expect(ids('first_msg')).toEqual(['f']); expect(ids('followup')).toEqual(['u']);
    expect(ids('pending')).toEqual(['pend']); expect(ids('overdue')).toEqual(['o']); expect(ids('cooling')).toEqual(['cool']);
    expect(q.followup[0].why).toContain('Msg 2');
  });
});

describe('outreach: input', () => {
  it('cleanProspect keeps known fields, drops unknown stages and duplicate profiles, reads custom fields', () => {
    const s = mergeSettings({ fields: [{ id: 'f1', label: 'Ads?', type: 'check' }] });
    const c = cleanProspect({ name: '  John ', stage: 'nope', hack: 1, tags: 'a, b', profiles: [{ url: 'https://linkedin.com/in/j' }, { url: 'linkedin.com/in/j/' }], custom: { f1: 'yes', zz: 1 } }, s);
    expect(c.name).toBe('John'); expect(c.stage).toBeUndefined(); expect((c as any).hack).toBeUndefined();
    expect(c.tags).toEqual(['a', 'b']); expect(c.profiles).toHaveLength(1); expect(c.profiles![0].platform).toBe('linkedin'); expect(c.custom).toEqual({ f1: true });
  });
  it('CSV import: quotes, tabs and profile columns', () => {
    const rows = parseCsv('Name,Company,City,LinkedIn,Instagram\n"Smith, John","Smith Roofing",Austin,https://linkedin.com/in/js,\nAna\tA Co\tDallas\t\thttps://instagram.com/ana');
    expect(rows).toHaveLength(2);
    const a = rowToProspect(rows[0]);
    expect(a).toMatchObject({ name: 'Smith, John', company: 'Smith Roofing', city: 'Austin', source: 'linkedin' });
    expect(rowToProspect(rows[1]).profiles).toEqual([{ platform: 'instagram', url: 'https://instagram.com/ana' }]);
  });
  it('settings: saved lists win, broken core lists fall back', () => {
    const s = mergeSettings({ industries: ['Roofing'], stages: [], followup_days: 0 } as any);
    expect(s.industries).toEqual(['Roofing']); expect(s.stages.length).toBeGreaterThan(5); expect(s.followup_days).toBe(3);
  });
});

describe('outreach: undo and templates', () => {
  it('rebuild recalculates counters from the remaining log and keeps the hand-set stage', () => {
    const acts = [A('connect', 'instagram', '2026-11-10T04:00:00.000Z'), A('msg', 'instagram', '2026-11-11T05:00:00.000Z'), A('msg', 'instagram', '2026-11-12T05:00:00.000Z')];
    const { p } = run(P(), acts);
    const back = rebuild({ ...p, stage: 'warm' }, acts.slice(0, 2), S);
    const ig = back.profiles.find((x) => x.platform === 'instagram')!;
    expect(ig.msgs).toBe(1); expect(back.touches).toBe(2); expect(back.stage).toBe('warm'); expect(back.reply_status).toBe('none');
    expect(rebuild(p, [], S)).toMatchObject({ touches: 0, awaiting: false });
  });
  it('a reply is credited to the template of the last message on that profile', () => {
    const { p, acts } = run(P(), [A('msg', 'linkedin', '2026-11-10T04:00:00.000Z', { template: 't1' }), A('reply', 'linkedin', '2026-11-11T04:00:00.000Z', { sentiment: 'not_now' })]);
    expect(acts[1].template).toBe('t1');
    const st = stats([p], acts, '2026-11-10', '2026-11-11', S);
    expect(st.templates.t1).toEqual({ sent: 1, replies: 1 }); expect(st.sentiments).toEqual({ not_now: 1 }); expect(st.repliedPeople).toBe(1);
  });
});
