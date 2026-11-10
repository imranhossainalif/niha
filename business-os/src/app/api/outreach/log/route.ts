import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { loadSettings, logActivity, needOutreach } from '@/lib/outreach/server';

/** Log an action on a prospect: {prospect, type, platform?, sender?, note?, sentiment?, template?, at?, next_action?, next_due?}. */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  needOutreach(p, true);
  return json(await logActivity(p, await req.json(), await loadSettings(p)), 201);
});
