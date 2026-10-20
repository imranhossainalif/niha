// Doc store: access rules, optimistic versions, change feed; Nuport job with a mocked API. Needs TEST_DATABASE_URL (a throwaway database).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@/lib/access';

const HAS_DB = !!process.env.TEST_DATABASE_URL;
const T = 'test_' + Date.now();

describe.skipIf(!HAS_DB)('doc store', () => {
  let dbm: typeof import('@/lib/db');
  let prisma: typeof import('@/lib/prisma').prisma;
  const staff: Principal = { kind: 'user', userId: 'u', email: 's@x', role: 'staff', businesses: ['lrf'], scopes: ['read', 'write'] };
  const reader: Principal = { ...staff, role: 'owner', scopes: ['read'] } as Principal;
  beforeAll(async () => { dbm = await import('@/lib/db'); prisma = (await import('@/lib/prisma')).prisma; });
  afterAll(async () => { await prisma.$executeRaw`DELETE FROM docs WHERE collection LIKE ${T + '%'} OR (collection IN ('tasks','kb_notes') AND id LIKE ${T + '%'})`; await prisma.$disconnect(); });

  it('versions every write and refuses stale ones', async () => {
    const ref = dbm.db().collection(T).doc('a');
    expect((await ref.set({ x: 1 })).version).toBe(1);
    expect((await ref.update({ y: 2, 'n.deep': 3 })).data).toEqual({ x: 1, y: 2, n: { deep: 3 } });
    await expect(ref.set({ x: 9 }, { expectedVersion: 1 })).rejects.toMatchObject({ code: 'version_conflict' });
    await expect(dbm.db().collection(T).doc('a').set({}, { expectedVersion: 0 })).rejects.toMatchObject({ code: 'version_conflict' });
    expect((await ref.set({ x: 3 }, { expectedVersion: 2 })).version).toBe(3);
  });

  it('queries JSON fields', async () => {
    const c = dbm.db().collection(T + 'q');
    await c.doc('1').set({ n: 5, tag: ['a'], s: 'x' }); await c.doc('2').set({ n: 10, s: 'y' }); await c.doc('3').set({ n: 1, s: 'x' });
    expect((await c.where('n', '>=', 5).orderBy('n', 'desc').get()).map((d) => d.id)).toEqual(['2', '1']);
    expect((await c.where('s', 'in', ['y']).get()).map((d) => d.id)).toEqual(['2']);
    expect((await c.where('tag', 'array-contains', 'a').get()).map((d) => d.id)).toEqual(['1']);
    expect((await c.where('s', '!=', 'x').get()).map((d) => d.id)).toEqual(['2']);
  });

  it('staff only see and write their businesses', async () => {
    const sys = dbm.db();
    await sys.collection('tasks').doc(T + 'lrf').set({ title: 'L', business: 'lrf' });
    await sys.collection('tasks').doc(T + 'kc').set({ title: 'K', business: 'kidscare' });
    await sys.collection('kb_notes').doc(T + 'n').set({ title: 'shared note' });
    const s = dbm.db(staff);
    const ids = (await s.collection('tasks').limit(5000).get()).map((d) => d.id);
    expect(ids).toContain(T + 'lrf');
    expect(ids).not.toContain(T + 'kc');
    expect(await s.collection('tasks').doc(T + 'kc').get()).toBeNull();
    expect(await s.collection('kb_notes').doc(T + 'n').get()).not.toBeNull();
    await expect(s.collection('tasks').doc(T + 'kc').set({ business: 'lrf' })).rejects.toMatchObject({ code: 'permission_denied' }); // can't take over another business's doc
    await expect(s.collection('tasks').doc(T + 'new').set({ business: 'kidscare' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(s.collection('kb_notes').doc(T + 'n').set({ title: 'x' })).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(dbm.db(reader).collection(T).doc('a').set({})).rejects.toMatchObject({ code: 'permission_denied' });
  });

  it('change feed returns upserts and deletes after a sequence', async () => {
    const c = dbm.db().collection(T + 'f');
    const { seq } = await dbm.changes({ kind: 'system' }, 0, [T + 'f']);
    await c.doc('1').set({ a: 1 }); await c.doc('2').set({ a: 2 }); await c.doc('1').delete();
    const ch = await dbm.changes({ kind: 'system' }, seq, [T + 'f']);
    expect(ch.upserts.map((u) => u.id)).toEqual(['2']);
    expect(ch.deletes).toEqual([{ collection: T + 'f', id: '1' }]);
    expect(ch.seq).toBeGreaterThan(seq);
  });
});

describe.skipIf(!HAS_DB)('nuport job (mocked API)', () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  const orders: Record<number, any> = {
    1001: { internalId: 1, createdAt: '2026-10-01T04:00:00Z', status: 'COMPLETED', totalAmount: 1000, isReturn: false, deliveredAt: '2026-10-03T05:00:00Z' },
    1002: { internalId: 2, createdAt: '2026-10-15T04:00:00Z', status: 'IN_TRANSIT', totalAmount: 500 },
    1003: { internalId: 3, createdAt: '2026-10-15T05:00:00Z', status: 'CANCELLED', totalAmount: 700 },
  };
  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma;
    await prisma.$executeRaw`DELETE FROM docs WHERE collection IN ('nuport_orders') OR (collection = 'sync_state' AND id = 'nuport')`;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const n = Number(String(url).split('SO-')[1]);
      return orders[n] ? new Response(JSON.stringify(orders[n]), { status: 200 }) : new Response('', { status: 404 });
    }));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await prisma.$executeRaw`DELETE FROM docs WHERE collection IN ('nuport_orders') OR (collection = 'sync_state' AND id = 'nuport') OR (collection = 'sales_daily' AND data->>'asof' = 'nuport-test')`;
    await prisma.$disconnect();
  });

  it('fetches new SOs, stops after 30 misses, writes sales_daily and remembers the last SO', async () => {
    const { nuportSync } = await import('@/lib/jobs/nuport');
    const r = await nuportSync({ key: 'k', startSo: 1000, today: '2026-10-20' });
    expect(r).toMatchObject({ last_so: 1003, added: 3 });
    const { db } = await import('@/lib/db');
    const st = await db().collection('sync_state').doc('nuport').get();
    expect(st!.data.last_so).toBe(1003);
    // first order is 1 Oct → days from 11 Oct are safe to recompute
    const d15 = await db().collection('sales_daily').doc('kidscare_2026-10-15').get();
    expect(d15!.data).toMatchObject({ orders: 2, cancelled: 1, sent: 1, sent_in_transit: 1, sent_in_transit_amount: 500, source: 'nuport' });
    // status change is picked up on the next run
    orders[1002] = { ...orders[1002], status: 'COMPLETED', deliveredAt: '2026-10-19T06:00:00Z' };
    const r2 = await nuportSync({ key: 'k', today: '2026-10-20' });
    expect(r2).toMatchObject({ last_so: 1003, added: 0, changed: 1 });
    const d19 = await db().collection('sales_daily').doc('kidscare_2026-10-19').get();
    expect(d19!.data).toMatchObject({ delivered: 1, delivered_amount: 500 });
  });
});
