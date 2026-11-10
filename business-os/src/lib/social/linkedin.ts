// LinkedIn: member profile (OpenID Connect userinfo) and posts on the member's own profile via the
// Posts API (rest/posts): text, link, one image, several images (multi-image post) or one video.
// Images and videos use LinkedIn's own upload flow (initializeUpload → PUT bytes → post with the
// returned urn). The app carries "Sign In with LinkedIn using OpenID Connect" (openid, profile) and
// "Share on LinkedIn" (w_member_social) only, which is enough for media on the PERSONAL profile —
// company pages need the Community Management API approval. Member access tokens last ~60 days and
// this product tier gives NO refresh token: when one expires, oauth.getAccess fails with "abar
// connect korun" and the owner reconnects with one click (same pattern as the Meta user token).
// A post that has media never falls back to text only: if the upload fails the target fails, so
// nobody believes a picture went out when it did not.
import { open } from 'node:fs/promises';
import type { PublishInput, PublishResult } from './meta';

const API = 'https://api.linkedin.com';
// LinkedIn versions are YYYYMM, supported for a minimum of one year: 202410 (Oct 2024)
// was retired, so publishing failed with "Requested version 20241001 is not active".
// 202610 is the latest documented version (Oct 2026, learn.microsoft.com LinkedIn
// versioning page, checked 2026-11-09) — bump again before Oct 2027.
const VERSION = '202610';
type F = typeof fetch;
/** A media file that is also on our disk (preferred over downloading it back from our own URL). */
export type LocalFile = { path: string; mime: string; size?: number };

const friendly = (msg: string) => /duplicate/i.test(msg) ? 'LinkedIn ei lekha ta age post hoyeche bole nilo na (identical post allow kore na) — lekha ektu bodle abar chesta korun'
  : /version.*not active/i.test(msg) ? 'LinkedIn API version purono hoye geche — developer ke jananor dorkar' : msg;

