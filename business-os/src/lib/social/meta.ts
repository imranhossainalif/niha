// Facebook Page + Instagram (business) through the Graph API: find accounts, publish, read posts with metrics,
// and read competitors' public Instagram posts (Business Discovery). One user token — the Settings system-user
// token (META_SOCIAL_TOKEN), else the one-click Facebook Login token, else META_ADS_TOKEN — gives page tokens
// on the fly, so no page token is ever stored.
// Facts this follows: Meta removed posting to Groups from the API (2024); Instagram needs a public media URL and
// can't post text only; Facebook Page post metrics need pages_read_engagement + read_insights.
import { cfg, readSecret, saveSecret } from '../config';

export const GRAPH = 'https://graph.facebook.com/v21.0';
export type Network = 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'pinterest' | 'linkedin';
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
  // A network blink ("fetch failed") is retried — but only where doing it twice is harmless: reads, and creating an
  // Instagram media container. Calls that publish (media_publish, feed, photos, videos) are never repeated here.
  const safe = (opts.method ?? 'GET') === 'GET' || /\/media$/.test(path);
  let r: Response | undefined;
  for (let i = 0; ; i++) {
    try { r = await f(url.toString(), { method: opts.method ?? 'GET', ...(opts.method === 'POST' ? { body } : {}), signal: AbortSignal.timeout(120000) }); break; }
    catch (e) {
      if (!safe || i >= 2) throw new GraphError('Meta er sathe network e connect hoy nai (' + String((e as Error).message || e) + ') — ektu pore abar chesta hobe');
      await new Promise((res) => setTimeout(res, opts.f ? 0 : 1500 * (i + 1)));
    }
  }
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
  const t = (await cfg('META_SOCIAL_TOKEN')) || (await metaUserToken()) || (await cfg('META_ADS_TOKEN'));
  if (!t) throw Object.assign(new Error('Social media connect nai: Social Media → Accounts e "Facebook diye connect" chapun, ba Settings e Meta social token boshan'), { status: 400, code: 'not_connected' });
  return t;
}

/* ---------- one-click connect: Facebook Login (OAuth) ---------- */
export const META_SCOPES = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'pages_read_user_content', 'read_insights', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights', 'business_management', 'ads_read'];

/** Facebook Login dialog URL: the user just logs in and approves — no token to copy or paste. */
export function metaAuthUrl(appId: string, redirect: string, state: string): string {
  const u = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  u.searchParams.set('client_id', appId);
  u.searchParams.set('redirect_uri', redirect);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', META_SCOPES.join(','));
  u.searchParams.set('state', state);
  return u.toString();
}

