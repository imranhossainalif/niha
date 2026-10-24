import { describe, expect, it } from 'vitest';
import { formatReply } from '@/lib/inbox/format';
import { systemPrompt } from '@/lib/inbox/ai';
import { productBlock } from '@/lib/inbox/products';

describe('reply layout', () => {
  it('splits one wall of text into short paragraphs', () => {
    const wall = 'জি আপু, আমাদের রাজমা খিচুড়ি আছে। এটি ১ বছরের বাচ্চার জন্য ভালো। চাল, ডাল আর সবজি দিয়ে বানানো হয়। কোনো প্রিজারভেটিভ নেই। আর কিছু জানতে চান আপু? আমরা সবসময় আছি আপনার পাশে।';
    const out = formatReply(wall);
    expect(out.split('\n\n').length).toBeGreaterThanOrEqual(3);
    expect(out.replace(/\s+/g, ' ')).toBe(wall);
  });
  it('puts a blank line between a paragraph and a list and the closing question; one item per line', () => {
    const out = formatReply('জি আপু, আছে।\n• ২৫০ গ্রাম — ৳৩৫০\n• ৫০০ গ্রাম — ৳৭০০\nকোনটা নেবেন আপু?');
    expect(out).toBe('জি আপু, আছে।\n\n• ২৫০ গ্রাম — ৳৩৫০\n• ৫০০ গ্রাম — ৳৭০০\n\nকোনটা নেবেন আপু?');
  });
  it('keeps already good layout, removes markdown and extra blank lines', () => {
    expect(formatReply('**জি আপু**\n\n\n\nধন্যবাদ')).toBe('জি আপু\n\nধন্যবাদ');
    expect(formatReply('# শিরোনাম\nলেখা')).toBe('শিরোনাম\n\nলেখা');
    expect(formatReply('')).toBe('');
    expect(formatReply('১। প্রথম\n২। দ্বিতীয়')).toBe('১। প্রথম\n২। দ্বিতীয়');
  });
});

describe('prompt rules for the page replies', () => {
  const p = systemPrompt('Bot', 'K', 'R');
  it('everyone is আপু', () => { expect(p).toContain('Always address the customer as "আপু"'); expect(p).toContain('never use "ভাইয়া"'); expect(p).not.toMatch(/"ভাইয়া" for a man/); });
  it('empty line between paragraphs is required', () => expect(p).toContain('EMPTY LINE between every paragraph'));
  it('information questions get no price unless the customer asks for it', () => {
    expect(p).toContain('ANSWER ONLY WHAT WAS ASKED');
    expect(p).toContain('Do NOT mention any price');
    expect(p).not.toContain('ALWAYS add the matching product');
  });
  it('tells the AI the standard wait message exists', () => expect(p).toContain('please wait, a team member will reply'));
});

describe('product details for the AI', () => {
  it('adds the shop description (ingredients) under the product line, trimmed', () => {
    const b = productBlock({ name: 'রাজমা খিচুড়ি', url: 'https://s.test/k', currency: 'BDT', variants: [{ label: '২৫০ গ্রাম', price: 280 }], description: 'উপাদান: চাল, মুগ ডাল, রাজমা, গাজর।   কোনো প্রিজারভেটিভ নেই।', source: 'woocommerce' }, 40);
    expect(b).toBe('• রাজমা খিচুড়ি: ২৫০ গ্রাম ৳280 — https://s.test/k\n   Bibaron (shop theke): উপাদান: চাল, মুগ ডাল, রাজমা, গাজর। কোনো …');
    expect(productBlock({ name: 'A', url: '', currency: 'BDT', variants: [{ label: '', price: 1 }], description: 'x', source: 'jsonld' }, 0)).toBe('• A: ৳1');
  });
});
