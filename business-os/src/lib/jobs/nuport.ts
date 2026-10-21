// Nuport → sales_daily. Runs 3× a day from the worker (08:50, 13:50, 20:50 Asia/Dhaka).
//  1. new orders: SO numbers after the last known one, up to +300, stopping after 30 404s in a row
//  2. refresh: orders created in the last 14 days, and unfinished ones up to 45 days old (status changes)
//  3. recompute sales_daily for the affected BD dates from all stored orders
import { db } from '../db';
import { cfg } from '../config';
import { addDays, bdDate, bdToday } from '../time';
import { salesDaily, slim, type NuportOrder } from '../calc/nuport';

const API = 'https://api.nuport.io/integration/orders/SO-';
const TERMINAL = new Set(['COMPLETED', 'CANCELLED']);
type Stored = NuportOrder & { so: number };

async function fetchOrder(n: number, key: string): Promise<NuportOrder | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + n, { headers: { Authorization: key }, signal: AbortSignal.timeout(30000) });
      if (r.status === 404) return null;
      if (r.ok) return slim(await r.json());
    } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error('Nuport SO-' + n + ' failed 3 times');
}

async function pool<T, R>(items: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await f(items[k]); } }));
  return out;
}

export async function nuportSync(opts: { key?: string; startSo?: number; today?: string } = {}) {
  const key = opts.key ?? (await cfg('NUPORT_API_KEY'));
  if (!key) throw new Error('NUPORT_API_KEY is not set (Admin → Integrations)');
  const store = db();
  const stateRef = store.collection('sync_state').doc('nuport');
  const state = (await stateRef.get())?.data ?? {};
  const start = Number(state.last_so ?? opts.startSo ?? (await cfg('NUPORT_START_SO')));
  if (!Number.isFinite(start) || start <= 0) throw new Error('Set NUPORT_START_SO (the last SO number already counted) in Admin → Integrations for the first run');
  const today = opts.today ?? bdToday();
  const ordersCol = store.collection('nuport_orders');
  const save = (so: number, o: NuportOrder) => ordersCol.doc(String(so)).set({ ...o, so });

  // 1. new orders, in order, in small parallel batches (the first run may backfill further)
  const span = state.last_so ? 300 : 5000;
  let last = start, misses = 0, added = 0;
  for (let n = start + 1; n <= start + span && misses < 30; n += 6) {
    const nums = Array.from({ length: 6 }, (_, i) => n + i).filter((x) => x <= start + span);
    const got = await pool(nums, 4, (x) => fetchOrder(x, key));
    for (let i = 0; i < nums.length; i++) {
      if (got[i]) { await save(nums[i], got[i]!); last = nums[i]; misses = 0; added++; }
      else if (++misses >= 30) break;
    }
  }

  // 2. refresh recent / unfinished orders
  const all = (await ordersCol.limit(5000).orderBy('so', 'desc').get()).map((s) => s.data as Stored);
  const since14 = addDays(today, -14), since45 = addDays(today, -45);
  const stale = all.filter((o) => { const d = bdDate(o.created); return !!d && (d >= since14 || (d >= since45 && !TERMINAL.has(String(o.status)))); });
  let changed = 0;
  const fresh = await pool(stale, 4, async (o) => ({ o, n: await fetchOrder(o.so, key).catch(() => null) }));
  for (const { o, n } of fresh) {
    if (n && (n.status !== o.status || n.delivered_at !== o.delivered_at || n.is_return !== o.is_return || n.total !== o.total)) { await save(o.so, n); Object.assign(o, n); changed++; }
  }

  // 3. sales_daily for the last 14 days. Skip days too close to the first stored order: orders created
  //    before it aren't known, so that day's counts (and deliveries for ~10 days after) would come out low.
  const firstDay = all.map((o) => bdDate(o.created)).filter(Boolean).sort()[0];
  const safeFrom = firstDay ? addDays(firstDay, 10) : null;
  const days: string[] = [];
  for (let d = since14; d <= today; d = addDays(d, 1)) if (safeFrom && d >= safeFrom) days.push(d);
  const rows = salesDaily(all, days);
  const sd = store.collection('sales_daily');
  for (const r of rows) {
    const { id, ...data } = r;
    const cur = await sd.doc(id).get();
    // keep fields someone added by hand (e.g. cash_due) unless Nuport computed them
    await sd.doc(id).set({ ...(cur?.data ?? {}), ...data, cash_due: cur?.data?.cash_due ?? 0 });
  }
  await stateRef.set({ last_so: last, last_run: new Date().toISOString(), added, refreshed: stale.length, changed, days: days.length });
  return { last_so: last, added, refreshed: stale.length, changed, days: days.length };
}
