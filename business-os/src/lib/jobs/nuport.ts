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
const ordersCol = () => db().collection('nuport_orders');
// all stored orders, newest first (queries return at most 5000 rows, so page through)
async function storedOrders(): Promise<Stored[]> {
  const out: Stored[] = [];
  for (let off = 0; ; off += 5000) {
    const page = await ordersCol().orderBy('so', 'desc').limit(5000).offset(off).get();
    out.push(...page.map((s) => s.data as Stored));
    if (page.length < 5000) return out;
  }
}
const save = (so: number, o: NuportOrder) => ordersCol().doc(String(so)).set({ ...o, so });

/**
 * Recompute sales_daily from stored orders for from..to. Days too close to the first stored order are skipped:
 * orders created before it aren't known, so that day's counts (and deliveries for ~10 days after) would come out low.
 */
async function writeSalesDaily(all: Stored[], from: string, to: string): Promise<string[]> {
  const firstDay = all.map((o) => bdDate(o.created)).filter(Boolean).sort()[0];
  const safeFrom = firstDay ? addDays(firstDay, 10) : null;
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (safeFrom && d >= safeFrom) days.push(d);
  const sd = db().collection('sales_daily');
  for (const r of salesDaily(all, days)) {
    const { id, ...data } = r;
    const cur = await sd.doc(id).get();
    // keep fields someone added by hand (e.g. cash_due) unless Nuport computed them
    await sd.doc(id).set({ ...(cur?.data ?? {}), ...data, cash_due: cur?.data?.cash_due ?? 0 });
  }
  return days;
}
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
  const all = await storedOrders();
  const since14 = addDays(today, -14), since45 = addDays(today, -45);
  const stale = all.filter((o) => { const d = bdDate(o.created); return !!d && (d >= since14 || (d >= since45 && !TERMINAL.has(String(o.status)))); });
  let changed = 0;
  const fresh = await pool(stale, 4, async (o) => ({ o, n: await fetchOrder(o.so, key).catch(() => null) }));
  for (const { o, n } of fresh) {
    if (n && (n.status !== o.status || n.delivered_at !== o.delivered_at || n.is_return !== o.is_return || n.total !== o.total || o.source === undefined)) { await save(o.so, n); Object.assign(o, n); changed++; }
  }

  // 3. sales_daily for the last 14 days. Skip days too close to the first stored order: orders created
  //    before it aren't known, so that day's counts (and deliveries for ~10 days after) would come out low.
  const days = await writeSalesDaily(all, since14, today);
  await stateRef.set({ ...state, last_so: last, last_run: new Date().toISOString(), added, refreshed: stale.length, changed, days: days.length });
  return { last_so: last, added, refreshed: stale.length, changed, days: days.length };
}

/**
 * History load for the month/year views. Resumable: progress lives in sync_state/nuport_backfill, so a stopped
 * job (restart, deploy) carries on where it was. Steps:
 *  1. re-fetch stored orders saved before sources were kept
 *  2. find `low`: an SO number created before fromDate (walk back from the oldest stored order)
 *  3. scan every SO from the newest stored one down to `low`, fetching the ones not stored yet (cursor saved per chunk)
 *  4. only when the scan is complete: recompute sales_daily from fromDate (never from partial data)
 */
