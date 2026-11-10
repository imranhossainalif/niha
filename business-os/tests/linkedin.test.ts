import { describe, expect, it } from 'vitest';
// LinkedIn module tests live apart from social.test.ts on purpose: linkedin.ts has no
// config/Prisma dependency, so these run even where the Prisma client is unavailable.

describe('LinkedIn (mocked)', () => {
  it('profile uses the OIDC sub as the account id', async () => {
    const { liProfile } = await import('@/lib/social/linkedin');
    const f = (async (url: string) => {
      expect(String(url)).toContain('/v2/userinfo');
      return new Response(JSON.stringify({ sub: 'abc123', name: 'Imran Hossain Alif', picture: 'https://x/p.jpg' }), { status: 200 });
    }) as typeof fetch;
    const p = await liProfile('TOKEN', f);
    expect(p).toMatchObject({ id: 'abc123', name: 'Imran Hossain Alif', picture: 'https://x/p.jpg' });
  });
  it('post create sends a public text post to /rest/posts and takes the id from the header', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    let body: any; let headers: any;
    const f = (async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('/rest/posts');
      body = JSON.parse(String(init!.body));
      headers = init!.headers;
      return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:7234567890' } });
    }) as typeof fetch;
    const r = await publishLinkedIn({ ext_id: 'abc123' }, { text: 'Hello LinkedIn', media: [] }, 'TOKEN', f);
    expect(body).toMatchObject({ author: 'urn:li:person:abc123', commentary: 'Hello LinkedIn', visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED' }, lifecycleState: 'PUBLISHED' });
    expect(headers['Linkedin-Version']).toBeTruthy();
    expect(r).toMatchObject({ ext_post_id: 'urn:li:share:7234567890', permalink: 'https://www.linkedin.com/feed/update/urn:li:share:7234567890/' });
  });
  it('a link is appended to the text when the post has one', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    let body: any;
    const f = (async (url: string, init?: RequestInit) => {
      body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ id: 'urn:li:share:1' }), { status: 201 });
    }) as typeof fetch;
    const r = await publishLinkedIn({ ext_id: 'abc123' }, { text: 'New guide', media: [], link: 'https://localrevenueflow.com/x' }, 'TOKEN', f);
    expect(body.commentary).toBe('New guide\n\nhttps://localrevenueflow.com/x');
    expect(r.ext_post_id).toBe('urn:li:share:1');
  });
  it('post create refuses an empty post', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const f = (async () => new Response(JSON.stringify({}), { status: 201 })) as typeof fetch;
    await expect(publishLinkedIn({ ext_id: 'abc123' }, { text: '  ', media: [{ url: 'https://x/a.jpg', mime: 'image/jpeg' }] }, 'TOKEN', f)).rejects.toThrow(/lekha lagbe/);
  });
});

