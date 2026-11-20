// "Login with Google / TikTok / Facebook / Pinterest / LinkedIn / X" for YouTube, TikTok, Meta (Facebook + Instagram),
// Pinterest, LinkedIn and X (Twitter) accounts.
// Tokens are stored encrypted (config.saveSecret), never in docs (docs are synced to browsers).
// getAccess() refreshes an expired access token (YouTube/TikTok/Pinterest); the Meta token is shared, see meta.ts.
// LinkedIn member tokens (~60 days) come with no refresh token at this product tier, so an expired one
// fails getAccess with "abar connect korun" and the owner reconnects with one click.
import { createHash, randomBytes } from 'node:crypto';
import { cfg, readSecret, saveSecret, type ConfigKey } from '../config';
import { META_SCOPES, metaAuthUrl, metaExchangeCode } from './meta';

export type Provider = 'youtube' | 'tiktok' | 'meta' | 'pinterest' | 'linkedin' | 'twitter';
/** PKCE verifier for the X (Twitter) OAuth 2.0 flow; the challenge goes to X, the verifier stays in the state cookie. */
export const pkceVerifier = () => randomBytes(32).toString('base64url');
const pkceChallenge = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');
export type Tokens = { access_token: string; refresh_token?: string; expires_at: number; scope?: string; open_id?: string };

export const redirectUri = (origin: string, p: Provider) => (process.env.PUBLIC_URL || origin).replace(/\/$/, '') + '/api/social/oauth/' + p + '/callback';
export const SCOPES: Record<Provider, string> = {
  youtube: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
  tiktok: 'user.info.basic,user.info.profile,user.info.stats,video.list,video.upload,video.publish',
  meta: META_SCOPES.join(','),
  pinterest: 'boards:read,boards:write,pins:read,pins:write,user_accounts:read',
  linkedin: 'openid profile w_member_social',
  twitter: 'tweet.read tweet.write users.read offline.access',
};

