import type { Config } from 'tailwindcss';
// Colors must match src/app/globals.css :root (and public/legacy/redesign.css).
// tests/design-tokens.test.ts checks they agree — the old accent #C9661C (orange)
// contradicted the CSS --accent green #13896F, so bg-accent and btn-primary disagreed.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: '#13896f',
        good: '#0e8a62',
        warn: '#b8650e',
        bad: '#c2363f',
        info: '#2f6fd1',
        biz: {
          kidscare: '#c9661c',
          insafia: '#a34b3b',
          lrf: '#13896f',
          localservicehq: '#16a34a',
          personalbrand: '#0891b2',
          itevs: '#1f6fb8',
          hajj: '#7c3aed',
          others: '#5f7a74',
          personal: '#6a4fc4',
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Figtree', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
