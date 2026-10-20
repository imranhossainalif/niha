import type { Config } from 'tailwindcss';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { accent: '#C9661C' } } },
  plugins: [],
} satisfies Config;
