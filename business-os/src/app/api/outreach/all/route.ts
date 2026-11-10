import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { addDays, dayOf, OUTREACH_BIZ, type Activity } from '@/lib/outreach/core';
import { allProspects, loadSettings, needOutreach, who } from '@/lib/outreach/server';

/** Everything the Outreach page needs in one call: prospects, settings and the activity log since ?since=YYYY-MM-DD (default 200 days). */
export const GET = handle(async (req: Request) => {
  const p = await needPrincipal(req);
  needOutreach(p);
  const today = dayOf(new Date().toISOString());
  const since = new URL(req.url).searchParams.get('since') || addDays(today, -200);
  const [prospects, settings, acts] = await Promise.all([
    allProspects(p), loadSettings(p),
    db(p).collection('outreach_activities').where('business', '==', OUTREACH_BIZ).where('day', '>=', since).limit(50000).get(),
  ]);
  const backup = (await db(p).collection('outreach_settings').doc('backup').get())?.data ?? null;
  const activities = acts.map((a) => ({ ...(a.data as Activity), id: a.id }));
  return json({ prospects, settings, activities, today, backup, me: who(p), canAdmin: isFull(p) });
});