async function li(path: string, token: string, opts: { method?: 'GET' | 'POST'; body?: unknown; f?: F } = {}) {
  const rest = path.startsWith('/rest/');
  const r = await (opts.f ?? fetch)(API + path, { method: opts.method ?? 'GET', headers: { Authorization: 'Bearer ' + token, ...(rest || opts.method === 'POST' ? { 'Linkedin-Version': VERSION, 'X-Restli-Protocol-Version': '2.0.0' } : {}), ...(opts.method === 'POST' ? { 'content-type': 'application/json' } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: AbortSignal.timeout(60000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('LinkedIn: ' + friendly(String(j.message || j.error_description || j.error || r.status)));
  return { j, id: r.headers.get('x-restli-id') || undefined };
}

/** The connected member: the OIDC `sub` is the identity (it becomes the post author URN). */
export async function liProfile(token: string, f?: F) {
  const { j } = await li('/v2/userinfo', token, { f });
  if (!j.sub) throw new Error('LinkedIn account pawa jayni');
  return { id: String(j.sub) as string, name: String(j.name || 'LinkedIn member') as string, username: undefined as string | undefined, picture: (j.picture as string | undefined) || undefined, followers: 0 };
}

/** The bytes of a slice of a media item: from our disk when we have it, else downloaded from its URL. */
async function bytes(m: { url: string; mime: string }, file: LocalFile | undefined, f: F | undefined, from = 0, to?: number): Promise<Buffer> {
  if (file) {
    const h = await open(file.path, 'r');
    try {
      const size = (await h.stat()).size, end = Math.min(to ?? size, size);
      const buf = Buffer.alloc(Math.max(0, end - from));
      await h.read(buf, 0, buf.length, from);
      return buf;
    } finally { await h.close(); }
  }
  const r = await (f ?? fetch)(m.url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('LinkedIn: media file ta pawa gelo na (' + r.status + ')');
  const all = Buffer.from(await r.arrayBuffer());
  return all.subarray(from, to ?? all.length);
}
const sizeOf = async (m: { url: string; mime: string }, file: LocalFile | undefined, f: F | undefined) => file ? (file.size ?? (await (await open(file.path, 'r')).stat()).size) : (await bytes(m, undefined, f)).length;

async function putBytes(url: string, body: Buffer, token: string, f: F | undefined, contentType = 'application/octet-stream') {
  const r = await (f ?? fetch)(url, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'content-type': contentType }, body: new Uint8Array(body), signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error('LinkedIn: media upload hoyni (' + r.status + ')');
  return r.headers.get('etag') || '';
}

/** Upload one image and return its urn. */
async function uploadImage(owner: string, m: { url: string; mime: string }, file: LocalFile | undefined, token: string, f?: F): Promise<string> {
  const { j } = await li('/rest/images?action=initializeUpload', token, { method: 'POST', f, body: { initializeUploadRequest: { owner } } });
  const up = j.value?.uploadUrl as string | undefined, urn = j.value?.image as string | undefined;
  if (!up || !urn) throw new Error('LinkedIn: chobi upload shuru kora gelo na');
  await putBytes(up, await bytes(m, file, f), token, f, m.mime);
  return urn;
}

/** Upload one video in 4 MB parts, finalize it, and wait (a little) until LinkedIn has processed it. */
async function uploadVideo(owner: string, m: { url: string; mime: string }, file: LocalFile | undefined, token: string, f?: F): Promise<string> {
  const total = await sizeOf(m, file, f);
  const { j } = await li('/rest/videos?action=initializeUpload', token, { method: 'POST', f, body: { initializeUploadRequest: { owner, fileSizeBytes: total, uploadCaptions: false, uploadThumbnail: false } } });
  const urn = j.value?.video as string | undefined, parts = (j.value?.uploadInstructions ?? []) as { firstByte: number; lastByte: number; uploadUrl: string }[];
  if (!urn || !parts.length) throw new Error('LinkedIn: video upload shuru kora gelo na');
  const etags: string[] = [];
  for (const p of parts) etags.push((await putBytes(p.uploadUrl, await bytes(m, file, f, p.firstByte, p.lastByte + 1), token, f)).replace(/"/g, ''));
  await li('/rest/videos?action=finalizeUpload', token, { method: 'POST', f, body: { finalizeUploadRequest: { video: urn, uploadToken: j.value?.uploadToken || '', uploadedPartIds: etags } } });
  for (let i = 0; i < 36; i++) { // up to ~3 min; a post that references a video still processing is refused
    const st = (await li('/rest/videos/' + encodeURIComponent(urn), token, { f }).catch(() => ({ j: {} as any }))).j.status;
    if (st === 'AVAILABLE') return urn;
    if (st === 'PROCESSING_FAILED') throw new Error('LinkedIn video process korte parlo na — onno format/size e chesta korun');
    await new Promise((r) => setTimeout(r, f ? 0 : 5000));
  }
  throw new Error('LinkedIn video process hote onek deri hocche — kichukkhon por retry korun');
}

/**
 * Publish one post on the member's profile. A link goes at the end of the text (LinkedIn renders
 * it as a link preview). Media: one image, 2–20 images, or one video (not mixed). `files` are the
 * same media on our disk, in the same order as input.media.
 */
export async function publishLinkedIn(account: { ext_id: string }, input: PublishInput, token: string, f?: F, files: (LocalFile | undefined)[] = []): Promise<PublishResult> {
  let text = (input.text || '').trim();
  if (input.link && !text.includes(input.link)) text = (text ? text + '\n\n' : '') + input.link;
  const media = input.media || [];
  if (!text && !media.length) throw new Error('LinkedIn e kichu lekha ba chobi/video lagbe');
  if (text.length > 3000) throw new Error('LinkedIn e lekha 3000 okkhorer beshi hoye geche');
  const owner = 'urn:li:person:' + account.ext_id;
  const videos = media.filter((m) => m.mime.startsWith('video/'));
  if (videos.length && (videos.length !== 1 || media.length !== 1)) throw new Error('LinkedIn e ek post e ekta video, ba shudhu chobi (1–20 ta) deya jay — video ar chobi mishano jay na');
  if (media.length > 20) throw new Error('LinkedIn e ek post e 20 tar beshi chobi hoy na');
  let content: Record<string, unknown> | undefined;
  if (videos.length) content = { media: { id: await uploadVideo(owner, media[0], files[0], token, f) } };
  else if (media.length === 1) content = { media: { id: await uploadImage(owner, media[0], files[0], token, f) } };
  else if (media.length > 1) { const ids: string[] = []; for (let i = 0; i < media.length; i++) ids.push(await uploadImage(owner, media[i], files[i], token, f)); content = { multiImage: { images: ids.map((id) => ({ id })) } }; }
  const { j, id } = await li('/rest/posts', token, { method: 'POST', f, body: {
    author: owner,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(content ? { content } : {}),
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  } });
  const postId = id || (j.id as string | undefined);
  if (!postId) throw new Error('LinkedIn post toiri hoyni');
  return { ext_post_id: String(postId), permalink: 'https://www.linkedin.com/feed/update/' + postId + '/' };
}
