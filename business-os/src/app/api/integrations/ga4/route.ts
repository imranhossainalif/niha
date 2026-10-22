import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { prisma } from '@/lib/prisma';
import { saveTraffic, type GaPush } from '@/lib/web/traffic';

export const maxDuration = 300;

const num = z.coerce.number().optional();
const Body = z.object({
  property: z.string().max(40),
  business: z.enum(['kidscare', 'lrf']), // required: an old script without it pushed one site's data into the other's dashboard
  propertyName: z.string().max(200).optional(),
  rows: z.array(z.object({ date: z.string(), source: z.string().default(''), medium: z.string().default(''), sessions: z.coerce.number(), users: z.coerce.number(), newUsers: num, purchases: num, revenue: num })).max(200000).optional(),
  days: z.array(z.object({ date: z.string(), sessions: z.coerce.number(), users: z.coerce.number(), newUsers: num, engagedSessions: num, views: num, engagementSec: num, addToCarts: num, checkouts: num, purchases: num, revenue: num })).max(5000).optional(),
  pages: z.array(z.object({ date: z.string(), page: z.string().max(500), title: z.string().max(300).optional(), views: z.coerce.number(), users: z.coerce.number(), engagementSec: num })).max(200000).optional(),
  landing: z.array(z.object({ date: z.string(), page: z.string().max(500), sessions: z.coerce.number(), engagedSessions: num })).max(200000).optional(),
  devices: z.array(z.object({ date: z.string(), key: z.string().max(100), sessions: z.coerce.number() })).max(50000).optional(),
  cities: z.array(z.object({ date: z.string(), key: z.string().max(100), sessions: z.coerce.number() })).max(200000).optional(),
  realtime: z.object({ activeUsers: z.coerce.number(), pages: z.array(z.object({ page: z.string(), users: z.coerce.number() })).optional(), sources: z.array(z.object({ source: z.string(), users: z.coerce.number() })).optional(), devices: z.array(z.object({ device: z.string(), users: z.coerce.number() })).optional() }).optional(),
});

/** Push from the Google Apps Script: GA4 daily totals, sources, pages, landing pages, devices, cities, realtime. */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin key required'), { status: 403, code: 'permission_denied' });
  const b = Body.parse(await req.json());
  const result = await saveTraffic(b as GaPush);
  await prisma.job.create({ data: { kind: 'ga4_push', status: 'done', result, createdBy: p.kind === 'user' ? p.email : 'system', startedAt: new Date(), finishedAt: new Date() } });
  return json({ ok: true, ...result });
});
