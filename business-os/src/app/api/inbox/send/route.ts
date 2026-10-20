import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { inboxPrincipal } from '@/lib/inbox/guard';
import { teamSend } from '@/lib/inbox/process';

const Body = z.object({ conv: z.string().min(1), text: z.string().min(1).max(8000), status: z.enum(['open', 'done']).optional() });

export const POST = handle(async (req: Request) => {
  await inboxPrincipal(req, true);
  const b = Body.parse(await req.json());
  return json(await teamSend(b.conv, b.text, b.status));
});
