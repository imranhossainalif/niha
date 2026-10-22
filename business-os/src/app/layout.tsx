import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: { default: 'EasyFounder', template: '%s · EasyFounder' },
  description: 'EasyFounder — Imran er shob business ek jaygay',
  icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/brand/favicon-32.png', type: 'image/png' }], apple: '/brand/apple-touch-icon.png' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
