import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { needBiz, PostBody, who } from '@/lib/social/api';
import { publishPost, type SocialPost } from '@/lib/jobs/social';

export const maxDuration = 300;
type Ctx = { params: Promise<{ business: string }> };

/** Posts for the calendar: ?from=YYYY-MM-DD&to=YYYY-MM-DD (by scheduled/published day), drafts always. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req);
  needBiz(p, business);
  const sp = new URL(req.url).searchParams;
  const from = sp.get('from') || '0000', to = (sp.get('to') || '9999') + 'T99';
  const rows = await db(p).collection('social_posts').where('business', '==', business).limit(5000).get();
  const posts = rows.map((s) => ({ id: s.id, version: s.version, ...(s.data as SocialPost) }))
    .filter((x) => { const t = x.published_at || x.scheduled_at; return !t ? true : t >= from && t <= to; })
    .sort((a, b) => String(a.scheduled_at || a.published_at || '').localeCompare(String(b.scheduled_at || b.published_at || '')));
  return json({ posts });
});


/** Create a post: save as draft, schedule, or publish now. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req, 'write');
  needBiz(p, business, true);
  const b = PostBody.parse(await req.json());
  if (b.action === 'schedule' && (!b.scheduled_at || Date.parse(b.scheduled_at) < Date.now() - 60e3)) throw Object.assign(new Error('Shamner ekta shomoy din'), { status: 400, code: 'bad_request' });
  if (b.targets.some((t) => t.network === 'instagram') && !b.media.length) throw Object.assign(new Error('Instagram e chobi ba video lagbe'), { status: 400, code: 'bad_request' });
  const doc: SocialPost & Record<string, unknown> = {
    business, text: b.text, media: b.media, link: b.link || undefined, labels: b.labels, content_type: b.content_type,
    targets: b.targets.map((t) => ({ ...t, status: 'pending' as const })),
    scheduled_at: b.action === 'schedule' ? b.scheduled_at : null,
    status: b.action === 'draft' ? 'draft' : 'scheduled', created_by: who(p), created_at: new Date().toISOString(),
  };
  if (b.action === 'now') doc.status = 'draft'; // publishPost moves it on
  const s = await db(p).collection('social_posts').add(doc);
  if (b.action === 'now') return json({ id: s.id, ...(await publishPost(s.id, p)) }, 201);
  return json({ id: s.id, status: doc.status }, 201);
});
