import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { isFull } from '@/lib/access';
import { cfg, saveConfig } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { inboxPrincipal } from '@/lib/inbox/guard';
import { webStatus } from '@/lib/inbox/web';
import { productStats } from '@/lib/inbox/products';
import { listFiles } from '@/lib/inbox/files';
import { pairCount } from '@/lib/inbox/learn';

const hostOf = (u: string) => { try { return new URL(u.includes('://') ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** What the AI reads: the two websites (pages + products), uploaded files, and how many past replies it learned from. */
export const GET = handle(async (req: Request) => {
  const p = await inboxPrincipal(req);
  const [u1, u2, web, prods, files, pairs, job] = await Promise.all([cfg('WEBSITE_URL'), cfg('WEBSITE_URL_2'), webStatus(), productStats(), listFiles(), pairCount().catch(() => 0),
    prisma.job.findFirst({ where: { kind: 'inbox_web_sync' }, orderBy: { createdAt: 'desc' } })]);
  const site = (key: string, url?: string) => { const h = url ? hostOf(url) : ''; return { key, url: url ?? '', host: h, pages: web.sites[h]?.pages ?? 0, last: web.sites[h]?.last ?? null, products: prods[h] ?? 0 }; };
  return json({ canEdit: isFull(p), sites: [site('WEBSITE_URL', u1), site('WEBSITE_URL_2', u2)], files, pairs, sync: job ? { status: job.status, at: job.createdAt, error: job.error, result: job.result } : null });
});

const Put = z.object({ website_1: z.string().max(300).default(''), website_2: z.string().max(300).default('') });
/** Save the two website links (owner only: they are settings). */
export const PUT = handle(async (req: Request) => {
  const p = await inboxPrincipal(req, true);
  if (p.kind !== 'user' || p.role !== 'owner') throw Object.assign(new Error('Website link shudhu owner bodlate pare'), { status: 403, code: 'permission_denied' });
  const b = Put.parse(await req.json());
  const clean = (v: string) => { const t = v.trim(); if (!t) return ''; if (!hostOf(t)) throw Object.assign(new Error('Link thik nai: ' + t), { status: 400, code: 'bad_request' }); return t.includes('://') ? t : 'https://' + t; };
  await saveConfig({ WEBSITE_URL: clean(b.website_1), WEBSITE_URL_2: clean(b.website_2) }, p.email); // empty = remove the saved value
  return json({ ok: true });
});

/** Read both websites now (pages + products). */
export const POST = handle(async (req: Request) => {
  const p = await inboxPrincipal(req, true);
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  const busy = await prisma.job.findFirst({ where: { kind: 'inbox_web_sync', status: { in: ['queued', 'claimed', 'running'] } } });
  if (busy) return json({ queued: false, note: 'Age theke cholche' });
  const j = await prisma.job.create({ data: { kind: 'inbox_web_sync', createdBy: p.kind === 'user' ? p.email : 'system' } });
  return json({ queued: true, job_id: j.id });
});
