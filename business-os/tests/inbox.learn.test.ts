import { describe, expect, it } from 'vitest';
import { buildPairs, scrub } from '@/lib/inbox/learn';
import { chunkText, pageLinks, sitemapUrls } from '@/lib/inbox/web';
import { systemPrompt } from '@/lib/inbox/ai';
import { queryFrom } from '@/lib/inbox/context';
import { buildIndex, kbSearch } from '@/lib/kb/bm25';

const m = (conv: string, dir: 'in' | 'out', by: 'customer' | 'team' | 'ai', text: string, min: number) => ({ conv, dir, by, text, ts: new Date(Date.UTC(2026, 9, 1, 6, min)).toISOString() });

describe('learning from past replies', () => {
  it('removes phone numbers (also Bangla digits) and links', () => {
    expect(scrub('call 01712-345678 ba ০১৮১২৩৪৫৬৭৮ ba +8801912345678 https://x.com/a')).toBe('call [phone] ba [phone] ba [phone] [link]');
  });
  it('pairs the customer messages before a TEAM reply; AI replies and attachments are not examples', () => {
    const pairs = buildPairs([
      m('a', 'in', 'customer', 'Cerelac er dam koto?', 0), m('a', 'in', 'customer', '8 mash er baby', 1), m('a', 'out', 'team', 'Apu 500g Cerelac ৳650, 8 mash er jonno perfect', 3),
      m('a', 'in', 'customer', 'ok order dibo', 5), m('a', 'out', 'ai', 'AI reply should not be learned from at all', 6),
      m('b', 'in', 'customer', '(attachment: image)', 0), m('b', 'out', 'team', 'Ji apu dekhlam, ektu opekkha korun', 2),
      m('c', 'out', 'team', 'Ager din er kotha, kono proshno nai ei reply te', 0),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ q: 'Cerelac er dam koto? 8 mash er baby', a: 'Apu 500g Cerelac ৳650, 8 mash er jonno perfect' });
  });
  it('finds the most similar past question', () => {
    const pairs = buildPairs([
      m('a', 'in', 'customer', 'delivery charge koto dhaka te', 0), m('a', 'out', 'team', 'Dhaka te delivery 60 taka, 2 dine pabeen', 2),
      m('b', 'in', 'customer', 'cerelac e ki ki upadan ache', 0), m('b', 'out', 'team', 'Chal, dal, gajor — ar kichu na apu', 2),
    ]);
    const idx = buildIndex(pairs.map((p, i) => ({ id: 'p' + i, data: { title: '', src: '', chunks: [{ p: '', t: p.q }] } })), []);
    const hit = kbSearch(idx, 'dhaka delivery charge koto', 2)[0];
    expect(pairs[Number(hit.id.slice(1).split('_')[0])].a).toMatch(/Dhaka te delivery 60/);
  });
});

describe('website knowledge', () => {
  it('keeps same-site page links, drops cart/login/files/other hosts', () => {
    const html = '<a href="/product/cerelac/">a</a><a href="https://www.kidscarebd.com/about#x">b</a><a href="/cart">c</a><a href="/img/a.jpg">d</a><a href="https://facebook.com/x">e</a><a href="/product/cerelac?ref=1">f</a>';
    expect(pageLinks(html, new URL('https://kidscarebd.com')).sort()).toEqual(['https://kidscarebd.com/product/cerelac', 'https://www.kidscarebd.com/about'].sort());
  });
  it('reads sitemap locs and splits long text into passages', () => {
    expect(sitemapUrls('<urlset><url><loc>https://a.com/x</loc></url><url><loc> https://a.com/y?a=1&amp;b=2 </loc></url></urlset>')).toEqual(['https://a.com/x', 'https://a.com/y?a=1&b=2']);
    const long = Array.from({ length: 40 }, (_, i) => 'line number ' + i + ' with some words in it').join('\n');
    const parts = chunkText(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 760)).toBe(true);
    expect(parts.join('\n')).toBe(long);
  });
});

describe('prompt', () => {
  it('puts website passages and past replies in, with the "never copy prices from old replies" rule', () => {
    const p = systemPrompt('Bot', 'PRODUCT: Cerelac ৳650', 'be polite', { web: [{ title: 'Cerelac', url: 'https://kidscarebd.com/cerelac', text: 'Homemade Cerelac, 6 mash+' }], past: [{ q: 'dam koto', a: 'Apu ৳650' }] });
    expect(p).toContain('WEBSITE (our site');
    expect(p).toContain('https://kidscarebd.com/cerelac');
    expect(p).toContain('PAST REPLIES (our team');
    expect(p).toContain('Customer: dam koto');
    expect(p).toMatch(/Do NOT copy a price, offer, date or stock/);
    expect(systemPrompt('Bot', 'K', 'R')).not.toContain('WEBSITE (our site');
  });
  it('the lookup text is the last 3 customer messages, so a bare "ok" still has its question', () => {
    expect(queryFrom([{ dir: 'in', text: 'cerelac dam' }, { dir: 'out', text: 'x' }, { dir: 'in', text: '8 mash' }, { dir: 'in', text: 'ok' }])).toBe('cerelac dam 8 mash ok');
  });
});
