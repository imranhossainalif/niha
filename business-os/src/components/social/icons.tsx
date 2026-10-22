// Inline SVG icons: the four network logos (simplified) and the few UI icons the Social screens use.
import type { CSSProperties } from 'react';

export type Net = 'facebook' | 'instagram' | 'youtube' | 'tiktok';
export const NETS: Net[] = ['facebook', 'instagram', 'youtube', 'tiktok'];
export const NET_NAME: Record<Net, string> = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok' };
export const NET_COLOR: Record<Net, string> = { facebook: '#1877F2', instagram: '#D6249F', youtube: '#FF0000', tiktok: '#111111' };

export function NetLogo({ net, size = 20, style }: { net: Net | string; size?: number; style?: CSSProperties }) {
  const s = { width: size, height: size, display: 'inline-block', flex: 'none', ...style };
  if (net === 'instagram') return (
    <svg viewBox="0 0 24 24" style={s} aria-label="Instagram"><defs><radialGradient id="igg" cx="30%" cy="107%" r="150%"><stop offset="0" stopColor="#fdf497" /><stop offset=".45" stopColor="#fd5949" /><stop offset=".6" stopColor="#d6249f" /><stop offset=".9" stopColor="#285AEB" /></radialGradient></defs>
      <rect width="24" height="24" rx="6.5" fill="url(#igg)" /><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" strokeWidth="1.8" /><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" strokeWidth="1.8" /><circle cx="16.3" cy="7.7" r="1" fill="#fff" /></svg>);
  if (net === 'youtube') return (
    <svg viewBox="0 0 24 24" style={s} aria-label="YouTube"><rect width="24" height="24" rx="6.5" fill="#FF0000" /><path d="M9.6 8.2v7.6l6.3-3.8z" fill="#fff" /></svg>);
  if (net === 'tiktok') return (
    <svg viewBox="0 0 24 24" style={s} aria-label="TikTok"><rect width="24" height="24" rx="6.5" fill="#111" />
      <path d="M13.6 5.5h2.1c.2 1.5 1.2 2.6 2.7 2.8v2.1c-1 0-2-.3-2.8-.9v4.3a3.9 3.9 0 1 1-3.9-3.9c.2 0 .4 0 .6.1v2.1a1.8 1.8 0 1 0 1.3 1.7z" fill="#25F4EE" transform="translate(-.6 -.4)" />
      <path d="M13.6 5.5h2.1c.2 1.5 1.2 2.6 2.7 2.8v2.1c-1 0-2-.3-2.8-.9v4.3a3.9 3.9 0 1 1-3.9-3.9c.2 0 .4 0 .6.1v2.1a1.8 1.8 0 1 0 1.3 1.7z" fill="#FE2C55" transform="translate(.6 .4)" />
      <path d="M13.6 5.5h2.1c.2 1.5 1.2 2.6 2.7 2.8v2.1c-1 0-2-.3-2.8-.9v4.3a3.9 3.9 0 1 1-3.9-3.9c.2 0 .4 0 .6.1v2.1a1.8 1.8 0 1 0 1.3 1.7z" fill="#fff" /></svg>);
  return (
    <svg viewBox="0 0 24 24" style={s} aria-label="Facebook"><rect width="24" height="24" rx="6.5" fill="#1877F2" /><path d="M13.3 19v-6h2l.3-2.4h-2.3V9.1c0-.7.2-1.2 1.2-1.2h1.2V5.8c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.8H8.9V13h2v6z" fill="#fff" /></svg>);
}

const P: Record<string, string> = {
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  chart: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
  spark: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8',
  plus: 'M12 5v14M5 12h14', chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6', close: 'M6 6l12 12M18 6L6 18',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 1 0 0-.01', clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', refresh: 'M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4',
  check: 'M5 12l5 5 9-10', alert: 'M12 8v5M12 16.5v.5M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16', send: 'M4 12l16-8-6 16-3-7z', edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  comment: 'M4 5h16v11H8l-4 4z', share: 'M14 5l6 6-6 6M20 11H9a5 5 0 0 0-5 5v2', bookmark: 'M6 4h12v17l-6-4-6 4z', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', copy: 'M9 9h11v11H9zM5 15V4h11',
};
export function Icon({ name, size = 16, style, stroke = 2 }: { name: keyof typeof P | string; size?: number; style?: CSSProperties; stroke?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', ...style }} aria-hidden="true"><path d={P[name] || ''} /></svg>;
}
