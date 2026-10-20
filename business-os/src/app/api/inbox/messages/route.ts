import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { inboxPrincipal } from '@/lib/inbox/guard';
import { recentMessages, updateMessage } from '@/lib/inbox/store';

/** Latest messages (newest first). */
export const GET = handle(async (req: Request) => {
  await inboxPrincipal(req);
  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit')) || 500, 2000);
  const rows = await recentMessages(limit);
  return json({ messages: rows.map((r) => ({ key: r.id, ...r.data })) });
});

const Patch = z.object({ mid: z.string(), status: z.enum(['open', 'waiting', 'done']).optional(), human: z.boolean().optional() });
/** Mark a message (usually the conversation's last one) open/waiting/done. */
export const PATCH = handle(async (req: Request) => {
  await inboxPrincipal(req, true);
  const { mid, ...patch } = Patch.parse(await req.json());
  const s = await updateMessage(mid, patch);
  return json({ key: s.id, ...s.data });
});
