// Connection + limit check for every outside service the system depends on (Settings → API o connection).
// Each check is live where the service allows it (a 1-token Anthropic call, Meta debug_token, Nuport, Make.com), and
// otherwise judged from how fresh the last push/job is. Result is stored in system_health/latest (hourly from the
// worker, and on demand from the Settings page) so the dashboard can show a warning without calling anything.
import { statfs } from 'node:fs/promises';
import { prisma } from './prisma';
import { db } from './db';
import { cfg, type ConfigKey } from './config';
import { MODEL } from './anthropic';
import { getConfig as inboxConfig } from './inbox/store';

export type Status = 'ok' | 'warn' | 'bad' | 'off';
export type Limit = { label: string; used: number; max: number; unit?: string; note?: string };
export type Health = {
  id: string; name: string; status: Status; summary: string;
  limits?: Limit[]; details?: [string, string][]; fix?: string;
  links?: { label: string; url: string }[]; keys?: ConfigKey[];
};

const GRAPH = 'https://graph.facebook.com/v21.0';
const HOUR = 3600e3;
const ago = (t: Date | string | number | null | undefined) => {
  if (!t) return '—';
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  return m < 1 ? 'ekhoni' : m < 60 ? m + ' min age' : m < 1440 ? Math.round(m / 60) + ' ghonta age' : Math.round(m / 1440) + ' din age';
};
const fmtDate = (t: string | number | Date) => new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
async function get(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const text = await r.text();
  let j: any = null; try { j = JSON.parse(text); } catch { /* not json */ }
  return { r, j, text };
}
const worst = (xs: Status[]): Status => (xs.includes('bad') ? 'bad' : xs.includes('warn') ? 'warn' : xs.includes('ok') ? 'ok' : 'off');
const lastJob = (kind: string, where: object = {}) => prisma.job.findFirst({ where: { kind, ...where }, orderBy: { createdAt: 'desc' } });

async function anthropicCheck(): Promise<Health> {
  const base = { id: 'anthropic', name: 'Anthropic (Claude AI)', keys: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'ANTHROPIC_MODEL_COMPLEX'] as ConfigKey[],
    links: [{ label: 'Credit / billing', url: 'https://console.anthropic.com/settings/billing' }, { label: 'Spend limit', url: 'https://console.anthropic.com/settings/limits' }, { label: 'Usage', url: 'https://console.anthropic.com/usage' }] };
  const key = await cfg('ANTHROPIC_API_KEY');
  if (!key) return { ...base, status: 'off', summary: 'Key nai — AI chat, InboxPilot AI reply ar AI jobs cholbe na.', fix: 'console.anthropic.com → API keys → Create key, tarpor nicher form e boshan.' };
  const model = await MODEL();
  const usage = (await db().collection('system_usage').doc('anthropic_' + new Date().toISOString().slice(0, 7)).get())?.data as { models?: Record<string, Record<string, number>> } | undefined;
  const details: [string, string][] = [['Model', model]];
  for (const [m, x] of Object.entries(usage?.models ?? {})) details.push(['Ei mashe ' + m, x.calls + ' bar · ' + Math.round((x.input + x.cache_read + x.cache_write) / 1000) + 'k input + ' + Math.round(x.output / 1000) + 'k output token']);
  const { r, j } = await get('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
  });
  const limits: Limit[] = [];
  const hdr = (n: string) => Number(r.headers.get('anthropic-ratelimit-' + n));
  for (const [k, label] of [['requests', 'Request / minute'], ['input-tokens', 'Input token / minute'], ['output-tokens', 'Output token / minute']]) {
    const max = hdr(k + '-limit'), rem = hdr(k + '-remaining');
    if (max > 0 && Number.isFinite(rem)) limits.push({ label, used: max - rem, max, note: 'rate limit (proti minute e reset)' });
  }
  const msg = String(j?.error?.message || '');
  if (r.ok) return { ...base, status: 'ok', summary: 'Kaj korche. Credit ache (test call shofol).', limits, details: [...details, ['Balance', 'Anthropic API balance dekhay na — "Credit / billing" link e dekhun. Auto-reload chalu rakhle credit shesh hobe na.']] };
  if (/credit balance/i.test(msg)) return { ...base, status: 'bad', summary: 'CREDIT SHESH — AI kono kaj korche na (chat, inbox reply, weekly jobs).', limits, details: [...details, ['Anthropic bolche', msg]], fix: 'Credit / billing link e giye credit kinun (ba auto-reload chalu korun). Kinar 1–2 min por eta abar check korun.' };
  if (r.status === 401 || r.status === 403) return { ...base, status: 'bad', summary: 'Key kaj korche na (bhul, muche fela ba bondho).', details: [...details, ['Anthropic bolche', msg || String(r.status)]], fix: 'Notun key banan, nicher form e boshan.' };
  if (r.status === 429) return { ...base, status: 'warn', summary: /spend limit|usage limit/i.test(msg) ? 'Mashik spend limit e pouche geche — AI bondho thakbe limit na barano porjonto.' : 'Rate limit — ekhon onek beshi call, ektu por thik hobe.', limits, details: [...details, ['Anthropic bolche', msg]], fix: /limit/i.test(msg) ? '"Spend limit" link e limit baran.' : undefined };
  if (r.status === 404 || /model/i.test(msg)) return { ...base, status: 'bad', summary: 'Model er naam bhul: ' + model, details: [...details, ['Anthropic bolche', msg]], fix: 'Nicher form e Model faka korun (default use hobe) ba thik naam din.' };
  return { ...base, status: 'warn', summary: 'Anthropic theke uttor ' + r.status + (r.status >= 500 ? ' (oder server e shomossa, nijei thik hoy)' : ''), details: [...details, ['Anthropic bolche', msg || String(r.status)]] };
}

