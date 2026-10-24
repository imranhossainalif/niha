// Product catalogue from our shop website: every product with its variations and prices, so the inbox AI never guesses.
// Read from the shop's public JSON when it has one (Shopify /products.json, WooCommerce Store API), otherwise from the
// schema.org Product data that most shop pages carry (JSON-LD). Stored in `inbox_products`, looked up per customer question.
import { createHash } from 'node:crypto';
import { db } from '../db';
import { prisma } from '../prisma';
import { assertPublicUrl, decodeEntities } from '../web/extract';
import { buildIndex, kbSearch, type KbIndex } from '../kb/bm25';
import { BUSINESS } from './store';

export type Variant = { label: string; price: number; regular?: number; available?: boolean };
export type WebProduct = { name: string; url: string; category?: string; description?: string; currency: string; variants: Variant[]; available?: boolean; source: 'shopify' | 'woocommerce' | 'jsonld' };

const SYMBOL: Record<string, string> = { BDT: '৳', TK: '৳', USD: '$', INR: '₹', EUR: '€', GBP: '£' };
export const money = (n: number, cur = 'BDT') => (SYMBOL[cur.toUpperCase()] ?? cur + ' ') + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : NaN; };
const clean = (s: unknown, max = 300) => decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, max);

async function getJson(url: string): Promise<{ json: any; headers: Headers } | null> {
  try {
    const u = await assertPublicUrl(url);
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'EasyFounder/1.0 (+catalogue)', accept: 'application/json' } });
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) return null;
    return { json: await r.json(), headers: r.headers };
  } catch { return null; }
}

/* ---- Shopify ---- */
export function shopifyProducts(list: any[], origin: string, currency = 'BDT'): WebProduct[] {
  return list.map((p) => ({
    name: clean(p.title, 200), url: origin + '/products/' + p.handle, category: clean(p.product_type, 80) || undefined, description: clean(p.body_html), currency, source: 'shopify' as const,
    variants: (p.variants ?? []).map((v: any) => ({ label: v.title && v.title !== 'Default Title' ? clean(v.title, 120) : '', price: num(v.price), regular: num(v.compare_at_price) || undefined, available: v.available })).filter((v: Variant) => v.price >= 0),
    available: (p.variants ?? []).some((v: any) => v.available !== false),
  })).filter((p) => p.name && p.variants.length);
}

/* ---- WooCommerce Store API ---- */
const wooMoney = (prices: any, key: string) => { const n = num(prices?.[key]); const minor = Number(prices?.currency_minor_unit ?? 2); return Number.isFinite(n) ? n / 10 ** minor : NaN; };
/** Woo gives an attribute value as its slug ("%e0%a7%a8...-%e0%a6%97..." for "২৫০ গ্রাম"): turn it back into words. */
export const unslug = (v: unknown) => { let t = String(v ?? ''); try { t = decodeURIComponent(t); } catch { /* keep as is */ } return clean(t.replace(/-/g, ' '), 80); };
/** "Size: 500g, Flavor: Rose" -> "500g / Rose" */
const variationText = (s: unknown) => clean(s, 160).split(/,\s*(?=[^,:]+:)/).map((x) => x.replace(/^[^:]*:\s*/, '').trim()).filter(Boolean).join(' / ');
export function wooProducts(list: any[], variationsOf: Record<string, any[]> = {}): WebProduct[] {
  const out: WebProduct[] = [];
  for (const p of list) {
    const cur = p.prices?.currency_code || 'BDT';
    const vars = variationsOf[String(p.id)] ?? [];
    // the parent lists each variation's attributes (id + [{name, value}]); the variation itself carries a "Size: 500g" text
    const terms: Record<string, string> = {}; // slug -> the shop's own word for it
    for (const at of p.attributes ?? []) for (const t of at.terms ?? []) if (t.slug) terms[String(t.slug).toLowerCase()] = clean(t.name, 80);
    const word = (v: unknown) => terms[String(v ?? '').toLowerCase()] || unslug(v);
    const named: Record<string, string> = {};
    for (const x of p.variations ?? []) named[String(x.id)] = (x.attributes ?? []).map((a: any) => word(a.value)).filter(Boolean).join(' / ');
    let variants: Variant[] = vars.map((v: any) => ({
      label: named[String(v.id)] || variationText(v.variation) || (v.attributes ?? []).map((a: any) => word(a.value)).filter(Boolean).join(' / '),
      price: wooMoney(v.prices, 'price'), regular: wooMoney(v.prices, 'regular_price') || undefined, available: v.is_in_stock,
    })).filter((v) => Number.isFinite(v.price));
    if (!variants.length) {
      const lo = wooMoney(p.prices, 'price'), hi = num(p.prices?.price_range?.max_amount) / 10 ** Number(p.prices?.currency_minor_unit ?? 2);
      if (Number.isFinite(lo)) variants = [{ label: Number.isFinite(hi) && hi > lo ? 'dam ' + lo + ' theke ' + hi + ' porjonto (variation onujayi)' : '', price: lo, regular: wooMoney(p.prices, 'regular_price') || undefined, available: p.is_in_stock }];
    }
    if (p.name && variants.length) out.push({ name: clean(p.name, 200), url: p.permalink, category: (p.categories ?? []).map((c: any) => clean(c.name, 60)).join(', ') || undefined, description: clean(p.short_description || p.description), currency: cur, variants, available: p.is_in_stock, source: 'woocommerce' });
  }
  return out;
}

