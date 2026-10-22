// Facebook Page + Instagram (business) through the Graph API: find accounts, publish, read posts with metrics,
// and read competitors' public Instagram posts (Business Discovery). One system-user token (META_SOCIAL_TOKEN, else
// META_ADS_TOKEN) gives page tokens on the fly, so no page token is ever stored.
// Facts this follows: Meta removed posting to Groups from the API (2024); Instagram needs a public media URL and
// can't post text only; Facebook Page post metrics need pages_read_engagement + read_insights.
import { cfg } from '../config';

export const GRAPH = 'https://graph.facebook.com/v21.0';
export type Network = 'facebook' | 'instagram';
export type Fetch = typeof fetch;

export class GraphError extends Error {
  constructor(message: string, public code?: number, public status?: number) { super(message); }
}

export async function graph(path: string, opts: { token: string; method?: 'GET' | 'POST' | 'DELETE'; params?: Record<string, unknown>; f?: Fetch; base?: string } ): Promise<any> {
  const f = opts.f ?? fetch;
  const url = new URL((opts.base ?? GRAPH) + (path.startsWith('/') ? path : '/' + path));
  const body = new URLSearchParams();
  const put = (k: string, v: unknown) => (opts.method === 'POST' ? body : url.searchParams).set(k, typeof v === 'string' ? v : JSON.stringify(v));
  for (const [k, v] of Object.entries(opts.params ?? {})) if (v !== undefined && v !== null && v !== '') put(k, v);
  put('access_token', opts.token);
  const r = await f(url.toString(), { method: opts.method ?? 'GET', ...(opts.method === 'POST' ? { body } : {}), signal: AbortSignal.timeout(120000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new GraphError(j.error?.error_user_msg || j.error?.message || 'Meta API ' + r.status, j.error?.code, r.status);
  return j;
}
/** Follow `paging.next` until `cap` rows. */
export async function graphAll(path: string, opts: Parameters<typeof graph>[1], cap = 500): Promise<any[]> {
  const out: any[] = [];
  let j = await graph(path, opts);
  for (;;) {
    out.push(...(j.data ?? []));
    if (out.length >= cap || !j.paging?.next) return out.slice(0, cap);
    const r = await (opts.f ?? fetch)(j.paging.next, { signal: AbortSignal.timeout(120000) });
    j = await r.json();
    if (j.error) throw new GraphError(j.error.message, j.error.code, r.status);
  }
}

export async function socialToken(): Promise<string> {
  const t = (await cfg('META_SOCIAL_TOKEN')) || (await cfg('META_ADS_TOKEN'));
  if (!t) throw Object.assign(new Error('Social media token nai: Settings → Meta Social token boshan'), { status: 400, code: 'not_connected' });
  return t;
}

const pageTokens = new Map<string, { t: string; at: number }>();
/** Page access token for a page the system user can manage (cached 30 min). */
export async function pageToken(pageId: string, user: string, f?: Fetch): Promise<string> {
  const c = pageTokens.get(pageId);
  if (c && Date.now() - c.at < 30 * 60e3) return c.t;
  const j = await graph('/' + pageId, { token: user, params: { fields: 'access_token' }, f });
  if (!j.access_token) throw new GraphError('Page ' + pageId + ' er token pawa jayni: system user ke page e "Create content" access din');
  pageTokens.set(pageId, { t: j.access_token, at: Date.now() });
  return j.access_token;
}

export type FoundAccount = { network: Network; ext_id: string; name: string; username?: string; picture?: string; followers?: number; page_id?: string };
/** Pages (and their linked Instagram accounts) this token can manage. */
export async function discoverAccounts(user: string, f?: Fetch): Promise<FoundAccount[]> {
  const pages = await graphAll('/me/accounts', { token: user, f, params: { fields: 'id,name,picture{url},followers_count,fan_count,instagram_business_account{id,username,name,profile_picture_url,followers_count}', limit: 100 } }, 200);
  const out: FoundAccount[] = [];
  for (const p of pages) {
    out.push({ network: 'facebook', ext_id: p.id, name: p.name, picture: p.picture?.data?.url, followers: p.followers_count ?? p.fan_count });
    const ig = p.instagram_business_account;
    if (ig) out.push({ network: 'instagram', ext_id: ig.id, name: ig.name || ig.username, username: ig.username, picture: ig.profile_picture_url, followers: ig.followers_count, page_id: p.id });
  }
  return out;
}

export type Media = { url: string; mime: string };
export type PublishInput = { text: string; media: Media[]; link?: string; scheduled?: boolean };
export type PublishResult = { ext_post_id: string; permalink?: string };
const isVideo = (m: Media) => m.mime.startsWith('video/');

/** Publish now on a Facebook Page: text/link, one photo, several photos (album post), or one video. */
export async function publishFacebook(pageId: string, input: PublishInput, user: string, f?: Fetch): Promise<PublishResult> {
  const token = await pageToken(pageId, user, f);
  const { text, media, link } = input;
  let id: string;
  if (media.length === 1 && isVideo(media[0])) {
    const j = await graph('/' + pageId + '/videos', { token, method: 'POST', f, base: 'https://graph-video.facebook.com/v21.0', params: { file_url: media[0].url, description: text } });
    id = j.post_id || j.id;
  } else if (media.length === 1) {
    const j = await graph('/' + pageId + '/photos', { token, method: 'POST', f, params: { url: media[0].url, caption: text } });
    id = j.post_id || j.id;
  } else if (media.length > 1) {
    if (media.some(isVideo)) throw new GraphError('Facebook e ek post e onek video/photo+video eksathe deya jay na — ekta video ba shudhu photo din');
    const ids: string[] = [];
    for (const m of media) ids.push((await graph('/' + pageId + '/photos', { token, method: 'POST', f, params: { url: m.url, published: 'false' } })).id);
    id = (await graph('/' + pageId + '/feed', { token, method: 'POST', f, params: { message: text, attached_media: ids.map((x) => ({ media_fbid: x })) } })).id;
  } else {
    if (!text && !link) throw new GraphError('Lekha ba link lagbe');
    id = (await graph('/' + pageId + '/feed', { token, method: 'POST', f, params: { message: text, link } })).id;
  }
  const p = await graph('/' + id, { token, f, params: { fields: 'permalink_url' } }).catch(() => ({}));
  return { ext_post_id: id, permalink: p.permalink_url };
}

async function waitContainer(id: string, token: string, f?: Fetch, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const j = await graph('/' + id, { token, f, params: { fields: 'status_code,status' } });
    if (j.status_code === 'FINISHED') return;
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') throw new GraphError('Instagram media process hoyni: ' + (j.status || j.status_code));
    await new Promise((r) => setTimeout(r, f ? 0 : 5000));
  }
  throw new GraphError('Instagram video process hote onek deri hocche — kichukkhon por abar chesta korun');
}

/** Publish now on Instagram: one photo, one video (as a Reel), or 2–10 items (carousel). */
export async function publishInstagram(igId: string, pageId: string, input: PublishInput, user: string, f?: Fetch): Promise<PublishResult> {
  const token = await pageToken(pageId, user, f);
  const { text, media } = input;
  if (!media.length) throw new GraphError('Instagram e shudhu lekha post hoy na — chobi ba video lagbe');
  if (media.length > 10) throw new GraphError('Instagram carousel e 10 tar beshi item hoy na');
  const item = async (m: Media, carousel: boolean) => {
    const j = await graph('/' + igId + '/media', { token, method: 'POST', f, params: isVideo(m)
      ? { media_type: carousel ? 'VIDEO' : 'REELS', video_url: m.url, ...(carousel ? { is_carousel_item: 'true' } : { caption: text }) }
      : { image_url: m.url, ...(carousel ? { is_carousel_item: 'true' } : { caption: text }) } });
    if (isVideo(m)) await waitContainer(j.id, token, f);
    return j.id as string;
  };
  let creation: string;
  if (media.length === 1) creation = await item(media[0], false);
  else {
    const children: string[] = [];
    for (const m of media) children.push(await item(m, true));
    creation = (await graph('/' + igId + '/media', { token, method: 'POST', f, params: { media_type: 'CAROUSEL', children: children.join(','), caption: text } })).id;
    await waitContainer(creation, token, f);
  }
  const pub = await graph('/' + igId + '/media_publish', { token, method: 'POST', f, params: { creation_id: creation } });
  const p = await graph('/' + pub.id, { token, f, params: { fields: 'permalink' } }).catch(() => ({}));
  return { ext_post_id: pub.id, permalink: p.permalink };
}

/* ---------- reading posts + metrics ---------- */
export type PostStat = {
  network: Network; account_id: string; ext_id: string; created: string; text: string; permalink?: string; thumb?: string;
  format: 'photo' | 'video' | 'reel' | 'carousel' | 'album' | 'text' | 'link' | 'other';
  metrics: { reach?: number; views?: number; reactions: number; comments: number; shares: number; saves?: number; clicks?: number };
};

export function fbFormat(p: any): PostStat['format'] {
  const a = p.attachments?.data?.[0];
  const t = String(a?.media_type || a?.type || p.status_type || '').toLowerCase();
  if (/reel/.test(t)) return 'reel';
  if (/video/.test(t)) return 'video';
  if (/album/.test(t) || (a?.subattachments?.data?.length ?? 0) > 1) return 'album';
  if (/photo|image/.test(t)) return 'photo';
  if (/share|link/.test(t)) return 'link';
  return p.full_picture ? 'photo' : 'text';
}
export function igFormat(m: any): PostStat['format'] {
  if (m.media_product_type === 'REELS') return 'reel';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  if (m.media_type === 'VIDEO') return 'video';
  if (m.media_type === 'IMAGE') return 'photo';
  return 'other';
}

/** Insights for one object; tries the metric list, then one by one (Meta keeps retiring metrics). */
async function insights(id: string, metrics: string[], token: string, f?: Fetch): Promise<Record<string, number>> {
  const read = (j: any) => Object.fromEntries((j.data ?? []).map((d: any) => [d.name, Number(d.values?.[0]?.value ?? d.total_value?.value) || 0]));
  try { return read(await graph('/' + id + '/insights', { token, f, params: { metric: metrics.join(',') } })); } catch { /* some metric is gone */ }
  const out: Record<string, number> = {};
  for (const m of metrics) { try { Object.assign(out, read(await graph('/' + id + '/insights', { token, f, params: { metric: m } }))); } catch { /* skip */ } }
  return out;
}

export async function facebookPosts(pageId: string, sinceIso: string, user: string, f?: Fetch, cap = 300): Promise<PostStat[]> {
  const token = await pageToken(pageId, user, f);
  const rows = await graphAll('/' + pageId + '/posts', { token, f, params: { since: Math.floor(Date.parse(sinceIso) / 1000), limit: 50,
    fields: 'id,created_time,message,permalink_url,full_picture,status_type,attachments{media_type,type,subattachments.limit(2)},shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)' } }, cap);
  const out: PostStat[] = [];
  for (const p of rows) {
    const ins = await insights(p.id, ['post_impressions_unique', 'post_media_view', 'post_clicks'], token, f);
    out.push({ network: 'facebook', account_id: pageId, ext_id: p.id, created: p.created_time, text: String(p.message || '').slice(0, 500), permalink: p.permalink_url, thumb: p.full_picture, format: fbFormat(p),
      metrics: { reach: ins.post_impressions_unique, views: ins.post_media_view, clicks: ins.post_clicks, reactions: p.reactions?.summary?.total_count ?? 0, comments: p.comments?.summary?.total_count ?? 0, shares: p.shares?.count ?? 0 } });
  }
  return out;
}

export async function instagramPosts(igId: string, pageId: string, sinceIso: string, user: string, f?: Fetch, cap = 300): Promise<PostStat[]> {
  const token = await pageToken(pageId, user, f);
  const rows = (await graphAll('/' + igId + '/media', { token, f, params: { limit: 50, fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url,media_url,like_count,comments_count' } }, cap))
    .filter((m) => m.timestamp >= sinceIso);
  const out: PostStat[] = [];
  for (const m of rows) {
    const ins = await insights(m.id, ['reach', 'views', 'saved', 'shares', 'total_interactions'], token, f);
    out.push({ network: 'instagram', account_id: igId, ext_id: m.id, created: m.timestamp, text: String(m.caption || '').slice(0, 500), permalink: m.permalink, thumb: m.thumbnail_url || (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM' ? m.media_url : undefined), format: igFormat(m),
      metrics: { reach: ins.reach, views: ins.views, reactions: m.like_count ?? 0, comments: m.comments_count ?? 0, shares: ins.shares ?? 0, saves: ins.saved } });
  }
  return out;
}

/** Current follower count of a connected account. */
export async function followers(network: Network, extId: string, pageId: string, user: string, f?: Fetch): Promise<number | null> {
  const token = await pageToken(pageId, user, f);
  const j = await graph('/' + extId, { token, f, params: { fields: network === 'facebook' ? 'followers_count,fan_count' : 'followers_count' } }).catch(() => null);
  return j ? Number(j.followers_count ?? j.fan_count) || 0 : null;
}

/** Instagram audience (age/gender, city) — only for accounts with 100+ followers. */
export async function igAudience(igId: string, pageId: string, user: string, f?: Fetch) {
  const token = await pageToken(pageId, user, f);
  const one = async (breakdown: string) => {
    const j = await graph('/' + igId + '/insights', { token, f, params: { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown } }).catch(() => null);
    const rows = j?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    return rows.map((r: any) => ({ key: (r.dimension_values ?? []).join(' '), value: Number(r.value) || 0 })) as { key: string; value: number }[];
  };
  return { age_gender: await one('age,gender'), city: (await one('city')).sort((a, b) => b.value - a.value).slice(0, 15) };
}

/** A competitor's public Instagram business/creator account: profile + latest posts. */
export async function igCompetitor(myIgId: string, pageId: string, username: string, user: string, f?: Fetch) {
  const token = await pageToken(pageId, user, f);
  const u = username.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
  const j = await graph('/' + myIgId, { token, f, params: { fields: `business_discovery.username(${u}){username,name,followers_count,media_count,profile_picture_url,media.limit(30){caption,like_count,comments_count,timestamp,media_type,media_product_type,permalink,media_url,thumbnail_url}}` } });
  const b = j.business_discovery;
  return {
    username: b.username as string, name: b.name as string, followers: Number(b.followers_count) || 0, media_count: Number(b.media_count) || 0, picture: b.profile_picture_url as string | undefined,
    posts: ((b.media?.data ?? []) as any[]).map((m) => ({ created: m.timestamp, text: String(m.caption || '').slice(0, 400), format: igFormat(m), likes: m.like_count ?? 0, comments: m.comments_count ?? 0, permalink: m.permalink, thumb: m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : undefined) })),
  };
}
