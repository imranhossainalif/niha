import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import type { SocialPost } from '@/lib/jobs/social';

/** Drag & drop on the calendar: new time for a scheduled post or draft. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const p = await needPrincipal(req, 'write');
  const { scheduled_at } = z.object({ scheduled_at: z.string().datetime() }).parse(await req.json());
  if (Date.parse(scheduled_at) < Date.now() - 60e3) throw Object.assign(new Error('Ager shomoye neya jabe na'), { status: 400, code: 'bad_request' });
  const ref = db(p).collection('social_posts').doc((await params).id);
  const cur = await ref.get();
  if (!cur) throw Object.assign(new Error('Post nai'), { status: 404, code: 'not_found' });
  const post = cur.data as SocialPost;
  if (!['scheduled', 'draft', 'failed'].includes(post.status)) throw Object.assign(new Error('Publish hoye gele shoranor upay nai'), { status: 409, code: 'conflict' });
  await ref.set({ ...post, scheduled_at, status: post.status === 'draft' ? 'draft' : 'scheduled' } as never, { expectedVersion: cur.version });
  return json({ ok: true });
});
