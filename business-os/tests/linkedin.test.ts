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
    await expect(publishLinkedIn({ ext_id: 'abc123' }, { text: '  ', media: [] }, 'TOKEN', f)).rejects.toThrow(/lekha ba chobi/);
  });
});

/** A fake LinkedIn: records every call and answers like the Images / Videos / Posts APIs. */
function fakeLinkedIn(opts: { failUpload?: boolean; postError?: string; videoStatus?: string } = {}) {
  const calls: { method: string; url: string; body?: any; bytes?: number }[] = [];
  let n = 0;
  const f = (async (url: string, init?: RequestInit) => {
    const u = String(url); const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ method, url: u, body, bytes: init?.body && typeof init.body !== 'string' ? (init.body as Uint8Array).length : undefined });
    const ok = (j: unknown, h: Record<string, string> = {}, status = 200) => new Response(JSON.stringify(j), { status, headers: h });
    if (u.includes('/rest/images?action=initializeUpload')) return ok({ value: { uploadUrl: 'https://upload.li/img' + ++n, image: 'urn:li:image:' + n } });
    if (u.includes('/rest/videos?action=initializeUpload')) return ok({ value: { video: 'urn:li:video:V1', uploadToken: 'tok', uploadInstructions: [{ firstByte: 0, lastByte: 4 }, { firstByte: 5, lastByte: 9 }].map((x, i) => ({ ...x, uploadUrl: 'https://upload.li/part' + i })) } });
    if (u.includes('/rest/videos?action=finalizeUpload')) return ok({});
    if (u.includes('/rest/videos/')) return ok({ status: opts.videoStatus ?? 'AVAILABLE' });
    if (u.startsWith('https://upload.li/')) return opts.failUpload ? new Response('', { status: 500 }) : new Response('', { status: 201, headers: { etag: '"etag' + calls.length + '"' } });
    if (u.startsWith('https://x/')) return new Response(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), { status: 200 });
    if (u.includes('/rest/posts')) return opts.postError ? ok({ message: opts.postError }, {}, 422) : ok({}, { 'x-restli-id': 'urn:li:share:99' }, 201);
    return ok({});
  }) as typeof fetch;
  return { f, calls };
}

