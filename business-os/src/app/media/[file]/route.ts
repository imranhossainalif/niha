import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { mediaFile } from '@/lib/social/media';

/** Public media for posts (Facebook/Instagram download it from here). Supports Range for video. */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const m = await mediaFile((await params).file);
  if (!m) return new Response('Not found', { status: 404 });
  const headers: Record<string, string> = { 'content-type': m.mime, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, m.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), m.size - 1) : m.size - 1;
    if (start > end || start >= m.size) return new Response(null, { status: 416, headers: { 'content-range': 'bytes */' + m.size } });
    return new Response(Readable.toWeb(createReadStream(m.path, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${m.size}`, 'content-length': String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(m.path)) as ReadableStream, { headers: { ...headers, 'content-length': String(m.size) } });
}
export const HEAD = async (req: Request, ctx: { params: Promise<{ file: string }> }) => {
  const r = await GET(req, ctx); r.body?.cancel(); return new Response(null, { status: r.status, headers: r.headers });
};
