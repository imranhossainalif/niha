import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { saveTraffic } from '@/lib/web/traffic';

export const maxDuration = 120;

const Row = z.object({ date: z.string(), source: z.string().default(''), medium: z.string().default(''), sessions: z.coerce.number(), users: z.coerce.number(), newUsers: z.coerce.number().optional(), purchases: z.coerce.number().optional(), revenue: z.coerce.number().optional() });
const Body = z.object({ property: z.string().max(40), rows: z.array(Row).max(100000) });

/** Push from the Google Apps Script: GA4 rows (date × source × medium) → web_traffic docs (owner/admin key). */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin key required'), { status: 403, code: 'permission_denied' });
  const b = Body.parse(await req.json());
  const result = await saveTraffic(b.rows, b.property);
  await prisma.job.create({ data: { kind: 'ga4_push', status: 'done', result, createdBy: p.kind === 'user' ? p.email : 'system', startedAt: new Date(), finishedAt: new Date() } });
  return json({ ok: true, ...result });
});
