// Website traffic from Google Analytics 4, pushed by the Apps Script (deploy/sheets-push.gs → pushGA4).
// One doc per day in web_traffic: totals + per source/medium. No visitor-level data.
import { db } from '../db';

export type GaRow = { date: string; source: string; medium: string; sessions: number; users: number; newUsers?: number; purchases?: number; revenue?: number };
type Bucket = { sessions: number; users: number; new_users: number; purchases: number; revenue: number };

/** Group raw GA4 rows (date × source × medium) into one doc per day. */
export function trafficDocs(rows: GaRow[], business = 'kidscare') {
  const days: Record<string, { date: string; business: string; total: Bucket; by_source: Record<string, Bucket & { source: string; medium: string }> }> = {};
  const z = (): Bucket => ({ sessions: 0, users: 0, new_users: 0, purchases: 0, revenue: 0 });
  for (const r of rows) {
    const date = /^\d{8}$/.test(r.date) ? r.date.slice(0, 4) + '-' + r.date.slice(4, 6) + '-' + r.date.slice(6) : r.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const d = (days[date] ??= { date, business, total: z(), by_source: {} });
    const key = (String(r.source || '(direct)') + ' / ' + String(r.medium || '(none)')).slice(0, 120);
    const b = (d.by_source[key] ??= { source: r.source || '(direct)', medium: r.medium || '(none)', ...z() });
    for (const [k, v] of [['sessions', r.sessions], ['users', r.users], ['new_users', r.newUsers], ['purchases', r.purchases], ['revenue', r.revenue]] as const) {
      const n = Number(v) || 0;
      b[k] += n; d.total[k] += n;
    }
  }
  return Object.values(days);
}

export async function saveTraffic(rows: GaRow[], property: string) {
  const docs = trafficDocs(rows);
  const col = db().collection('web_traffic');
  for (const d of docs) await col.doc('kidscare_' + d.date).set({ ...d, property, asof: new Date().toISOString() });
  return { days: docs.length, sessions: docs.reduce((s, d) => s + d.total.sessions, 0) };
}
