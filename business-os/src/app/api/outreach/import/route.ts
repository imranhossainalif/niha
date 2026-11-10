import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { parseCsv, rowToProspect } from '@/lib/outreach/core';
import { allProspects, createProspect, loadSettings, needOutreach } from '@/lib/outreach/server';

/** Bulk add from pasted CSV/sheet text: {csv, defaults?}. Duplicates and nameless rows are skipped and counted. */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  needOutreach(p, true);
  const b = await req.json();
  const rows = parseCsv(String(b.csv || '')).slice(0, 2000);
  const s = await loadSettings(p); const existing = await allProspects(p);
  let added = 0, dup = 0, bad = 0;
  for (const r of rows) {
    const cand = { ...(b.defaults || {}), ...rowToProspect(r) };
    if (!cand.name && !cand.company) { bad++; continue; }
    const out = await createProspect(p, cand, s, existing);
    if (out.prospect) { added++; existing.push(out.prospect); } else dup++;
  }
  return json({ rows: rows.length, added, duplicates: dup, skipped: bad });
});
