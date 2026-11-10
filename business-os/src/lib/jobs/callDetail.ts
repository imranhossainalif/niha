// Per-rep call detail for one day, used by the Sales Team date-wise table.
//
// The call sheet's Live_Dashboard tab has per-rep CALLS for every date (the trend table, ⑤), but per-rep
// receive/order only for its "Aaj" (today, ①) and selected-date (②) tables. The sync therefore copies those two
// tables into the matching `calls_daily` doc, and later syncs preserve the values (the trend write has no detail),
// so the date-wise table keeps the breakdown after the day is over.
//
// Pure functions only: no DB, no Next imports, so this is unit-tested without a database.
import { bdDate } from '../time';

export type RepCounts = { calls: number | null; received: number | null; orders: number | null; order_tk: number | null };
export type CountMap = Record<string, number>;

export type CallDoc = {
  date: string;
  reps: CountMap;
  rcv: CountMap;
  ord: CountMap;
  otk: CountMap;
  calls: number;
  received: number;
  orders: number;
  order_tk: number;
  asof?: string;
  src?: Record<string, unknown>;
  [k: string]: unknown;
};

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const enDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));

const EN_MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const BN_MONTHS: [string, number][] = [
  ['জানুয়ারি', 1], ['ফেব্রুয়ারি', 2], ['মার্চ', 3], ['এপ্রিল', 4], ['মে', 5], ['জুন', 6],
  ['জুলাই', 7], ['আগস্ট', 8], ['সেপ্টেম্বর', 9], ['অক্টোবর', 10], ['নভেম্বর', 11], ['ডিসেম্বর', 12],
];

/**
 * Date written in a sheet label ("30 October", "৩০ অক্টোবর", "Friday 30 October 2026").
 * Without an explicit year the most recent past/today date is used; a label that only fits a future date is
 * rejected (null), so a typo can never move data to the wrong day.
 */
export function parseSheetDate(label: unknown, near: string): string | null {
  if (typeof label !== 'string' || !label.trim()) return null;
  const s = enDigits(label).toLowerCase();
  const m = s.match(/(\d{1,2})\s*([a-z\u0980-\u09ff]+)/);
  if (!m) return null;
  const day = Number(m[1]);
  const word = m[2];
  let month = EN_MONTHS[word.slice(0, 3)];
  if (!month) for (const [bn, n] of BN_MONTHS) if (word.startsWith(bn)) { month = n; break; }
  if (!month || day < 1 || day > 31) return null;
  const explicitYear = s.match(/(20\d{2})/);
  const year = explicitYear ? Number(explicitYear[1]) : Number(near.slice(0, 4));
  if (!Number.isFinite(year) || year < 2000) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // 31 February and friends are not real dates
  if (new Date(iso + 'T00:00:00Z').toISOString().slice(0, 10) !== iso) return null;
  if (!explicitYear && iso > near) return null; // only today or the past is backfilled
  return iso;
}

/** The sheet's "today" date (from its own label, else the sync date in BD) and its selected date. */
export function liveDates(live: Record<string, unknown> | null | undefined): { todayDate: string; selectedDate: string | null } {
  const asof = typeof live?.asof === 'string' ? live.asof : new Date().toISOString();
  const syncDate = bdDate(asof) as string;
  const todayDate = parseSheetDate(live?.today_label, syncDate) ?? syncDate;
  const selectedDate = parseSheetDate(live?.selected_label, todayDate);
  return { todayDate, selectedDate: selectedDate === todayDate ? null : selectedDate };
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Non-total rows of a sheet table ("Aaj"/selected day) keyed by rep name, with only the values that exist. */
export function repCounts(rows: unknown): Record<string, RepCounts> {
  const out: Record<string, RepCounts> = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!name || /^(total|মোট|সব মিলিয়ে)$/i.test(name)) continue;
    out[name] = { calls: num(r.calls), received: num(r.received), orders: num(r.orders), order_tk: num(r.order_tk) };
  }
  return out;
}

const asMap = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});
const sumMap = (m: Record<string, unknown>) => Object.values(m).reduce<number>((s, v) => s + (Number(v) || 0), 0);
const total = (doc: Record<string, unknown> | null | undefined, k: string): number | null => {
  const v = doc?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : num(v);
};

/**
 * Carry the per-rep detail of the stored doc into the freshly parsed one (the trend write has none).
 * The incoming values win per rep; totals come from the incoming doc when it has them, but never fall below
 * the sum of the (possibly preserved) per-rep values.
 */
