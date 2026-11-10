// Outreach CRM (sidebar → Outreach): pure logic shared by the API routes and the page. No server imports here.
// One prospect = one person/business with several social profiles; every action is an activity row (the history),
// and the prospect doc carries the current state so lists and filters need no joins.

export type Opt = { id: string; label: string; color?: string };
export type PlatformOpt = Opt & { connect: string; back: string };
export type Sender = { id: string; platform: string; name: string; day_connect?: number; week_connect?: number; day_msg?: number };
export type CustomField = { id: string; label: string; type: 'text' | 'number' | 'select' | 'date' | 'link' | 'check'; options?: string[] };
export type CustomAction = { id: string; label: string; kind: 'touch' | 'msg' | 'none' };
export type Settings = {
  platforms: PlatformOpt[]; industries: string[]; sizes: string[]; roles: string[]; brands: string[]; reps: string[];
  stages: Opt[]; reply_statuses: Opt[]; sales_stages: Opt[]; lost_reasons: string[];
  senders: Sender[]; fields: CustomField[]; actions: CustomAction[]; templates: { id: string; label: string; text: string }[];
  targets: { connect: number; msg: number; touch: number };
  followup_days: number; max_steps: number; pending_days: number; cooling_days: number;
};
export type Profile = { platform: string; url: string; handle?: string; last_tpl?: string; out?: string | null; back?: string | null; connected?: boolean; msgs?: number; last_msg?: string | null; replied?: string | null; replies?: number };
export type Prospect = {
  id?: string; version?: number; business: string; name: string; company?: string; role?: string; industry?: string; size?: string; country?: string; city?: string;
  website?: string; email?: string; phone?: string; brand?: string; source?: string; primary?: string; profiles: Profile[];
  stage: string; reply_status?: string; sales_stage?: string; deal_value?: number; lost_reason?: string; owner?: string;
  next_action?: string; next_due?: string; tags?: string[]; notes?: string; pain?: string; custom?: Record<string, unknown>;
  created_at: string; created_by?: string; first_touch?: string; last_touch?: string; last_in?: string; awaiting?: boolean; touches?: number;
};
export type Activity = {
  id?: string; business: string; prospect: string; type: string; platform?: string; at: string; day: string; by?: string; sender?: string;
  note?: string; step?: number; after_step?: number; sentiment?: string; template?: string;
};

export const OUTREACH_BIZ = 'lrf'; // access bucket: staff assigned to Local Revenue Flow can use the CRM

