import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { isFull } from '@/lib/access';
import { inboxPrincipal } from '@/lib/inbox/guard';
import { decide } from '@/lib/inbox/ai';
import { contextFor } from '@/lib/inbox/context';
import { getConfig, knowledgeFor, type InboxMessage } from '@/lib/inbox/store';

export const maxDuration = 120;
const Body = z.object({ messages: z.array(z.object({ dir: z.enum(['in', 'out']), text: z.string().max(2000) })).min(1).max(12) });

/** Try the AI on a made-up conversation: same knowledge, website and past-reply lookup as a real message, but nothing is sent or saved. */
export const POST = handle(async (req: Request) => {
  const p = await inboxPrincipal(req, true);
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin only'), { status: 403, code: 'permission_denied' });
  const b = Body.parse(await req.json());
  const history = b.messages.map((m, i) => ({ conv: 'test', channel: 'messenger', dir: m.dir, by: m.dir === 'in' ? 'customer' : 'ai', text: m.text, ts: new Date(Date.now() - (b.messages.length - i) * 60000).toISOString(), mid: 't' + i, status: 'open', business: 'kidscare' })) as InboxMessage[];
  const cfg = await getConfig();
  const { kb, rules } = await knowledgeFor(cfg);
  const ctx = await contextFor(history);
  const decision = await decide(cfg.agent_name || 'Kids Care Assistant', kb, rules, history, ctx.extras);
  return json({ decision, used: { web: ctx.web.map((h) => ({ title: h.title, url: h.url, text: h.text.slice(0, 300) })), past: ctx.past } });
});
