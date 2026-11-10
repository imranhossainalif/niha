import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { needOutreach, saveSettings } from '@/lib/outreach/server';

/** Replace the Outreach option lists, accounts, limits and custom fields (owner/admin). */
export const PUT = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  needOutreach(p, true);
  return json({ settings: await saveSettings(p, await req.json()) });
});
