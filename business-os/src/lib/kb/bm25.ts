// BM25 search over course chunks (kb_chunks) and own notes (kb_notes). Port of kbTok / kbIndex / kbSearch.
const KB_STOP = new Set('the and for you your are with that this from have will can our not but what how who why when all any into more most they them their then than its was were has had his her one two also use using each make get just very about which there here out over like only own same such too onto per via ki ke ar e o er te na ta ei je kore hobe theke jonno amader amar apnar ekta kono'.split(' '));
export const kbTok = (s: unknown) => (String(s || '').toLowerCase().match(/[a-z0-9ঀ-৿]{2,}/g) || []).filter((w) => !KB_STOP.has(w));

type Row = { id: string; title: string; src: string; pages: string; text: string; kind: 'course' | 'note'; business?: string };
export type Hit = { score: number; source: string; file: string; pages: string; kind: string; text: string };
export type KbIndex = { items: { r: Row; tf: Map<string, number>; len: number }[]; df: Map<string, number>; N: number; avg: number };

export function buildIndex(chunkDocs: { id: string; data: Record<string, any> }[], notes: { id: string; data: Record<string, any> }[]): KbIndex {
  const rows: Row[] = [];
  chunkDocs.forEach((d) => (d.data.chunks || []).forEach((c: any, i: number) => rows.push({ id: d.id + '_' + i, title: d.data.title, src: d.data.src, pages: c.p, text: c.t, kind: 'course' })));
  notes.forEach((n) => rows.push({ id: 'note_' + n.id, src: n.data.title, title: n.data.title, pages: 'note', text: (n.data.topic ? n.data.topic + ': ' : '') + n.data.text, business: n.data.business, kind: 'note' }));
  const items = rows.map((r) => { const t = kbTok(r.title + ' ' + r.text); const tf = new Map<string, number>(); t.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1)); return { r, tf, len: t.length }; });
  const df = new Map<string, number>();
  items.forEach((it) => it.tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)));
  return { items, df, N: items.length, avg: items.reduce((s, x) => s + x.len, 0) / (items.length || 1) };
}

/** Top n passages; the business's own notes get a 1.3× boost. */
export function kbSearch(KB: KbIndex, q: string, n = 6, biz?: string): Hit[] {
  const qs = [...new Set(kbTok(q))];
  if (!qs.length) return [];
  return KB.items
    .map((it) => {
      let s = 0;
      for (const w of qs) {
        const f = it.tf.get(w); if (!f) continue;
        const df = KB.df.get(w)!;
        const idf = Math.log(1 + (KB.N - df + 0.5) / (df + 0.5));
        s += (idf * (f * 2.2)) / (f + 1.2 * (0.25 + (0.75 * it.len) / KB.avg));
      }
      if (it.r.kind === 'note' && (!it.r.business || it.r.business === biz)) s *= 1.3;
      return { it, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, n)
    .map(({ it, s }) => ({ score: +s.toFixed(2), source: it.r.title, file: it.r.src, pages: it.r.pages, kind: it.r.kind, text: it.r.text }));
}
