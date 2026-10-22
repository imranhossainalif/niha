// "Login with Google / TikTok" for YouTube and TikTok accounts. Tokens are stored encrypted (config.saveSecret),
// never in docs (docs are synced to browsers). getAccess() refreshes an expired access token.
import { cfg, readSecret, saveSecret } from '../config';

export type Provider = 'youtube' | 'tiktok';
export type Tokens = { access_token: string; refresh_token?: string; expires_at: number; scope?: string; open_id?: string };

export const redirectUri = (origin: string, p: Provider) => (process.env.PUBLIC_URL || origin).replace(/\/$/, '') + '/api/social/oauth/' + p + '/callback';
export const SCOPES: Record<Provider, string> = {
  youtube: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
  tiktok: 'user.info.basic,user.info.profile,user.info.stats,video.list,video.upload,video.publish',
};

async function creds(p: Provider) {
  const [id, secret] = p === 'youtube' ? [await cfg('YOUTUBE_CLIENT_ID'), await cfg('YOUTUBE_CLIENT_SECRET')] : [await cfg('TIKTOK_CLIENT_KEY'), await cfg('TIKTOK_CLIENT_SECRET')];
  if (!id || !secret) throw Object.assign(new Error((p === 'youtube' ? 'YouTube (Google) client ID/secret' : 'TikTok client key/secret') + ' Settings e boshano nai'), { status: 400, code: 'not_connected' });
  return { id, secret };
}

export async function authUrl(p: Provider, state: string, origin: string) {
  const { id } = await creds(p);
  const u = new URL(p === 'youtube' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://www.tiktok.com/v2/auth/authorize/');
  const q = p === 'youtube'
    ? { client_id: id, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: SCOPES.youtube, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }
    : { client_key: id, redirect_uri: redirectUri(origin, p), response_type: 'code', scope: SCOPES.tiktok, state };
  for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
  return u.toString();
}

async function tokenCall(p: Provider, body: Record<string, string>, f: typeof fetch = fetch): Promise<Tokens> {
  const { id, secret } = await creds(p);
  const form = new URLSearchParams(p === 'youtube' ? { client_id: id, client_secret: secret, ...body } : { client_key: id, client_secret: secret, ...body });
  const r = await f(p === 'youtube' ? 'https://oauth2.googleapis.com/token' : 'https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(30000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((p === 'youtube' ? 'Google' : 'TikTok') + ': ' + (j.error_description || j.error?.message || j.error || r.status));
  return { access_token: j.access_token, refresh_token: j.refresh_token ?? body.refresh_token, expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000, scope: j.scope, open_id: j.open_id };
}
export const exchangeCode = (p: Provider, code: string, origin: string, f?: typeof fetch) => tokenCall(p, { code, grant_type: 'authorization_code', redirect_uri: redirectUri(origin, p) }, f);

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
