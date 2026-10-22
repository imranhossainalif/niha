// Uploaded post media (photo/video). Kept on disk (MEDIA_DIR, a Docker volume) and served publicly at /media/<id>,
// because Instagram and Facebook fetch the file from a public URL when publishing. Ids are random, so they can't be guessed.
import { randomBytes } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), 'media');
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov' };
export const MIME: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
export const MAX_BYTES = { image: 8 * 1024 * 1024, video: 300 * 1024 * 1024 };

export const publicBase = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
/** id must be <24 hex>.<ext> — anything else (paths, dots) is refused. */
export const safeId = (id: string) => (/^[a-f0-9]{24}\.(jpg|png|webp|gif|mp4|mov)$/.test(id) ? id : null);

/** `origin`: used when PUBLIC_URL isn't set (Meta needs a full https URL). */
export async function saveMedia(file: File, origin = '') {
  const ext = EXT[file.type];
  if (!ext) throw Object.assign(new Error('Ei file chole na: JPG, PNG, WEBP, GIF, MP4 ba MOV din'), { status: 400, code: 'bad_request' });
  const kind = file.type.startsWith('video/') ? 'video' : 'image';
  if (file.size > MAX_BYTES[kind]) throw Object.assign(new Error(kind === 'video' ? 'Video 300 MB er beshi' : 'Chobi 8 MB er beshi (Instagram er limit)'), { status: 400, code: 'bad_request' });
  await mkdir(MEDIA_DIR, { recursive: true });
  const id = randomBytes(12).toString('hex') + '.' + ext;
  await writeFile(path.join(MEDIA_DIR, id), Buffer.from(await file.arrayBuffer()));
  return { id, url: (publicBase() || origin.replace(/\/$/, '')) + '/media/' + id, mime: file.type, size: file.size, kind };
}
export async function mediaFile(id: string) {
  const ok = safeId(id); if (!ok) return null;
  const p = path.join(MEDIA_DIR, ok);
  const s = await stat(p).catch(() => null);
  return s ? { path: p, size: s.size, mime: MIME[ok.split('.')[1]] } : null;
}
