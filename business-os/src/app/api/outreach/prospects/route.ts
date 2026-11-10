import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { allProspects, createProspect, loadSettings, needOutreach } from '@/lib/outreach/server';

/** Add a prospect. A matching profile link/email/phone returns 409 with the existing one unless force=true. */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  needOutreach(p, true);
  const b = await req.json();
  const r = await createProspect(p, b, await loadSettings(p), await allProspects(p), !!b.force);
  if (r.duplicate) return json({ error: { code: 'duplicate', message: 'This prospect already exists: ' + r.duplicate.name }, duplicate: r.duplicate }, 409);
  return json({ prospect: r.prospect }, 201);
});