describe('LinkedIn media', () => {
  it('one image: initializeUpload → PUT the bytes → post carries the image urn', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f, calls } = fakeLinkedIn();
    const r = await publishLinkedIn({ ext_id: 'abc' }, { text: 'Hi', media: [{ url: 'https://x/a.jpg', mime: 'image/jpeg' }] }, 'T', f);
    expect(calls.map((c) => c.method + ' ' + c.url.replace(/^https:\/\/(api\.linkedin\.com|upload\.li)/, '')).filter((x) => !x.startsWith('GET https://x/'))).toEqual(['POST /rest/images?action=initializeUpload', 'PUT /img1', 'POST /rest/posts']);
    expect(calls[0].body).toEqual({ initializeUploadRequest: { owner: 'urn:li:person:abc' } });
    expect(calls.find((c) => c.method === 'PUT')!.bytes).toBe(10);
    expect(calls.find((c) => c.url.endsWith('/rest/posts'))!.body.content).toEqual({ media: { id: 'urn:li:image:1' } });
    expect(r.ext_post_id).toBe('urn:li:share:99');
  });
  it('a picture alone (no text) is a valid post', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f, calls } = fakeLinkedIn();
    await publishLinkedIn({ ext_id: 'abc' }, { text: '', media: [{ url: 'https://x/a.jpg', mime: 'image/jpeg' }] }, 'T', f);
    expect(calls.find((c) => c.url.endsWith('/rest/posts'))!.body.commentary).toBe('');
  });
  it('several images become one multiImage post, in order', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f, calls } = fakeLinkedIn();
    const m = (n: number) => ({ url: 'https://x/' + n + '.jpg', mime: 'image/jpeg' });
    await publishLinkedIn({ ext_id: 'abc' }, { text: 'Album', media: [m(1), m(2), m(3)] }, 'T', f);
    expect(calls.find((c) => c.url.endsWith('/rest/posts'))!.body.content).toEqual({ multiImage: { images: [{ id: 'urn:li:image:1' }, { id: 'urn:li:image:2' }, { id: 'urn:li:image:3' }] } });
  });
  it('a video is uploaded in parts, finalized with the part etags, then posted', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f, calls } = fakeLinkedIn();
    await publishLinkedIn({ ext_id: 'abc' }, { text: 'Vid', media: [{ url: 'https://x/v.mp4', mime: 'video/mp4' }] }, 'T', f);
    expect(calls.find((c) => c.url.includes('videos?action=initializeUpload'))!.body.initializeUploadRequest).toMatchObject({ owner: 'urn:li:person:abc', fileSizeBytes: 10 });
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts.map((c) => c.bytes)).toEqual([5, 5]);
    expect(calls.find((c) => c.url.includes('finalizeUpload'))!.body.finalizeUploadRequest).toEqual({ video: 'urn:li:video:V1', uploadToken: 'tok', uploadedPartIds: [expect.stringMatching(/^etag/), expect.stringMatching(/^etag/)] });
    expect(calls.find((c) => c.url.endsWith('/rest/posts'))!.body.content).toEqual({ media: { id: 'urn:li:video:V1' } });
  });
  it('reads the file from disk when we have it', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { writeFile, mkdtemp } = await import('node:fs/promises'); const { tmpdir } = await import('node:os'); const path = await import('node:path');
    const dir = await mkdtemp(path.join(tmpdir(), 'li-')); const file = path.join(dir, 'a.jpg'); await writeFile(file, Buffer.from([9, 9, 9]));
    const { f, calls } = fakeLinkedIn();
    await publishLinkedIn({ ext_id: 'abc' }, { text: 'x', media: [{ url: 'https://x/never-fetched.jpg', mime: 'image/jpeg' }] }, 'T', f, [{ path: file, mime: 'image/jpeg' }]);
    expect(calls.some((c) => c.url.startsWith('https://x/'))).toBe(false);
    expect(calls.find((c) => c.method === 'PUT')!.bytes).toBe(3);
  });
  it('if the upload fails the post FAILS — it is never sent as text only', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f, calls } = fakeLinkedIn({ failUpload: true });
    await expect(publishLinkedIn({ ext_id: 'abc' }, { text: 'Hi', media: [{ url: 'https://x/a.jpg', mime: 'image/jpeg' }] }, 'T', f)).rejects.toThrow(/upload hoyni/);
    expect(calls.some((c) => c.url.endsWith('/rest/posts'))).toBe(false);
  });
  it('video mixed with images, or more than 20 images, is refused before anything is uploaded', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f, calls } = fakeLinkedIn();
    await expect(publishLinkedIn({ ext_id: 'abc' }, { text: 'x', media: [{ url: 'https://x/a.jpg', mime: 'image/jpeg' }, { url: 'https://x/v.mp4', mime: 'video/mp4' }] }, 'T', f)).rejects.toThrow(/mishano/);
    await expect(publishLinkedIn({ ext_id: 'abc' }, { text: 'x', media: Array.from({ length: 21 }, (_, i) => ({ url: 'https://x/' + i + '.jpg', mime: 'image/jpeg' })) }, 'T', f)).rejects.toThrow(/20/);
    expect(calls).toHaveLength(0);
  });
  it('a video LinkedIn cannot process fails with a clear message', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f } = fakeLinkedIn({ videoStatus: 'PROCESSING_FAILED' });
    await expect(publishLinkedIn({ ext_id: 'abc' }, { text: 'x', media: [{ url: 'https://x/v.mp4', mime: 'video/mp4' }] }, 'T', f)).rejects.toThrow(/process korte parlo na/);
  });
  it('LinkedIn "duplicate" errors get a plain explanation', async () => {
    const { publishLinkedIn } = await import('@/lib/social/linkedin');
    const { f } = fakeLinkedIn({ postError: 'com.linkedin.content.common.exception.BadRequestResponseException: Content is a duplicate of urn:li:share:1' });
    await expect(publishLinkedIn({ ext_id: 'abc' }, { text: 'same', media: [] }, 'T', f)).rejects.toThrow(/identical post allow kore na/);
  });
});

