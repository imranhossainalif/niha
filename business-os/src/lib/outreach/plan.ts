// Outreach CRM: goal → targets → daily tasks → suggestions. Pure functions, no server imports.
// The owner sets ONE number (clients to win this month). Everything else is worked out backwards through the funnel,
// using the team's own conversion rates once there is enough data and a stated benchmark until then.
import { actionKind, addDays, dayOf, groupBy, queues, type Activity, type Prospect, type Settings } from './core';

export type Goal = NonNullable<Settings['goal']>;
export const DEFAULT_GOAL: Goal = { clients: 0, workdays: [1, 2, 3, 4, 5] };

/** Starting assumptions, used only until the team's own numbers exist. Loosely based on the warm-pipeline plan's
 *  self-reported benchmark (from ~60 listed: 20+ engaged, 10–15 conversations, 2–3 hot, 1–2 signed) — not a promise. */
export const BENCH = { accept: 0.3, reply: 0.2, positive: 0.4, meeting: 0.4, won: 0.5, msgsPerPerson: 1.8 };

export type Rate = { v: number; own: boolean; n: number };
const rate = (a: number, b: number, min: number, bench: number): Rate => (b >= min && a > 0 ? { v: Math.min(1, a / b), own: true, n: b } : { v: bench, own: false, n: b });
const isMeeting = (p: Prospect) => ['meeting', 'meeting_done', 'proposal', 'won'].includes(p.sales_stage || '');

/** The team's own step-to-step conversion (all prospects), falling back to the benchmark where the sample is too small. */
export function funnelRates(prospects: Prospect[]) {
  let reached = 0, requested = 0, accepted = 0, replied = 0, positive = 0, meeting = 0, won = 0, msgs = 0, messaged = 0;
  for (const p of prospects) {
    if (p.touches) reached++;
    const pr = p.profiles || [];
    if (pr.some((x) => x.out || x.back)) requested++;
    if (pr.some((x) => x.back)) accepted++;
    const m = pr.reduce((n, x) => n + (x.msgs || 0), 0); if (m) { messaged++; msgs += m; }
    if (p.last_in) replied++;
    if (p.reply_status === 'positive' || isMeeting(p)) positive++;
    if (isMeeting(p)) meeting++;
    if (p.sales_stage === 'won') won++;
  }
  return {
    accept: rate(accepted, requested, 20, BENCH.accept), reply: rate(replied, reached, 20, BENCH.reply), positive: rate(positive, replied, 8, BENCH.positive),
    meeting: rate(meeting, positive, 5, BENCH.meeting), won: rate(won, meeting, 4, BENCH.won),
    msgsPerPerson: messaged >= 20 ? Math.max(1, msgs / messaged) : BENCH.msgsPerPerson,
    counts: { reached, requested, accepted, replied, positive, meeting, won },
  };
}

