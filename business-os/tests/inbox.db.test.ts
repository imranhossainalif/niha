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

  it('needs_human: no reply, conversation waits for the team', async () => {
    create.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ reply: '', intent: 'complaint', mood: 'angry', needs_human: true, lead_score: 10, order: {} }) }] });
    const [m] = await mod.ingestWebhook(payload('m_in_3_' + conv, 'product kharap!'));
    expect(await mod.autoReply(m, 0)).toBe('waiting');
    expect(sent).toHaveLength(1);
    expect((await store.lastInbound(conv))).toMatchObject({ status: 'waiting', human: true, mood: 'angry' });
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
