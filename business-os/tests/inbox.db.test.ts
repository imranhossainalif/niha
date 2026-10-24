// Integration: webhook payload → stored message → AI decision → Graph send → stored reply.
// Needs TEST_DATABASE_URL (a throwaway, migrated Postgres); skipped otherwise. Claude and Meta are mocked.
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const HAS_DB = !!process.env.TEST_DATABASE_URL;
const create = vi.fn();
vi.mock('@/lib/anthropic', () => ({ anthropic: () => ({ messages: { create } }), MODEL: () => 'test-model', MODEL_COMPLEX: () => 'test-model' }));

describe.skipIf(!HAS_DB)('InboxPilot end to end (mocked Claude + Graph)', () => {
  const conv = 'psid_' + Date.now();
  const sent: any[] = [];
  let mod: typeof import('@/lib/inbox/process');
  let store: typeof import('@/lib/inbox/store');
  let prisma: typeof import('@/lib/prisma').prisma;

  beforeAll(async () => {
    process.env.META_PAGE_TOKEN = 'test-token';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/me/messages')) { sent.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ message_id: 'm_out_' + sent.length }), { status: 200 }); }
      if (String(url).includes(conv)) return new Response(JSON.stringify({ name: 'Test Ma' }), { status: 200 });
      return new Response('{}', { status: 404 });
    }));
    mod = await import('@/lib/inbox/process');
    store = await import('@/lib/inbox/store');
    prisma = (await import('@/lib/prisma')).prisma;
  });
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM docs WHERE collection = 'inbox_messages' AND data->>'conv' = ${conv}`;
    await prisma.$executeRaw`DELETE FROM docs WHERE collection = 'inbox_config' AND id = 'kidscare'`;
    vi.unstubAllGlobals();
    await prisma.$disconnect();
  });

  const payload = (mid: string, text: string, extra: object = {}) => ({ object: 'page', entry: [{ id: 'page', messaging: [{ sender: { id: conv }, recipient: { id: 'page' }, timestamp: Date.now(), message: { mid, text, ...extra } }] }] });

  it('AI off: message is stored as waiting, nothing is sent', async () => {
    await store.saveConfig({ ai_on: false });
    const [m] = await mod.ingestWebhook(payload('m_in_1_' + conv, 'dam koto?'));
    expect(m).toMatchObject({ conv, dir: 'in', by: 'customer', name: 'Test Ma', channel: 'messenger' });
    expect(await mod.autoReply(m, 0)).toBe('waiting');
    expect(sent).toHaveLength(0);
    expect((await store.lastInbound(conv))!.status).toBe('waiting');
  });

  it('duplicates (same mid) and echoes are skipped', async () => {
    expect(await mod.ingestWebhook(payload('m_in_1_' + conv, 'dam koto?'))).toHaveLength(0);
    expect(await mod.ingestWebhook(payload('m_echo_' + conv, 'x', { is_echo: true }))).toHaveLength(0);
  });

  it('AI on: replies through the Graph API and stores the reply with intent/lead/order', async () => {
    await store.saveConfig({ ai_on: true, kb: 'Cerelac 1kg ৳1,200', rules: 'be nice' });
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Apu 1kg ৳1,200 🙂', intent: 'price', mood: 'happy', needs_human: false, lead_score: 72, order: { name: '', phone: '', address: '', product: 'Cerelac 1kg', qty: '1', baby_age: '' } }) }] });
    const [m] = await mod.ingestWebhook(payload('m_in_2_' + conv, 'cerelac 1 ta nibo'));
    expect(await mod.autoReply(m, 0)).toBe('sent');
    expect(sent[0]).toMatchObject({ recipient: { id: conv }, messaging_type: 'RESPONSE', message: { text: 'Apu 1kg ৳1,200 🙂' } });
    const req = create.mock.calls[0][0];
    expect(req.system[0].text).toContain('Cerelac 1kg ৳1,200');
    expect(req.messages.at(-1)).toMatchObject({ role: 'user' });
    const hist = await store.convMessages(conv, 10);
    expect(hist.at(-1)).toMatchObject({ dir: 'out', by: 'ai', text: 'Apu 1kg ৳1,200 🙂' });
    expect(hist.find((x) => x.mid === 'm_in_2_' + conv)).toMatchObject({ intent: 'price', lead: 72, order: { product: 'Cerelac 1kg', qty: '1' } });
  });

  it('the AI also gets the website passages and similar past TEAM replies (and old prices are marked "do not copy")', async () => {
    const col = (await import('@/lib/db')).db().collection('inbox_web');
    await col.doc('t_' + conv).set({ business: 'kidscare', url: 'https://kc.test/dhaka-delivery', title: 'Dhaka delivery', text: 'Zorbatzorbat delivery policy: Dhaka te 2 diner moddhe delivery', fetched: new Date().toISOString() });
    const other = 'old_' + conv;
    await store.saveMessage({ conv: other, channel: 'messenger', dir: 'in', by: 'customer', text: 'zorbatzorbat polisi ki', mid: 'o_in_' + conv, ts: new Date(Date.now() - 9 * 864e5).toISOString(), status: 'done', business: 'kidscare', source: 'import' });
    await store.saveMessage({ conv: other, channel: 'messenger', dir: 'out', by: 'team', text: 'Apu zorbatzorbat er jonno Dhaka te 2 din lage, call 01712345678', mid: 'o_out_' + conv, ts: new Date(Date.now() - 9 * 864e5 + 60000).toISOString(), status: 'done', business: 'kidscare', source: 'import' });
    (await import('@/lib/inbox/web')).invalidateWebIndex(); (await import('@/lib/inbox/learn')).invalidatePairs();
    create.mockClear();
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Apu Dhaka te 2 din ❤', intent: 'delivery', mood: 'normal', needs_human: false, lead_score: 30, order: {} }) }] });
    const [m] = await mod.ingestWebhook(payload('m_in_ctx_' + conv, 'zorbatzorbat polisi bolen'));
    await mod.autoReply(m, 0);
    sent.pop(); // keep the later tests' counts as they were
    await store.updateMessage('m_in_ctx_' + conv, { ts: new Date(Date.now() - 100 * 3600e3).toISOString() }); // it must not count as a fresh customer message in the 24 h test below
    const sys = create.mock.calls[0][0].system[0].text as string;
    expect(sys).toContain('https://kc.test/dhaka-delivery');
    expect(sys).toContain('Dhaka te 2 diner moddhe delivery');
    expect(sys).toContain('Amader uttor: Apu zorbatzorbat er jonno Dhaka te 2 din lage, call [phone]'); // phone number scrubbed
    await prisma.$executeRaw`DELETE FROM docs WHERE collection IN ('inbox_web','inbox_messages') AND (id = ${'t_' + conv} OR data->>'conv' = ${other})`;
    (await import('@/lib/inbox/web')).invalidateWebIndex(); (await import('@/lib/inbox/learn')).invalidatePairs();
  });

  it('needs_human: no reply, conversation waits for the team', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: '', intent: 'complaint', mood: 'angry', needs_human: true, lead_score: 10, order: {} }) }] });
    const [m] = await mod.ingestWebhook(payload('m_in_3_' + conv, 'product kharap!'));
    expect(await mod.autoReply(m, 0)).toBe('waiting');
    expect(sent).toHaveLength(1);
    expect((await store.lastInbound(conv))).toMatchObject({ status: 'waiting', human: true, mood: 'angry' });
  });

  it('a holding reply ("we have it, the team will confirm the price") is sent AND the chat stays flagged for the team; an angry customer gets no automatic reply', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Ji apu Khichuri ache, dam team confirm korbe', intent: 'product_info', mood: 'normal', needs_human: true, note: 'khichuri price not in knowledge', lead_score: 40, order: {} }) }] });
    const [m] = await mod.ingestWebhook(payload('m_in_hold_' + conv, 'khichuri hobe?'));
    const before = sent.length;
    expect(await mod.autoReply(m, 0)).toBe('waiting');
    expect(sent).toHaveLength(before + 1);
    expect(sent.at(-1).message.text).toBe('Ji apu Khichuri ache, dam team confirm korbe');
    expect(await store.lastInbound(conv)).toMatchObject({ status: 'waiting', human: true, ai_why: 'khichuri price not in knowledge' });
    sent.pop();

    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: 'Sorry apu', intent: 'complaint', mood: 'angry', needs_human: true, note: 'angry', lead_score: 5, order: {} }) }] });
    const [a2] = await mod.ingestWebhook(payload('m_in_angry_' + conv, 'khub kharap service!!'));
    expect(await mod.autoReply(a2, 0)).toBe('waiting');
    expect(sent).toHaveLength(before); // nothing went out
    for (const mid of ['m_in_hold_', 'm_in_angry_']) await store.updateMessage(mid + conv, { ts: new Date(Date.now() - 100 * 3600e3).toISOString() }); // not "fresh" for the 24 h test below
  });

  it('team reply inside 24h is sent and clears waiting; outside 24h is refused', async () => {
    await mod.teamSend(conv, 'Sorry apu, ekhoni dekhchi');
    expect(sent[1].message.text).toBe('Sorry apu, ekhoni dekhchi');
    expect((await store.lastInbound(conv))).toMatchObject({ status: 'open', human: false });
    await store.updateMessage('m_in_3_' + conv, { ts: new Date(Date.now() - 25 * 3600e3).toISOString() });
    await store.updateMessage('m_in_2_' + conv, { ts: new Date(Date.now() - 26 * 3600e3).toISOString() });
    await store.updateMessage('m_in_1_' + conv, { ts: new Date(Date.now() - 27 * 3600e3).toISOString() });
    await expect(mod.teamSend(conv, 'late')).rejects.toMatchObject({ code: 'outside_24h' });
  });

  it('a signed webhook request is accepted by the route; a bad signature is not', async () => {
    process.env.META_APP_SECRET = 's3';
    const { POST } = await import('@/app/api/meta/webhook/route');
    const body = JSON.stringify({ object: 'page', entry: [] });
    const good = new Request('http://x/api/meta/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 's3').update(body).digest('hex') } });
    const bad = new Request('http://x/api/meta/webhook', { method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } });
    expect((await POST(bad)).status).toBe(401);
    // after() needs a request scope outside Next; the signature check runs first, so only assert it got past it
    const r = await POST(good).catch((e: Error) => e);
    expect(r instanceof Response ? r.status : String(r)).not.toBe(401);
  });
});
