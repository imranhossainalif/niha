import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { decodeCursor, encodeCursor, needPrincipal, parseWhere } from '@/lib/apiutil';

type Ctx = { params: Promise<{ collection: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { collection } = await params;
  const p = await needPrincipal(req);
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get('limit')) || 200, 2000);
  const offset = decodeCursor(sp.get('cursor'));
  let q = db(p).collection(collection).limit(limit + 1).offset(offset);
  for (const w of parseWhere(sp)) q = q.where(w.field, w.op, w.value);
  for (const o of sp.getAll('orderBy')) { const [f, d] = o.split(':'); q = q.orderBy(f, d === 'desc' ? 'desc' : 'asc'); }
  const rows = await q.get();
  const more = rows.length > limit;
  return json({ docs: rows.slice(0, limit).map(({ id, data, version, updatedAt }) => ({ id, data, version, updated_at: updatedAt })), next_cursor: more ? encodeCursor(offset + limit) : null });
});

/** Create a doc with a generated id. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { collection } = await params;
  const p = await needPrincipal(req, 'write');
  const s = await db(p).collection(collection).add(await req.json());
  return json({ id: s.id, data: s.data, version: s.version }, 201);
});
