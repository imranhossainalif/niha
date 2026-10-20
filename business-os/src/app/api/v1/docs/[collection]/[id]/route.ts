import { db, NotFoundError } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { expectedVersion, needPrincipal } from '@/lib/apiutil';

type Ctx = { params: Promise<{ collection: string; id: string }> };
const out = (s: { id: string; data: unknown; version: number; updatedAt: string }) => json({ id: s.id, data: s.data, version: s.version, updated_at: s.updatedAt });

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { collection, id } = await params;
  const s = await db(await needPrincipal(req)).collection(collection).doc(id).get();
  if (!s) throw new NotFoundError(collection + '/' + id + ' not found');
  return out(s);
});

/** Replace (create if missing). If-Match: <version> to guard against overwriting someone else's change; 0 = create only. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const { collection, id } = await params;
  const p = await needPrincipal(req, 'write');
  return out(await db(p).collection(collection).doc(id).set(await req.json(), { expectedVersion: expectedVersion(req) }));
});

/** Merge fields into an existing doc. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { collection, id } = await params;
  const p = await needPrincipal(req, 'write');
  return out(await db(p).collection(collection).doc(id).update(await req.json(), { expectedVersion: expectedVersion(req) }));
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { collection, id } = await params;
  const p = await needPrincipal(req, 'write');
  const ok = await db(p).collection(collection).doc(id).delete({ expectedVersion: expectedVersion(req) });
  return json({ deleted: ok });
});
