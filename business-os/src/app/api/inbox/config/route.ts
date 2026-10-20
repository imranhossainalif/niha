import { handle, json } from '@/lib/http';
import { inboxPrincipal } from '@/lib/inbox/guard';
import { getConfig, saveConfig } from '@/lib/inbox/store';

export const GET = handle(async (req: Request) => {
  await inboxPrincipal(req);
  return json(await getConfig());
});

/** Merge config fields: ai_on, agent_name, kb, rules, ... */
export const PATCH = handle(async (req: Request) => {
  await inboxPrincipal(req, true);
  const body = await req.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Body must be an object'), { status: 400, code: 'bad_request' });
  const s = await saveConfig(body);
  return json(s.data);
});
