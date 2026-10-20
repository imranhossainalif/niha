import { changes } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';

/** Change feed for live updates: GET /api/v1/sync?since=<seq>&cols=a,b → { seq, more, upserts, deletes } */
export const GET = handle(async (req: Request) => {
  const p = await needPrincipal(req);
  const sp = new URL(req.url).searchParams;
  const since = Math.max(0, Number(sp.get('since')) || 0);
  const cols = (sp.get('cols') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return json(await changes(p, since, cols.length ? cols : undefined));
});
