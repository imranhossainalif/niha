// Learn from the team's own past replies: pair each customer question with what the team answered, and find the
// pairs most like a new question. Only used as examples of how we answer (style, common facts); prices and offers
// always come from the current knowledge, because old replies can be out of date.
import { db } from '../db';
import { buildIndex, kbSearch, type KbIndex } from '../kb/bm25';
import type { InboxMessage } from './store';

export type Pair = { q: string; a: string; ts: string };
const BN = '০১২৩৪৫৬৭৮৯';
const dig = (s: string) => s.replace(/[০-৯]/g, (c) => String(BN.indexOf(c)));
/** Phone numbers out; names and addresses are short-lived in replies and never kept as examples of facts. */
export const scrub = (s: string) => dig(s).replace(/(\+?88)?01[3-9][\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{3}/g, '[phone]').replace(/https?:\/\/\S+/g, '[link]').replace(/\s+/g, ' ').trim();

/** Question = the customer's last messages right before a team reply (same conversation, within 12 h). */
export function buildPairs(msgs: Pick<InboxMessage, 'conv' | 'dir' | 'by' | 'text' | 'ts'>[]): Pair[] {
  const byConv = new Map<string, typeof msgs>();
  for (const m of msgs) { if (!byConv.has(m.conv)) byConv.set(m.conv, []); byConv.get(m.conv)!.push(m); }
  const pairs: Pair[] = []; const seenA = new Set<string>();
  for (const list of byConv.values()) {
    list.sort((a, b) => a.ts.localeCompare(b.ts));
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.dir !== 'out' || r.by !== 'team') continue;
      const qs: string[] = [];
      for (let j = i - 1; j >= 0 && qs.length < 3; j--) {
        const m = list[j];
        if (m.dir !== 'in' || Date.parse(r.ts) - Date.parse(m.ts) > 12 * 3600e3) break;
        if (!/^\(attachment/.test(m.text)) qs.unshift(m.text);
      }
      const q = scrub(qs.join(' ')), a = scrub(r.text || '');
      if (q.length < 4 || a.length < 12 || a.length > 700 || /^\(attachment/.test(a)) continue;
      const k = a.toLowerCase().slice(0, 80); if (seenA.has(k)) continue; seenA.add(k);
      pairs.push({ q: q.slice(0, 400), a, ts: r.ts });
    }
  }
  return pairs;
}

let cache: { at: number; pairs: Pair[]; idx: KbIndex } | null = null;
export const invalidatePairs = () => { cache = null; };
async function load() {
  if (cache && Date.now() - cache.at < 15 * 60e3) return cache;
  const out: InboxMessage[] = [];
  for (let off = 0; ; off += 5000) {
    const page = await db().collection('inbox_messages').orderBy('ts', 'desc').limit(5000).offset(off).get();
    out.push(...page.map((s) => s.data as InboxMessage));
    if (page.length < 5000 || out.length >= 60000) break;
  }
  const pairs = buildPairs(out);
  cache = { at: Date.now(), pairs, idx: buildIndex(pairs.map((p, i) => ({ id: 'p' + i, data: { title: '', src: '', chunks: [{ p: '', t: p.q }] } })), []) };
  return cache;
}

/** Past Q→A pairs closest to `query` (a pair needs a real word overlap to count). */
export async function pastExamples(query: string, n = 4): Promise<Pair[]> {
  const c = await load();
  if (!c.pairs.length) return [];
  const hits = kbSearch(c.idx, scrub(query), n);
  const top = hits[0]?.score ?? 0;
  return hits.filter((h) => h.score >= Math.max(0.2, top * 0.5)).map((h) => c.pairs[Number(h.id.slice(1).split('_')[0])]).filter(Boolean);
}
export async function pairCount() { return (await load()).pairs.length; }
