// What works on social: by hour and weekday (Bangladesh time), format and content type, best/worst posts.
// Pure functions over social_insights docs, shared by the API (Analytics tab) and the AI suggestion job.
export type Insight = {
  network: string; account_id: string; ext_id: string; created: string; text?: string; permalink?: string; thumb?: string;
  format: string; content_type?: string;
  metrics: { reach?: number; views?: number; reactions?: number; comments?: number; shares?: number; saves?: number; clicks?: number };
};

const BD = 6 * 3600e3;
export const bdHour = (iso: string) => new Date(Date.parse(iso) + BD).getUTCHours();
export const bdWeekday = (iso: string) => new Date(Date.parse(iso) + BD).getUTCDay(); // 0 = Sunday
export const WEEKDAYS = ['Robi', 'Shom', 'Mongol', 'Budh', 'Brihoshpoti', 'Shukro', 'Shoni'];

export const engagement = (m: Insight['metrics']) => (m.reactions || 0) + (m.comments || 0) + (m.shares || 0) + (m.saves || 0);
/** Engagement per 100 people reached when reach is known, else null. */
export const engRate = (m: Insight['metrics']) => (m.reach ? (engagement(m) / m.reach) * 100 : null);

type Agg = { key: string; posts: number; engagement: number; reach: number; avg_eng: number; avg_reach: number; rate: number | null };
function group(rows: Insight[], key: (r: Insight) => string): Agg[] {
  const m = new Map<string, { posts: number; engagement: number; reach: number; reachPosts: number; engR: number }>();
  for (const r of rows) {
    const k = key(r); const x = m.get(k) ?? { posts: 0, engagement: 0, reach: 0, reachPosts: 0, engR: 0 };
    const e = engagement(r.metrics);
    x.posts++; x.engagement += e;
    if (r.metrics.reach) { x.reach += r.metrics.reach; x.reachPosts++; x.engR += e; }
    m.set(k, x);
  }
  return [...m].map(([k, x]) => ({ key: k, posts: x.posts, engagement: x.engagement, reach: x.reach, avg_eng: x.engagement / x.posts, avg_reach: x.reachPosts ? x.reach / x.reachPosts : 0, rate: x.reach ? (x.engR / x.reach) * 100 : null }));
}

export function analyze(rows: Insight[], opts: { minPosts?: number } = {}) {
  const min = opts.minPosts ?? 2;
  const totals = { posts: rows.length, engagement: rows.reduce((s, r) => s + engagement(r.metrics), 0), reach: rows.reduce((s, r) => s + (r.metrics.reach || 0), 0), views: rows.reduce((s, r) => s + (r.metrics.views || 0), 0) };
  const byHour = group(rows, (r) => String(bdHour(r.created))).sort((a, b) => Number(a.key) - Number(b.key));
  const byWeekday = group(rows, (r) => String(bdWeekday(r.created))).sort((a, b) => Number(a.key) - Number(b.key));
  const byFormat = group(rows, (r) => r.format || 'other').sort((a, b) => b.avg_eng - a.avg_eng);
  const byType = group(rows.filter((r) => r.content_type), (r) => r.content_type!).sort((a, b) => b.avg_eng - a.avg_eng);
  const byNetwork = group(rows, (r) => r.network);
  // weekday × 3-hour slot, the grid the "best time" heatmap shows
  const slot = (r: Insight) => bdWeekday(r.created) + ':' + Math.floor(bdHour(r.created) / 3) * 3;
  const heat = group(rows, slot).map((a) => ({ ...a, weekday: Number(a.key.split(':')[0]), hour: Number(a.key.split(':')[1]) }));
  const best = (xs: Agg[]) => xs.filter((x) => x.posts >= min).sort((a, b) => b.avg_eng - a.avg_eng);
  const scored = rows.map((r) => ({ ...r, eng: engagement(r.metrics), rate: engRate(r.metrics) }));
  const rank = [...scored].sort((a, b) => b.eng - a.eng);
  return {
    totals, byHour, byWeekday, byFormat, byType, byNetwork, heat,
    bestHours: best(byHour).slice(0, 3), bestDays: best(byWeekday).slice(0, 3), bestSlots: best(heat).slice(0, 3), bestFormat: best(byFormat)[0] ?? null,
    top: rank.slice(0, 10), weak: rank.length > 10 ? rank.slice(-5).reverse() : [],
  };
}
export type Analysis = ReturnType<typeof analyze>;