/* ---- schema.org JSON-LD on product pages ---- */
export function jsonLdProducts(html: string, pageUrl: string): WebProduct[] {
  const out: WebProduct[] = [];
  const nodes: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1].trim()); for (const x of Array.isArray(j) ? j : [j]) nodes.push(...(x['@graph'] ?? [x])); } catch { /* bad json */ }
  }
  const types = (n: any) => ([] as string[]).concat(n?.['@type'] ?? []).map(String);
  const offerPrice = (o: any): { price: number; cur: string; avail?: boolean } | null => {
    const one = Array.isArray(o) ? o[0] : o; if (!one) return null;
    const price = num(one.price ?? one.lowPrice); if (!Number.isFinite(price)) return null;
    return { price, cur: one.priceCurrency || 'BDT', avail: one.availability ? /InStock|PreOrder/i.test(String(one.availability)) : undefined };
  };
  for (const n of nodes) {
    const t = types(n);
    if (t.includes('ProductGroup')) {
      const variants: Variant[] = []; let cur = 'BDT';
      for (const v of [].concat(n.hasVariant ?? [])) { const o = offerPrice((v as any).offers); if (o) { cur = o.cur; variants.push({ label: clean((v as any).name?.replace(n.name, '') || (v as any).name, 120), price: o.price, available: o.avail }); } }
      if (n.name && variants.length) out.push({ name: clean(n.name, 200), url: n.url || pageUrl, description: clean(n.description), currency: cur, variants, source: 'jsonld' });
    } else if (t.includes('Product')) {
      const o = offerPrice(n.offers); const agg = (Array.isArray(n.offers) ? n.offers[0] : n.offers) ?? {};
      if (n.name && o) out.push({ name: clean(n.name, 200), url: n.url || pageUrl, category: clean(n.category, 80) || undefined, description: clean(n.description), currency: o.cur, available: o.avail,
        variants: Array.isArray(n.offers) && n.offers.length > 1 ? n.offers.map((x: any) => ({ label: clean(x.name || x.sku, 100), price: num(x.price), available: /InStock/i.test(String(x.availability)) })).filter((v: Variant) => Number.isFinite(v.price)) : [{ label: agg.highPrice && agg.highPrice !== agg.lowPrice ? 'dam ' + agg.lowPrice + ' theke ' + agg.highPrice + ' porjonto' : '', price: o.price, available: o.avail }], source: 'jsonld' });
    }
  }
  return out;
}

