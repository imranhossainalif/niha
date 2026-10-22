import { describe, expect, it } from 'vitest';
import { analyze, bdHour, bdWeekday, engagement, engRate } from '@/lib/social/analytics';
import { fbFormat, igFormat, publishFacebook, publishInstagram, type Fetch } from '@/lib/social/meta';

const post = (created: string, format: string, m: Record<string, number>, content_type?: string) => ({ network: 'facebook', account_id: 'p', ext_id: created, created, format, content_type, metrics: { reactions: 0, comments: 0, shares: 0, ...m } });

describe('social analytics', () => {
  it('uses Bangladesh time for hour and weekday', () => {
    expect(bdHour('2026-10-21T14:30:00Z')).toBe(20); // 20:30 in Dhaka
    expect(bdWeekday('2026-10-21T20:00:00Z')).toBe(4); // Thu 02:00 in Dhaka (Wed in UTC)
  });
  it('engagement = reactions + comments + shares + saves; rate per 100 reached', () => {
    expect(engagement({ reactions: 10, comments: 2, shares: 3, saves: 5 })).toBe(20);
    expect(engRate({ reactions: 10, comments: 0, shares: 0, reach: 200 })).toBe(5);
    expect(engRate({ reactions: 10, comments: 0, shares: 0 })).toBeNull();
  });
  it('finds the best slot, format and type only where there are enough posts', () => {
    const rows = [
      post('2026-10-21T14:00:00Z', 'reel', { reactions: 100, reach: 1000 }, 'recipe_tips'), post('2026-10-14T14:10:00Z', 'reel', { reactions: 80, reach: 900 }, 'recipe_tips'),
      post('2026-10-20T04:00:00Z', 'photo', { reactions: 10, reach: 500 }, 'product'), post('2026-10-13T04:00:00Z', 'photo', { reactions: 12, reach: 400 }, 'product'),
      post('2026-10-19T09:00:00Z', 'text', { reactions: 500 }), // one big post alone is not a "best" slot
    ];
    const A = analyze(rows);
    expect(A.totals).toMatchObject({ posts: 5, engagement: 702, reach: 2800 });
    expect(A.bestSlots[0]).toMatchObject({ weekday: 3, hour: 18, posts: 2, avg_eng: 90 }); // Wed 18–21 BD
    expect(A.bestFormat).toMatchObject({ key: 'reel', posts: 2 });
    expect(A.byType[0]).toMatchObject({ key: 'recipe_tips', avg_eng: 90 });
    expect(A.top[0].eng).toBe(500);
  });
  it('reads post formats', () => {
    expect(fbFormat({ attachments: { data: [{ media_type: 'video', type: 'video_inline' }] } })).toBe('video');
    expect(fbFormat({ attachments: { data: [{ type: 'album', subattachments: { data: [{}, {}] } }] } })).toBe('album');
    expect(fbFormat({ message: 'hi' })).toBe('text');
    expect(igFormat({ media_type: 'VIDEO', media_product_type: 'REELS' })).toBe('reel');
    expect(igFormat({ media_type: 'CAROUSEL_ALBUM' })).toBe('carousel');
  });
});

/** Fake Graph API: records calls, answers like Meta. */
function fakeGraph() {
  const calls: { path: string; method: string; params: Record<string, string> }[] = [];
  let n = 0;
  const f: Fetch = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input));
    const params = Object.fromEntries(init?.method === 'POST' ? new URLSearchParams(String(init.body)) : u.searchParams);
    const path = u.pathname.replace(/^\/v21\.0/, '');
    calls.push({ path, method: init?.method ?? 'GET', params });
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (params.fields === 'access_token') return ok({ access_token: 'PAGE_TOKEN' });
    if (params.fields === 'status_code,status') return ok({ status_code: 'FINISHED' });
    if (params.fields === 'permalink_url' || params.fields === 'permalink') return ok({ permalink_url: 'https://fb/p', permalink: 'https://ig/p' });
    if (path.endsWith('/photos')) return ok({ id: 'photo' + ++n, post_id: params.published === 'false' ? undefined : 'page_post' + n });
    if (path.endsWith('/feed')) return ok({ id: 'feed_post' });
    if (path.endsWith('/media_publish')) return ok({ id: 'ig_post' });
    if (path.endsWith('/media')) return ok({ id: 'container' + ++n });
    return ok({});
  }) as Fetch;
  return { f, calls };
}

