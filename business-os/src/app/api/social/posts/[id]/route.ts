import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { PostBody } from '@/lib/social/api';
import type { SocialPost } from '@/lib/jobs/social';

type Ctx = { params: Promise<{ id: string }> };
const notFound = () => Object.assign(new Error('Post nai'), { status: 404, code: 'not_found' });

/** Edit a draft/scheduled/failed post (published ones are fixed). action: draft | schedule. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const p = await needPrincipal(req, 'write');
  const ref = db(p).collection('social_posts').doc(id);
  const cur = await ref.get(); if (!cur) throw notFound();
  const post = cur.data as SocialPost;
  if (post.status === 'published' || post.status === 'publishing') throw Object.assign(new Error('Publish hoye gele ar edit hoy na'), { status: 409, code: 'conflict' });
  const b = PostBody.parse(await req.json());
  if (b.action === 'schedule' && (!b.scheduled_at || Date.parse(b.scheduled_at) < Date.now() - 60e3)) throw Object.assign(new Error('Shamner ekta shomoy din'), { status: 400, code: 'bad_request' });
  const prev = new Map(post.targets.map((t) => [t.account_id, t]));
  const next = { ...post, text: b.text, media: b.media, link: b.link || undefined, labels: b.labels, content_type: b.content_type,
    targets: b.targets.map((t) => { const o = prev.get(t.account_id); return o?.status === 'published' ? o : { ...t, status: 'pending' as const }; }),
    scheduled_at: b.action === 'schedule' ? b.scheduled_at : null, status: b.action === 'schedule' ? 'scheduled' : 'draft', error: undefined };
  const s = await ref.set(next as never, { expectedVersion: cur.version });
  return json({ id, version: s.version, status: next.status });
});

/** Remove from the calendar. A post already on Facebook/Instagram stays there (delete it on the page). */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const p = await needPrincipal(req, 'write');
  const ok = await db(p).collection('social_posts').doc(id).delete();
  if (!ok) throw notFound();
  return json({ deleted: true });
});
