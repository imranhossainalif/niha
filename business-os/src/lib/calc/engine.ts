// Growth Engine numbers: ports of engNums / engUnit and the L × C × M × F simulator from legacy/business-os.html.
import { daysTo } from '../time';
import { plMonth, plMonthList, type State } from './pl';

type R = Record<string, any>;
const sumBy = (arr: R[], f: (x: R) => unknown) => arr.reduce((s, r) => s + (Number(f(r)) || 0), 0);

/** Last 30 days vs the 30 before, from sales_daily (+ call stats for the sales team). */
export function engNums(S: State, id: string, today: string) {
  const sd = S.sales_daily ?? [];
  const win = (a: number, b: number) => sd.filter((r) => r.business === id && daysTo(r.date, today) > -a - 1 && daysTo(r.date, today) <= -b);
  const cur = win(30, 0), prev = win(60, 31);
  const sm = (rows: R[], k: string) => sumBy(rows, (r) => r[k]);
  const n = (rows: R[]) => ({
    orders: sm(rows, 'orders'), real: sm(rows, 'real_orders') || sm(rows, 'orders') - sm(rows, 'cancelled'), cancel: sm(rows, 'cancelled'),
    deliv: sm(rows, 'delivered'), rev: sm(rows, 'delivered_amount'), sent: sm(rows, 'sent'), ret: sm(rows, 'sent_returned'), days: rows.length,
  });
  const c = n(cur), p = n(prev);
  const calls = (S.calls_daily ?? []).filter((r) => daysTo(r.date, today) > -31 && daysTo(r.date, today) <= 0);
  const cl = { calls: sumBy(calls, (r) => r.calls), rcv: sumBy(calls, (r) => r.received), ord: sumBy(calls, (r) => r.orders) };
  return { c, p, cl, aov: c.deliv ? c.rev / c.deliv : 0, paov: p.deliv ? p.rev / p.deliv : 0 };
}

/** Unit economics of the last complete month (Kids Care): gross margin, break-even ROAS, MER, POAS. */
export function engUnit(S: State, id: string, today: string) {
  if (id !== 'kidscare') return null;
  const ms = plMonthList(S, today).filter((m) => m < today.slice(0, 7)).slice(-1);
  if (!ms.length) return null;
  const p = plMonth(S, ms[0]);
  const gm = p.sales ? (p.sales - p.cost) / p.sales : 0;
  const other = p.fx.total + p.daily;
  return { m: ms[0], sales: p.sales, gm, be: gm ? 1 / gm : 0, ads: p.ads.total, mer: p.ads.total ? p.sales / p.ads.total : 0, poas: p.ads.total ? (p.sales - p.cost - other) / p.ads.total : 0, net: p.net, other };
}

export type Levers = { L?: number; C?: number; M?: number; F?: number };
/**
 * Growth formula (Hourglass Funnel): revenue = Leads × Conversion × Margin(AOV) × Frequency.
 * proj = base × L × C × M × F; to reach `goal`, each of the 4 levers needs (goal/base)^(1/4).
 */
export function growthProjection(base: number, levers: Levers, goal = 0) {
  const mul = { L: Number(levers.L) || 1, C: Number(levers.C) || 1, M: Number(levers.M) || 1, F: Number(levers.F) || 1 };
  const proj = Math.round(base * mul.L * mul.C * mul.M * mul.F);
  const need = goal && base ? goal / base : 0;
  const each = need ? Math.pow(need, 1 / 4) : 0;
  return { mul, proj, need, each };
}