describe('publishing (mocked Meta)', () => {
  it('Facebook: one photo goes to /photos with the page token', async () => {
    const g = fakeGraph();
    const r = await publishFacebook('PAGE1', { text: 'Hi', media: [{ url: 'https://x/a.jpg', mime: 'image/jpeg' }] }, 'USER', g.f);
    expect(r.ext_post_id).toMatch(/^page_post/);
    const photo = g.calls.find((c) => c.path === '/PAGE1/photos')!;
    expect(photo.params).toMatchObject({ url: 'https://x/a.jpg', caption: 'Hi', access_token: 'PAGE_TOKEN' });
  });
  it('Facebook: several photos are uploaded unpublished, then one feed post', async () => {
    const g = fakeGraph();
    await publishFacebook('PAGE2', { text: 'Album', media: [{ url: 'https://x/1.jpg', mime: 'image/jpeg' }, { url: 'https://x/2.jpg', mime: 'image/jpeg' }] }, 'USER', g.f);
    expect(g.calls.filter((c) => c.path === '/PAGE2/photos' && c.params.published === 'false')).toHaveLength(2);
    const feed = g.calls.find((c) => c.path === '/PAGE2/feed')!;
    expect(JSON.parse(feed.params.attached_media)).toHaveLength(2);
  });
  it('Instagram: carousel = item containers + carousel container + publish', async () => {
    const g = fakeGraph();
    const r = await publishInstagram('IG1', 'PAGE3', { text: 'Cap', media: [{ url: 'https://x/1.jpg', mime: 'image/jpeg' }, { url: 'https://x/2.mp4', mime: 'video/mp4' }] }, 'USER', g.f);
    expect(r.ext_post_id).toBe('ig_post');
    const items = g.calls.filter((c) => c.path === '/IG1/media' && c.params.is_carousel_item === 'true');
    expect(items.map((c) => c.params.media_type ?? 'IMAGE')).toEqual(['IMAGE', 'VIDEO']);
    expect(g.calls.find((c) => c.params.media_type === 'CAROUSEL')!.params).toMatchObject({ caption: 'Cap' });
  });
  it('Instagram: refuses text-only posts', async () => {
    const g = fakeGraph();
    await expect(publishInstagram('IG1', 'PAGE4', { text: 'only text', media: [] }, 'USER', g.f)).rejects.toThrow(/chobi ba video/);
  });
});

describe('YouTube + TikTok (mocked)', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;
  const { publishYouTube } = await import('@/lib/social/youtube');
  const { publishTikTok, chunks } = await import('@/lib/social/tiktok');
  const dir = await mkdtemp(path.join(tmpdir(), 'bos-'));
  const file = path.join(dir, 'v.mp4'); await writeFile(file, Buffer.alloc(1234, 7));
  const vid = { path: file, size: 1234, mime: 'video/mp4' };

  it('TikTok chunks: one chunk under the size, else 10 MB chunks with the rest in the last', () => {
    expect(chunks(3_000_000)).toEqual({ chunk_size: 3_000_000, total_chunk_count: 1 });
    expect(chunks(25 * 1024 * 1024)).toEqual({ chunk_size: 10 * 1024 * 1024, total_chunk_count: 2 });
  });
  it('YouTube: resumable upload with title from the first line, public, not made for kids', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('uploadType=resumable')) return new Response('', { status: 200, headers: { location: 'https://upload.example/session1' } });
      return new Response(JSON.stringify({ id: 'vid123', status: { privacyStatus: 'private' } }), { status: 200 });
    }) as typeof fetch;
    const r = await publishYouTube(vid, 'Cerelac banano\nDetails…', {}, 'TOKEN', f);
    expect(r).toMatchObject({ ext_post_id: 'vid123', permalink: 'https://youtu.be/vid123' });
    expect(r.note).toMatch(/private/); // Google keeps unaudited API uploads private: say so
    const meta = JSON.parse(String(calls[0].init!.body));
    expect(meta).toMatchObject({ snippet: { title: 'Cerelac banano' }, status: { privacyStatus: 'public', selfDeclaredMadeForKids: false } });
    expect(calls[1]).toMatchObject({ url: 'https://upload.example/session1' });
  });
  it('TikTok inbox: init, upload the bytes, wait for SEND_TO_USER_INBOX', async () => {
    const seen: string[] = []; let put: RequestInit | undefined;
    const f = (async (url: string, init?: RequestInit) => {
      const u = String(url); seen.push(u.replace('https://open.tiktokapis.com/v2', ''));
      const ok = (data: unknown) => new Response(JSON.stringify({ data, error: { code: 'ok' } }), { status: 200 });
      if (u.includes('/inbox/video/init/')) return ok({ publish_id: 'p1', upload_url: 'https://up.tiktok/x' });
      if (u === 'https://up.tiktok/x') { put = init; return new Response('', { status: 201 }); }
      if (u.includes('/status/fetch/')) return ok({ status: 'SEND_TO_USER_INBOX' });
      return ok({});
    }) as typeof fetch;
    const r = await publishTikTok(vid, 'Hi', { mode: 'inbox' }, 'TOKEN', f);
    expect(seen).toEqual(['/post/publish/inbox/video/init/', 'https://up.tiktok/x', '/post/publish/status/fetch/']);
    expect((put!.headers as Record<string, string>)['content-range']).toBe('bytes 0-1233/1234');
    expect(r.note).toMatch(/TikTok app/);
  });
});
