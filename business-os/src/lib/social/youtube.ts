// YouTube Data API v3: channel info, upload (resumable), and the channel's videos with views/likes/comments.
// Note: videos uploaded through an API project that Google has not audited stay PRIVATE (Google's rule since 2020);
// the post result says so, and they can be made public in YouTube Studio until the audit is done.
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { PostStat } from './meta';

const API = 'https://www.googleapis.com/youtube/v3';
type F = typeof fetch;

async function yt(path: string, token: string, f: F = fetch) {
  const r = await f(API + path, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(60000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('YouTube: ' + (j.error?.message || r.status));
  return j;
}

export async function channel(token: string, f?: F) {
  const j = await yt('/channels?part=snippet,statistics,contentDetails&mine=true', token, f);
  const c = j.items?.[0];
  if (!c) throw new Error('Ei Google account e kono YouTube channel nai');
  return { id: c.id as string, name: c.snippet.title as string, username: (c.snippet.customUrl as string | undefined)?.replace(/^@/, ''), picture: c.snippet.thumbnails?.default?.url as string | undefined,
    followers: Number(c.statistics?.subscriberCount) || 0, uploads: c.contentDetails?.relatedPlaylists?.uploads as string | undefined };
}

export type YtOptions = { title?: string; privacy?: 'public' | 'unlisted' | 'private'; kids?: boolean; tags?: string[] };
/** Upload one video file. Title: given, else the first line of the text (max 100). */
export async function publishYouTube(file: { path: string; size: number; mime: string }, text: string, o: YtOptions, token: string, f: F = fetch) {
  const title = (o.title || text.split('\n').find((l) => l.trim()) || 'Video').trim().slice(0, 100);
  const meta = { snippet: { title, description: text.slice(0, 5000), tags: o.tags?.slice(0, 30), categoryId: '26' }, status: { privacyStatus: o.privacy || 'public', selfDeclaredMadeForKids: !!o.kids } };
  const init = await f('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-length': String(file.size), 'x-upload-content-type': file.mime },
    body: JSON.stringify(meta), signal: AbortSignal.timeout(60000),
  });
  if (!init.ok) { const j: any = await init.json().catch(() => ({})); throw new Error('YouTube: ' + (j.error?.message || init.status)); }
  const loc = init.headers.get('location');
  if (!loc) throw new Error('YouTube upload shuru hoyni');
  const up = await f(loc, { method: 'PUT', headers: { 'content-type': file.mime, 'content-length': String(file.size) }, body: Readable.toWeb(createReadStream(file.path)) as ReadableStream, duplex: 'half', signal: AbortSignal.timeout(30 * 60e3) } as RequestInit);
  const v: any = await up.json().catch(() => ({}));
  if (!up.ok || !v.id) throw new Error('YouTube: ' + (v.error?.message || up.status));
  return { ext_post_id: v.id as string, permalink: 'https://youtu.be/' + v.id, note: v.status?.privacyStatus === 'private' && (o.privacy || 'public') !== 'private' ? 'YouTube video ta private ache (Google audit er age API upload private thake) — Studio theke Public korun' : undefined };
}

const seconds = (iso: string) => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || ''); return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0; };

export async function youtubePosts(accountId: string, uploads: string, sinceIso: string, token: string, f?: F, cap = 200): Promise<PostStat[]> {
  const ids: string[] = [];
  let page = '';
  do {
    const j = await yt(`/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${page ? '&pageToken=' + page : ''}`, token, f);
    for (const it of j.items ?? []) if ((it.contentDetails?.videoPublishedAt || '') >= sinceIso) ids.push(it.contentDetails.videoId);
    page = j.nextPageToken && ids.length < cap && (j.items ?? []).every((it: any) => (it.contentDetails?.videoPublishedAt || '') >= sinceIso) ? j.nextPageToken : '';
  } while (page);
  const out: PostStat[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt('/videos?part=snippet,statistics,contentDetails&id=' + ids.slice(i, i + 50).join(','), token, f);
    for (const v of j.items ?? []) out.push({ network: 'youtube', account_id: accountId, ext_id: v.id, created: v.snippet.publishedAt, text: (v.snippet.title + '\n' + (v.snippet.description || '')).slice(0, 500),
      permalink: 'https://youtu.be/' + v.id, thumb: v.snippet.thumbnails?.medium?.url, format: seconds(v.contentDetails?.duration) <= 180 ? 'short' : 'video',
      metrics: { views: Number(v.statistics?.viewCount) || 0, reactions: Number(v.statistics?.likeCount) || 0, comments: Number(v.statistics?.commentCount) || 0, shares: 0 } });
  }
  return out;
}
