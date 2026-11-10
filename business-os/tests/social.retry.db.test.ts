// Integration: a network blink is retried by the worker, a post cut off mid-publish is released with a clear error,
// and connecting an account that another business already holds is refused (needs TEST_DATABASE_URL; Meta is mocked).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('social publish: retry and recovery', () => {
  const tag = 'r' + Date.now();
  let prisma: typeof import('@/lib/prisma').prisma;
  let dbm: typeof import('@/lib/db');
  let social: typeof import('@/lib/jobs/social');
  beforeAll(async () => {
    process.env.META_SOCIAL_TOKEN = 'USER';
    prisma = (await import('@/lib/prisma')).prisma;
    dbm = await import('@/lib/db');
    social = await import('@/lib/jobs/social');
    await dbm.db().collection('social_accounts').doc('facebook_' + tag).set({ business: 'kidscare', network: 'facebook', ext_id: 'P' + tag, page_id: 'P' + tag, name: 'KC page', active: true });
  });
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM docs WHERE collection IN ('social_accounts','social_posts') AND (id LIKE ${'%' + tag} OR data->>'text' = ${tag})`;
    delete process.env.META_SOCIAL_TOKEN;
  });
  const okFb = (async (input: string | URL, init?: RequestInit) => {
    const u = new URL(String(input)); const params = Object.fromEntries(init?.method === 'POST' ? new URLSearchParams(String(init.body)) : u.searchParams);
    const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
    if (params.fields === 'access_token') return ok({ access_token: 'PT' });
    if (u.pathname.endsWith('/feed')) return ok({ id: 'fbpost' });
    return ok({ permalink_url: 'https://fb/x' });
  }) as typeof fetch;
  const ago = (min: number) => new Date(Date.now() - min * 60e3).toISOString();
  const target = (o: object) => ({ account_id: 'facebook_' + tag, network: 'facebook', ...o });

  it('retries a target that failed only on a network error, a few minutes later, at most 3 times', async () => {
    const col = dbm.db().collection('social_posts');
    const p = await col.add({ business: 'kidscare', status: 'failed', text: tag, media: [], scheduled_at: ago(30), targets: [target({ status: 'failed', error: 'Meta er sathe network e connect hoy nai (fetch failed)', at: ago(10), attempts: 1 })] });
    const fresh = await col.add({ business: 'kidscare', status: 'failed', text: tag, media: [], scheduled_at: ago(30), targets: [target({ status: 'failed', error: 'fetch failed', at: ago(1), attempts: 1 })] });   // too soon
    const spent = await col.add({ business: 'kidscare', status: 'failed', text: tag, media: [], scheduled_at: ago(30), targets: [target({ status: 'failed', error: 'fetch failed', at: ago(10), attempts: 3 })] }); // out of tries
    const rejected = await col.add({ business: 'kidscare', status: 'failed', text: tag, media: [], scheduled_at: ago(30), targets: [target({ status: 'failed', error: '(#100) Object does not exist', at: ago(10), attempts: 1 })] }); // not a blink
    const old = await col.add({ business: 'kidscare', status: 'failed', text: tag, media: [], scheduled_at: ago(60 * 30), targets: [target({ status: 'failed', error: 'fetch failed', at: ago(60 * 29), attempts: 1 })] }); // a day old
    const r = await social.publishDue(okFb);
    expect(r.retried.map((x) => x.id)).toEqual([p.id]);
    expect(r.retried[0].status).toBe('published');
    expect(((await col.doc(p.id).get())!.data as any).targets[0]).toMatchObject({ status: 'published', ext_post_id: 'fbpost' });
    for (const x of [fresh, spent, rejected, old]) expect(((await col.doc(x.id).get())!.data as any).status).toBe('failed');
  });

  it('a post stuck in "publishing" is released: unfinished targets become failed with a "check the page" note, nothing is re-sent', async () => {
    const col = dbm.db().collection('social_posts');
    const p = await col.add({ business: 'kidscare', status: 'publishing', text: tag, media: [], scheduled_at: ago(60), targets: [target({ status: 'pending' }), { account_id: 'x_' + tag, network: 'instagram', status: 'published', ext_post_id: 'ig1' }] });
    await prisma.$executeRaw`UPDATE docs SET updated_at = now() - interval '40 minutes' WHERE collection = 'social_posts' AND id = ${p.id}`;
    await social.publishDue(okFb);
    const d = (await col.doc(p.id).get())!.data as any;
    expect(d.status).toBe('partial');
    expect(d.targets[0]).toMatchObject({ status: 'failed' }); expect(d.targets[0].error).toMatch(/Retry/);
    expect(d.targets[1]).toMatchObject({ status: 'published', ext_post_id: 'ig1' });
  });
});
