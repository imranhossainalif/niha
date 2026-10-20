import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';

const Op = z.object({
  op: z.enum(['set', 'update', 'delete']),
  collection: z.string(),
  id: z.string().optional(),
  data: z.record(z.unknown()).optional(),
  expected_version: z.number().int().min(0).optional(),
});
const Body = z.object({ ops: z.array(Op).min(1).max(500) });

/** Run up to 500 writes in order. Each op succeeds or fails on its own (not one transaction); results say which. */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  const { ops } = Body.parse(await req.json());
  const store = db(p);
  const results = [];
  for (const o of ops) {
    try {
      const col = store.collection(o.collection);
      if (o.op === 'delete') {
        if (!o.id) throw Object.assign(new Error('id required'), { status: 400, code: 'bad_request' });
        results.push({ ok: true, id: o.id, deleted: await col.doc(o.id).delete({ expectedVersion: o.expected_version }) });
      } else {
        const ref = col.doc(o.id);
        const s = o.op === 'set' ? await ref.set(o.data ?? {}, { expectedVersion: o.expected_version }) : await ref.update(o.data ?? {}, { expectedVersion: o.expected_version });
        results.push({ ok: true, id: s.id, version: s.version });
      }
    } catch (e) {
      const x = e as { code?: string; message?: string };
      results.push({ ok: false, id: o.id ?? null, error: { code: x.code ?? 'error', message: x.message } });
    }
  }
  return json({ results });
});
