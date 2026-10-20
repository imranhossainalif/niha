import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { searchKnowledge } from '@/lib/kb/index';

/** BM25 search over the course knowledge and own notes: GET /api/v1/kb/search?q=…&n=6&business=kidscare */
export const GET = handle(async (req: Request) => {
  await needPrincipal(req);
  const sp = new URL(req.url).searchParams;
  return json({ hits: await searchKnowledge(sp.get('q') || '', Math.min(Number(sp.get('n')) || 6, 20), sp.get('business') || undefined) });
});