export async function nuportBackfill(opts: { fromDate: string; key?: string; today?: string }) {
  const key = opts.key ?? (await cfg('NUPORT_API_KEY'));
  if (!key) throw new Error('NUPORT_API_KEY is not set (Admin → Integrations)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.fromDate)) throw new Error('fromDate must be YYYY-MM-DD');
  const today = opts.today ?? bdToday();
  const stRef = db().collection('sync_state').doc('nuport_backfill');
  let st = (await stRef.get())?.data ?? {};
  if (st.from_date !== opts.fromDate || st.done) st = { from_date: opts.fromDate };
  const saveState = (patch: Record<string, unknown>) => { st = { ...st, ...patch, updated: new Date().toISOString() }; return stRef.set(st); };
  let all = await storedOrders();
  if (!all.length) throw new Error('No stored orders yet: run the normal Nuport sync first');

  // 1. orders stored without source info
  const old = all.filter((o) => o.source === undefined);
  await pool(old, 4, async (o) => { const n = await fetchOrder(o.so, key).catch(() => null); if (n) await save(o.so, n); });

  // 2. lowest SO to scan to
  if (!st.low) {
    const minSo = Math.min(...all.map((o) => o.so));
    const near = async (n: number) => { for (let k = 0; k < 6; k++) { const o = await fetchOrder(n + k, key).catch(() => null); if (o) return o; } return null; };
    let low = minSo;
    const oldest = all.find((o) => o.so === minSo);
    if (!oldest || (bdDate(oldest.created) ?? '') >= opts.fromDate) {
      for (let n = minSo - 200; n > 0; n -= 200) { const o = await near(n); low = n; if (!o || (bdDate(o.created) ?? '9999') < opts.fromDate) break; }
    }
    await saveState({ low, next: Math.max(...all.map((o) => o.so)) - 1, added: 0, failed: [] });
  }

  // 3. scan down, skipping what is stored
  const have = new Set(all.map((o) => o.so));
  let added = Number(st.added) || 0; const failed: number[] = [...((st.failed as number[]) || [])];
  for (let n = Number(st.next); n >= Number(st.low);) {
    const chunk: number[] = [];
    while (chunk.length < 40 && n >= Number(st.low)) { if (!have.has(n)) chunk.push(n); n--; }
    const got = await pool(chunk, 4, async (x) => { try { return await fetchOrder(x, key); } catch { failed.push(x); return null; } });
    for (let j = 0; j < chunk.length; j++) if (got[j]) { await save(chunk[j], got[j]!); added++; }
    await saveState({ next: n, added, failed: failed.slice(-500) });
  }
  // one more try for numbers that errored (not 404) on the way
  const retry = failed.splice(0);
  const again = await pool(retry, 2, (x) => fetchOrder(x, key).catch(() => null));
  for (let j = 0; j < retry.length; j++) if (again[j]) { await save(retry[j], again[j]!); added++; } else failed.push(retry[j]);

  // 4. recompute every day from fromDate
  all = await storedOrders();
  const days = await writeSalesDaily(all, opts.fromDate, today);
  await saveState({ done: true, added, failed, days: days.length });
  return { refetched: old.length, added, low: st.low, days: days.length, first_day: days[0] ?? null, still_failed: failed.length };
}

/** Recompute sales_daily from the stored orders for fromDate..today (no fetching). */
export async function nuportRecompute(opts: { fromDate: string; today?: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.fromDate)) throw new Error('fromDate must be YYYY-MM-DD');
  const all = await storedOrders();
  const days = await writeSalesDaily(all, opts.fromDate, opts.today ?? bdToday());
  return { orders: all.length, days: days.length, first_day: days[0] ?? null };
}

/** Re-fetch stored orders created in the last `days` days (adds product lines to older orders), then recompute. */
export async function nuportRefetch(opts: { days: number; key?: string; today?: string }) {
  const key = opts.key ?? (await cfg('NUPORT_API_KEY'));
  if (!key) throw new Error('NUPORT_API_KEY is not set (Admin → Integrations)');
  const today = opts.today ?? bdToday();
  const from = addDays(today, -Math.max(1, Math.min(800, opts.days || 120)));
  let all = await storedOrders();
  const todo = all.filter((o) => (bdDate(o.created) ?? '') >= from && !Array.isArray(o.items));
  let done = 0;
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40);
    const got = await pool(chunk, 4, (o) => fetchOrder(o.so, key).catch(() => null));
    for (let j = 0; j < chunk.length; j++) if (got[j]) { await save(chunk[j].so, got[j]!); done++; }
  }
  all = await storedOrders();
  const days = await writeSalesDaily(all, from, today);
  return { refetched: done, of: todo.length, days: days.length };
}
