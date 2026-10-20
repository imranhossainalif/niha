import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { inboxPrincipal } from '@/lib/inbox/guard';
import { prisma } from '@/lib/prisma';

const Body = z.object({ days: z.number().int().min(1).max(365).default(30) });

/** Queue a Messenger history import; the worker runs it. Poll GET /api/jobs?id=… for the result. */
export const POST = handle(async (req: Request) => {
  const p = await inboxPrincipal(req, true);
  const { days } = Body.parse(await req.json().catch(() => ({})));
  const job = await prisma.job.create({ data: { kind: 'inbox_import', params: { days }, createdBy: p.kind === 'user' ? p.email : 'system' } });
  return json({ job_id: job.id, status: job.status }, 202);
});
