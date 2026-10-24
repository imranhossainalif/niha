import { handle, json } from '@/lib/http';
import { isFull } from '@/lib/access';
import { inboxPrincipal } from '@/lib/inbox/guard';
import { removeFile, saveUpload } from '@/lib/inbox/files';

export const maxDuration = 120;

/** Upload a price list / catalogue / policy for the AI (multipart "file"): PDF, TXT, MD or CSV. Reading it happens in the background. */
export const POST = handle(async (req: Request) => {
  const p = await inboxPrincipal(req, true);
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  const file = (await req.formData()).get('file');
  if (!(file instanceof File)) throw Object.assign(new Error('file lagbe'), { status: 400, code: 'bad_request' });
  return json(await saveUpload(file, p.kind === 'user' ? p.email : 'system'), 201);
});

export const DELETE = handle(async (req: Request) => {
  const p = await inboxPrincipal(req, true);
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{16}$/.test(id)) throw Object.assign(new Error('Bad id'), { status: 400, code: 'bad_request' });
  await removeFile(id);
  return json({ deleted: true });
});
