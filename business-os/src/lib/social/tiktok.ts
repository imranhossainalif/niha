// TikTok Content Posting + Display API (v2): profile, video upload (direct post, or a draft in the TikTok app inbox),
// and the account's videos with views/likes/comments/shares.
// TikTok's rule: until the app passes TikTok's audit, direct posts can only be "Only me" (private). Inbox drafts work
// without that — the post appears as a notification in the TikTok app and is finished there.
import { open } from 'node:fs/promises';
import type { PostStat } from './meta';

const API = 'https://open.tiktokapis.com/v2';
type F = typeof fetch;

async function tt(path: string, token: string, body?: unknown, f: F = fetch) {
  const r = await f(API + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json; charset=UTF-8' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || (j.error && j.error.code && j.error.code !== 'ok')) throw new Error('TikTok: ' + (j.error?.message || j.error?.code || r.status));
  return j.data ?? {};
}

export async function profile(token: string, f?: F) {
  const d = await tt('/user/info/?fields=open_id,avatar_url,display_name,username,follower_count,video_count', token, undefined, f);
  const u = d.user ?? {};
  return { id: u.open_id as string, name: (u.display_name || u.username) as string, username: u.username as string | undefined, picture: u.avatar_url as string | undefined, followers: Number(u.follower_count) || 0 };
}

/** Chunks as TikTok wants them: 5–64 MB each, the last one takes the remainder; one chunk under 5 MB. */
export function chunks(size: number, chunk = 10 * 1024 * 1024) {
  if (size <= chunk) return { chunk_size: size, total_chunk_count: 1 };
  return { chunk_size: chunk, total_chunk_count: Math.floor(size / chunk) };
}

export type TtOptions = { mode?: 'direct' | 'inbox'; privacy?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY' };
export async function publishTikTok(file: { path: string; size: number; mime: string }, text: string, o: TtOptions, token: string, f: F = fetch) {
  const c = chunks(file.size);
  const source_info = { source: 'FILE_UPLOAD', video_size: file.size, ...c };
  let privacy = o.privacy || 'PUBLIC_TO_EVERYONE';
  if (o.mode === 'direct') {
    const info = await tt('/post/publish/creator_info/query/', token, {}, f);
    const opts: string[] = info.privacy_level_options ?? [];
    if (opts.length && !opts.includes(privacy)) privacy = opts.includes('SELF_ONLY') ? 'SELF_ONLY' : (opts[0] as typeof privacy);
  }
  const init = o.mode === 'direct'
    ? await tt('/post/publish/video/init/', token, { post_info: { title: text.slice(0, 2200), privacy_level: privacy, disable_duet: false, disable_comment: false, disable_stitch: false }, source_info }, f)
    : await tt('/post/publish/inbox/video/init/', token, { source_info }, f);
  const fh = await open(file.path, 'r');
  try {
    for (let i = 0; i < c.total_chunk_count; i++) {
      const start = i * c.chunk_size, end = i === c.total_chunk_count - 1 ? file.size - 1 : start + c.chunk_size - 1;
      const buf = Buffer.alloc(end - start + 1);
      await fh.read(buf, 0, buf.length, start);
      const r = await f(init.upload_url, { method: 'PUT', headers: { 'content-type': file.mime, 'content-length': String(buf.length), 'content-range': `bytes ${start}-${end}/${file.size}` }, body: buf, signal: AbortSignal.timeout(10 * 60e3) });
      if (!r.ok && r.status !== 201 && r.status !== 206) throw new Error('TikTok upload ' + r.status);
    }
  } finally { await fh.close(); }
  // wait for TikTok to take it (a few seconds to a few minutes)
  let st: any = {};
  for (let i = 0; i < 60; i++) {
    st = await tt('/post/publish/status/fetch/', token, { publish_id: init.publish_id }, f);
    if (['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX', 'FAILED'].includes(st.status)) break;
    await new Promise((r) => setTimeout(r, f === fetch ? 5000 : 0));
  }
  if (st.status === 'FAILED') throw new Error('TikTok: ' + (st.fail_reason || 'post hoyni'));
  const postId = st.publicaly_available_post_id?.[0];
  return { ext_post_id: postId ? String(postId) : String(init.publish_id), permalink: undefined,
    note: st.status === 'SEND_TO_USER_INBOX' || o.mode !== 'direct' ? 'TikTok app e notification eseche — okhane giye post shesh korun' : privacy === 'SELF_ONLY' ? 'TikTok e "Only me" hoye post hoyeche (TikTok audit er age eta-i niyom)' : undefined };
}

export async function tiktokPosts(accountId: string, sinceIso: string, token: string, f?: F, cap = 200): Promise<PostStat[]> {
  const out: PostStat[] = [];
  let cursor: number | undefined;
  for (;;) {
    const d = await tt('/video/list/?fields=id,create_time,cover_image_url,share_url,video_description,duration,title,like_count,comment_count,share_count,view_count', token, { max_count: 20, ...(cursor ? { cursor } : {}) }, f);
    for (const v of d.videos ?? []) {
      const created = new Date(Number(v.create_time) * 1000).toISOString();
      if (created < sinceIso) return out;
      out.push({ network: 'tiktok', account_id: accountId, ext_id: String(v.id), created, text: String(v.video_description || v.title || '').slice(0, 500), permalink: v.share_url, thumb: v.cover_image_url, format: 'video',
        metrics: { views: Number(v.view_count) || 0, reactions: Number(v.like_count) || 0, comments: Number(v.comment_count) || 0, shares: Number(v.share_count) || 0 } });
    }
    if (!d.has_more || out.length >= cap) return out;
    cursor = d.cursor;
  }
}
