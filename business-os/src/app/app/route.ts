import fs from 'node:fs/promises';
import path from 'node:path';
import { requestPrincipal } from '@/lib/session';
import { legacyDocument } from '@/lib/legacy/patches';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let cached: { mtime: number; html: string } | null = null;

/** The full legacy dashboard (every tab), running against this server through /legacy/bos-shim.js. */
export async function GET(req: Request) {
  const p = await requestPrincipal(req);
  // Relative Location on purpose: behind the Caddy proxy `req.url` is built from PORT/hostname
  // (https://localhost:3000), so an absolute redirect sent the browser to the server's own localhost.
  if (!p) return new Response(null, { status: 302, headers: { location: '/login?next=/app' } });
  const file = path.join(process.cwd(), 'legacy', 'business-os.html');
  const st = await fs.stat(file);
  if (!cached || cached.mtime !== st.mtimeMs) cached = { mtime: st.mtimeMs, html: legacyDocument(await fs.readFile(file, 'utf8')) };
  return new Response(cached.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