/** All products of a shop: Shopify, WooCommerce, else nothing (JSON-LD from crawled pages is added by the caller). */
export async function shopProducts(origin: string): Promise<WebProduct[]> {
  const shop: any[] = [];
  for (let page = 1; page <= 8; page++) {
    const r = await getJson(`${origin}/products.json?limit=250&page=${page}`);
    if (!r?.json?.products?.length) break;
    shop.push(...r.json.products); if (r.json.products.length < 250) break;
  }
  if (shop.length) return shopifyProducts(shop, origin);
  const woo: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await getJson(`${origin}/wp-json/wc/store/v1/products?per_page=100&page=${page}`);
    if (!Array.isArray(r?.json) || !r!.json.length) break;
    woo.push(...r!.json); if (r!.json.length < 100) break;
  }
  if (!woo.length) return [];
  const variationsOf: Record<string, any[]> = {};
  for (const p of woo.filter((x) => x.type === 'variable').slice(0, 150)) {
    const r = await getJson(`${origin}/wp-json/wc/store/v1/products?type=variation&parent=${p.id}&per_page=100`);
    if (Array.isArray(r?.json)) variationsOf[String(p.id)] = r!.json;
  }
  return wooProducts(woo, variationsOf);
}

const pid = (site: string, p: WebProduct) => createHash('sha1').update(site + '|' + (p.url || p.name)).digest('hex').slice(0, 16);
/** Replace this site's stored products with `products` (only when the run found some). */
export async function saveProducts(site: string, products: WebProduct[]) {
  const col = db().collection('inbox_products'); const keep = new Set<string>();
  const byUrl = new Map<string, WebProduct>(); for (const p of products) byUrl.set(p.url || p.name, p); // shop JSON wins over JSON-LD for the same url
  for (const p of byUrl.values()) { const k = pid(site, p); keep.add(k); await col.doc(k).set({ business: BUSINESS, site, ...p, fetched: new Date().toISOString() }); }
  let removed = 0;
  if (keep.size) for (const s of await col.where('site', '==', site).limit(2000).get()) if (!keep.has(s.id)) { await col.doc(s.id).delete(); removed++; }
  invalidateProducts();
  return { products: keep.size, removed };
}

/* ---- lookup ---- */
export const variantLine = (v: Variant, cur: string) => (v.label ? v.label + ' ' : '') + money(v.price, cur) + (v.available === false ? ' (stock nai)' : '');
export const productLine = (p: Pick<WebProduct, 'name' | 'variants' | 'currency' | 'url' | 'available'>) => '• ' + p.name + ': ' + p.variants.map((v) => variantLine(v, p.currency)).join('; ') + (p.available === false ? ' [ekhon stock nai]' : '') + (p.url ? ' — ' + p.url : '');

let cache: { key: string; idx: KbIndex; list: WebProduct[] } | null = null;
export const invalidateProducts = () => { cache = null; };
async function index() {
  const r = await prisma.$queryRaw<{ k: string | null }[]>`SELECT max(seq)::text || ':' || count(*)::text AS k FROM docs WHERE collection = 'inbox_products'`;
  const key = r[0]?.k ?? '';
  if (cache && cache.key === key) return cache;
  const list = (await db().collection('inbox_products').limit(3000).get()).map((s) => s.data as WebProduct);
  cache = { key, list, idx: buildIndex(list.map((p, i) => ({ id: 'p' + i, data: { title: p.name, src: p.url, chunks: [{ p: '', t: [p.name, p.category, ...p.variants.map((v) => v.label)].filter(Boolean).join(' ') }] } })), []) };
  return cache;
}
const WANTS_LIST = /(^|\s)(sob|shob|list|catalog|catalogue|menu|price list|kon kon|ki ki|ki ki product)(\s|$)|সব|কি কি|কী কী|তালিকা|লিস্ট|মেনু/i;

/** Products that match the question (with every variation and price); a general "what do you have / price list" gets the whole list in short form. */
export async function searchProducts(query: string, n = 5): Promise<WebProduct[]> {
  const c = await index();
  if (!c.list.length) return [];
  const hits = kbSearch(c.idx, query, n * 2);
  const top = hits[0]?.score ?? 0;
  const found = hits.filter((h) => h.score >= top * 0.4).slice(0, n).map((h) => c.list[Number(h.id.slice(1).split('_')[0])]).filter(Boolean);
  return WANTS_LIST.test(query) ? c.list.slice(0, 25) : found; // "sob product / price list" → the whole list; no match → nothing (the AI then asks the team)
}
export async function productStats() {
  const rows = await db().collection('inbox_products').limit(3000).get();
  const by: Record<string, number> = {}; for (const r of rows) by[String(r.data.site)] = (by[String(r.data.site)] || 0) + 1;
  return by;
}
