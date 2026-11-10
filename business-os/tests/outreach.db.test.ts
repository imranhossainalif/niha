// Integration: two reps logging the same prospect at the same moment must both be counted (needs TEST_DATABASE_URL).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HAS_DB = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!HAS_DB)('outreach: concurrent logging and import', () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let srv: typeof import('@/lib/outreach/server');
  let core: typeof import('@/lib/outreach/core');
  const P = { kind: 'system' } as const;
  beforeAll(async () => { prisma = (await import('@/lib/prisma')).prisma; srv = await import('@/lib/outreach/server'); core = await import('@/lib/outreach/core'); });
  afterAll(async () => { await prisma.$executeRaw`DELETE FROM docs WHERE collection IN ('outreach_prospects','outreach_activities') AND data->>'name' LIKE 'OT-%' OR collection = 'outreach_activities' AND data->>'note' = 'ot'`; });

  it('parallel logs on one prospect are all applied (optimistic lock + retry), and message steps stay in order', async () => {
    const s = core.mergeSettings(null);
    const made = await srv.createProspect(P, { name: 'OT-race', profiles: [{ platform: 'instagram', url: 'https://instagram.com/ot-race' }] }, s, []);
    const id = made.prospect!.id!;
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => srv.logActivity(P, { prospect: id, type: i % 2 ? 'msg' : 'like', platform: 'instagram', note: 'ot' }, s)));
    expect(results).toHaveLength(6);
    const cur = (await (await import('@/lib/db')).db().collection('outreach_prospects').doc(id).get())!.data as any;
    expect(cur.touches).toBe(6);
    expect(cur.profiles[0].msgs).toBe(3);
    expect(results.map((r) => r.activity.step).filter(Boolean).sort()).toEqual([1, 2, 3]);
  });

  it('undo rebuilds the counters; a future time is clamped to now', async () => {
    const s = core.mergeSettings(null);
    const made = await srv.createProspect(P, { name: 'OT-undo', profiles: [{ platform: 'linkedin', url: 'https://linkedin.com/in/ot-undo' }] }, s, []);
    const id = made.prospect!.id!;
    await srv.logActivity(P, { prospect: id, type: 'connect', platform: 'linkedin', note: 'ot' }, s);
    const m = await srv.logActivity(P, { prospect: id, type: 'msg', platform: 'linkedin', note: 'ot', at: new Date(Date.now() + 5 * 864e5).toISOString() }, s);
    expect(Date.parse(m.activity.at)).toBeLessThanOrEqual(Date.now());
    const after = await srv.undoActivity(P, m.activity.id!, s);
    expect(after.touches).toBe(1); expect(after.profiles[0].msgs).toBe(0); expect(after.profiles[0].out).toBeTruthy();
  });

  it('keyIndex finds duplicates without rescanning (import)', async () => {
    const s = core.mergeSettings(null);
    const a = await srv.createProspect(P, { name: 'OT-idx', profiles: [{ platform: 'x', url: 'https://x.com/ot_idx' }] }, s, []);
    const index = srv.keyIndex([a.prospect!]);
    const again = await srv.createProspect(P, { name: 'OT-idx2', profiles: [{ platform: 'x', url: 'twitter.com/OT_IDX/' }] }, s, [], false, index);
    expect(again.duplicate?.id).toBe(a.prospect!.id);
  });
});
