// Nuport orders → sales_daily rows. Field definitions are exactly those of scripts/nuport_sync.py.
import { bdDate } from '../time';

export type NuportOrder = {
  id: number | string | null;
  created: string | null;
  status: string | null; // CANCELLED | IN_TRANSIT | COMPLETED | (anything else = still being processed)
  delivery_status?: string | null;
  total: number | string | null;
  is_return?: boolean | null;
  delivered_at?: string | null;
};

/** Keep only the fields we need (no customer data). */
export const slim = (o: any): NuportOrder => ({
  id: o?.internalId ?? null, created: o?.createdAt ?? null, status: o?.status ?? null, delivery_status: o?.deliveryStatus ?? null,
  total: o?.totalAmount ?? null, is_return: o?.isReturn ?? null, delivered_at: o?.deliveredAt ?? null,
});

// Python's round() is banker's rounding; match it so numbers equal the old script's.
export function pyRound(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (Math.abs(d - 0.5) < 1e-9) return f % 2 === 0 ? f : f + 1;
  return Math.round(x);
}
const amt = (L: NuportOrder[]) => pyRound(L.reduce((s, o) => s + (Number(o.total) || 0), 0));

export type SalesDaily = {
  id: string; asof: string; business: 'kidscare'; date: string; source: 'nuport';
  orders: number; cancelled: number; real_orders: number; in_progress: number;
  sent: number; sent_amount: number; sent_delivered: number; sent_delivered_amount: number;
  sent_in_transit: number; sent_in_transit_amount: number; sent_returned: number; sent_other: number;
  delivered: number; delivered_amount: number; cash_due: number;
};

/** One row per BD date. `sent` = created that day and handed to the courier; `delivered` = delivered that day (any creation date). */
export function salesDaily(orders: NuportOrder[], days: string[], asof = new Date().toISOString().replace(/\.\d+Z$/, 'Z')): SalesDaily[] {
  return days.map((d) => {
    const C = orders.filter((o) => bdDate(o.created) === d);
    const can = C.filter((o) => o.status === 'CANCELLED');
    const sent = C.filter((o) => o.status === 'IN_TRANSIT' || o.status === 'COMPLETED');
    const tr = sent.filter((o) => o.status === 'IN_TRANSIT');
    const dl = sent.filter((o) => o.status === 'COMPLETED' && !o.is_return);
    const ret = sent.filter((o) => o.is_return);
    const D = orders.filter((o) => bdDate(o.delivered_at) === d);
    return {
      id: 'kidscare_' + d, asof, business: 'kidscare', date: d, source: 'nuport',
      orders: C.length, cancelled: can.length, real_orders: C.length - can.length, in_progress: C.length - can.length - sent.length,
      sent: sent.length, sent_amount: amt(sent), sent_delivered: dl.length, sent_delivered_amount: amt(dl),
      sent_in_transit: tr.length, sent_in_transit_amount: amt(tr), sent_returned: ret.length, sent_other: sent.length - dl.length - tr.length - ret.length,
      delivered: D.length, delivered_amount: amt(D), cash_due: 0,
    };
  });
}

/** "Ekhon courier e (in transit)" across all dates. */
export const inTransit = (rows: Partial<SalesDaily>[]) => ({
  orders: rows.reduce((s, r) => s + (Number(r.sent_in_transit) || 0), 0),
  amount: rows.reduce((s, r) => s + (Number(r.sent_in_transit_amount) || 0), 0),
});
