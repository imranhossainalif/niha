import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { saveMedia } from '@/lib/social/media';

export const maxDuration = 300;

/** Upload a photo/video for a post (multipart field "file"). Returns its public URL. */
export const POST = handle(async (req: Request) => {
  await needPrincipal(req, 'write');
  const fd = await req.formData();
  const file = fd.get('file');
  if (!(file instanceof File)) throw Object.assign(new Error('file lagbe'), { status: 400, code: 'bad_request' });
  const h = req.headers, host = h.get('x-forwarded-host') || h.get('host');
  const origin = host ? (h.get('x-forwarded-proto') || 'https') + '://' + host : new URL(req.url).origin;
  return json(await saveMedia(file, origin), 201);
});
