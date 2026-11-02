import { describe, expect, it } from 'vitest';
// Pinterest module tests live apart from social.test.ts on purpose: pinterest.ts has no
// config/Prisma dependency, so these run even where the Prisma client is unavailable.

describe('Pinterest (mocked)', () => {
  it('profile uses the username as the account id', async () => {
    const { pinProfile } = await import('@/lib/social/pinterest');
    const f = (async (url: string) => {
      expect(String(url)).toContain('/v5/user_account');
      return new Response(JSON.stringify({ username: 'localservicehq', about: 'LocalServiceHQ', follower_count: 42, profile_image: 'https://x/p.jpg' }), { status: 200 });
    }) as typeof fetch;
    const p = await pinProfile('TOKEN', f);
    expect(p).toMatchObject({ id: 'localservicehq', username: 'localservicehq', followers: 42 });
  });
  it('pin create posts board/title/description/link/image_url to /v5/pins', async () => {
    const { publishPinterest } = await import('@/lib/social/pinterest');
    let body: any;
    const f = (async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain('/v5/pins');
      body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ id: '987654321' }), { status: 201 });
    }) as typeof fetch;
    const r = await publishPinterest({ board_id: 'B1' }, { text: 'Concrete cost guide\nFull breakdown here', media: [{ url: 'https://os.example/media/a.jpg', mime: 'image/jpeg' }], link: 'https://localservicehq.com/x' }, {}, 'TOKEN', f);
    expect(body).toMatchObject({ board_id: 'B1', title: 'Concrete cost guide', description: 'Concrete cost guide\nFull breakdown here', link: 'https://localservicehq.com/x', media_source: { source_type: 'image_url', url: 'https://os.example/media/a.jpg' } });
    expect(r).toMatchObject({ ext_post_id: '987654321', permalink: 'https://www.pinterest.com/pin/987654321/' });
  });
  it('pin create refuses a video-only post', async () => {
    const { publishPinterest } = await import('@/lib/social/pinterest');
    const f = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
    await expect(publishPinterest({}, { text: 'x', media: [{ url: 'https://x/v.mp4', mime: 'video/mp4' }] }, {}, 'TOKEN', f)).rejects.toThrow(/chobi lagbe/);
  });
  it('pin create falls back to the account\'s first board when none is chosen', async () => {
    const { publishPinterest } = await import('@/lib/social/pinterest');
    let body: any;
    const f = (async (url: string, init?: RequestInit) => {
      if (String(url).includes('/boards')) return new Response(JSON.stringify({ items: [{ id: 'B9', name: 'First' }, { id: 'B10', name: 'Second' }] }), { status: 200 });
      body = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ id: '555' }), { status: 201 });
    }) as typeof fetch;
    await publishPinterest({}, { text: 'Hello', media: [{ url: 'https://x/a.jpg', mime: 'image/jpeg' }] }, {}, 'TOKEN', f);
    expect(body.board_id).toBe('B9');
  });
});