/** Meta token info via debug_token (works with the token itself for system-user and page tokens). */
async function debugToken(token: string) {
  const { j } = await get(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`);
  return (j?.data ?? { is_valid: false, error: j?.error }) as { is_valid: boolean; expires_at?: number; data_access_expires_at?: number; scopes?: string[]; type?: string; error?: { message: string } };
}
const usagePct = (r: Response) => {
  let max = 0;
  for (const h of ['x-app-usage', 'x-business-use-case-usage', 'x-page-usage']) {
    const v = r.headers.get(h); if (!v) continue;
    JSON.stringify(JSON.parse(v)).replace(/"(call_count|total_cputime|total_time)":(\d+)/g, (_, __, n) => { max = Math.max(max, Number(n)); return ''; });
  }
  return max;
};
function tokenLines(t: Awaited<ReturnType<typeof debugToken>>): { details: [string, string][]; status: Status; note?: string } {
  const details: [string, string][] = [];
  let status: Status = 'ok', note: string | undefined;
  if (t.expires_at) {
    const days = (t.expires_at * 1000 - Date.now()) / 86400e3;
    details.push(['Token er meyad', fmtDate(t.expires_at * 1000) + ' (' + Math.max(0, Math.round(days)) + ' din baki)']);
    if (days < 7) { status = 'warn'; note = 'Token ' + Math.max(0, Math.round(days)) + ' din por shesh hobe — notun token banan.'; }
  } else if (t.is_valid) details.push(['Token er meyad', 'Kokhono shesh hobe na']);
  if (t.data_access_expires_at) details.push(['Data access', fmtDate(t.data_access_expires_at * 1000) + ' porjonto']);
  if (t.scopes?.length) details.push(['Permission', t.scopes.join(', ')]);
  return { details, status, note };
}

async function metaPageCheck(): Promise<Health> {
  const base = { id: 'meta_page', name: 'Meta · Facebook Page (InboxPilot)', keys: ['META_PAGE_ID', 'META_PAGE_TOKEN', 'META_APP_SECRET', 'META_VERIFY_TOKEN'] as ConfigKey[],
    links: [{ label: 'Meta app dashboard', url: 'https://developers.facebook.com/apps/' }, { label: 'Business settings', url: 'https://business.facebook.com/settings/system-users' }] };
  const [token, pageId, secret] = await Promise.all([cfg('META_PAGE_TOKEN'), cfg('META_PAGE_ID'), cfg('META_APP_SECRET')]);
  if (!token) return { ...base, status: 'off', summary: 'Page token nai — Messenger message ashbe na, reply jabe na.', fix: 'Meta app → Messenger → Access tokens theke page token niye nicher form e boshan.' };
  const t = await debugToken(token);
  if (!t.is_valid) return { ...base, status: 'bad', summary: 'Page token kaj korche na (shesh/bondho hoye geche).', details: [['Meta bolche', t.error?.message || 'invalid token']], fix: 'Notun page token banan, nicher form e boshan.' };
  const tl = tokenLines(t);
  const details = [...tl.details];
  const statuses: Status[] = [tl.status];
  const notes: string[] = tl.note ? [tl.note] : [];
  let limits: Limit[] = [];
  if (pageId) {
    const { r, j } = await get(`${GRAPH}/${pageId}?fields=name,followers_count&access_token=${encodeURIComponent(token)}`);
    if (j?.name) details.unshift(['Page', j.name + (j.followers_count ? ' · ' + Number(j.followers_count).toLocaleString('en-IN') + ' follower' : '')]);
    // reading page info needs pages_read_engagement, which messaging itself does not: only a token/page error is a problem
    else if (j?.error?.code === 100 || j?.error?.code === 10) details.unshift(['Page', pageId + ' (naam porar permission nai — message er jonno lage na)']);
    else { statuses.push('bad'); notes.push('Page ' + pageId + ' porte parche na: ' + (j?.error?.message || r.status)); }
    const pct = usagePct(r); limits = [{ label: 'Meta API call limit', used: pct, max: 100, unit: '%', note: '100% hole Meta kichukkhon call bondho rakhe' }];
    if (pct >= 80) { statuses.push('warn'); notes.push('Meta API limit ' + pct + '% use hoyeche.'); }
  }
  if (!secret) { statuses.push('warn'); notes.push('App secret nai — webhook (live message) kaj korbe na.'); }
  const last = (await db().collection('inbox_messages').where('dir', '==', 'in').orderBy('ts', 'desc').limit(1).get())[0]?.data as { ts?: string } | undefined;
  details.push(['Shesh customer message', last?.ts ? ago(last.ts) + ' (' + fmtDate(last.ts) + ')' : 'ekhono nai']);
  const ib = await inboxConfig().catch(() => null);
  details.push(['AI auto-reply', ib?.ai_on ? 'ON' : 'OFF (Admin → InboxPilot)']);
  if (last?.ts && Date.now() - Date.parse(last.ts) > 24 * HOUR) { statuses.push('warn'); notes.push('24 ghontar beshi kono notun message ashe nai — webhook e "messages" subscribe kora ache kina dekhun.'); }
  const st = worst(statuses);
  return { ...base, status: st, summary: notes.length ? notes.join(' ') : 'Kaj korche. Token valid.', details, limits, fix: notes.length ? notes.join(' ') : undefined };
}

const AD_STATUS: Record<number, [string, Status]> = { 1: ['Active', 'ok'], 2: ['Disabled', 'bad'], 3: ['Unsettled (bill baki)', 'bad'], 7: ['Risk review', 'warn'], 8: ['Pending settlement', 'warn'], 9: ['Grace period (bill dite hobe)', 'warn'], 100: ['Pending closure', 'bad'], 101: ['Closed', 'bad'] };
async function metaAdsCheck(): Promise<Health> {
  const base = { id: 'meta_ads', name: 'Meta Ads (ad data, Supermetrics er free bikolpo)', keys: ['META_ADS_TOKEN'] as ConfigKey[],
    links: [{ label: 'System users', url: 'https://business.facebook.com/settings/system-users' }, { label: 'Billing & payments', url: 'https://business.facebook.com/billing_hub/payment_settings' }] };
  const token = await cfg('META_ADS_TOKEN');
  if (!token) return { ...base, status: 'off', summary: 'Ads token nai — Marketing tab e ad er khoroch/result ashbe na.', fix: 'Business settings → System users → business-os → Generate token (ads_read, pages_read_engagement), nicher form e boshan.' };
  const t = await debugToken(token);
  if (!t.is_valid) return { ...base, status: 'bad', summary: 'Ads token kaj korche na.', details: [['Meta bolche', t.error?.message || 'invalid token']], fix: 'Notun system user token banan.' };
  const tl = tokenLines(t);
  const { r, j } = await get(`${GRAPH}/me/adaccounts?fields=name,account_status,disable_reason,amount_spent,spend_cap,balance,currency&limit=50&access_token=${encodeURIComponent(token)}`);
  const accts = (j?.data ?? []) as { id: string; name: string; account_status: number; amount_spent?: string; spend_cap?: string; balance?: string; currency?: string }[];
  const statuses: Status[] = [tl.status]; const notes: string[] = tl.note ? [tl.note] : [];
  const details: [string, string][] = [];
  const limits: Limit[] = [];
  for (const a of accts) {
    const [label, st] = AD_STATUS[a.account_status] ?? ['Status ' + a.account_status, 'warn'];
    statuses.push(st);
    const cur = a.currency || '';
    details.push([a.name + ' (' + a.id + ')', label + (Number(a.balance) ? ' · bill baki ' + (Number(a.balance) / 100).toLocaleString('en-IN') + ' ' + cur : '')]);
    if (st !== 'ok') notes.push(a.name + ': ' + label + '.');
    if (Number(a.spend_cap) > 0) {
      const used = Number(a.amount_spent) / 100, max = Number(a.spend_cap) / 100;
      limits.push({ label: a.name + ' · spend cap', used, max, unit: cur, note: 'cap e pouchale ad bondho hoye jay' });
      if (used / max >= 0.9) { statuses.push('warn'); notes.push(a.name + ': spend cap er ' + Math.round((used / max) * 100) + '% khoroch hoye geche.'); }
    }
  }
  if (!accts.length) { statuses.push('warn'); notes.push('Kono ad account dekha jacche na — system user ke ad account assign korun.'); }
  const pct = usagePct(r); if (pct) limits.push({ label: 'Meta Ads API call limit', used: pct, max: 100, unit: '%' });
  return { ...base, status: worst(statuses), summary: notes.length ? notes.join(' ') : accts.length + ' ta ad account, shob active.', details: [...details, ...tl.details], limits, fix: notes.length ? notes.join(' ') : undefined };
}

async function nuportCheck(): Promise<Health> {
  const base = { id: 'nuport', name: 'Nuport (Kids Care order)', keys: ['NUPORT_API_KEY', 'NUPORT_START_SO'] as ConfigKey[], links: [{ label: 'Nuport', url: 'https://app.nuport.io' }] };
  const key = await cfg('NUPORT_API_KEY');
  if (!key) return { ...base, status: 'off', summary: 'Key nai — order data ashbe na.' };
  const st = ((await db().collection('sync_state').doc('nuport').get())?.data ?? {}) as { last_so?: number; last_run?: string; added?: number };
  const details: [string, string][] = [['Shesh sync', st.last_run ? ago(st.last_run) + ' (' + fmtDate(st.last_run) + ')' : 'ekhono hoyni'], ['Shesh SO', st.last_so ? 'SO-' + st.last_so : '—'], ['Schedule', 'din e 3 bar: 08:50, 13:50, 20:50']];
  const failed = await lastJob('nuport_sync');
  if (failed?.status === 'failed') details.push(['Shesh job er error', String(failed.error || '').slice(0, 200)]);
  let live: Status = 'ok', note = '';
  if (st.last_so) {
    const { r } = await get('https://api.nuport.io/integration/orders/SO-' + st.last_so, { headers: { Authorization: key } });
    if (r.status === 401 || r.status === 403) { live = 'bad'; note = 'Nuport key ar kaj korche na (' + r.status + ').'; }
    else if (!r.ok && r.status !== 404) { live = 'warn'; note = 'Nuport theke uttor ' + r.status + '.'; }
  }
  const stale = !st.last_run || Date.now() - Date.parse(st.last_run) > 13 * HOUR;
  const s = worst([live, failed?.status === 'failed' ? 'warn' : 'ok', stale ? 'warn' : 'ok']);
  return { ...base, status: s, summary: note || (stale ? '13 ghontar beshi sync hoyni — worker cholche kina dekhun.' : failed?.status === 'failed' ? 'Shesh sync e error.' : 'Kaj korche.'), details, fix: note ? 'Nuport theke notun API key niye nicher form e boshan.' : undefined };
}

async function sheetsCheck(): Promise<Health> {
  const base = { id: 'sheets', name: 'Google Sheets (sales team, call, daily report / hajira)', keys: ['SHEETS_PUSH_ENABLED', 'GOOGLE_SERVICE_ACCOUNT_JSON'] as ConfigKey[], links: [{ label: 'Apps Script', url: 'https://script.google.com/home/executions' }] };
  const last = await lastJob('sheets_push');
  const ok = await lastJob('sheets_push', { status: 'done' });
  if (!last) return { ...base, status: 'off', summary: 'Apps Script ekhono kichu pathay ni.', fix: 'deploy/sheets-push.gs Apps Script e boshiye "setup" Run korun.' };
  const age = ok?.finishedAt ? Date.now() - ok.finishedAt.getTime() : Infinity;
  const details: [string, string][] = [['Shesh shofol push', ok?.finishedAt ? ago(ok.finishedAt) + ' (' + fmtDate(ok.finishedAt) + ')' : 'kokhono na'], ['Schedule', 'Apps Script, proti 10 min']];
  if (last.status === 'failed') details.push(['Shesh push er error', String(last.error || '').slice(0, 300)]);
  const s: Status = last.status === 'failed' ? 'bad' : age > 3 * HOUR ? 'bad' : age > 45 * 60e3 ? 'warn' : 'ok';
  return { ...base, status: s, details,
    summary: s === 'ok' ? 'Kaj korche. Shesh push ' + ago(ok?.finishedAt) + '.' : last.status === 'failed' ? 'Shesh push e error — sheet er data update hocche na.' : 'Shesh push ' + ago(ok?.finishedAt) + ' — Apps Script bondho ba error dicche.',
    fix: s === 'ok' ? undefined : 'Apps Script → Executions e error dekhun. Google account er permission ba API key bodle gele script e notun key boshan, "setup" abar Run korun.' };
}

async function ga4Check(biz: 'kidscare' | 'lrf', label: string): Promise<Health> {
  const base = { id: 'ga4_' + biz, name: 'Google Analytics (GA4) · ' + label, links: [{ label: 'Apps Script', url: 'https://script.google.com/home/executions' }, { label: 'GA4', url: 'https://analytics.google.com/' }] };
  const jobs = await prisma.job.findMany({ where: { kind: 'ga4_push', status: 'done' }, orderBy: { createdAt: 'desc' }, take: 40 });
  const last = jobs.find((j) => ((j.result as { business?: string } | null)?.business ?? 'kidscare') === biz);
  const doc = (await db().collection('web_traffic').where('business', '==', biz).orderBy('date', 'desc').limit(1).get())[0]?.data as { property_name?: string; property?: string; date?: string } | undefined;
  if (!last) return { ...base, status: 'off', summary: 'GA4 data ekhono ashe nai.', fix: 'Apps Script e GA4_SITES.' + biz + ' e ' + label + ' er Measurement ID (G-…) boshiye "setupGA4" Run korun.' };
  const age = Date.now() - (last.finishedAt ?? last.createdAt).getTime();
  const details: [string, string][] = [['Shesh push', ago(last.finishedAt) + ' (' + fmtDate(last.finishedAt ?? last.createdAt) + ')'], ['GA4 property', (doc?.property_name || '—') + (doc?.property ? ' · ' + doc.property : '')], ['Schedule', 'Apps Script, proti 15 min']];
  const s: Status = age > 3 * HOUR ? 'bad' : age > 45 * 60e3 ? 'warn' : 'ok';
  return { ...base, status: s, details, summary: s === 'ok' ? 'Kaj korche.' : 'Shesh push ' + ago(last.finishedAt) + ' — Apps Script e error ba bondho.', fix: s === 'ok' ? undefined : 'Apps Script → Executions e pushGA4 er error dekhun.' };
}

async function makeCheck(): Promise<Health> {
  const base = { id: 'make', name: 'Make.com', keys: ['MAKE_API_TOKEN', 'MAKE_ZONE'] as ConfigKey[], links: [{ label: 'Make subscription', url: 'https://www.make.com/en/pricing' }] };
  const token = await cfg('MAKE_API_TOKEN');
  if (!token) return { ...base, status: 'off', summary: 'Make er API token deya nai, tai operation limit dekhte parchi na. (InboxPilot ekhon ei server e chole — Make lage na.)', fix: 'Make → Profile → API access → Add token (scope: organizations:read, scenarios:read), nicher form e boshan.' };
  const zone = ((await cfg('MAKE_ZONE')) || 'us2.make.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const h = { headers: { Authorization: 'Token ' + token } };
  const list = await get(`https://${zone}/api/v2/organizations`, h);
  if (!list.r.ok) return { ...base, status: 'bad', summary: 'Make token kaj korche na (' + list.r.status + ').', details: [['Make bolche', String(list.j?.message || list.j?.detail || list.text).slice(0, 200)]], fix: 'Zone thik ache kina dekhun (jemon us2.make.com), notun token din.' };
  const orgs = (list.j?.organizations ?? []) as { id: number }[];
  const details: [string, string][] = []; const limits: Limit[] = []; const statuses: Status[] = []; const notes: string[] = [];
  for (const o of orgs.slice(0, 3)) {
    const g = await get(`https://${zone}/api/v2/organizations/${o.id}`, h);
    const x = g.j?.organization ?? g.j ?? {};
    const used = Number(x.operations) || 0, max = Number(x.license?.operations) || 0;
    if (max) limits.push({ label: (x.name || 'Organization') + ' · operation', used, max, note: 'reset ' + (x.nextReset ? fmtDate(x.nextReset) : '—') });
    details.push([x.name || String(o.id), (x.productName || x.serviceName || '') + ' plan' + (x.isPaused ? ' · PAUSED' : '') + (x.nextReset ? ' · reset ' + fmtDate(x.nextReset) : '')]);
    if (x.isPaused || (max && used >= max)) { statuses.push('bad'); notes.push((x.name || 'Make') + ': operation shesh, shob scenario bondho' + (x.nextReset ? ' (' + fmtDate(x.nextReset) + ' e reset)' : '') + '.'); }
    else if (max && used / max >= 0.85) { statuses.push('warn'); notes.push((x.name || 'Make') + ': operation er ' + Math.round((used / max) * 100) + '% shesh.'); }
    else statuses.push('ok');
    const sc = await get(`https://${zone}/api/v2/scenarios?organizationId=${o.id}&pg[limit]=50`, h).catch(() => null);
    const active = ((sc?.j?.scenarios ?? []) as { name: string; isActive: boolean }[]).filter((s) => s.isActive).map((s) => s.name);
    if (sc?.j?.scenarios) details.push(['Chalu scenario', active.join(', ') || 'nai']);
  }
  return { ...base, status: worst(statuses), summary: notes.join(' ') || 'Kaj korche.', details, limits, fix: notes.length ? 'Plan upgrade korun, extra operation kinun, ba je scenario ar lage na seta bondho korun (InboxPilot ekhon ei server e chole).' : undefined };
}

async function supermetricsCheck(): Promise<Health> {
  const [key, meta] = await Promise.all([cfg('SUPERMETRICS_API_KEY'), cfg('META_ADS_TOKEN')]);
  const base = { id: 'supermetrics', name: 'Supermetrics', keys: ['SUPERMETRICS_API_KEY'] as ConfigKey[], links: [{ label: 'Supermetrics', url: 'https://hub.supermetrics.com/' }] };
  if (!key) return { ...base, status: 'off', summary: meta ? 'Lage na — Meta Ads token diye ad data ashche (free).' : 'Key nai. Ad data er jonno Meta Ads token (free) boshano bhalo.' };
  return { ...base, status: 'ok', summary: 'Key boshano ache' + (meta ? ' (kintu Meta Ads token thakay age oita use hoy).' : '.') };
}

async function workerCheck(): Promise<Health> {
  const base = { id: 'worker', name: 'Background kaj (worker) o backup' };
  const since = new Date(Date.now() - 24 * HOUR);
  const [lastSched, failed, stuck, backup] = await Promise.all([
    prisma.job.findFirst({ where: { createdBy: 'schedule' }, orderBy: { createdAt: 'desc' } }),
    // 'Worker restarted' = cut off by a deploy; resumable jobs are queued again, so that is not a problem
    prisma.job.findMany({ where: { status: 'failed', createdAt: { gte: since }, NOT: { error: 'Worker restarted' } }, orderBy: { createdAt: 'desc' }, take: 10 }),
    prisma.job.findMany({ where: { status: 'running', startedAt: { lt: new Date(Date.now() - 3 * HOUR) } }, take: 5 }),
    lastJob('backup', { status: 'done' }),
  ]);
  const details: [string, string][] = [['Shesh schedule kaj', lastSched ? lastSched.kind + ' · ' + ago(lastSched.createdAt) : '—'], ['Shesh backup', backup?.finishedAt ? ago(backup.finishedAt) + ' (' + fmtDate(backup.finishedAt) + ')' : 'ekhono hoyni']];
  for (const f of failed) details.push(['Error: ' + f.kind + ' · ' + ago(f.createdAt), String(f.error || '').slice(0, 200)]);
  for (const s of stuck) details.push(['Atke ache: ' + s.kind, 'shuru ' + ago(s.startedAt)]);
  const st: Status[] = [];
  const notes: string[] = [];
  if (!lastSched || Date.now() - lastSched.createdAt.getTime() > 14 * HOUR) { st.push('bad'); notes.push('Worker 14 ghontar beshi kono kaj koreni — server e worker bondho thakte pare.'); }
  if (!backup?.finishedAt || Date.now() - backup.finishedAt.getTime() > 30 * HOUR) { st.push('warn'); notes.push('Backup 30 ghontar beshi hoyni.'); }
  if (failed.length) { st.push('warn'); notes.push('Shesh 24 ghontay ' + failed.length + ' ta kaj e error.'); }
  if (stuck.length) { st.push('warn'); notes.push(stuck.length + ' ta kaj 3 ghontar beshi atke ache.'); }
  return { ...base, status: worst(st.length ? st : ['ok']), summary: notes.join(' ') || 'Shob kaj thik moto cholche, backup hocche.', details };
}

async function serverCheck(): Promise<Health> {
  const base = { id: 'server', name: 'Server (VPS) o database' };
  const details: [string, string][] = []; const limits: Limit[] = [];
  let status: Status = 'ok', summary = 'Jayga ache.';
  try {
    const s = await statfs('/');
    const total = s.blocks * s.bsize, free = s.bavail * s.bsize;
    limits.push({ label: 'Disk', used: Math.round((total - free) / 1e8) / 10, max: Math.round(total / 1e8) / 10, unit: 'GB' });
    if (free / total < 0.05) { status = 'bad'; summary = 'Disk prai bhore geche — data save bondho hoye jete pare.'; }
    else if (free / total < 0.15) { status = 'warn'; summary = 'Disk ' + Math.round((1 - free / total) * 100) + '% bhora.'; }
  } catch { /* statfs unsupported */ }
  const rows = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`.catch(() => []);
  if (rows[0]) details.push(['Database', (Number(rows[0].size) / 1e6).toFixed(0) + ' MB']);
  return { ...base, status, summary, details, limits };
}


const SOCIAL_SCOPES = ['pages_manage_posts', 'pages_read_engagement', 'read_insights', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'];
async function socialCheck(): Promise<Health> {
  const base = { id: 'social', name: 'Social Media (Facebook, Instagram, YouTube, TikTok)', keys: ['META_SOCIAL_TOKEN'] as ConfigKey[], links: [{ label: 'System users', url: 'https://business.facebook.com/settings/system-users' }] };
  const own = await cfg('META_SOCIAL_TOKEN');
  const token = own || (await cfg('META_ADS_TOKEN'));
  const accts = (await db().collection('social_accounts').limit(100).get()).map((x) => x.data as { name: string; network: string; active?: boolean; error?: string }).filter((a) => a.active !== false);
  const NET: Record<string, string> = { facebook: 'FB ', instagram: 'IG ', youtube: 'YouTube ', tiktok: 'TikTok ' };
  if (!token) return { ...base, status: accts.length ? 'ok' : 'off', summary: accts.length ? accts.length + ' ta account connect (Facebook/Instagram er token nai).' : 'Social token nai — post/schedule kora jabe na.', fix: 'Kids Care → Social Media → Accounts e step gulo dekhun.' };
  const t = await debugToken(token);
  if (!t.is_valid) return { ...base, status: 'bad', summary: 'Social token kaj korche na.', details: [['Meta bolche', t.error?.message || 'invalid token']], fix: 'Notun system user token banan.' };
  const missing = SOCIAL_SCOPES.filter((x) => !(t.scopes ?? []).includes(x));
  const since = new Date(Date.now() - 24 * HOUR).toISOString();
  const failed = await db().collection('social_posts').where('status', 'in', ['failed', 'partial']).limit(200).get();
  const recentFail = failed.map((x) => x.data as { published_at?: string; scheduled_at?: string; error?: string }).filter((x) => String(x.scheduled_at || x.published_at || '') >= since);
  const sync = await lastJob('social_sync');
  const details: [string, string][] = [['Token', own ? 'Social token' : 'Ads token (post korar permission thakbe na)'], ['Connect kora', accts.map((a) => (NET[a.network] || '') + a.name).join(', ') || 'kichu na'],
    ['Shesh data sync', sync ? ago(sync.createdAt) + ' · ' + sync.status : '—'], ...tokenLines(t).details];
  for (const f of recentFail.slice(0, 5)) details.push(['Hoyni', String(f.error || '').slice(0, 200)]);
  const notes: string[] = []; const st: Status[] = ['ok'];
  if (missing.length) { st.push(accts.length ? 'bad' : 'warn'); notes.push('Token e permission nai: ' + missing.join(', ') + '.'); }
  if (!accts.length) { st.push('warn'); notes.push('Kono page/Instagram connect kora nai.'); }
  if (recentFail.length) { st.push('bad'); notes.push('Shesh 24 ghontay ' + recentFail.length + ' ta post publish hoyni.'); }
  if (sync?.status === 'failed') { st.push('warn'); notes.push('Shesh data sync e error.'); }
  for (const a of accts.filter((x) => x.error)) { st.push('bad'); notes.push((NET[a.network] || '') + a.name + ': ' + a.error); }
  return { ...base, status: worst(st), summary: notes.join(' ') || 'Kaj korche: ' + accts.length + ' ta account connect.', details, fix: missing.length ? 'System user e notun token banan ei permission gulo tick kore (Social Media → Accounts e step ache), Settings e "Social media token" e boshan.' : notes.length ? notes.join(' ') : undefined };
}

const CHECKS: [string, () => Promise<Health>][] = [
  ['anthropic', anthropicCheck], ['meta_page', metaPageCheck], ['meta_ads', metaAdsCheck], ['social', socialCheck], ['nuport', nuportCheck], ['sheets', sheetsCheck],
  ['ga4_kidscare', () => ga4Check('kidscare', 'Kids Care BD')], ['ga4_lrf', () => ga4Check('lrf', 'Local Revenue Flow')],
  ['make', makeCheck], ['supermetrics', supermetricsCheck], ['worker', workerCheck], ['server', serverCheck],
];

/** Run every check (in parallel, each failure contained) and store the result. */
export async function checkAll() {
  const items = await Promise.all(CHECKS.map(async ([id, f]) => {
    try { return await f(); } catch (e) { return { id, name: id, status: 'warn' as Status, summary: 'Check korte parlam na: ' + String((e as Error)?.message || e).slice(0, 200) }; }
  }));
  const out = { checked_at: new Date().toISOString(), items, bad: items.filter((i) => i.status === 'bad').length, warn: items.filter((i) => i.status === 'warn').length };
  await db().collection('system_health').doc('latest').set(out);
  return out;
}
export type HealthReport = Awaited<ReturnType<typeof checkAll>>;
export async function latestHealth(): Promise<HealthReport | null> {
  return ((await db().collection('system_health').doc('latest').get())?.data as HealthReport | undefined) ?? null;
}
