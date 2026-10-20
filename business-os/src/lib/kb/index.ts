import { db } from '../db';
import { prisma } from '../prisma';
import { buildIndex, kbSearch, type KbIndex } from './bm25';

let cache: { key: string; idx: KbIndex } | null = null;

/** Index over all kb_chunks + kb_notes, rebuilt only when one of them changed. */
export async function kbIndex(): Promise<KbIndex> {
  const r = await prisma.$queryRaw<{ k: string | null }[]>`SELECT max(seq)::text || ':' || count(*)::text AS k FROM docs WHERE collection IN ('kb_chunks','kb_notes')`;
  const key = r[0]?.k ?? '';
  if (cache && cache.key === key) return cache.idx;
  const store = db();
  const [chunks, notes] = await Promise.all([store.collection('kb_chunks').limit(5000).get(), store.collection('kb_notes').limit(5000).get()]);
  cache = { key, idx: buildIndex(chunks, notes) };
  return cache.idx;
}

export async function searchKnowledge(q: string, n = 6, biz?: string) {
  return kbSearch(await kbIndex(), q, n, biz);
}
