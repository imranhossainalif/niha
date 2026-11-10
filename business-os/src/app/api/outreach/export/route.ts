import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { OUTREACH_BIZ, type Activity } from '@/lib/outreach/core';
import { exportTables } from '@/lib/outreach/export';
import { allProspects, loadSettings, needOutreach, who } from '@/lib/outreach/server';

export const maxDuration = 120;

/**
 * Everything in the Outreach CRM as ready-to-write tables (Prospects, Activity log, Daily numbers): the Google Sheet backup
 * (deploy/outreach-backup.gs) calls this every hour with ?mark=1, which records the time so the CRM can show "last backup".
 */
export const GET = handle(async (req: Request) => {
  const p = await needPrincipal(req);
  needOutreach(p);
  const [prospects, settings, acts] = await Promise.all([allProspects(p), loadSettings(p), db(p).collection('outreach_activities').where('business', '==', OUTREACH_BIZ).limit(200000).get()]);
  const t = exportTables(prospects, acts.map((a) => ({ ...(a.data as Activity), id: a.id })), settings);
  const at = new Date().toISOString();
  if (new URL(req.url).searchParams.get('mark') === '1') await db(p).collection('outreach_settings').doc('backup').set({ business: OUTREACH_BIZ, at, by: who(p), prospects: t.prospects.rows.length, activities: t.activities.rows.length }).catch(() => null);
  return json({ at, counts: { prospects: t.prospects.rows.length, activities: t.activities.rows.length }, ...t });
});