export const DEFAULT_SETTINGS: Settings = {
  platforms: [
    { id: 'linkedin', label: 'LinkedIn', color: '#0A66C2', connect: 'Connection request', back: 'Accepted' },
    { id: 'instagram', label: 'Instagram', color: '#D6297B', connect: 'Follow', back: 'Followed back' },
    { id: 'facebook', label: 'Facebook', color: '#1877F2', connect: 'Friend request', back: 'Accepted' },
    { id: 'x', label: 'X (Twitter)', color: '#14171A', connect: 'Follow', back: 'Followed back' },
    { id: 'tiktok', label: 'TikTok', color: '#00B5AD', connect: 'Follow', back: 'Followed back' },
    { id: 'youtube', label: 'YouTube', color: '#E62117', connect: 'Subscribe', back: 'Subscribed back' },
    { id: 'reddit', label: 'Reddit', color: '#FF4500', connect: 'Follow', back: 'Followed back' },
    { id: 'whatsapp', label: 'WhatsApp', color: '#1FA855', connect: 'Number saved', back: 'Saved our number' },
    { id: 'email', label: 'Email', color: '#6B5BD2', connect: 'Intro email', back: 'Opted in' },
    { id: 'phone', label: 'Phone', color: '#8A6D3B', connect: 'Call attempt', back: 'Answered' },
    { id: 'other', label: 'Other', color: '#5F7A74', connect: 'Connect', back: 'Connected back' },
  ],
  industries: ['Home services', 'Roofing', 'Plumbing', 'HVAC', 'Pest control', 'Dental', 'Med spa', 'Law firm', 'Real estate', 'Restaurant', 'Auto repair', 'E-commerce', 'Agency', 'Other'],
  sizes: ['1', '2-5', '6-10', '11-25', '26-50', '51-100', '101-250', '250+'],
  roles: ['Owner', 'Founder', 'CEO', 'COO', 'CMO', 'Marketing Director', 'Marketing Manager', 'Office Manager', 'GM', 'Other'],
  brands: ['Local Revenue Flow', 'LocalServiceHQ', 'Itevs Digital'],
  reps: [],
  stages: [
    { id: 'cold', label: 'Cold', color: '#8A9993' }, { id: 'watching', label: 'Watching', color: '#6B8FB5' }, { id: 'engaging', label: 'Engaging', color: '#2F6FD1' },
    { id: 'connected', label: 'Connected', color: '#7A5BD2' }, { id: 'engaged', label: 'Engaged', color: '#B8650E' }, { id: 'warm', label: 'Warm', color: '#E07B1A' },
    { id: 'hot', label: 'Hot', color: '#C2363F' }, { id: 'nurture', label: 'Nurture', color: '#0E8A62' }, { id: 'dormant', label: 'Dormant', color: '#93A6A0' }, { id: 'dnc', label: 'Do not contact', color: '#4A4A4A' },
  ],
  reply_statuses: [
    { id: 'none', label: 'No reply' }, { id: 'positive', label: 'Positive', color: '#0E8A62' }, { id: 'neutral', label: 'Neutral', color: '#2F6FD1' }, { id: 'not_now', label: 'Not now', color: '#B8650E' },
    { id: 'has_agency', label: 'Has an agency', color: '#B8650E' }, { id: 'no_budget', label: 'No budget', color: '#B8650E' }, { id: 'wrong_person', label: 'Wrong person', color: '#8A9993' }, { id: 'negative', label: 'Negative', color: '#C2363F' },
  ],
  sales_stages: [
    { id: 'prospect', label: 'Prospect' }, { id: 'qualified', label: 'Qualified' }, { id: 'meeting', label: 'Meeting booked' }, { id: 'meeting_done', label: 'Meeting done' },
    { id: 'proposal', label: 'Proposal' }, { id: 'won', label: 'Won', color: '#0E8A62' }, { id: 'lost', label: 'Lost', color: '#C2363F' },
  ],
  lost_reasons: ['Not interested', 'No budget', 'Already has agency', 'Timing / later', 'Wrong person', 'Poor fit', 'No response after meeting', 'Competitor', 'Business closed', 'Other'],
  senders: [], fields: [], actions: [], templates: [],
  targets: { connect: 20, msg: 15, touch: 30 },
  followup_days: 3, max_steps: 3, pending_days: 14, cooling_days: 10,
};

/** Saved settings over the defaults (a list saved as [] stays empty only for the user-made lists). */
export function mergeSettings(saved: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(saved || {}) } as Settings;
  for (const k of ['platforms', 'stages', 'reply_statuses', 'sales_stages'] as const) if (!Array.isArray(s[k]) || !s[k].length) (s as any)[k] = DEFAULT_SETTINGS[k];
  for (const k of ['industries', 'sizes', 'roles', 'brands', 'reps', 'lost_reasons', 'senders', 'fields', 'actions', 'templates'] as const) if (!Array.isArray(s[k])) (s as any)[k] = DEFAULT_SETTINGS[k];
  s.targets = { ...DEFAULT_SETTINGS.targets, ...(s.targets || {}) };
  for (const k of ['followup_days', 'max_steps', 'pending_days', 'cooling_days'] as const) if (!(Number(s[k]) > 0)) s[k] = DEFAULT_SETTINGS[k];
  return s;
}