export function mergePreserved(incoming: Record<string, unknown>, existing: Record<string, unknown> | null): CallDoc {
  const out: Record<string, unknown> = { ...incoming };
  for (const k of ['reps', 'rcv', 'ord', 'otk'] as const) out[k] = { ...asMap(existing?.[k]), ...asMap(incoming[k]) };
  const pick = (k: string) => total(incoming, k) ?? total(existing, k) ?? 0;
  out.calls = Math.max(pick('calls'), sumMap(asMap(out.reps)));
  out.received = Math.max(pick('received'), sumMap(asMap(out.rcv)));
  out.orders = Math.max(pick('orders'), sumMap(asMap(out.ord)));
  out.order_tk = Math.max(pick('order_tk'), sumMap(asMap(out.otk)));
  return out as CallDoc;
}

/** Merge one day's per-rep table into a calls_daily doc (max per field, so a partial sync never lowers a number). */
export function mergeRepRows(doc: CallDoc, rows: Record<string, RepCounts>): CallDoc {
  const out: CallDoc = { ...doc, reps: { ...doc.reps }, rcv: { ...doc.rcv }, ord: { ...doc.ord }, otk: { ...doc.otk } };
  for (const [name, r] of Object.entries(rows)) {
    if (r.calls != null) out.reps[name] = Math.max(out.reps[name] ?? 0, r.calls);
    if (r.received != null) out.rcv[name] = Math.max(out.rcv[name] ?? 0, r.received);
    if (r.orders != null) out.ord[name] = Math.max(out.ord[name] ?? 0, r.orders);
    if (r.order_tk != null) out.otk[name] = Math.max(out.otk[name] ?? 0, r.order_tk);
  }
  out.calls = Math.max(out.calls ?? 0, sumMap(out.reps));
  out.received = Math.max(out.received ?? 0, sumMap(out.rcv));
  out.orders = Math.max(out.orders ?? 0, sumMap(out.ord));
  out.order_tk = Math.max(out.order_tk ?? 0, sumMap(out.otk));
  return out;
}

/** A calls_daily doc that only exists because the sheet's selected date was backfilled. */
export function detailDoc(date: string, rows: Record<string, RepCounts>, asof?: string): CallDoc {
  const base: CallDoc = { date, reps: {}, rcv: {}, ord: {}, otk: {}, calls: 0, received: 0, orders: 0, order_tk: 0, src: { detail: 'selected-day' } };
  if (asof) base.asof = asof;
  return mergeRepRows(base, rows);
}

export type DocWrite = { collection: string; doc_id: string; data: Record<string, unknown> };

/**
 * Post-process the sync's writes:
 *  - calls_daily: keep the stored per-rep detail, add today's (Aaj) and the sheet's selected-day tables,
 *    and create a doc for a backfilled selected day that the trend table no longer has;
 *  - sales_team/live_calls: store the normalized `today_date` / `selected_date` the UI matches against.
 */
export function withCallDetail(writes: DocWrite[], existing: { id: string; data: Record<string, unknown> }[]): DocWrite[] {
  const live = writes.find((w) => w.collection === 'sales_team' && w.doc_id === 'live_calls')?.data;
  const { todayDate, selectedDate } = liveDates(live);
  const existingByDate = new Map(existing.map((e) => [String(e.data.date ?? e.id), e.data]));
  /** The sheet's per-rep table for a date (its "Aaj" table for today, its selected-date table for that day). */
  const rowsFor = (date: string): Record<string, RepCounts> | null => {
    const rows = todayDate === date ? live?.today : selectedDate === date ? live?.selected_day : null;
    const counts = repCounts(rows);
    return Object.keys(counts).length ? counts : null;
  };
  const docs = new Map<string, CallDoc>();
  for (const w of writes) {
    if (w.collection !== 'calls_daily') continue;
    const date = String(w.doc_id);
    let doc = mergePreserved(w.data, existingByDate.get(date) ?? null);
    const rows = rowsFor(date);
    if (rows) doc = mergeRepRows(doc, rows);
    doc.date = typeof doc.date === 'string' && doc.date ? doc.date : date;
    docs.set(date, doc);
  }
  // the selected date can be older than the trend table: still keep/backfill it
  for (const date of [todayDate, selectedDate]) {
    if (!date || docs.has(date)) continue;
    const base = existingByDate.get(date);
    const rows = rowsFor(date);
    if (!base && !rows) continue;
    docs.set(date, base ? (rows ? mergeRepRows(mergePreserved({ date }, base), rows) : mergePreserved({ date }, base))
      : detailDoc(date, rows!, typeof live?.asof === 'string' ? live.asof : undefined));
  }
  const out = writes
    .filter((w) => w.collection !== 'calls_daily')
    .map((w) => (w.collection === 'sales_team' && w.doc_id === 'live_calls'
      ? { ...w, data: { ...w.data, today_date: todayDate, selected_date: selectedDate } }
      : w));
  for (const [date, data] of docs) out.push({ collection: 'calls_daily', doc_id: date, data: data as unknown as Record<string, unknown> });
  return out;
}
