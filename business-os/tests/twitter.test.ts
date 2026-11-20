import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Fetch } from '@/lib/social/meta';
import { authUrl, exchangeCode, pkceVerifier } from '@/lib/social/oauth';
import { publishTwitter, tweetLength, twitterProfile } from '@/lib/social/twitter';

const CID = 'x-client-id', CSECRET = 'x-client-secret';
beforeAll(() => { process.env.TWITTER_CLIENT_ID = CID; process.env.TWITTER_CLIENT_SECRET = CSECRET; });
afterAll(() => { delete process.env.TWITTER_CLIENT_ID; delete process.env.TWITTER_CLIENT_SECRET; });

const capture = (answer: unknown) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(answer), { status: 200 });
  }) as Fetch;
  return { f, calls };
};

describe('X (Twitter) OAuth 2.0', () => {
  it('authorize URL uses PKCE (S256) and the tweet/write scopes', async () => {
    const verifier = pkceVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const u = new URL(await authUrl('twitter', 'state123', 'https://os.example', verifier));
    expect(u.origin + u.pathname).toBe('https://twitter.com/i/oauth2/authorize');
    expect(u.searchParams.get('client_id')).toBe(CID);
    expect(u.searchParams.get('redirect_uri')).toBe('https://os.example/api/social/oauth/twitter/callback');
    expect(u.searchParams.get('state')).toBe('state123');
    expect(u.searchParams.get('scope')).toContain('tweet.write');
    expect(u.searchParams.get('scope')).toContain('offline.access');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('code_challenge')).toHaveLength(43);
    expect(u.searchParams.get('code_challenge')).not.toBe(verifier); // sha256(verifier), never the verifier
  });

  it('refuses to build the URL without a PKCE verifier', async () => {
    await expect(authUrl('twitter', 'state', 'https://os.example')).rejects.toThrow(/PKCE verifier/);
  });

  it('code exchange sends Basic client auth + the PKCE verifier and keeps the refresh token', async () => {
    const { f, calls } = capture({ access_token: 'AT', refresh_token: 'RT', expires_in: 7200, scope: 'tweet.read tweet.write' });
    const t = await exchangeCode('twitter', 'CODE', 'https://os.example', 'VERIFIER', f);
    expect(t).toMatchObject({ access_token: 'AT', refresh_token: 'RT', scope: 'tweet.read tweet.write' });
    expect(t.expires_at).toBeGreaterThan(Date.now() + 60 * 60e3);
    const c = calls[0];
    expect(c.url).toBe('https://api.twitter.com/2/oauth2/token');
    expect((c.init?.headers as Record<string, string>).Authorization).toBe('Basic ' + Buffer.from(CID + ':' + CSECRET).toString('base64'));
    const body = new URLSearchParams(String(c.init?.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE');
    expect(body.get('code_verifier')).toBe('VERIFIER');
    expect(body.get('redirect_uri')).toBe('https://os.example/api/social/oauth/twitter/callback');
  });
});

describe('X (Twitter) profile + posting', () => {
  it('reads the profile and cleans the avatar URL', async () => {
    const { f } = capture({ data: { id: '42', name: 'Imran', username: 'imranhossainalif', profile_image_url: 'https://pbs/x_normal.jpg', public_metrics: { followers_count: 1234 } } });
    await expect(twitterProfile('AT', f)).resolves.toEqual({ id: '42', name: 'Imran', username: 'imranhossainalif', picture: 'https://pbs/x.jpg', followers: 1234 });
  });

  it('posts the text and returns the tweet permalink', async () => {
    const { f, calls } = capture({ data: { id: '99' } });
    const r = await publishTwitter('AT', '  Hello X  ', 'imranhossainalif', f);
    expect(r).toEqual({ ext_post_id: '99', permalink: 'https://x.com/imranhossainalif/status/99' });
    expect(calls[0].url).toBe('https://api.twitter.com/2/tweets');
    expect(calls[0].init?.method).toBe('POST');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer AT');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: 'Hello X' });
  });

  it('rejects empty text and anything over 280 characters before calling X', async () => {
    const { f, calls } = capture({ data: { id: '1' } });
    await expect(publishTwitter('AT', '   ', 'u', f)).rejects.toThrow(/lekha lagbe/);
    expect(tweetLength('a'.repeat(281))).toBe(281);
    await expect(publishTwitter('AT', 'a'.repeat(281), 'u', f)).rejects.toThrow(/280/);
    expect(calls).toHaveLength(0);
  });

  it('surfaces the X API error message', async () => {
    const f = (async () => new Response(JSON.stringify({ title: 'Unauthorized', detail: 'Unauthorized' }), { status: 401 })) as Fetch;
    await expect(publishTwitter('AT', 'hi', 'u', f)).rejects.toThrow(/Unauthorized/);
  });
});