/* Built-in actions. kind: touch = outbound engagement, msg = outbound message, in = something they did, deal = sales step, none = note. */
export const ACTIONS: { id: string; label: string; kind: 'touch' | 'msg' | 'in' | 'deal' | 'none'; perProfile?: boolean }[] = [
  { id: 'view', label: 'Viewed profile', kind: 'none', perProfile: true },
  { id: 'like', label: 'Liked a post', kind: 'touch', perProfile: true },
  { id: 'comment', label: 'Commented', kind: 'touch', perProfile: true },
  { id: 'connect', label: 'Follow / request sent', kind: 'touch', perProfile: true },
  { id: 'accepted', label: 'Followed back / accepted', kind: 'in', perProfile: true },
  { id: 'withdrawn', label: 'Request withdrawn', kind: 'none', perProfile: true },
  { id: 'msg', label: 'Message sent', kind: 'msg', perProfile: true },
  { id: 'reply', label: 'Reply received', kind: 'in', perProfile: true },
  { id: 'meeting', label: 'Meeting booked', kind: 'deal' },
  { id: 'meeting_done', label: 'Meeting done', kind: 'deal' },
  { id: 'proposal', label: 'Proposal sent', kind: 'deal' },
  { id: 'won', label: 'Won (client)', kind: 'deal' },
  { id: 'lost', label: 'Lost', kind: 'deal' },
  { id: 'note', label: 'Note', kind: 'none' },
];
export const actionKind = (type: string, s: Settings) => ACTIONS.find((a) => a.id === type)?.kind ?? s.actions.find((a) => a.id === type)?.kind ?? 'none';
export const actionLabel = (type: string, s: Settings) => ACTIONS.find((a) => a.id === type)?.label ?? s.actions.find((a) => a.id === type)?.label ?? type;

/** Bangladesh calendar day of a timestamp. */
export const dayOf = (iso: string) => new Date(Date.parse(iso) + 6 * 3600e3).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 864e5);

