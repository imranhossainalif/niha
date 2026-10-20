import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyChallenge, verifySignature } from '@/lib/meta/signature';
import { parseDecision, toTurns } from '@/lib/inbox/ai';
import { ibCompile, ibRulesCompile, IB_RULES_DEFAULT } from '@/lib/inbox/compile';
import { windowLeftHours } from '@/lib/inbox/process';
import type { InboxMessage } from '@/lib/inbox/store';

const SECRET = 'app-secret';
const sign = (body: string, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

describe('X-Hub-Signature-256', () => {
  const body = JSON.stringify({ object: 'page', entry: [{ messaging: [{ message: { mid: 'm1', text: 'dam koto?' } }] }] });
  it('accepts the right signature', () => expect(verifySignature(body, sign(body), SECRET)).toBe(true));
  it('accepts uppercase hex', () => expect(verifySignature(body, sign(body).toUpperCase().replace('SHA256', 'sha256'), SECRET)).toBe(true));
  it('rejects a tampered body', () => expect(verifySignature(body + ' ', sign(body), SECRET)).toBe(false));
  it('rejects a wrong secret', () => expect(verifySignature(body, sign(body, 'other'), SECRET)).toBe(false));
  it('rejects missing/garbled headers and a missing secret', () => {
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, 'sha1=abc', SECRET)).toBe(false);
    expect(verifySignature(body, 'sha256=xyz', SECRET)).toBe(false);
    expect(verifySignature(body, sign(body), undefined)).toBe(false);
  });
  it('works on raw bytes (bodies with Bangla text)', () => {
    const b = JSON.stringify({ text: 'আপু দাম কত?' });
    expect(verifySignature(Buffer.from(b), sign(b), SECRET)).toBe(true);
  });
});

describe('GET verify handshake', () => {
  const q = (o: Record<string, string>) => new URLSearchParams(o);
  it('echoes the challenge when the token matches', () => {
    expect(verifyChallenge(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'kidscare2026', 'hub.challenge': '12345' }), 'kidscare2026')).toBe('12345');
  });
  it('rejects a wrong token, wrong mode or unset token', () => {
    expect(verifyChallenge(q({ 'hub.mode': 'subscribe', 'hub.verify_token': 'x', 'hub.challenge': '1' }), 'kidscare2026')).toBeNull();
    expect(verifyChallenge(q({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'kidscare2026', 'hub.challenge': '1' }), 'kidscare2026')).toBeNull();
    expect(verifyChallenge(q({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '1' }), undefined)).toBeNull();
  });
});

const msg = (dir: 'in' | 'out', text: string, ts: string): InboxMessage => ({ conv: 'c1', channel: 'messenger', dir, by: dir === 'in' ? 'customer' : 'ai', text, ts, mid: ts, status: 'open', business: 'kidscare' });

describe('inbox AI helpers', () => {
  it('builds alternating turns that start and end with the customer', () => {
    const t = toTurns([msg('out', 'Welcome', '1'), msg('in', 'hi', '2'), msg('in', 'dam koto?', '3'), msg('out', '৳1200', '4'), msg('in', 'ok order', '5')]);
    expect(t.map((x) => x.role)).toEqual(['user', 'assistant', 'user']);
    expect(t[0].content).toBe('hi\ndam koto?');
  });
  it('parses and clamps the JSON decision', () => {
    const d = parseDecision('```json\n{"reply":"Ji apu","intent":"price","mood":"happy","needs_human":false,"lead_score":140,"order":{"name":"A","phone":"","address":"","product":"","qty":"","baby_age":""}}\n```');
    expect(d).toMatchObject({ reply: 'Ji apu', intent: 'price', mood: 'happy', needs_human: false, lead_score: 100 });
    expect(d.order.name).toBe('A');
  });
  it('unknown intent → other; empty reply → needs a human', () => {
    const d = parseDecision('{"reply":"","intent":"weird","mood":"x","needs_human":false,"lead_score":-5,"order":{}}');
    expect(d).toMatchObject({ intent: 'other', mood: 'normal', needs_human: true, lead_score: 0 });
  });
  it('24-hour window', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    expect(windowLeftHours('2026-10-20T10:00:00Z', now)).toBeCloseTo(22);
    expect(windowLeftHours('2026-10-19T11:00:00Z', now)).toBeLessThan(0);
    expect(windowLeftHours(undefined, now)).toBeLessThan(0);
  });
});

describe('knowledge compile', () => {
  const k = {
    products: [{ name: 'Cerelac 1kg', price: '৳1,200', age: '6 mash+' }, { name: 'Old', active: 'false' }],
    offers: [{ title: 'Boro Babu Combo', price: '৳2,990', until: '2026-10-31' }, { title: 'Expired', until: '2026-10-01' }, { title: 'Off', active: false }],
    couriers: [{ area: 'Dhaka', charge: 60, days: '1–2 din' }],
    kb: [{ title: 'FAQ', text: 'No preservative' }, { title: 'Hidden', text: 'x', use: 'false' }],
    settings: { payment: 'COD' },
  };
  const out = ibCompile(k, '2026-10-20');
  it('includes only active products and live offers', () => {
    expect(out).toContain('Cerelac 1kg | dam: ৳1,200 | boyosh: 6 mash+');
    expect(out).not.toContain('Old');
    expect(out).toContain('Boro Babu Combo — ৳2,990 (meyad 2026-10-31 porjonto)');
    expect(out).not.toContain('Expired');
    expect(out).not.toContain('- Off');
    expect(out).toContain('- Dhaka: ৳60, 1–2 din\nPayment: COD');
    expect(out).toContain('# FAQ\nNo preservative');
    expect(out).not.toContain('Hidden');
  });
  it('says there is no offer when none is live', () => {
    expect(ibCompile({ ...k, offers: [] }, '2026-10-20')).toContain('Ekhon kono offer nai');
  });
  it('caps at 30k characters', () => {
    expect(ibCompile({ ...k, kb: Array.from({ length: 20 }, (_, i) => ({ title: 'x' + i, text: 'y'.repeat(4000) })) }).length).toBe(30000);
  });
  it('rules: defaults plus greeting/tone/samples', () => {
    expect(ibRulesCompile({})).toBe(IB_RULES_DEFAULT);
    expect(ibRulesCompile({ rules: 'R', greeting: 'Salam', tone: 'soft', samples: 'S' })).toBe('R\n\nProthom message er shuru: Salam\n\nTone: soft\n\nAMADER UTTOR DEYAR DHORON (ei style copy korbe):\nS');
  });
});
