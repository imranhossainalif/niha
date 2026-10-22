import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { needBiz } from '@/lib/social/api';
import { analyze, engagement, type Insight } from '@/lib/social/analytics';
import { bdDate } from '@/lib/time';

type Ctx = { params: Promise<{ business: string }> };

/** ?days=30 (posts created in the last N days), &network=facebook|instagram, compared with the N days before. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req);
  needBiz(p, business);
  const sp = new URL(req.url).searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.get('days')) || 30));
  const net = sp.get('network') || '';
  const from = new Date(Date.now() - days * 864e5).toISOString(), prevFrom = new Date(Date.now() - 2 * days * 864e5).toISOString();
  const all = (await db(p).collection('social_insights').where('business', '==', business).limit(5000).get()).map((s) => s.data as Insight).filter((r) => !net || r.network === net);
  const cur = all.filter((r) => r.created >= from), prev = all.filter((r) => r.created >= prevFrom && r.created < from);
  const daily = (await db(p).collection('social_daily').where('business', '==', business).limit(5000).get()).map((s) => s.data as { account_doc: string; network: string; date: string; followers: number })
    .filter((d) => !net || d.network === net).sort((a, b) => a.date.localeCompare(b.date));
  const audience = (await db(p).collection('social_audience').where('business', '==', business).limit(10).get()).map((s) => s.data);
  const last = all.map((r) => (r as Insight & { synced?: string }).synced).filter(Boolean).sort().pop() ?? null;
  // per BD day: posts, engagement, reach (for the small charts)
  const perDay: Record<string, { posts: number; engagement: number; reach: number; views: number }> = {};
  for (const r of cur) { const d = bdDate(r.created)!; const x = (perDay[d] ??= { posts: 0, engagement: 0, reach: 0, views: 0 }); x.posts++; x.engagement += engagement(r.metrics); x.reach += r.metrics.reach || 0; x.views += r.metrics.views || 0; }
  const series = Array.from({ length: days }, (_, i) => bdDate(Date.now() - (days - 1 - i) * 864e5)!).map((d) => ({ date: d, ...(perDay[d] ?? { posts: 0, engagement: 0, reach: 0, views: 0 }) }));
  const networks = [...new Set(all.map((r) => r.network))];
  return json({ days, series, networks, analysis: analyze(cur), prev: analyze(prev).totals, followers: daily, audience, total_posts: all.length, synced: last });
});
