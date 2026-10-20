import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatches, legacyDocument, PATCHES } from '@/lib/legacy/patches';
import { htmlToText } from '@/lib/web/extract';
import { docBusiness, LEGACY_COLS } from '@/lib/business';

const legacy = fs.readFileSync(path.join(__dirname, '..', 'legacy', 'business-os.html'), 'utf8');

describe('legacy page', () => {
  it('every patch applies exactly once to the spec file', () => {
    const out = legacyDocument(legacy);
    for (const p of PATCHES) expect(out).toContain(p.replace);
    expect(out.startsWith('<!doctype html>')).toBe(true);
    expect(out.indexOf('/legacy/bos-shim.js')).toBeLessThan(out.indexOf('d3-7.9.0.min.js'));
    expect(out).not.toContain('cdnjs.cloudflare.com');
  });
  it('a patch that no longer matches fails loudly', () => {
    expect(() => applyPatches('nothing here')).toThrow(/matched 0 times/);
  });
  it('LEGACY_COLS matches the COLS list in the legacy file', () => {
    const m = legacy.match(/const COLS = (\[[^\]]+\]);/);
    expect(JSON.parse(m![1].replace(/'/g, '"'))).toEqual(LEGACY_COLS);
  });
});

describe('docBusiness', () => {
  it('maps docs to businesses', () => {
    expect(docBusiness('tasks', 'x', { business: 'lrf' })).toBe('lrf');
    expect(docBusiness('budgets', 'x', { business: 'all' })).toBeNull();
    expect(docBusiness('pl_kidscare', '2026-09', {})).toBe('kidscare');
    expect(docBusiness('ai_chat', 'insafia', {})).toBe('insafia');
    expect(docBusiness('settings', 'engine_itevs', {})).toBe('itevs');
    expect(docBusiness('settings', 'global', {})).toBeNull();
    expect(docBusiness('fixed_costs', 'f', {})).toBe('kidscare');
    expect(docBusiness('kb_docs', 'k', {})).toBeNull();
  });
});

describe('website → text', () => {
  it('keeps the readable content and drops scripts, nav and footer', () => {
    const t = htmlToText('<html><head><title>Kids Care &amp; More</title><style>x{}</style></head><body><nav>Menu</nav><main><h1>Cerelac</h1><p>Dam ৳1,200&nbsp;only</p><ul><li>6 mash+</li></ul><table><tr><td>500g</td><td>৳650</td></tr></table></main><script>alert(1)</script><footer>©</footer></body></html>');
    expect(t.title).toBe('Kids Care & More');
    expect(t.text).toContain('Cerelac');
    expect(t.text).toContain('Dam ৳1,200 only');
    expect(t.text).toContain('- 6 mash+');
    expect(t.text).toContain('500g | ৳650');
    expect(t.text).not.toMatch(/alert|Menu|x\{\}/);
  });
});

import { buildIndex, kbSearch } from '@/lib/kb/bm25';
describe('knowledge BM25', () => {
  const idx = buildIndex(
    [{ id: 'godfather', data: { title: 'Godfather Offer', src: 'go.pdf', chunks: [{ p: '3', t: 'Value equation: dream outcome times perceived likelihood divided by time delay and effort.' }, { p: '4', t: 'Scarcity and urgency for close-ended campaigns.' }] } }],
    [{ id: 'n1', data: { title: 'Kids Care tripwire', text: 'Trial pack ৳130 as tripwire offer', business: 'kidscare' } }],
  );
  it('ranks the matching passage first', () => {
    const h = kbSearch(idx, 'value equation time delay');
    expect(h[0]).toMatchObject({ source: 'Godfather Offer', pages: '3', kind: 'course' });
  });
  it('finds own notes and ignores stop words', () => {
    expect(kbSearch(idx, 'tripwire', 6, 'kidscare')[0].kind).toBe('note');
    expect(kbSearch(idx, 'the and ki')).toEqual([]);
  });
});
