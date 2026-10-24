// Integration (needs TEST_DATABASE_URL): upload a PDF and a text file, a background job reads them, and the inbox AI
// then gets the file passages and the shop catalogue in its prompt. Claude is mocked.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const HAS_DB = !!process.env.TEST_DATABASE_URL;
const stream = vi.fn(); const create = vi.fn();
vi.mock('@/lib/anthropic', () => ({ anthropic: () => ({ messages: { stream, create } }), MODEL: () => 'test-model', MODEL_COMPLEX: () => 'test-model' }));

describe.skipIf(!HAS_DB)('files + catalogue for the inbox AI', () => {
  const tag = 'f' + Date.now();
  let files: typeof import('@/lib/inbox/files'); let ctx: typeof import('@/lib/inbox/context'); let prod: typeof import('@/lib/inbox/products'); let prisma: typeof import('@/lib/prisma').prisma; let ai: typeof import('@/lib/inbox/ai');
  beforeAll(async () => {
    process.env.MEDIA_DIR = mkdtempSync(path.join(tmpdir(), 'bos-kb-'));
    files = await import('@/lib/inbox/files'); ctx = await import('@/lib/inbox/context'); prod = await import('@/lib/inbox/products'); ai = await import('@/lib/inbox/ai');
    prisma = (await import('@/lib/prisma')).prisma;
  });
  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM docs WHERE (collection = 'inbox_web' AND (id LIKE 'file_%' OR data->>'site' = ${tag})) OR (collection = 'inbox_products' AND data->>'site' = ${tag})`;
    await prisma.$executeRaw`DELETE FROM jobs WHERE kind = 'inbox_file'`;
  });

  it('PDF: uploaded, read by Claude as a document, stored as searchable text', async () => {
    stream.mockReturnValueOnce({ finalMessage: async () => ({ model: 'test-model', usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text: `Qwertyuiop price list\nQwertyuiop Gift Box | 3 pcs | ৳1,850\nQwertyuiop Gift Box | 6 pcs | ৳3,400\n---\nreturn policy` }] }) });
    const up = await files.saveUpload(new File([Buffer.from('%PDF-1.4 fake')], 'price-list.pdf', { type: 'application/pdf' }), 'test');
    expect((await files.listFiles())[0]).toMatchObject({ title: 'price-list.pdf', status: 'processing', ext: 'pdf' });
    await files.processFile(up.id);
    const sent = stream.mock.calls[0][0].messages[0].content;
    expect(sent[0]).toMatchObject({ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } });
    expect((await files.listFiles()).find((f) => f.id === up.id)).toMatchObject({ status: 'ready' });
    const c = await ctx.contextFor([{ dir: 'in', text: 'qwertyuiop gift box 6 pcs dam koto' }]);
    expect(c.web[0].text).toContain('Qwertyuiop Gift Box | 6 pcs | ৳3,400');
    expect(ai.systemPrompt('Bot', 'K', 'R', c.extras)).toContain('WEBSITE AND FILES');
  });

  it('text file works too; wrong types and oversize are refused; removing a file removes its text', async () => {
    const up = await files.saveUpload(new File(['Zxcvbnm delivery: Dhaka 60 taka\nBaire 120 taka'], 'delivery.txt', { type: 'text/plain' }), 'test');
    await files.processFile(up.id);
    expect((await ctx.contextFor([{ dir: 'in', text: 'zxcvbnm delivery charge' }])).web.some((h) => h.text.includes('Baire 120 taka'))).toBe(true);
    await expect(files.saveUpload(new File(['x'], 'virus.exe'), 't')).rejects.toMatchObject({ code: 'bad_request' });
    await expect(files.saveUpload(new File([Buffer.alloc(21 * 1024 * 1024)], 'big.pdf'), 't')).rejects.toMatchObject({ code: 'bad_request' });
    await files.removeFile(up.id);
    expect((await ctx.contextFor([{ dir: 'in', text: 'zxcvbnm delivery charge' }])).web.some((h) => h.text.includes('Baire 120 taka'))).toBe(false);
  });

  it('a failed read is shown on the file, not lost', async () => {
    stream.mockReturnValueOnce({ finalMessage: async () => { throw new Error('PDF is password protected'); } });
    const up = await files.saveUpload(new File([Buffer.from('%PDF')], 'locked.pdf', { type: 'application/pdf' }), 'test');
    await expect(files.processFile(up.id)).rejects.toThrow(/password/);
    expect((await files.listFiles()).find((f) => f.id === up.id)).toMatchObject({ status: 'error', error: expect.stringContaining('password') });
  });

  it('shop catalogue: the question finds the product with ALL its variations; "price list" gives the list; unknown gives nothing', async () => {
    await prod.saveProducts(tag, [
      { name: 'Quxwvu Cerelac', url: 'https://shop.test/q', currency: 'BDT', source: 'shopify', variants: [{ label: '500g', price: 700 }, { label: '1kg', price: 1200 }] },
      { name: 'Plmokn Honey Mix', url: 'https://shop.test/h', currency: 'BDT', source: 'shopify', variants: [{ label: '250g', price: 450, available: false }] },
    ]);
    const one = await ctx.contextFor([{ dir: 'in', text: 'quxwvu cerelac er dam koto' }]);
    expect(one.extras.products).toEqual(['• Quxwvu Cerelac: 500g ৳700; 1kg ৳1,200 — https://shop.test/q']);
    const sys = ai.systemPrompt('Bot', 'K', 'R', one.extras);
    expect(sys).toContain('SHOP PRODUCTS (live from our shop website');
    expect(sys).toContain('list every variation');
    expect((await ctx.contextFor([{ dir: 'in', text: 'apnader sob product er price list den' }])).products.length).toBeGreaterThanOrEqual(2);
    expect((await ctx.contextFor([{ dir: 'in', text: 'xyzzyplugh kothay' }])).products).toHaveLength(0);
    const out = await ctx.contextFor([{ dir: 'in', text: 'plmokn honey mix dam' }]);
    expect(out.extras.products![0]).toContain('250g ৳450 (stock nai)');
    // a later sync that no longer has a product removes it
    await prod.saveProducts(tag, [{ name: 'Quxwvu Cerelac', url: 'https://shop.test/q', currency: 'BDT', source: 'shopify', variants: [{ label: '500g', price: 750 }] }]);
    expect((await ctx.contextFor([{ dir: 'in', text: 'plmokn honey mix dam' }])).products).toHaveLength(0);
    expect((await ctx.contextFor([{ dir: 'in', text: 'quxwvu cerelac' }])).extras.products![0]).toContain('500g ৳750');
  });
});
