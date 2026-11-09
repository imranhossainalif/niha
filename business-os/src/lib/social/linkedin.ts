// LinkedIn: member profile (OpenID Connect userinfo) and text posts on the member's own profile
// via the Posts API (rest/posts). The app carries "Sign In with LinkedIn using OpenID Connect"
// (openid, profile) and "Share on LinkedIn" (w_member_social) only, so v1 is TEXT posts on the
// personal profile — no company pages (needs the Community Management API approval), no image
// posts (needs the separate media-upload flow). Member access tokens last ~60 days and this
// product tier gives NO refresh token: when one expires, oauth.getAccess fails with "abar
// connect korun" and the owner reconnects with one click (same pattern as the Meta user token).
import type { PublishInput, PublishResult } from './meta';

const API = 'https://api.linkedin.com';
// LinkedIn versions are YYYYMM, supported for a minimum of one year: 202410 (Oct 2024)
// was retired, so publishing failed with "Requested version 20241001 is not active".
// 202610 is the latest documented version (Oct 2026, learn.microsoft.com LinkedIn
// versioning page, checked 2026-11-09) — bump again before Oct 2027.
const VERSION = '202610';
type F = typeof fetch;

async function li(path: string, token: string, opts: { method?: 'GET' | 'POST'; body?: unknown; f?: F } = {}) {
  const rest = opts.method === 'POST';
  const r = await (opts.f ?? fetch)(API + path, { method: opts.method ?? 'GET', headers: { Authorization: 'Bearer ' + token, ...(rest ? { 'content-type': 'application/json', 'Linkedin-Version': VERSION, 'X-Restli-Protocol-Version': '2.0.0' } : {}) }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body), signal: AbortSignal.timeout(60000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('LinkedIn: ' + (j.message || j.error_description || j.error || r.status));
  return { j, id: r.headers.get('x-restli-id') || undefined };
}

/** The connected member: the OIDC `sub` is the identity (it becomes the post author URN). */
export async function liProfile(token: string, f?: F) {
  const { j } = await li('/v2/userinfo', token, { f });
  if (!j.sub) throw new Error('LinkedIn account pawa jayni');
  return { id: String(j.sub) as string, name: String(j.name || 'LinkedIn member') as string, username: undefined as string | undefined, picture: (j.picture as string | undefined) || undefined, followers: 0 };
}

/**
 * Publish one text post on the member's profile. A link goes at the end of the text (LinkedIn
 * renders it as a link preview) because the article-content form needs the page's title/image
 * fetched separately. Media is ignored in v1 — LinkedIn text post only.
 */
export async function publishLinkedIn(account: { ext_id: string }, input: PublishInput, token: string, f?: F): Promise<PublishResult> {
  let text = (input.text || '').trim();
  if (input.link && !text.includes(input.link)) text = (text ? text + '\n\n' : '') + input.link;
  if (!text) throw new Error('LinkedIn e kichu lekha lagbe (shudhu chobi/video ekhane jabe na)');
  if (text.length > 3000) throw new Error('LinkedIn e lekha 3000 okkhorer beshi hoye geche');
  const { j, id } = await li('/rest/posts', token, { method: 'POST', f, body: {
    author: 'urn:li:person:' + account.ext_id,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  } });
  const postId = id || (j.id as string | undefined);
  if (!postId) throw new Error('LinkedIn post toiri hoyni');
  return { ext_post_id: String(postId), permalink: 'https://www.linkedin.com/feed/update/' + postId + '/' };
}
