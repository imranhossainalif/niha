import { z } from 'zod';
import { db } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { needBiz, who } from '@/lib/social/api';

type Ctx = { params: Promise<{ business: string }> };

/** AI plan, competitors' Instagram posts, and the research settings. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req);
  needBiz(p, business);
  const [plan, settings, comps, jobs] = await Promise.all([
    db(p).collection('social_ai').doc(business).get(),
    db(p).collection('social_settings').doc(business).get(),
    db(p).collection('social_competitors').where('business', '==', business).limit(50).get(),
    prisma.job.findMany({ where: { kind: { in: ['social_ideas', 'social_sync'] } }, orderBy: { createdAt: 'desc' }, take: 6 }),
  ]);
  return json({ plan: plan?.data ?? null, settings: settings?.data ?? { ig_competitors: [], fb_competitors: [], groups: [], notes: '' }, competitors: comps.map((s) => s.data),
    jobs: jobs.map((j) => ({ kind: j.kind, status: j.status, at: j.createdAt, error: j.error })) });
});

const Settings = z.object({ ig_competitors: z.array(z.string().max(100)).max(20), fb_competitors: z.array(z.string().max(200)).max(30), groups: z.array(z.string().max(300)).max(50), notes: z.string().max(3000).default('') });
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req, 'write');
  needBiz(p, business, true);
  const b = Settings.parse(await req.json());
  await db(p).collection('social_settings').doc(business).set({ business, ...b, updated_by: who(p) });
  return json({ ok: true });
});

/** {action: "ideas" | "sync"} queues the AI plan or a fresh import of posts/metrics. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req, 'write');
  needBiz(p, business, true);
  const { action } = z.object({ action: z.enum(['ideas', 'sync']) }).parse(await req.json());
  const kind = action === 'ideas' ? 'social_ideas' : 'social_sync';
  const busy = await prisma.job.findFirst({ where: { kind, status: { in: ['queued', 'claimed', 'running'] } } });
  if (busy) return json({ queued: false, note: 'Age theke cholche' });
  const j = await prisma.job.create({ data: { kind, params: action === 'ideas' ? { business } : {}, createdBy: who(p) } });
  return json({ queued: true, job_id: j.id });
});
