// X (Twitter) through the API v2 with an OAuth 2.0 user token (PKCE login handled in lib/social/oauth).
// Text posts only for now: media upload needs X's separate media endpoint and a paid API tier; the composer
// refuses media for X instead of silently dropping it.
import type { Fetch } from './meta';

const API = 'https://api.twitter.com/2';
const timeout = () => AbortSignal.timeout(30000);

type XProfile = { id: string; name: string; username: string; picture?: string; followers: number };

async function json(r: Response, what: string): Promise<any> {
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.errors || j.title) throw new Error('X (' + what + '): ' + (j.detail || j.title || j.errors?.[0]?.message || ('HTTP ' + r.status)));
  return j;
}

/** The connected X account's profile (also the token check used by the sync job). */
export async function twitterProfile(token: string, f: Fetch = fetch): Promise<XProfile> {
  const r = await f(API + '/users/me?user.fields=profile_image_url,public_metrics', { headers: { Authorization: 'Bearer ' + token }, signal: timeout() });
  const j = await json(r, 'profile');
  const d = j.data ?? {};
  return {
    id: String(d.id ?? ''),
    name: String(d.name ?? ''),
    username: String(d.username ?? ''),
    picture: d.profile_image_url ? String(d.profile_image_url).replace('_normal', '') : undefined,
    followers: Number(d.public_metrics?.followers_count) || 0,
  };
}

/** X counts characters (URLs count as 23); this simple count matches the composer's limit for normal text. */
export const tweetLength = (text: string) => [...text].length;

/** Post one text tweet. `username` only shapes the returned permalink. */
export async function publishTwitter(token: string, text: string, username?: string, f: Fetch = fetch): Promise<{ ext_post_id: string; permalink: string }> {
  const body = text.trim();
  if (!body) throw new Error('X e post korte lekha lagbe');
  if (tweetLength(body) > 280) throw new Error('X e 280 okkhorer beshi jay na (' + tweetLength(body) + ') — chhoto korun');
  const r = await f(API + '/tweets', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ text: body }),
    signal: timeout(),
  });
  const j = await json(r, 'post');
  const id = String(j.data?.id ?? '');
  if (!id) throw new Error('X: post id pawa jayni');
  return { ext_post_id: id, permalink: 'https://x.com/' + (username ? encodeURIComponent(username) : 'i') + '/status/' + id };
}
