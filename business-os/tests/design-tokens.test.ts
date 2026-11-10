import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Design tokens must agree across all four places that define them:
 * tailwind.config.ts, src/app/globals.css, public/legacy/redesign.css and
 * src/components/social/social.css — plus src/lib/business.ts, which owns the
 * business colors. This test exists because the dashboard once shipped two
 * different accents at once (Tailwind orange #C9661C vs CSS green #13896F)
 * and two different colors per business. See docs/DESIGN_SYSTEM.md.
 */
const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const varValue = (css: string, name: string): string | null => {
  const m = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim().toLowerCase() : null;
};
// First :root block only — the dark block inside @media comes later.
const lightRoot = (css: string): string => {
  const m = css.match(/:root\s*\{([\s\S]*?)\}/);
  return m ? m[1] : '';
};
const smBlock = (css: string): string => {
  const m = css.match(/\.sm\s*\{([\s\S]*?)\}/);
  return m ? m[1] : '';
};
const hex = (css: string, key: string): string | null => {
  const m = css.match(new RegExp(`${key}:\\s*'(#[0-9a-fA-F]{6})'`));
  return m ? m[1].toLowerCase() : null;
};

const BIZ_IDS = ['kidscare', 'insafia', 'lrf', 'localservicehq', 'personalbrand', 'itevs', 'hajj', 'others', 'personal'];

describe('design tokens agree everywhere', () => {
  it('accent is the same green in Tailwind, globals, legacy redesign and social', () => {
    const tw = read('tailwind.config.ts');
    const globals = lightRoot(read('src/app/globals.css'));
    const legacy = lightRoot(read('public/legacy/redesign.css'));
    const social = smBlock(read('src/components/social/social.css'));
    expect(hex(tw, 'accent')).toBe('#13896f');
    expect(varValue(globals, 'accent')).toBe('#13896f');
    expect(varValue(legacy, 'accent')).toBe('#13896f');
    expect(varValue(social, 'accent')).toBe('#13896f');
  });

  it('status colors agree across globals, legacy redesign and social', () => {
    const globals = lightRoot(read('src/app/globals.css'));
    const legacy = lightRoot(read('public/legacy/redesign.css'));
    const social = smBlock(read('src/components/social/social.css'));
    for (const name of ['good', 'warn', 'bad', 'info']) {
      const g = varValue(globals, name);
      expect(g).not.toBeNull();
      expect(varValue(legacy, name)).toBe(g);
      expect(varValue(social, name)).toBe(g);
    }
  });

  it('business colors in business.ts match the --biz-* tokens everywhere', () => {
    const biz = read('src/lib/business.ts');
    const globals = lightRoot(read('src/app/globals.css'));
    const legacy = lightRoot(read('public/legacy/redesign.css'));
    const social = smBlock(read('src/components/social/social.css'));
    for (const id of BIZ_IDS) {
      const m = biz.match(new RegExp(`id: '${id}', name: '[^']+', color: '(#[0-9a-fA-F]{6})'`));
      expect(m, `business.ts must list ${id}`).not.toBeNull();
      const color = m![1].toLowerCase();
      expect(varValue(globals, 'biz-' + id)).toBe(color);
      expect(varValue(legacy, 'biz-' + id)).toBe(color);
      expect(varValue(social, 'biz-' + id)).toBe(color);
    }
  });

  it('Settings uses token vars, not a fourth hardcoded status palette', () => {
    const settings = read('src/app/settings/page.tsx');
    for (const old of ['#d64545', '#d99a1e', '#1f9d6b', '#8a9993']) {
      expect(settings).not.toContain(old);
    }
    expect(settings).toContain('var(--bad)');
    expect(settings).toContain('var(--warn)');
    expect(settings).toContain('var(--good)');
  });
});
