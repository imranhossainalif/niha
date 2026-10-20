import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { prisma } from '@/lib/prisma';
import { isFull } from '@/lib/access';

/** Recent background jobs (owner/admin), or one job by ?id=. */
export const GET = handle(async (req: Request) => {
  const p = await needPrincipal(req);
  const id = new URL(req.url).searchParams.get('id');
  if (id) return json(await prisma.job.findUnique({ where: { id } }));
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  return json({ jobs: await prisma.job.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }) });
});
