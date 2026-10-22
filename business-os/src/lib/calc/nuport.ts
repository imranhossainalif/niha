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
  // where the order came from (no customer data)
  source?: string | null; // Nuport: UP_SELL | WHATSAPP | MESSENGER | WEBSITE | OFFLINE | OTHER | …
  custom_source?: string | null;
  web_origin?: string | null; // website: fb | google | (direct) | …
  utm_medium?: string | null; // website: paid | organic | referral | …
  source_type?: string | null; // website: utm | organic | typein | referral
  campaign_id?: string | null;
  web_meta?: boolean; // website order carried session info (false = e.g. abandoned-cart recovery)
  author?: string | null; // Nuport user who entered it
  items?: OrderItem[];
};
export type OrderItem = { sku: string; name: string; qty: number; price: number; discount: number };

/** Keep only the fields we need (no customer data). */
export const slim = (o: any): NuportOrder => {
  const m = o?.metadata && typeof o.metadata === 'object' ? o.metadata : {};
  return {
    id: o?.internalId ?? null, created: o?.createdAt ?? null, status: o?.status ?? null, delivery_status: o?.deliveryStatus ?? null,
    total: o?.totalAmount ?? null, is_return: o?.isReturn ?? null, delivered_at: o?.deliveredAt ?? null,
    source: o?.source ?? null, custom_source: o?.customOrderSource?.name ?? null,
    web_origin: m.origin ?? null, utm_medium: m.utmMedium ?? null, source_type: m.sourceType ?? null, campaign_id: m.campaignId ?? null,
    web_meta: !!(m.origin || m.sourceType || m.utmMedium), author: o?.authorId ?? null,
    items: Array.isArray(o?.salesOrderItems)
      ? o.salesOrderItems.map((it: any) => ({ sku: String(it?.product?.sku ?? ''), name: String(it?.product?.name ?? '').slice(0, 120), qty: Number(it?.quantity) || 0, price: Number(it?.price) || 0, discount: Number(it?.discountAmount) || 0 }))
      : undefined,
  };
};

/** Order channels shown on the dashboard, in display order. */
export const CHANNELS: [string, string][] = [
  ['call', 'Sales team (call / up-sell)'], ['whatsapp', 'WhatsApp'], ['messenger', 'Messenger'],
  ['web_ads', 'Website · Ads (FB/paid)'], ['web_organic', 'Website · Google organic'], ['web_direct', 'Website · Direct'],
  ['web_other', 'Website · Onnanno'], ['offline', 'Offline'], ['other', 'Onnanno'], ['unknown', 'Source jana nai'],
];
const PAID = /^(paid|cpc|ppc|paid_social|paidsocial|ads?|cpm)$/i;

/** Which channel an order came from, from Nuport's source + website session metadata. */
export function orderChannel(o: NuportOrder): string {
  const s = String(o.source || '').toUpperCase();
  if (!s) return 'unknown';
  if (s === 'UP_SELL' || s === 'CALL' || s === 'CALL_CENTER' || s === 'PHONE' || s === 'TELESALES') return 'call';
  if (s === 'WHATSAPP') return 'whatsapp';
  if (s === 'MESSENGER' || s === 'FACEBOOK' || s === 'INSTAGRAM' || s === 'SOCIAL_MEDIA') return 'messenger';
  if (s === 'WEBSITE' || s === 'ECOMMERCE' || s === 'WOOCOMMERCE' || s === 'SHOPIFY') {
    if (PAID.test(o.utm_medium || '') || o.campaign_id) return 'web_ads';
    if (/organic/i.test(o.utm_medium || '') || /organic/i.test(o.source_type || '')) return 'web_organic';
    if (/direct|typein/i.test((o.web_origin || '') + ' ' + (o.source_type || ''))) return 'web_direct';
    return 'web_other';
  }
  if (s === 'OFFLINE' || s === 'POS' || s === 'SHOP') return 'offline';
  return 'other';
}

export type ProductStats = { name: string; sku: string; qty: number; revenue: number; orders: number };
/** Product key: SKU when present, else the name (used to join with pc_items). */
export const productKey = (it: OrderItem) => (it.sku || it.name).replace(/[.$/#[\]]/g, '_').slice(0, 80) || 'unknown';
function byProduct(orders: NuportOrder[]): Record<string, ProductStats> {
  const out: Record<string, ProductStats> = {};
  for (const o of orders) for (const it of o.items ?? []) {
    const k = productKey(it);
    const x = (out[k] ??= { name: it.name, sku: it.sku, qty: 0, revenue: 0, orders: 0 });
    x.qty += it.qty; x.revenue += it.qty * it.price - it.discount; x.orders++;
  }
  for (const x of Object.values(out)) x.revenue = pyRound(x.revenue);
  return out;
}

export type ChannelStats = { orders: number; cancelled: number; sent: number; sent_amount: number; in_transit: number; in_transit_amount: number; delivered: number; delivered_amount: number; returned: number };

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
  /** orders created that day, split by channel (only when every order of the day carries a source) */
  by_channel?: Record<string, ChannelStats>;
  /** products in orders created that day that went to the courier (returns excluded), when every order has items */
  by_product?: Record<string, ProductStats>;
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
      ...(C.every((o) => o.source !== undefined) ? { by_channel: byChannel(C) } : {}),
      ...(C.length && C.every((o) => Array.isArray(o.items)) ? { by_product: byProduct(sent.filter((o) => !o.is_return)) } : {}),
    };
  });
}

/** "Ekhon courier e (in transit)" across all dates. */
export const inTransit = (rows: Partial<SalesDaily>[]) => ({
  orders: rows.reduce((s, r) => s + (Number(r.sent_in_transit) || 0), 0),
  amount: rows.reduce((s, r) => s + (Number(r.sent_in_transit_amount) || 0), 0),
});

function byChannel(C: NuportOrder[]): Record<string, ChannelStats> {
  const out: Record<string, ChannelStats> = {};
  for (const o of C) {
    const k = orderChannel(o);
    const x = (out[k] ??= { orders: 0, cancelled: 0, sent: 0, sent_amount: 0, in_transit: 0, in_transit_amount: 0, delivered: 0, delivered_amount: 0, returned: 0 });
    const t = Number(o.total) || 0;
    x.orders++;
    if (o.status === 'CANCELLED') x.cancelled++;
    if (o.status === 'IN_TRANSIT' || o.status === 'COMPLETED') { x.sent++; x.sent_amount += t; }
    if (o.status === 'IN_TRANSIT') { x.in_transit++; x.in_transit_amount += t; }
    if (o.status === 'COMPLETED' && !o.is_return) { x.delivered++; x.delivered_amount += t; }
    if ((o.status === 'IN_TRANSIT' || o.status === 'COMPLETED') && o.is_return) x.returned++;
  }
  for (const x of Object.values(out)) for (const k of ['sent_amount', 'in_transit_amount', 'delivered_amount'] as const) x[k] = pyRound(x[k]);
  return out;
}
