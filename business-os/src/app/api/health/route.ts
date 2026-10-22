import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { checkAll, latestHealth } from '@/lib/health';

export const maxDuration = 120;

async function admin(req: Request, scope: 'read' | 'write') {
  const p = await needPrincipal(req, scope);
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
}

/** Last stored connection/limit check (hourly from the worker). The dashboard uses it for its warning badge. */
export const GET = handle(async (req: Request) => {
  await admin(req, 'read');
  const h = await latestHealth();
  if (!h) return json({ checked_at: null, bad: 0, warn: 0, items: [] });
  return json({ ...h, items: h.items.map(({ id, name, status, summary }) => ({ id, name, status, summary })) });
});

/** Run every check now. */
export const POST = handle(async (req: Request) => {
  await admin(req, 'write');
  return json(await checkAll());
});