/** Same profile written two ways must compare equal: no protocol, www/m., query, fragment or trailing slash. */
export function normUrl(raw: string): string {
  let u = String(raw || '').trim().toLowerCase();
  if (!u) return '';
  u = u.replace(/^[a-z]+:\/\//, '').replace(/^(www|m|mobile|web)\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  u = u.replace(/^twitter\.com/, 'x.com').replace(/^fb\.com/, 'facebook.com');
  if (u.startsWith('@')) u = u.slice(1);
  return u;
}
const HOSTS: [RegExp, string][] = [[/linkedin\.com/, 'linkedin'], [/instagram\.com/, 'instagram'], [/facebook\.com|fb\.com|messenger\.com/, 'facebook'], [/(^|\.)x\.com|twitter\.com/, 'x'], [/tiktok\.com/, 'tiktok'], [/youtube\.com|youtu\.be/, 'youtube'], [/reddit\.com/, 'reddit'], [/wa\.me|whatsapp\.com/, 'whatsapp']];
export function platformOf(url: string): string {
  const u = normUrl(url);
  if (/^[^@\s/]+@[^@\s/]+\.[a-z]{2,}$/.test(u)) return 'email';
  if (/^\+?[\d\s-]{7,}$/.test(u)) return 'phone';
  return HOSTS.find(([re]) => re.test(u.split('/')[0]))?.[1] ?? 'other';
}
/** Keys used to spot a duplicate prospect. */
export function dupKeys(p: Pick<Prospect, 'profiles' | 'email' | 'phone'>): string[] {
  const k = (p.profiles || []).map((x) => normUrl(x.url)).filter(Boolean);
  if (p.email) k.push('mail:' + p.email.trim().toLowerCase());
  if (p.phone) { const d = p.phone.replace(/\D/g, ''); if (d.length >= 7) k.push('tel:' + d.slice(-10)); }
  return k;
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : v == null ? '' : String(v).trim().slice(0, max));
/** Keep only known fields, trimmed, from a create/edit body. */
export function cleanProspect(b: Record<string, any>, s: Settings): Partial<Prospect> {
  const o: Partial<Prospect> = {};
  for (const k of ['name', 'company', 'role', 'industry', 'size', 'country', 'city', 'website', 'email', 'phone', 'brand', 'source', 'primary', 'reply_status', 'sales_stage', 'lost_reason', 'owner', 'next_action', 'next_due', 'stage'] as const)
    if (k in b) (o as any)[k] = str(b[k]);
  for (const k of ['notes', 'pain'] as const) if (k in b) o[k] = str(b[k], 5000);
  if ('deal_value' in b) o.deal_value = Number(b.deal_value) || 0;
  if ('awaiting' in b) o.awaiting = !!b.awaiting;
  if ('tags' in b) o.tags = (Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',')).map((t: unknown) => str(t, 40)).filter(Boolean).slice(0, 20);
  if ('custom' in b && b.custom && typeof b.custom === 'object') { o.custom = {}; for (const f of s.fields) if (f.id in b.custom) o.custom[f.id] = f.type === 'check' ? !!b.custom[f.id] : f.type === 'number' ? Number(b.custom[f.id]) || 0 : str(b.custom[f.id], 1000); }
  if ('profiles' in b && Array.isArray(b.profiles)) {
    const seen = new Set<string>();
    o.profiles = b.profiles.map((x: any): Profile => {
      const url = str(x?.url, 500);
      return { platform: str(x?.platform, 40) || platformOf(url), url, handle: str(x?.handle, 100) || undefined, out: x?.out || null, back: x?.back || null, connected: !!x?.connected, msgs: Math.max(0, Number(x?.msgs) || 0), last_msg: x?.last_msg || null, replied: x?.replied || null, replies: Math.max(0, Number(x?.replies) || 0), last_tpl: x?.last_tpl ? str(x.last_tpl, 60) : undefined };
    }).filter((x: Profile) => { const k = x.platform + '|' + normUrl(x.url); if ((!x.url && !x.platform) || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
  }
  if (o.stage && !s.stages.some((x) => x.id === o.stage)) delete o.stage;
  return o;
}

const STAGE_UP = ['cold', 'watching', 'engaging', 'connected', 'engaged', 'warm', 'hot'];
const raise = (cur: string, to: string) => (STAGE_UP.indexOf(cur) >= 0 && STAGE_UP.indexOf(cur) < STAGE_UP.indexOf(to) ? to : cur);

/** Apply one logged action to the prospect's current state. Returns the new prospect and the activity with step numbers filled in. */
export function applyActivity(p0: Prospect, a0: Activity, s: Settings): { prospect: Prospect; activity: Activity } {
  const p: Prospect = { ...p0, profiles: (p0.profiles || []).map((x) => ({ ...x })) };
  const a: Activity = { ...a0 };
  const kind = actionKind(a.type, s);
  let pr = a.platform ? p.profiles.find((x) => x.platform === a.platform) : undefined;
  if (a.platform && !pr && (kind === 'touch' || kind === 'msg' || kind === 'in')) { pr = { platform: a.platform, url: '', msgs: 0, replies: 0 }; p.profiles.push(pr); }
  const out = kind === 'touch' || kind === 'msg';
  if (out) { p.touches = (p.touches || 0) + 1; p.first_touch = p.first_touch || a.at; p.last_touch = a.at; p.stage = raise(p.stage, 'engaging'); }
  if (a.type === 'connect' && pr) pr.out = a.at;
  if (a.type === 'withdrawn' && pr) pr.out = null;
  if (a.type === 'accepted' && pr) { pr.back = a.at; pr.connected = true; p.stage = raise(p.stage, 'connected'); }
  if (kind === 'msg') {
    if (pr) { pr.msgs = (pr.msgs || 0) + 1; pr.last_msg = a.at; a.step = pr.msgs; if (a.template) pr.last_tpl = a.template; }
    p.awaiting = false;
  }
  if (a.type === 'reply') {
    if (pr) { pr.replied = a.at; pr.replies = (pr.replies || 0) + 1; pr.connected = true; a.after_step = pr.msgs || 0; if (pr.last_tpl) a.template = pr.last_tpl; }
    p.last_in = a.at; p.awaiting = true; p.reply_status = a.sentiment || p.reply_status || 'neutral';
    p.stage = a.sentiment === 'positive' ? raise(p.stage, 'warm') : raise(p.stage, 'engaged');
    if (a.sentiment === 'negative') p.stage = p.stage === 'dnc' ? 'dnc' : 'dormant';
  }
  if (a.type === 'meeting') { p.sales_stage = 'meeting'; p.stage = raise(p.stage, 'hot'); p.awaiting = false; }
  if (a.type === 'meeting_done') p.sales_stage = 'meeting_done';
  if (a.type === 'proposal') p.sales_stage = 'proposal';
  if (a.type === 'won') p.sales_stage = 'won';
  if (a.type === 'lost') { p.sales_stage = 'lost'; if (a.note && !p.lost_reason) p.lost_reason = a.note.slice(0, 100); }
  return { prospect: p, activity: a };
}

export type Counts = { connect: number; accepted: number; msg: number; reply: number; positive: number; meeting: number; touch: number; won: number };
const zero = (): Counts => ({ connect: 0, accepted: 0, msg: 0, reply: 0, positive: 0, meeting: 0, touch: 0, won: 0 });
function count(c: Counts, a: Activity, s: Settings) {
  const k = actionKind(a.type, s);
  if (k === 'touch' || k === 'msg') c.touch++;
  if (a.type === 'connect') c.connect++;
  if (a.type === 'accepted') c.accepted++;
  if (k === 'msg') c.msg++;
  if (a.type === 'reply') { c.reply++; if (a.sentiment === 'positive') c.positive++; }
  if (a.type === 'meeting') c.meeting++;
  if (a.type === 'won') c.won++;
}
/** Everything the dashboard shows for a day range (inclusive, Bangladesh days). */
export function stats(prospects: Prospect[], acts: Activity[], from: string, to: string, s: Settings) {
  const total = zero(); const byPlatform: Record<string, Counts> = {}; const byRep: Record<string, Counts> = {}; const bySender: Record<string, Counts> = {};
  const steps: Record<number, { sent: number; replies: number }> = {}; const contacted = new Set<string>(); const byDay: Record<string, Counts> = {};
  const templates: Record<string, { sent: number; replies: number }> = {}; const sentiments: Record<string, number> = {}; const replied = new Set<string>();
  for (const a of acts) {
    if (a.day < from || a.day > to) continue;
    count(total, a, s);
    if (a.platform) count((byPlatform[a.platform] ||= zero()), a, s); // meetings/notes without a platform only count in the total
    count((byRep[a.by || '—'] ||= zero()), a, s);
    count((byDay[a.day] ||= zero()), a, s);
    if (a.sender) count((bySender[a.sender] ||= zero()), a, s);
    const k = actionKind(a.type, s);
    if (k === 'touch' || k === 'msg') contacted.add(a.prospect);
    if (k === 'msg' && a.step) (steps[Math.min(a.step, 9)] ||= { sent: 0, replies: 0 }).sent++;
    if (a.type === 'reply' && a.after_step) (steps[Math.min(a.after_step, 9)] ||= { sent: 0, replies: 0 }).replies++;
    if (a.template) { const t = (templates[a.template] ||= { sent: 0, replies: 0 }); if (k === 'msg') t.sent++; else if (a.type === 'reply') t.replies++; }
    if (a.type === 'reply') { replied.add(a.prospect); sentiments[a.sentiment || 'neutral'] = (sentiments[a.sentiment || 'neutral'] || 0) + 1; }
  }
  const newProspects = prospects.filter((p) => { const d = dayOf(p.created_at); return d >= from && d <= to; }).length;
  return { total, byPlatform, byRep, bySender, byDay, steps, templates, sentiments, contacted: contacted.size, repliedPeople: replied.size, newProspects };
}

/** Today's and the last 7 days' use of each of our own accounts, against its limits. */
export function senderUsage(acts: Activity[], today: string, s: Settings) {
  const wk = addDays(today, -6);
  return s.senders.map((x) => {
    const mine = acts.filter((a) => a.sender === x.id && a.day >= wk && a.day <= today);
    const day = mine.filter((a) => a.day === today);
    return { sender: x, day_connect: day.filter((a) => a.type === 'connect').length, week_connect: mine.filter((a) => a.type === 'connect').length, day_msg: day.filter((a) => actionKind(a.type, s) === 'msg').length };
  });
}

export type QueueItem = { p: Prospect; why: string; platform?: string; days?: number };
/** The work lists: what should be done today and what is going cold. */
export function queues(prospects: Prospect[], today: string, s: Settings) {
  const q = { replies: [] as QueueItem[], overdue: [] as QueueItem[], due: [] as QueueItem[], first_msg: [] as QueueItem[], followup: [] as QueueItem[], pending: [] as QueueItem[], cooling: [] as QueueItem[] };
  for (const p of prospects) {
    if (p.stage === 'dnc' || p.sales_stage === 'won' || p.sales_stage === 'lost') continue;
    if (p.awaiting) q.replies.push({ p, why: 'Replied — waiting for our answer', days: p.last_in ? daysBetween(dayOf(p.last_in), today) : 0 });
    if (p.next_due) { if (p.next_due < today) q.overdue.push({ p, why: p.next_action || 'Next action', days: daysBetween(p.next_due, today) }); else if (p.next_due === today) q.due.push({ p, why: p.next_action || 'Next action' }); }
    if (p.next_due && p.next_due > today) continue; // snoozed until that day
    for (const pr of p.profiles || []) {
      const lbl = s.platforms.find((x) => x.id === pr.platform)?.label || pr.platform;
      if (pr.back && !pr.msgs && !pr.replied) q.first_msg.push({ p, platform: pr.platform, why: lbl + ': connected, first message not sent yet', days: daysBetween(dayOf(pr.back), today) });
      else if (pr.msgs && pr.last_msg && !(pr.replied && pr.replied > pr.last_msg) && pr.msgs < s.max_steps && daysBetween(dayOf(pr.last_msg), today) >= s.followup_days && !p.awaiting)
        q.followup.push({ p, platform: pr.platform, why: lbl + ': no reply after Msg ' + pr.msgs + ' → send Msg ' + (pr.msgs + 1), days: daysBetween(dayOf(pr.last_msg), today) });
      if (pr.out && !pr.back && daysBetween(dayOf(pr.out), today) >= s.pending_days) q.pending.push({ p, platform: pr.platform, why: lbl + ': request still pending', days: daysBetween(dayOf(pr.out), today) });
    }
    if (['engaged', 'warm', 'hot'].includes(p.stage) && !p.awaiting) { const last = [p.last_touch, p.last_in].filter(Boolean).sort().pop(); if (last && daysBetween(dayOf(last), today) >= s.cooling_days) q.cooling.push({ p, why: 'Relationship is cooling', days: daysBetween(dayOf(last), today) }); }
  }
  const byDays = (a: QueueItem, b: QueueItem) => (b.days || 0) - (a.days || 0);
  (Object.keys(q) as (keyof typeof q)[]).forEach((k) => q[k].sort(byDays));
  return q;
}

/** Undo support: rebuild the counters of a prospect from its remaining log. Stage and statuses the team set by hand are kept. */
export function rebuild(p0: Prospect, acts: Activity[], s: Settings): Prospect {
  let p: Prospect = { ...p0, touches: 0, first_touch: undefined, last_touch: undefined, last_in: undefined, awaiting: false,
    profiles: (p0.profiles || []).filter((x) => x.url).map((x) => ({ platform: x.platform, url: x.url, handle: x.handle, out: null, back: null, connected: false, msgs: 0, last_msg: null, replied: null, replies: 0 })) };
  for (const a of [...acts].sort((x, y) => x.at.localeCompare(y.at))) p = applyActivity(p, a, s).prospect;
  return { ...p, stage: p0.stage, reply_status: p.last_in ? p0.reply_status : 'none', sales_stage: p0.sales_stage, lost_reason: p0.lost_reason };
}

/** Day list between two days (inclusive), for zero-filled charts. */
export function dayList(from: string, to: string): string[] { const out: string[] = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out; }

/** Report: prospects grouped by one dimension, with how far each group got. */
export function groupBy(prospects: Prospect[], key: (p: Prospect) => string | string[]) {
  const m: Record<string, { n: number; contacted: number; connected: number; replied: number; positive: number; meeting: number; won: number; value: number }> = {};
  for (const p of prospects) {
    const ks = [key(p)].flat().map((k) => k || '—'); const uniq = [...new Set(ks.length ? ks : ['—'])];
    for (const k of uniq) {
      const g = (m[k] ||= { n: 0, contacted: 0, connected: 0, replied: 0, positive: 0, meeting: 0, won: 0, value: 0 });
      g.n++; if (p.touches) g.contacted++; if ((p.profiles || []).some((x) => x.back || x.connected)) g.connected++; if (p.last_in) g.replied++; if (p.reply_status === 'positive') g.positive++;
      if (['meeting', 'meeting_done', 'proposal', 'won'].includes(p.sales_stage || '')) g.meeting++;
      if (p.sales_stage === 'won') { g.won++; g.value += p.deal_value || 0; }
    }
  }
  return Object.entries(m).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.n - a.n);
}

/** CSV text → rows keyed by header (handles quotes and commas inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let cur: string[] = [], f = '', q = false;
  const t = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { cur.push(f); f = ''; }
    else if (c === '\n') { cur.push(f); rows.push(cur); cur = []; f = ''; }
    else f += c;
  }
  if (f || cur.length) { cur.push(f); rows.push(cur); }
  const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
const ALIAS: Record<string, string[]> = { name: ['name', 'full name', 'person', 'contact'], company: ['company', 'business', 'business name'], role: ['role', 'title', 'job title'], industry: ['industry', 'niche'], size: ['size', 'business size', 'employees'], country: ['country'], city: ['city'], website: ['website', 'site', 'domain'], email: ['email'], phone: ['phone', 'whatsapp'], brand: ['brand'], owner: ['owner', 'rep'], notes: ['notes', 'note'], tags: ['tags'] };
/** One imported row → prospect fields; any column that holds a profile link becomes a profile. */
export function rowToProspect(row: Record<string, string>): Partial<Prospect> {
  const o: Record<string, any> = {};
  for (const [k, names] of Object.entries(ALIAS)) { const h = names.find((n) => row[n]); if (h) o[k] = row[h]; }
  const profiles: Profile[] = [];
  for (const [h, v] of Object.entries(row)) {
    if (!v || ALIAS.website.includes(h)) continue;
    const pf = platformOf(v);
    if (/^https?:\/\/|^www\./i.test(v) && pf !== 'other') profiles.push({ platform: pf, url: v });
    else if (['linkedin', 'instagram', 'facebook', 'x', 'twitter', 'tiktok', 'youtube', 'reddit'].includes(h)) profiles.push({ platform: h === 'twitter' ? 'x' : h, url: v });
  }
  o.profiles = profiles; if (profiles[0]) o.source = row.source || row.platform || profiles[0].platform;
  return o;
}
