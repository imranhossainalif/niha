// Website traffic from Google Analytics 4, pushed by the Apps Script (deploy/sheets-push.gs → pushGA4).
// One doc per day in web_traffic (totals, per source/medium, pages, landing pages, devices, cities) plus
// web_traffic/<business>_realtime (visitors right now). Doc ids are <business>_<date> (kidscare, lrf).
// Only additive counts are stored, so any range can be summed:
// bounce rate = 1 − engaged_sessions / sessions, avg engagement = engagement_sec / sessions.
import { db } from '../db';

export type GaRow = { date: string; source: string; medium: string; sessions: number; users: number; newUsers?: number; purchases?: number; revenue?: number };
export type GaDay = { date: string; sessions: number; users: number; newUsers?: number; engagedSessions?: number; views?: number; engagementSec?: number; addToCarts?: number; checkouts?: number; purchases?: number; revenue?: number };
export type GaPage = { date: string; page: string; title?: string; views: number; users: number; engagementSec?: number };
export type GaLanding = { date: string; page: string; sessions: number; engagedSessions?: number };
export type GaDim = { date: string; key: string; sessions: number; users?: number };
export type GaRealtime = { activeUsers: number; pages?: { page: string; users: number }[]; sources?: { source: string; users: number }[]; devices?: { device: string; users: number }[] };
export type GaPush = { property: string; business?: string; propertyName?: string; rows?: GaRow[]; days?: GaDay[]; pages?: GaPage[]; landing?: GaLanding[]; devices?: GaDim[]; cities?: GaDim[]; realtime?: GaRealtime };

type Bucket = { sessions: number; users: number; new_users: number; purchases: number; revenue: number };
type DayDoc = {
  date: string; business: string; total: Bucket & Record<string, number>; by_source: Record<string, Bucket & { source: string; medium: string }>;
  pages?: Record<string, { page: string; title?: string; views: number; users: number; engagement_sec: number }>;
  landing?: Record<string, { page: string; sessions: number; engaged_sessions: number }>;
  devices?: Record<string, number>; cities?: Record<string, number>;
};

const isoDate = (d: string) => (/^\d{8}$/.test(d) ? d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6) : d);
const okDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const n = (v: unknown) => Number(v) || 0;
const key = (s: string) => s.replace(/[.$/#[\]]/g, '_').slice(0, 150) || '(none)';
const topN = <T,>(o: Record<string, T>, by: (x: T) => number, k: number) => Object.fromEntries(Object.entries(o).sort((a, b) => by(b[1]) - by(a[1])).slice(0, k));

/** Group a push into one doc per day. */
export function trafficDocs(push: GaPush | GaRow[], business?: string): DayDoc[] {
  const p: GaPush = Array.isArray(push) ? { property: '', rows: push } : push;
  business = business ?? p.business ?? 'kidscare';
  const days: Record<string, DayDoc> = {};
  const z = (): Bucket => ({ sessions: 0, users: 0, new_users: 0, purchases: 0, revenue: 0 });
  const day = (raw: string) => { const date = isoDate(raw); return okDate(date) ? (days[date] ??= { date, business, total: { ...z() }, by_source: {} }) : null; };

  for (const r of p.rows ?? []) {
    const d = day(r.date); if (!d) continue;
    const k = (String(r.source || '(direct)') + ' / ' + String(r.medium || '(none)')).slice(0, 120);
    const b = (d.by_source[k] ??= { source: r.source || '(direct)', medium: r.medium || '(none)', ...z() });
    b.sessions += n(r.sessions); b.users += n(r.users); b.new_users += n(r.newUsers); b.purchases += n(r.purchases); b.revenue += n(r.revenue);
    if (!p.days) { d.total.sessions += n(r.sessions); d.total.users += n(r.users); d.total.new_users += n(r.newUsers); d.total.purchases += n(r.purchases); d.total.revenue += n(r.revenue); }
  }
  // site-wide daily totals (exact users, bounce/engagement, funnel) win over summing sources
  for (const r of p.days ?? []) {
    const d = day(r.date); if (!d) continue;
    d.total = { sessions: n(r.sessions), users: n(r.users), new_users: n(r.newUsers), engaged_sessions: n(r.engagedSessions), views: n(r.views), engagement_sec: n(r.engagementSec),
      add_to_carts: n(r.addToCarts), checkouts: n(r.checkouts), purchases: n(r.purchases), revenue: n(r.revenue) };
  }
  for (const r of p.pages ?? []) {
    const d = day(r.date); if (!d) continue;
    const pg = ((d.pages ??= {})[key(r.page)] ??= { page: r.page, title: r.title, views: 0, users: 0, engagement_sec: 0 });
    pg.views += n(r.views); pg.users += n(r.users); pg.engagement_sec += n(r.engagementSec);
  }
  for (const r of p.landing ?? []) {
    const d = day(r.date); if (!d) continue;
    const l = ((d.landing ??= {})[key(r.page)] ??= { page: r.page, sessions: 0, engaged_sessions: 0 });
    l.sessions += n(r.sessions); l.engaged_sessions += n(r.engagedSessions);
  }
  for (const [list, field] of [[p.devices, 'devices'], [p.cities, 'cities']] as const) {
    for (const r of list ?? []) { const d = day(r.date); if (!d) continue; const m = (d[field] ??= {}); m[key(r.key)] = (m[key(r.key)] || 0) + n(r.sessions); }
  }
  for (const d of Object.values(days)) {
    if (d.pages) d.pages = topN(d.pages, (x) => x.views, 100);
    if (d.landing) d.landing = topN(d.landing, (x) => x.sessions, 50);
    if (d.cities) d.cities = topN(d.cities, (x) => x, 30);
  }
  return Object.values(days);
}

/** Save a push. Parts not in this push (e.g. pages on an hourly run) keep their stored values. */
export async function saveTraffic(push: GaPush | GaRow[], property?: string) {
  const p: GaPush = Array.isArray(push) ? { property: property ?? '', rows: push } : push;
  const business = p.business || 'kidscare';
  const docs = trafficDocs(p, business);
  const col = db().collection('web_traffic');
  const asof = new Date().toISOString();
  for (const d of docs) {
    const ref = col.doc(business + '_' + d.date);
    const cur = (await ref.get())?.data ?? {};
    await ref.set({ ...cur, ...d, ...(Object.keys(d.by_source).length ? {} : { by_source: cur.by_source ?? {} }), property: p.property, property_name: p.propertyName ?? cur.property_name ?? '', asof });
  }
  if (p.realtime) await col.doc(business + '_realtime').set({ business, date: '', realtime: true, ...p.realtime, property: p.property, property_name: p.propertyName ?? '', asof });
  return { business, days: docs.length, sessions: docs.reduce((s, d) => s + d.total.sessions, 0), realtime: p.realtime?.activeUsers ?? null };
}
