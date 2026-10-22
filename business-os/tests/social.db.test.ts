// Integration: a scheduled post that is due gets published to Facebook + Instagram by the worker job.
// Needs TEST_DATABASE_URL; Meta is mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('social publish job (mocked Meta)', () => {
  const tag = 't' + Date.now();
  let prisma: typeof import('@/lib/prisma').prisma;
  let dbm: typeof import('@/lib/db');
  let social: typeof import('@/lib/jobs/social');
  beforeAll(async () => {
    process.env.META_SOCIAL_TOKEN = 'USER';
    prisma = (await import('@/lib/prisma')).prisma;
    dbm = await import('@/lib/db');
    social = await import('@/lib/jobs/social');
    const col = dbm.db().collection('social_accounts');
    await col.doc('facebook_' + tag).set({ business: 'kidscare', network: 'facebook', ext_id: 'P' + tag, page_id: 'P' + tag, name: 'KC page', active: true });
    await col.doc('instagram_' + tag).set({ business: 'kidscare', network: 'instagram', ext_id: 'I' + tag, page_id: 'P' + tag, name: 'KC ig', active: true });
  });
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM docs WHERE collection IN ('social_accounts','social_posts') AND (id LIKE ${'%' + tag} OR data->>'text' = ${tag})`;
    delete process.env.META_SOCIAL_TOKEN;
  });

  it('publishes a due post to every target; IG failure leaves it partial with the error', async () => {
    const f = (async (input: string | URL, init?: RequestInit) => {
      const u = new URL(String(input)); const params = Object.fromEntries(init?.method === 'POST' ? new URLSearchParams(String(init.body)) : u.searchParams);
      const ok = (j: unknown) => new Response(JSON.stringify(j), { status: 200 });
      if (params.fields === 'access_token') return ok({ access_token: 'PT' });
      if (u.pathname.endsWith('/photos')) return ok({ id: 'ph', post_id: 'fbpost1' });
      if (u.pathname.includes('/I' + tag + '/media')) return new Response(JSON.stringify({ error: { message: 'Only photo or video can be accepted as media type.' } }), { status: 400 });
      return ok({ permalink_url: 'https://fb/x' });
    }) as typeof fetch;
    const col = dbm.db().collection('social_posts');
    const p = await col.add({ business: 'kidscare', status: 'scheduled', text: tag, media: [{ id: 'a', url: 'https://x/a.jpg', mime: 'image/jpeg' }], scheduled_at: new Date(Date.now() - 60e3).toISOString(),
      targets: [{ account_id: 'facebook_' + tag, network: 'facebook', status: 'pending' }, { account_id: 'instagram_' + tag, network: 'instagram', status: 'pending' }] });
    const later = await col.add({ business: 'kidscare', status: 'scheduled', text: tag, media: [], scheduled_at: new Date(Date.now() + 3600e3).toISOString(), targets: [{ account_id: 'facebook_' + tag, network: 'facebook', status: 'pending' }] });
    const r = await social.publishDue(f);
    expect(r.results.find((x) => x.id === p.id)?.status).toBe('partial');
    expect(r.results.find((x) => x.id === later.id)).toBeUndefined();
    const doc = (await col.doc(p.id).get())!.data as any;
    expect(doc.status).toBe('partial');
    expect(doc.targets[0]).toMatchObject({ status: 'published', ext_post_id: 'fbpost1' });
    expect(doc.targets[1].status).toBe('failed');
    expect(doc.error).toMatch(/Only photo or video/);
    // a second run doesn't publish again (not "scheduled" any more)
    expect((await social.publishDue(f)).results.find((x) => x.id === p.id)).toBeUndefined();
  });
});