const monthStart = (day: string) => day.slice(0, 8) + '01';
const monthEnd = (day: string) => { const d = new Date(Date.parse(monthStart(day) + 'T00:00:00Z')); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const weekday = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();
export function workdaysBetween(from: string, to: string, days: number[]) { let n = 0; for (let d = from; d <= to; d = addDays(d, 1)) if (days.includes(weekday(d))) n++; return n; }

export type Step = { key: string; label: string; need: number; done: number; expected: number; rate?: Rate; rateLabel?: string };
/** Work the goal backwards into monthly needs, what is done so far this month, and the catch-up target per remaining workday. */
export function plan(goal: Goal, prospects: Prospect[], acts: Activity[], today: string, s: Settings) {
  const g: Goal = { clients: Math.max(0, Math.round(goal?.clients || 0)), workdays: goal?.workdays?.length ? goal.workdays : DEFAULT_GOAL.workdays };
  const r = funnelRates(prospects);
  const from = monthStart(today), to = monthEnd(today);
  const wdTotal = Math.max(1, workdaysBetween(from, to, g.workdays));
  const isWorkday = g.workdays.includes(weekday(today));
  const wdLeft = Math.max(1, workdaysBetween(today, to, g.workdays));
  const wdPassed = workdaysBetween(from, addDays(today, -1), g.workdays);
  // done this month
  const reached = new Set<string>(), replied = new Set<string>(); let requests = 0, msgs = 0, touches = 0, positive = 0, meetings = 0, won = 0;
  const reps = new Set<string>();
  for (const a of acts) {
    if (a.day >= addDays(today, -13) && a.by) reps.add(a.by);
    if (a.day < from || a.day > today) continue;
    const k = actionKind(a.type, s);
    if (k === 'touch' || k === 'msg') { touches++; reached.add(a.prospect); }
    if (a.type === 'connect') requests++;
    if (k === 'msg') msgs++;
    if (a.type === 'reply') { replied.add(a.prospect); if (a.sentiment === 'positive') positive++; }
    if (a.type === 'meeting') meetings++;
    if (a.type === 'won') won++;
  }
  const up = (n: number) => Math.ceil(n - 1e-9);
  const nWon = g.clients, nMeet = up(nWon / r.won.v), nPos = up(nMeet / r.meeting.v), nReply = up(nPos / r.positive.v), nReach = up(nReply / r.reply.v);
  const nReq = nReach, nMsg = up(nReach * r.accept.v * r.msgsPerPerson), nTouch = nReq + nMsg + nReach; // one public engagement per person before the request
  const frac = Math.min(1, wdPassed / wdTotal);
  const mk = (key: string, label: string, need: number, done: number, rt?: Rate, rateLabel?: string): Step => ({ key, label, need, done, expected: Math.round(need * frac), rate: rt, rateLabel });
  const steps: Step[] = [
    mk('reach', 'People reached', nReach, reached.size),
    mk('reply', 'People who replied', nReply, replied.size, r.reply, 'of reached reply'),
    mk('positive', 'Positive replies', nPos, positive, r.positive, 'of replies are positive'),
    mk('meeting', 'Meetings', nMeet, meetings, r.meeting, 'of positive book a meeting'),
    mk('won', 'Clients won', nWon, won, r.won, 'of meetings become clients'),
  ];
  const work: Step[] = [mk('connect', 'Requests / follows sent', nReq, requests), mk('msg', 'Messages sent', nMsg, msgs), mk('touch', 'Total touches', nTouch, touches)];
  const perDay = (need: number, done: number) => Math.max(0, up((need - done) / wdLeft));
  const nReps = Math.max(1, reps.size);
  const daily = { reach: perDay(nReach, reached.size), connect: perDay(nReq, requests), msg: perDay(nMsg, msgs), touch: perDay(nTouch, touches) };
  const perRep = { reach: up(daily.reach / nReps), connect: up(daily.connect / nReps), msg: up(daily.msg / nReps), touch: up(daily.touch / nReps) };
  const fresh = prospects.filter((p) => !p.touches && p.stage !== 'dnc' && p.sales_stage !== 'lost' && p.sales_stage !== 'won').length;
  const toAdd = Math.max(0, nReach - reached.size - fresh);
  const limit = s.senders.reduce((n, x) => n + (x.day_connect || 0), 0);
  return { goal: g, active: g.clients > 0, rates: r, from, to, wdTotal, wdLeft, wdPassed, isWorkday, steps, work, daily, perRep, nReps, reps: [...reps], fresh, toAdd, addPerDay: up(toAdd / wdLeft), limit, overLimit: limit > 0 && daily.connect > limit };
}
export type Plan = ReturnType<typeof plan>;
export const paceOf = (st: Step): 'done' | 'on' | 'slow' | 'behind' => (st.need > 0 && st.done >= st.need ? 'done' : st.done >= st.expected ? 'on' : st.done >= st.expected * 0.7 ? 'slow' : 'behind');

export type Task = { id: string; title: string; detail: string; done: number; target: number; kind: 'count' | 'clear'; goto?: { tab: 'queue' | 'list'; quick?: string }; urgent?: boolean };
/** Today's task list for one rep (or the whole team when `rep` is empty): goal-driven numbers plus the queues that need clearing. */
export function tasksFor(pl: Plan, prospects: Prospect[], acts: Activity[], today: string, s: Settings, rep = ''): Task[] {
  const mine = (p: Prospect) => !rep || p.owner === rep;
  const q = queues(prospects.filter(mine), today, s);
  const t = { connect: 0, msg: 0, touch: 0, added: 0 }; const people = new Set<string>();
  for (const a of acts) {
    if (a.day !== today || (rep && a.by !== rep)) continue;
    const k = actionKind(a.type, s);
    if (k === 'touch' || k === 'msg') { t.touch++; people.add(a.prospect); }
    if (a.type === 'connect') t.connect++;
    if (k === 'msg') t.msg++;
  }
  t.added = prospects.filter((p) => dayOf(p.created_at) === today && (!rep || p.created_by === rep)).length;
  const tg = rep ? pl.perRep : pl.daily;
  const out: Task[] = [];
  const clear = (id: string, n: number, title: string, detail: string, urgent = false) => { if (n) out.push({ id, title, detail, done: 0, target: n, kind: 'clear', goto: { tab: 'queue' }, urgent }); };
  clear('replies', q.replies.length, `Answer ${q.replies.length} repl${q.replies.length === 1 ? 'y' : 'ies'}`, 'They wrote back and are waiting. Do this first — speed decides whether the conversation continues.', true);
  clear('overdue', q.overdue.length + q.due.length, `Do ${q.overdue.length + q.due.length} planned next action${q.overdue.length + q.due.length === 1 ? '' : 's'}`, `${q.overdue.length} overdue, ${q.due.length} due today.`, q.overdue.length > 0);
  clear('first', q.first_msg.length, `Send the first message to ${q.first_msg.length} new connection${q.first_msg.length === 1 ? '' : 's'}`, 'They accepted or followed back and have heard nothing yet.');
  clear('follow', q.followup.length, `Send ${q.followup.length} follow-up${q.followup.length === 1 ? '' : 's'}`, `No reply for ${s.followup_days}+ days. Reopen through something they posted, not a nudge.`);
  if (pl.active && pl.isWorkday) {
    const count = (id: string, title: string, detail: string, done: number, target: number, goto?: Task['goto']) => { if (target > 0) out.push({ id, title, detail, done, target, kind: 'count', goto }); };
    count('add', `Add ${rep ? Math.ceil(pl.addPerDay / pl.nReps) : pl.addPerDay} new prospects to the list`, `The goal needs ${pl.toAdd} more prospects than the list holds.`, t.added, rep ? Math.ceil(pl.addPerDay / pl.nReps) : pl.addPerDay, { tab: 'list' });
    count('reach', `Reach ${tg.reach} new people`, 'Open their profile, engage with a recent post first.', people.size, tg.reach, { tab: 'list', quick: 'fresh' });
    count('connect', `Send ${tg.connect} requests / follows`, pl.overLimit ? `Careful: the team target (${pl.daily.connect}/day) is above your accounts' safe limit (${pl.limit}/day).` : 'Spread them through the day.', t.connect, tg.connect, { tab: 'list', quick: 'fresh' });
    count('msg', `Send ${tg.msg} messages`, 'Context first, one question per message.', t.msg, tg.msg, { tab: 'queue' });
    count('touch', `Make ${tg.touch} touches in total`, 'Comments, likes, requests and messages all count.', t.touch, tg.touch);
  }
  clear('pending', q.pending.length, `Withdraw ${q.pending.length} old request${q.pending.length === 1 ? '' : 's'}`, `Pending for ${s.pending_days}+ days.`);
  clear('cooling', q.cooling.length, `Re-engage ${q.cooling.length} cooling relationship${q.cooling.length === 1 ? '' : 's'}`, `Engaged / warm / hot with no contact for ${s.cooling_days}+ days.`);
  const noNext = prospects.filter((p) => mine(p) && p.touches && !p.next_due && !p.awaiting && p.stage !== 'dnc' && p.sales_stage !== 'won' && p.sales_stage !== 'lost' && ['engaged', 'warm', 'hot'].includes(p.stage)).length;
  if (noNext) out.push({ id: 'nonext', title: `Set a next action on ${noNext} active prospect${noNext === 1 ? '' : 's'}`, detail: 'Engaged, warm or hot — but nothing is planned.', done: 0, target: noNext, kind: 'clear', goto: { tab: 'list', quick: 'nonext' } });
  return out;
}

/** Last `n` workdays: what was done against the per-day target (for the streak table). */
export function history(pl: Plan, acts: Activity[], today: string, s: Settings, rep = '', n = 7) {
  const days: string[] = []; for (let d = today; days.length < n && d >= addDays(today, -40); d = addDays(d, -1)) if (pl.goal.workdays.includes(weekday(d))) days.push(d);
  return days.map((day) => {
    let connect = 0, msg = 0, touch = 0, reply = 0;
    for (const a of acts) { if (a.day !== day || (rep && a.by !== rep)) continue; const k = actionKind(a.type, s); if (k === 'touch' || k === 'msg') touch++; if (a.type === 'connect') connect++; if (k === 'msg') msg++; if (a.type === 'reply') reply++; }
    return { day, connect, msg, touch, reply };
  });
}

export type Tip = { tone: 'bad' | 'warn' | 'good' | 'info'; area: string; title: string; fact: string; advice: string; goto?: { tab: 'queue' | 'list' | 'report' | 'settings' | 'goal'; quick?: string } };
const pc = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
/** Read the numbers and say what to change. Every tip carries the FACT it is based on; the advice is a HYPOTHESIS to test. */
export function suggestions(pl: Plan, prospects: Prospect[], acts: Activity[], today: string, s: Settings): Tip[] {
  const tips: Tip[] = [];
  const since = addDays(today, -29);
  const win = acts.filter((a) => a.day >= since && a.day <= today);
  const pname = (id?: string) => s.platforms.find((x) => x.id === id)?.label || id || 'Other';

  // 1 · accept rate per platform
  const plat: Record<string, { connect: number; accepted: number; msg: number; reply: number }> = {};
  for (const a of win) { if (!a.platform) continue; const x = (plat[a.platform] ||= { connect: 0, accepted: 0, msg: 0, reply: 0 }); if (a.type === 'connect') x.connect++; if (a.type === 'accepted') x.accepted++; if (actionKind(a.type, s) === 'msg') x.msg++; if (a.type === 'reply') x.reply++; }
  const acc = Object.entries(plat).filter(([, x]) => x.connect >= 10).map(([k, x]) => ({ k, r: x.accepted / x.connect, ...x })).sort((a, b) => b.r - a.r);
  for (const x of acc) if (x.r < 0.2) tips.push({ tone: 'bad', area: 'Accept rate', title: `${pname(x.k)}: only ${pc(x.accepted, x.connect)}% of requests are accepted`, fact: `${x.accepted} of ${x.connect} requests in the last 30 days.`, advice: 'Engage with a post before sending the request, tighten who goes on the list, and check that our profile names the buyer and the result. Sending more at this rate also risks the account.', goto: { tab: 'report' } });
  if (acc.length >= 2 && acc[0].r - acc[acc.length - 1].r >= 0.15) tips.push({ tone: 'info', area: 'Accept rate', title: `${pname(acc[0].k)} accepts far more often than ${pname(acc[acc.length - 1].k)}`, fact: `${pc(acc[0].accepted, acc[0].connect)}% (${acc[0].accepted}/${acc[0].connect}) vs ${pc(acc[acc.length - 1].accepted, acc[acc.length - 1].connect)}% (${acc[acc.length - 1].accepted}/${acc[acc.length - 1].connect}).`, advice: `Put more of the daily requests on ${pname(acc[0].k)} for two weeks and see whether replies follow.` });
  if (acc.length && acc[0].r >= 0.45) tips.push({ tone: 'good', area: 'Accept rate', title: `${pname(acc[0].k)}: ${pc(acc[0].accepted, acc[0].connect)}% accept — the targeting works`, fact: `${acc[0].accepted} of ${acc[0].connect} requests accepted in 30 days.`, advice: 'Keep the same list rules here; this is the channel to scale first.' });

  // 2 · reply rate per platform
  const rep = Object.entries(plat).filter(([, x]) => x.msg >= 10).map(([k, x]) => ({ k, r: x.reply / x.msg, ...x })).sort((a, b) => b.r - a.r);
  for (const x of rep) if (x.r < 0.08) tips.push({ tone: 'bad', area: 'Messages', title: `${pname(x.k)}: ${pc(x.reply, x.msg)}% reply rate`, fact: `${x.reply} replies to ${x.msg} messages in 30 days.`, advice: 'The message is probably the problem: lead with something from their own post, ask one question, mention no service. Try a new template on the next 20.', goto: { tab: 'settings' } });

  // 3 · message step
  const step: Record<number, { sent: number; replies: number }> = {};
  for (const a of win) { if (actionKind(a.type, s) === 'msg' && a.step) (step[Math.min(a.step, 5)] ||= { sent: 0, replies: 0 }).sent++; if (a.type === 'reply' && a.after_step) (step[Math.min(a.after_step, 5)] ||= { sent: 0, replies: 0 }).replies++; }
  const s1 = step[1], later = Object.entries(step).filter(([k]) => Number(k) > 1).reduce((n, [, v]) => ({ sent: n.sent + v.sent, replies: n.replies + v.replies }), { sent: 0, replies: 0 });
  if (s1 && s1.sent >= 15 && later.sent < s1.sent * 0.25) { const waiting = queues(prospects, today, s).followup.length; tips.push({ tone: 'warn', area: 'Follow-up', title: 'Most people get one message and nothing after', fact: `${s1.sent} first messages but only ${later.sent} follow-ups in 30 days${waiting ? `; ${waiting} follow-ups are due now` : ''}.`, advice: 'A large share of replies usually comes after the second or third touch. Clear the follow-up list daily.', goto: { tab: 'queue' } }); }
  if (later.sent >= 10 && s1 && s1.sent >= 10 && later.replies / later.sent > (s1.replies / s1.sent) * 1.3) tips.push({ tone: 'good', area: 'Follow-up', title: 'Follow-ups get more replies than first messages', fact: `Msg 1: ${pc(s1.replies, s1.sent)}% (${s1.replies}/${s1.sent}). Later messages: ${pc(later.replies, later.sent)}% (${later.replies}/${later.sent}).`, advice: 'Never stop at one message; consider making the first message shorter and saving the question for the second.' });

  // 4 · templates
  const tp: Record<string, { sent: number; replies: number }> = {};
  for (const a of win) { if (!a.template) continue; const x = (tp[a.template] ||= { sent: 0, replies: 0 }); if (actionKind(a.type, s) === 'msg') x.sent++; else if (a.type === 'reply') x.replies++; }
  const tl = Object.entries(tp).filter(([, x]) => x.sent >= 10).map(([k, x]) => ({ k, name: s.templates.find((t) => t.id === k)?.label || k, r: x.replies / x.sent, ...x })).sort((a, b) => b.r - a.r);
  if (tl.length >= 2 && tl[0].r - tl[tl.length - 1].r >= 0.08) tips.push({ tone: 'info', area: 'Templates', title: `“${tl[0].name}” beats “${tl[tl.length - 1].name}”`, fact: `${pc(tl[0].replies, tl[0].sent)}% (${tl[0].replies}/${tl[0].sent}) vs ${pc(tl[tl.length - 1].replies, tl[tl.length - 1].sent)}% (${tl[tl.length - 1].replies}/${tl[tl.length - 1].sent}).`, advice: `Retire “${tl[tl.length - 1].name}”, keep “${tl[0].name}” as the control and write one new challenger.`, goto: { tab: 'settings' } });
  if (!Object.keys(tp).length && Object.values(plat).reduce((n, x) => n + x.msg, 0) >= 20) tips.push({ tone: 'info', area: 'Templates', title: 'Messages are not tagged with a template', fact: 'No message in the last 30 days was logged with a template.', advice: 'Add 2 templates in Settings and pick one when logging — then this page can tell you which wording works.', goto: { tab: 'settings' } });

  // 5 · warm vs cold first message
  const byP: Record<string, Activity[]> = {};
  for (const a of acts) (byP[a.prospect] ||= []).push(a);
  const wc = { warm: { n: 0, r: 0 }, cold: { n: 0, r: 0 } };
  for (const list of Object.values(byP)) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    const i = list.findIndex((a) => actionKind(a.type, s) === 'msg'); if (i < 0) continue;
    const warm = list.slice(0, i).some((a) => a.type === 'like' || a.type === 'comment' || (actionKind(a.type, s) === 'touch' && a.type !== 'connect'));
    const g = warm ? wc.warm : wc.cold; g.n++; if (list.slice(i).some((a) => a.type === 'reply')) g.r++;
  }
  if (wc.warm.n >= 8 && wc.cold.n >= 8) {
    const w = wc.warm.r / wc.warm.n, c = wc.cold.r / wc.cold.n;
    if (w > c * 1.3) tips.push({ tone: 'good', area: 'Warm-up', title: 'Engaging before messaging pays off', fact: `Liked/commented first: ${pc(wc.warm.r, wc.warm.n)}% replied (${wc.warm.r}/${wc.warm.n}). Messaged cold: ${pc(wc.cold.r, wc.cold.n)}% (${wc.cold.r}/${wc.cold.n}).`, advice: 'Make a public comment the rule before any first message, and log it — cold messages are costing replies.' });
    else if (c > w * 1.3) tips.push({ tone: 'info', area: 'Warm-up', title: 'Cold messages are replying as well as warm ones', fact: `Warm: ${pc(wc.warm.r, wc.warm.n)}% (${wc.warm.r}/${wc.warm.n}). Cold: ${pc(wc.cold.r, wc.cold.n)}% (${wc.cold.r}/${wc.cold.n}).`, advice: 'The comments may be too generic to register. Comment on the specific point of their post, or save the time and message sooner.' });
  } else if (wc.cold.n >= 15 && wc.warm.n < 5) tips.push({ tone: 'warn', area: 'Warm-up', title: 'Almost every first message is sent cold', fact: `${wc.cold.n} people got a first message with no like or comment logged before it; only ${wc.warm.n} were warmed up.`, advice: 'Engage publicly first (and log it with Like / Comment) so the message has context — then this page can compare the two.' });

  // 6 · what the replies say
  const sent: Record<string, number> = {}; let nr = 0;
  for (const a of win) if (a.type === 'reply') { nr++; sent[a.sentiment || 'neutral'] = (sent[a.sentiment || 'neutral'] || 0) + 1; }
  const lbl = (id: string) => s.reply_statuses.find((x) => x.id === id)?.label || id;
  if (nr >= 8) {
    for (const [id, why] of [['has_agency', 'They already have someone. Add a list rule (e.g. no agency badge on the site, weak profile) or lead with a specific gap their agency missed.'], ['wrong_person', 'The list is reaching staff, not owners. Check the role before adding and prefer owner-run accounts.'], ['no_budget', 'The businesses may be too small. Raise the size or review-count rule for the list.'], ['not_now', 'Timing, not rejection. Set a next-action date 4–6 weeks out on each instead of dropping them.']] as const)
      if ((sent[id] || 0) / nr >= 0.3) tips.push({ tone: 'warn', area: 'Lead quality', title: `${pc(sent[id], nr)}% of replies say “${lbl(id)}”`, fact: `${sent[id]} of ${nr} replies in 30 days.`, advice: why, goto: { tab: 'list' } });
    if ((sent.positive || 0) / nr >= 0.4) tips.push({ tone: 'good', area: 'Lead quality', title: `${pc(sent.positive || 0, nr)}% of replies are positive`, fact: `${sent.positive} of ${nr} replies in 30 days.`, advice: 'The audience is right. The lever now is volume and speed of follow-up, not a new message.' });
  }

  // 7 · which kind of lead answers
  for (const [dim, name] of [['industry', 'industry'], ['city', 'city'], ['size', 'business size'], ['role', 'role'], ['source', 'source platform']] as const) {
    const g = groupBy(prospects, (p) => String(p[dim] || '')).filter((x) => x.k !== '—' && x.contacted >= 6).map((x) => ({ ...x, r: x.replied / x.contacted })).sort((a, b) => b.r - a.r);
    if (g.length >= 2 && g[0].r - g[g.length - 1].r >= 0.15) { const nm = (k: string) => (dim === 'source' ? pname(k) : k); tips.push({ tone: 'info', area: 'Lead type', title: `By ${name}: ${nm(g[0].k)} replies most, ${nm(g[g.length - 1].k)} least`, fact: `${nm(g[0].k)} ${pc(g[0].replied, g[0].contacted)}% (${g[0].replied}/${g[0].contacted}) vs ${nm(g[g.length - 1].k)} ${pc(g[g.length - 1].replied, g[g.length - 1].contacted)}% (${g[g.length - 1].replied}/${g[g.length - 1].contacted}).`, advice: `Fill next month's list with more ${nm(g[0].k)} and fewer ${nm(g[g.length - 1].k)} — but confirm with another 20 before dropping a segment.`, goto: { tab: 'report' } }); }
  }

  // 8 · speed and hygiene
  const q = queues(prospects, today, s);
  const slow = q.replies.filter((x) => (x.days || 0) >= 1).length;
  if (slow) tips.push({ tone: 'bad', area: 'Speed', title: `${slow} repl${slow === 1 ? 'y has' : 'ies have'} waited a day or more`, fact: `${q.replies.length} waiting in total; the oldest for ${q.replies[0]?.days || 0} day(s).`, advice: 'Answer replies before anything else each session. A reply that sits cools faster than any other lead.', goto: { tab: 'queue' } });
  if (q.first_msg.filter((x) => (x.days || 0) >= 3).length >= 3) tips.push({ tone: 'warn', area: 'Speed', title: 'New connections are left without a message', fact: `${q.first_msg.filter((x) => (x.days || 0) >= 3).length} people accepted 3+ days ago and have not been messaged.`, advice: 'Message within 48–72 hours of the accept, while they still remember the engagement.', goto: { tab: 'queue' } });
  if (q.pending.length >= 10) tips.push({ tone: 'warn', area: 'Account safety', title: `${q.pending.length} requests have been pending for ${s.pending_days}+ days`, fact: 'A large pile of unanswered requests lowers how the platform rates the account.', advice: 'Withdraw them in batches of 10–20 a day.', goto: { tab: 'queue' } });
  if (pl.overLimit) tips.push({ tone: 'warn', area: 'Account safety', title: 'The goal needs more requests than the accounts can safely send', fact: `Catch-up target ${pl.daily.connect} requests/day; safe limit across our accounts ${pl.limit}/day.`, advice: 'Add another sending account, lower the monthly goal, or raise the accept and reply rates so fewer requests are needed.', goto: { tab: 'goal' } });
  const blank = prospects.filter((p) => !p.industry || !p.city).length;
  if (prospects.length >= 20 && blank / prospects.length >= 0.3) tips.push({ tone: 'info', area: 'Data', title: `${pc(blank, prospects.length)}% of prospects have no industry or city`, fact: `${blank} of ${prospects.length}.`, advice: 'Fill them in (bulk edit in Prospects) — without them the lead-type analysis cannot work.', goto: { tab: 'list' } });

  // 9 · goal pace and the stage gates of the plan (backup freshness is added by the page, which knows the backup time)
  if (pl.active) {
    const behind = [...pl.work, ...pl.steps].filter((x) => x.expected >= 3 && paceOf(x) === 'behind');
    if (behind.length) { const b = behind[0]; tips.push({ tone: 'bad', area: 'Goal', title: `Behind on the monthly goal: ${b.label.toLowerCase()}`, fact: `${b.done} done, ${b.expected} expected by today, ${b.need} needed this month (${pl.wdLeft} workdays left).`, advice: `Today's catch-up numbers are on the Tasks tab. ${b.key === 'reply' || b.key === 'positive' ? 'Volume is there — work on the message and the warm-up.' : 'This is a volume gap: protect the daily outreach block.'}`, goto: { tab: 'goal' } }); }
    else if (pl.wdPassed >= 3) tips.push({ tone: 'good', area: 'Goal', title: 'On pace for the monthly goal', fact: `${pl.steps[0].done} people reached of ${pl.steps[0].need} needed; ${pl.wdLeft} workdays left.`, advice: 'Hold the routine. Check the later steps (replies → meetings) weekly; volume alone will not close the month.' });
    const usedBench = (['reply', 'positive', 'meeting', 'won'] as const).filter((k) => !pl.rates[k].own);
    if (usedBench.length) tips.push({ tone: 'info', area: 'Goal', title: 'Part of the plan still rests on assumed rates', fact: `No own data yet for: ${usedBench.join(', ')}. Benchmarks are used instead (a self-reported industry figure, not a promise).`, advice: 'The targets will correct themselves as replies, meetings and wins are logged. Log every reply and meeting.' });
  } else tips.push({ tone: 'info', area: 'Goal', title: 'No monthly goal is set', fact: 'Targets and daily tasks are worked out from the goal.', advice: 'Open Target & Goal and enter how many clients you want this month.', goto: { tab: 'goal' } });
  const day = Number(today.slice(8)), list = prospects.filter((p) => dayOf(p.created_at) >= pl.from || (p.last_touch && dayOf(p.last_touch) >= pl.from));
  const eng = list.filter((p) => ['connected', 'engaged', 'warm', 'hot'].includes(p.stage)).length, hot = list.filter((p) => p.stage === 'hot' || isMeeting(p)).length, meet = list.filter(isMeeting).length;
  if (list.length >= 30 && day >= 14 && eng / list.length < 0.1) tips.push({ tone: 'bad', area: 'Checkpoint', title: 'Day 14 check: under 10% of this month’s list is engaged', fact: `${eng} of ${list.length} active prospects are connected or engaged.`, advice: 'Fix the list before sending more: only people who posted recently, run their own account, and show a visible gap.', goto: { tab: 'list' } });
  if (day >= 25 && eng >= 10 && !hot) tips.push({ tone: 'warn', area: 'Checkpoint', title: 'People are engaged but nobody is hot', fact: `${eng} engaged prospects, 0 hot or with a meeting.`, advice: 'The comments and messages are too general. Name the specific problem you saw on their profile and ask about it.' });
  if (day >= 25 && hot >= 3 && !meet) tips.push({ tone: 'warn', area: 'Checkpoint', title: 'Hot leads are not turning into calls', fact: `${hot} hot prospects, 0 meetings.`, advice: 'Change the offer step: a short personal video of their own listing instead of a static image, then offer two specific times.' });

  if (!win.length) return [{ tone: 'info', area: 'Data', title: 'Nothing to analyse yet', fact: 'No activity was logged in the last 30 days.', advice: 'Log requests, messages and replies from the prospect window. Suggestions appear as soon as there are about 10 requests or messages on a platform.', goto: { tab: 'list' } }, ...tips.filter((t) => t.area === 'Goal')];
  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  return tips.sort((a, b) => order[a.tone] - order[b.tone]);
}