const CRED: Record<Provider, [ConfigKey, ConfigKey, string]> = {
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YouTube (Google) client ID/secret'],
  tiktok: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TikTok client key/secret'],
  meta: ['META_APP_ID', 'META_APP_SECRET', 'Meta App ID/secret'],
  pinterest: ['PINTEREST_APP_ID', 'PINTEREST_APP_SECRET', 'Pinterest App ID/secret'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LinkedIn client ID/secret'],
  twitter: ['TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET', 'X (Twitter) client ID/secret'],
};

async function creds(p: Provider) {
  const [keyId, keySecret, label] = CRED[p];
  const id = await cfg(keyId), secret = await cfg(keySecret);
  if (!id || !secret) throw Object.assign(new Error(label + ' Settings e boshano nai'), { status: 400, code: 'not_connected' });
  return { id, secret };
}

/** `verifier` is required for X (Twitter): its OAuth 2.0 flow uses PKCE. */
export async function authUrl(p: Provider, state: string, origin: string, verifier?: string) {
  const { id } = await creds(p);
  if (p === 'meta') return metaAuthUrl(id, redirectUri(origin, p), state);
  if (p === 'twitter') {
    if (!verifier) throw Object.assign(new Error('X login er PKCE verifier nai — abar Connect chapun'), { status: 400, code: 'bad_request' });
    const u = new URL('https://twitter.com/i/oauth2/authorize');
    for (const [k, v] of Object.entries({ response_type: 'code', client_id: id, redirect_uri: redirectUri(origin, p), scope: SCOPES.twitter, state, code_challenge: pkceChallenge(verifier), code_challenge_method: 'S256' })) u.searchParams.set(k, v);
    return u.toString();
  }
  if (p === 'pinterest') {
    const u = new URL('https://www.pinterest.com/oauth/');
    for (const [k, v] of Object.entries({ client_id: id, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: SCOPES.pinterest, state })) u.searchParams.set(k, v);
    return u.toString();
  }
  if (p === 'linkedin') {
    const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
    for (const [k, v] of Object.entries({ client_id: id, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: SCOPES.linkedin, state })) u.searchParams.set(k, v);
    return u.toString();
  }
  const u = new URL(p === 'youtube' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://www.tiktok.com/v2/auth/authorize/');
  const q = p === 'youtube'
    ? { client_id: id, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: SCOPES.youtube, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }
    : { client_key: id, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: SCOPES.tiktok, state };
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}

async function tokenCall(p: Provider, body: Record<string, string>, f: typeof fetch = fetch): Promise<Tokens> {
  const { id, secret } = await creds(p);
  if (p === 'twitter') {
    // X OAuth 2.0: confidential client → HTTP Basic auth for the client; the code exchange also carries
    // the PKCE code_verifier (already in `body`). Refresh uses grant_type=refresh_token.
    const r = await f('https://api.twitter.com/2/oauth2/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64') }, body: new URLSearchParams(body), signal: AbortSignal.timeout(30000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('X: ' + (j.error_description || j.error || r.status));
    return { access_token: j.access_token, refresh_token: j.refresh_token ?? body.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 7200) * 1000, scope: j.scope };
  }
  if (p === 'pinterest') {
    // Pinterest's token endpoint takes the app credentials as HTTP Basic auth, not in the form body.
    const r = await f('https://api.pinterest.com/v5/oauth/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64') }, body: new URLSearchParams(body), signal: AbortSignal.timeout(30000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Pinterest: ' + (j.error_description || j.message || j.error || r.status));
    return { access_token: j.access_token, refresh_token: j.refresh_token ?? body.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 2592000) * 1000, scope: j.scope };
  }
  if (p === 'linkedin') {
    // LinkedIn's token endpoint takes client_id + client_secret in the form body; member tokens
    // last ~60 days and this tier returns no refresh token (reconnect when expired).
    const r = await f('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: secret, ...body }), signal: AbortSignal.timeout(30000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('LinkedIn: ' + (j.error_description || j.error || r.status));
    return { access_token: j.access_token, refresh_token: j.refresh_token ?? body.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 5184000) * 1000, scope: j.scope };
  }
  const form = new URLSearchParams(p === 'youtube' ? { client_id: id, client_secret: secret, ...body } : { client_key: id, client_secret: secret, ...body });
  const r = await f(p === 'youtube' ? 'https://oauth2.googleapis.com/token' : 'https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(30000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((p === 'youtube' ? 'Google' : 'TikTok') + ': ' + (j.error_description || j.error?.message || j.error || r.status));
  return { access_token: j.access_token, refresh_token: j.refresh_token ?? body.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000, scope: j.scope, open_id: j.open_id };
}
export const exchangeCode = async (p: Provider, code: string, origin: string, verifier?: string, f?: typeof fetch): Promise<Tokens> => {
  if (p === 'meta') { const { id, secret } = await creds(p); const t = await metaExchangeCode(id, secret, code, redirectUri(origin, p), f); return { access_token: t.access_token, expires_at: t.expires_at, scope: SCOPES.meta }; }
  return tokenCall(p, { code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin, p), ...(p === 'twitter' ? { code_verifier: verifier || '' } : {}) }, f);
};

/** Valid access token for a connected account (doc id), refreshed when it is about to expire. */
export async function getAccess(p: Provider, accountId: string, f?: typeof fetch): Promise<string> {
  const t = await readSecret<Tokens>('oauth:' + accountId);
  if (!t) throw new Error('Login token nai — Accounts e abar connect korun');
  if (t.expires_at - Date.now() > 120e3) return t.access_token;
  if (!t.refresh_token) throw new Error('Login er meyad shesh — Accounts e abar connect korun');
  const n = await tokenCall(p, { grant_type: 'refresh_token', refresh_token: t.refresh_token }, f);
  await saveSecret('oauth:' + accountId, { ...t, ...n });
  return n.access_token;
}
