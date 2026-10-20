import { z } from 'zod';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { askAssistant } from '@/lib/ai/agent';
import { db } from '@/lib/db';

export const maxDuration = 300;

const Body = z.object({
  business: z.string(),
  message: z.string().min(1).max(20000).optional(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(40).optional(),
  complex: z.boolean().optional(),
  /** append the exchange to ai_chat/<business> so it shows in the dashboard chat */
  save_chat: z.boolean().optional(),
});

/** Ask a business's AI Assistant (same tools and rules as the dashboard chat). */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  const b = Body.parse(await req.json());
  const history = b.messages ?? (b.message ? [{ role: 'user' as const, content: b.message }] : []);
  if (!history.length) throw Object.assign(new Error('message or messages required'), { status: 400, code: 'bad_request' });
  const r = await askAssistant(p, b.business, history, { complex: b.complex });
  if (b.save_chat) {
    const ref = db(p).collection('ai_chat').doc(b.business);
    const cur = (await ref.get())?.data?.msgs;
    const now = new Date().toISOString();
    const msgs = [...(Array.isArray(cur) ? cur : []), { role: 'user', content: history[history.length - 1].content, at: now }, { role: 'assistant', content: r.text, tools: r.tools, at: now }].slice(-30);
    await ref.set({ business: b.business, msgs, updated_at: now });
  }
  return json(r);
});
