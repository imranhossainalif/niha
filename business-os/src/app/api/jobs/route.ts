import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { prisma } from '@/lib/prisma';
import { isFull } from '@/lib/access';
import { z } from 'zod';

/** Recent background jobs (owner/admin), or one job by ?id=. */
export const GET = handle(async (req: Request) => {
  const p = await needPrincipal(req);
  const id = new URL(req.url).searchParams.get('id');
  if (id) return json(await prisma.job.findUnique({ where: { id } }));
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  return json({ jobs: await prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) });
});

const QUEUEABLE = ['nuport_sync', 'nuport_backfill', 'nuport_recompute', 'sheets_sync', 'inbox_import', 'backup', 'growth_weekly', 'competitor_weekly', 'loan_plan', 'learning_nudge'] as const;
const Body = z.object({ kind: z.enum(QUEUEABLE), params: z.record(z.unknown()).default({}) });

/** Queue a background job (owner/admin): {kind, params}. The worker picks it up within seconds. */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  const b = Body.parse(await req.json());
  const job = await prisma.job.create({ data: { kind: b.kind, params: b.params as object, createdBy: p.kind === 'user' ? p.email : 'system' } });
  return json({ job_id: job.id, status: job.status }, 202);
});
