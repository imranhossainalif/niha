import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { cleanProspect, type Activity, type Prospect } from '@/lib/outreach/core';
import { allProspects, findDup, loadSettings, needOutreach } from '@/lib/outreach/server';

type Ctx = { params: Promise<{ id: string }> };
const nf = () => Object.assign(new Error('Prospect pawa jayni'), { status: 404, code: 'not_found' });

/** One prospect with its full timeline. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const p = await needPrincipal(req);
  needOutreach(p);
  const s = await db(p).collection('outreach_prospects').doc(id).get();
  if (!s) throw nf();
  const acts = await db(p).collection('outreach_activities').where('prospect', '==', id).limit(2000).get();
  const activities = acts.map((a) => ({ ...(a.data as Activity), id: a.id })).sort((a, b) => b.at.localeCompare(a.at));
  return json({ prospect: { ...(s.data as Prospect), id: s.id, version: s.version }, activities });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const p = await needPrincipal(req, 'write');
  needOutreach(p, true);
  const ref = db(p).collection('outreach_prospects').doc(id);
  const s = await ref.get();
  if (!s) throw nf();
  const b = await req.json();
  const c = cleanProspect(b, await loadSettings(p));
  const next = { ...(s.data as Prospect), ...c };
  if (c.profiles || c.email || c.phone) {
    const dup = b.force ? undefined : findDup(await allProspects(p), next, id);
    if (dup) return json({ error: { code: 'duplicate', message: 'Ei link/email onno prospect e ache: ' + dup.name }, duplicate: dup }, 409);
  }
  const saved = await ref.set(JSON.parse(JSON.stringify(next)));
  return json({ prospect: { ...next, id, version: saved.version } });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const p = await needPrincipal(req, 'write');
  needOutreach(p, true);
  const acts = await db(p).collection('outreach_activities').where('prospect', '==', id).limit(5000).get();
  for (const a of acts) await db(p).collection('outreach_activities').doc(a.id).delete();
  await db(p).collection('outreach_prospects').doc(id).delete();
  return json({ ok: true });
});