export type MetaTokens = { access_token: string; expires_at: number };
/** OAuth code → short-lived user token → long-lived (~60 day) user token. */
export async function metaExchangeCode(appId: string, secret: string, code: string, redirect: string, f?: Fetch): Promise<MetaTokens> {
  const call = async (params: Record<string, string>) => {
    const u = new URL(GRAPH + '/oauth/access_token');
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const r = await (f ?? fetch)(u.toString(), { signal: AbortSignal.timeout(30000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error || !j.access_token) throw new GraphError(j.error?.message || 'Meta token exchange hoyni (' + r.status + ')', j.error?.code, r.status);
    return j as { access_token: string; expires_in?: number };
  };
  const short = await call({ client_id: appId, client_secret: secret, redirect_uri: redirect, code });
  const long = await call({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: short.access_token });
  return { access_token: long.access_token, expires_at: Date.now() + (Number(long.expires_in) || 5184000) * 1000 };
}

export async function metaMe(token: string, f?: Fetch): Promise<{ id: string; name: string }> {
  const j = await graph('/me', { token, f, params: { fields: 'id,name' } });
  return { id: String(j.id), name: String(j.name || '') };
}

/** The one-click (Facebook Login) user token, while it is still valid — stored as an encrypted secret by the OAuth callback. */
export async function metaUserToken(): Promise<string | undefined> {
  const t = await readSecret<MetaTokens & { access_token: string }>('meta:user').catch(() => null);
  return t && t.access_token && t.expires_at > Date.now() + 60e3 ? t.access_token : undefined;
}

/**
 * Every one-click user token we hold, latest login first: 'meta:user' plus the recent-login history
 * ('meta:users', maintained by the OAuth callback). Each Facebook login is limited to the Pages/assets
 * chosen in that run's picker — the SAME person can reconnect tomorrow for one business with a narrow
 * picker — so no single token can manage every Page. A Page token must be derivable from ANY stored
 * login, otherwise connecting a second business silently breaks the first one's publishing (the
 * "Hoyni" outage of Nov 2026).
 */
export async function metaUserTokens(): Promise<string[]> {
  const out: string[] = [];
  const push = (t?: string) => { if (t && !out.includes(t)) out.push(t); };
  push(await metaUserToken());
  const hist = await readSecret<MetaTokens[]>('meta:users').catch(() => null);
  for (const t of hist ?? []) push(t.access_token && t.expires_at > Date.now() + 60e3 ? t.access_token : undefined);
  return out;
}

/** All tokens publishing/analytics may try, in order: Settings system token, one-click logins, ads token. */
export async function metaTokens(): Promise<string[]> {
  const out: string[] = [];
  const push = (t?: string) => { if (t && !out.includes(t)) out.push(t); };
  push(await cfg('META_SOCIAL_TOKEN'));
  for (const t of await metaUserTokens()) push(t);
  push(await cfg('META_ADS_TOKEN'));
  if (!out.length) throw Object.assign(new Error('Social media connect nai: Social Media → Accounts e "Facebook diye connect" chapun, ba Settings e Meta social token boshan'), { status: 400, code: 'not_connected' });
  return out;
}

const pageTokens = new Map<string, { t: string; at: number }>();
/**
 * Page tokens saved at connect time (encrypted secret 'meta:page:<id>'). A Page token made from a long-lived user token does
 * not expire, so it keeps publishing even when the user token behind it has lapsed. It is only a FALLBACK: derived tokens are
 * tried first, and if Facebook has revoked the Page's access (the person un-ticked it in a later login) it fails like before.
 */
export const savePageToken = (pageId: string, token: string) => saveSecret('meta:page:' + pageId, { token, at: Date.now() });
const storedPageToken = async (pageId: string) => (await readSecret<{ token: string }>('meta:page:' + pageId).catch(() => null))?.token;
/**
 * Page access token for a page (cached 30 min). `user` may be a list of candidate user tokens — the
 * first one that can manage this page wins, and if none can, the LAST Graph error is thrown (so the
 * failure stored on the post is Meta's real message, not a generic one).
 */
export async function pageToken(pageId: string, user: string | string[], f?: Fetch): Promise<string> {
  const c = pageTokens.get(pageId);
  if (c && Date.now() - c.at < 30 * 60e3) return c.t;
  let last: unknown;
  for (const u of Array.isArray(user) ? user : [user]) {
    try {
      const j = await graph('/' + pageId, { token: u, params: { fields: 'access_token' }, f });
      if (!j.access_token) throw new GraphError('Page ' + pageId + ' er token pawa jayni: system user ke page e "Create content" access din');
      pageTokens.set(pageId, { t: j.access_token, at: Date.now() });
      if (!(await storedPageToken(pageId))) void savePageToken(pageId, j.access_token).catch(() => {}); // first time we see it work: keep a fallback copy
      return j.access_token;
    } catch (e) { last = e; }
  }
  const stored = await storedPageToken(pageId);
  if (stored) {
    try { await graph('/' + pageId, { token: stored, params: { fields: 'id' }, f }); pageTokens.set(pageId, { t: stored, at: Date.now() }); return stored; } catch (e) { last = e; }
  }
  throw last ?? new GraphError('Page ' + pageId + ' er token pawa jayni');
}

export type FoundAccount = { network: Network; ext_id: string; name: string; username?: string; picture?: string; followers?: number; page_id?: string };
/** Pages (and their linked Instagram accounts) this token can manage. */
export async function discoverAccounts(user: string, f?: Fetch, keepTokens = false): Promise<FoundAccount[]> {
  const pages = await graphAll('/me/accounts', { token: user, f, params: { fields: 'id,name,access_token,picture{url},followers_count,fan_count,instagram_business_account{id,username,name,profile_picture_url,followers_count}', limit: 100 } }, 200);
  if (keepTokens) for (const p of pages) if (p.access_token) await savePageToken(String(p.id), p.access_token).catch(() => {});
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
export async function publishFacebook(pageId: string, input: PublishInput, user: string | string[], f?: Fetch): Promise<PublishResult> {
  const token = await pageToken(pageId, user, f);
  const { text, media, link } = input;
  let id: string;
  // `published`/`no_story` are sent explicitly: Meta's Page photo/video uploads do not always generate the feed story
  // on their own (a `/photos` upload can land only in the album/Photos tab), and the API defaults have changed before.
  // published=true + no_story=false is the documented way to get the post into the Page's main feed as well.
  if (media.length === 1 && isVideo(media[0])) {
    // Since Aug 2025 Meta treats uploaded Page videos as Reels; the feed story is the `no_story=false` part.
    const j = await graph('/' + pageId + '/videos', { token, method: 'POST', f, base: 'https://graph-video.facebook.com/v21.0', params: { file_url: media[0].url, description: text, published: 'true', no_story: 'false' } });
    id = j.post_id || j.id;
  } else if (media.length === 1) {
    const j = await graph('/' + pageId + '/photos', { token, method: 'POST', f, params: { url: media[0].url, caption: text, published: 'true', no_story: 'false' } });
    id = j.post_id || j.id;
  } else if (media.length > 1) {
    if (media.some(isVideo)) throw new GraphError('Facebook e ek post e onek video/photo+video eksathe deya jay na — ekta video ba shudhu photo din');
    const ids: string[] = [];
    for (const m of media) ids.push((await graph('/' + pageId + '/photos', { token, method: 'POST', f, params: { url: m.url, published: 'false' } })).id);
    // The album is only the container: the visible post is this `/feed` write with every photo attached.
    // Graph expects attached_media as indexed form fields (attached_media[0], attached_media[1], …).
    const attached: Record<string, string> = {};
    ids.forEach((x, i) => { attached['attached_media[' + i + ']'] = JSON.stringify({ media_fbid: x }); });
    id = (await graph('/' + pageId + '/feed', { token, method: 'POST', f, params: { message: text, published: 'true', ...attached } })).id;
  } else {
    if (!text && !link) throw new GraphError('Lekha ba link lagbe');
    id = (await graph('/' + pageId + '/feed', { token, method: 'POST', f, params: { message: text, link, published: 'true' } })).id;
  }
  const p = await graph('/' + id, { token, f, params: { fields: 'permalink_url' } }).catch(() => ({}));
  // Fallback: a post id alone is a valid facebook.com URL (also works for photo/Reel ids).
  return { ext_post_id: id, permalink: p.permalink_url || 'https://www.facebook.com/' + id };
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
export async function publishInstagram(igId: string, pageId: string, input: PublishInput, user: string | string[], f?: Fetch): Promise<PublishResult> {
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
  format: 'photo' | 'video' | 'reel' | 'short' | 'carousel' | 'album' | 'text' | 'link' | 'other';
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

export async function facebookPosts(pageId: string, sinceIso: string, user: string | string[], f?: Fetch, cap = 300): Promise<PostStat[]> {
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

export async function instagramPosts(igId: string, pageId: string, sinceIso: string, user: string | string[], f?: Fetch, cap = 300): Promise<PostStat[]> {
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
export async function followers(network: Network, extId: string, pageId: string, user: string | string[], f?: Fetch): Promise<number | null> {
  const token = await pageToken(pageId, user, f);
  const j = await graph('/' + extId, { token, f, params: { fields: network === 'facebook' ? 'followers_count,fan_count' : 'followers_count' } }).catch(() => null);
  return j ? Number(j.followers_count ?? j.fan_count) || 0 : null;
}

/** Instagram audience (age/gender, city) — only for accounts with 100+ followers. */
export async function igAudience(igId: string, pageId: string, user: string | string[], f?: Fetch) {
  const token = await pageToken(pageId, user, f);
  const one = async (breakdown: string) => {
    const j = await graph('/' + igId + '/insights', { token, f, params: { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown } }).catch(() => null);
    const rows = j?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    return rows.map((r: any) => ({ key: (r.dimension_values ?? []).join(' '), value: Number(r.value) || 0 })) as { key: string; value: number }[];
  };
  return { age_gender: await one('age,gender'), city: (await one('city')).sort((a, b) => b.value - a.value).slice(0, 15) };
}

/** A competitor's public Instagram business/creator account: profile + latest posts. */
export async function igCompetitor(myIgId: string, pageId: string, username: string, user: string | string[], f?: Fetch) {
  const token = await pageToken(pageId, user, f);
  const u = username.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/.*$/, '');
  const j = await graph('/' + myIgId, { token, f, params: { fields: `business_discovery.username(${u}){username,name,followers_count,media_count,profile_picture_url,media.limit(30){caption,like_count,comments_count,timestamp,media_type,media_product_type,permalink,media_url,thumbnail_url}}` } });
  const b = j.business_discovery;
  return {
    username: b.username as string, name: b.name as string, followers: Number(b.followers_count) || 0, media_count: Number(b.media_count) || 0, picture: b.profile_picture_url as string | undefined,
    posts: ((b.media?.data ?? []) as any[]).map((m) => ({ created: m.timestamp, text: String(m.caption || '').slice(0, 400), format: igFormat(m), likes: m.like_count ?? 0, comments: m.comments_count ?? 0, permalink: m.permalink, thumb: m.thumbnail_url || (m.media_type !== 'VIDEO' ? m.media_url : undefined) })),
  };
}
