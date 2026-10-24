// Website knowledge for the inbox AI: crawl the Kids Care site (sitemap first, else links from the home page), keep each
// page's readable text in `inbox_web`, and look up the best passages for a customer's question (BM25, same as the KB).
import { createHash } from 'node:crypto';
import { db } from '../db';
import { cfg } from '../config';
import { assertPublicUrl, fetchReadable } from '../web/extract';
import { buildIndex, kbSearch, type KbIndex } from '../kb/bm25';
import { prisma } from '../prisma';
import { BUSINESS } from './store';

const SKIP_PATH = /\/(cart|checkout|my-account|account|login|register|wp-admin|wp-json|feed|tag|author|search|thank|order-received)(\/|$)|\.(jpg|jpeg|png|gif|webp|svg|pdf|zip|css|js|mp4|xml|ico)(\?|$)/i;

/** Same-site, normalised (no hash/query/trailing slash) page links worth reading. */
export function pageLinks(html: string, base: URL): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"']+)["']/gi)) {
    if (m[1].startsWith('#')) continue;
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), base);
      if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '') || SKIP_PATH.test(u.pathname)) continue;
      u.hash = ''; u.search = '';
      out.add(u.origin + (u.pathname.replace(/\/+$/, '') || ''));
    } catch { /* bad link */ }
  }
  return [...out];
}
export const sitemapUrls = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));

async function getText(url: string): Promise<string | null> {
  try { const u = await assertPublicUrl(url); const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'EasyFounder/1.0 (+knowledge import)' } }); return r.ok ? await r.text() : null; } catch { return null; }
}

async function discover(start: URL, max: number): Promise<string[]> {
  const found = new Set<string>([start.origin + (start.pathname.replace(/\/+$/, '') || '')]);
  // sitemap(s): follow one level of sitemap index
  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml']) {
    const xml = await getText(start.origin + path); if (!xml || !/<loc>/i.test(xml)) continue;
    let urls = sitemapUrls(xml);
    if (/<sitemapindex/i.test(xml)) { const sub: string[] = []; for (const s of urls.slice(0, 8)) { const x = await getText(s); if (x) sub.push(...sitemapUrls(x)); } urls = sub; }
    for (const u of urls) { try { const x = new URL(u); if (x.hostname.replace(/^www\./, '') === start.hostname.replace(/^www\./, '') && !SKIP_PATH.test(x.pathname)) found.add(x.origin + (x.pathname.replace(/\/+$/, '') || '')); } catch { /* skip */ } }
    if (found.size > 1) break;
  }
  // links from the home page (and one level down) when the sitemap gave little
  if (found.size < 5) {
    const home = await getText(start.toString());
    if (home) for (const l of pageLinks(home, start)) found.add(l);
    for (const l of [...found].slice(1, 12)) { const h = await getText(l); if (h) for (const k of pageLinks(h, start)) found.add(k); if (found.size > max * 2) break; }
  }
  return [...found].slice(0, max);
}

const id = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 16);

/** Read the site and store its pages. Returns counts; removes stored pages that no longer exist. */
export async function webSync(opts: { url?: string; max?: number } = {}) {
  const raw = opts.url || (await cfg('WEBSITE_URL'));
  if (!raw) throw new Error('WEBSITE_URL set kora nai (Settings → AI knowledge)');
  const start = await assertPublicUrl(raw.includes('://') ? raw : 'https://' + raw);
  const urls = await discover(start, opts.max ?? 80);
  const col = db().collection('inbox_web');
  const seen = new Set<string>(); let pages = 0, failed = 0, chars = 0;
  const queue = [...urls];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const u = queue.shift()!;
      try {
        const r = await fetchReadable(u);
        if (r.text.length < 80) continue;
        const key = id(r.url.replace(/\/+$/, '')); seen.add(key);
        await col.doc(key).set({ business: BUSINESS, url: r.url, title: r.title, text: r.text.slice(0, 12000), fetched: new Date().toISOString() });
        pages++; chars += r.text.length;
      } catch { failed++; }
    }
  }));
  let removed = 0;
  if (pages >= 1) for (const s of await col.limit(1000).get()) if (!seen.has(s.id)) { await col.doc(s.id).delete(); removed++; }
  invalidateWebIndex();
  return { site: start.origin, found: urls.length, pages, failed, removed, chars };
}

/* ---- lookup ---- */
let cache: { key: string; at: number; idx: KbIndex } | null = null;
export const invalidateWebIndex = () => { cache = null; };
const CHUNK = 700;
export function chunkText(text: string): string[] {
  const out: string[] = []; let cur = '';
  for (const line of text.split('\n')) { if (cur && cur.length + line.length > CHUNK) { out.push(cur); cur = ''; } cur += (cur ? '\n' : '') + line; }
  if (cur) out.push(cur);
  return out;
}
async function webIndex(): Promise<KbIndex> {
  const r = await prisma.$queryRaw<{ k: string | null }[]>`SELECT max(seq)::text || ':' || count(*)::text AS k FROM docs WHERE collection = 'inbox_web'`;
  const key = r[0]?.k ?? '';
  if (cache && cache.key === key) return cache.idx;
  const rows = await db().collection('inbox_web').limit(1000).get();
  const docs = rows.map((s) => ({ id: s.id, data: { title: s.data.title, src: s.data.url, chunks: chunkText(String(s.data.text || '')).map((t) => ({ p: '', t })) } }));
  cache = { key, at: Date.now(), idx: buildIndex(docs, []) };
  return cache.idx;
}

export type WebHit = { title: string; url: string; text: string; score: number };
export async function searchWeb(query: string, n = 4): Promise<WebHit[]> {
  const idx = await webIndex();
  if (!idx.N) return [];
  const best = kbSearch(idx, query, n * 2);
  const top = best[0]?.score ?? 0;
  const seen = new Set<string>();
  return best.filter((h) => h.score >= top * 0.35).filter((h) => (seen.has(h.text) ? false : (seen.add(h.text), true))).slice(0, n).map((h) => ({ title: h.source, url: h.file, text: h.text, score: h.score }));
}
export async function webStatus() {
  const rows = await db().collection('inbox_web').limit(1000).get();
  const last = rows.map((r) => String(r.data.fetched || '')).sort().pop() || null;
  return { pages: rows.length, last };
}
