// Server side of the Outreach CRM: access check, settings doc, and the writes the routes share.
import { db } from '../db';
import { canReadDoc, canWriteDoc, isFull, type Principal } from '../access';
import { applyActivity, cleanProspect, dayOf, dupKeys, mergeSettings, OUTREACH_BIZ, rebuild, type Activity, type Prospect, type Settings } from './core';

const fail = (status: number, code: string, msg: string) => Object.assign(new Error(msg), { status, code });
export const who = (p: Principal) => (p.kind === 'user' ? p.email : 'system');

export function needOutreach(p: Principal, write = false) {
  if (!canReadDoc(p, 'outreach_prospects', OUTREACH_BIZ)) throw fail(403, 'permission_denied', 'You do not have access to Outreach');
  if (write && !canWriteDoc(p, 'outreach_prospects', OUTREACH_BIZ)) throw fail(403, 'permission_denied', 'You do not have permission to edit Outreach');
}
export async function loadSettings(p: Principal): Promise<Settings> {
  const s = await db(p).collection('outreach_settings').doc('main').get();
  return mergeSettings(s?.data as Partial<Settings> | undefined);
}
export async function saveSettings(p: Principal, body: Partial<Settings>): Promise<Settings> {
  if (!isFull(p)) throw fail(403, 'permission_denied', 'Only an owner or admin can change the settings');
  const s = mergeSettings(body);
  await db(p).collection('outreach_settings').doc('main').set({ ...s, business: OUTREACH_BIZ, updated_at: new Date().toISOString(), updated_by: who(p) });
  return s;
}
export async function allProspects(p: Principal): Promise<Prospect[]> {
  const rows = await db(p).collection('outreach_prospects').where('business', '==', OUTREACH_BIZ).limit(20000).get();
  return rows.map((r) => ({ ...(r.data as Prospect), id: r.id, version: r.version }));
}
/** Existing prospect that shares a profile link, email or phone with this one. */
export function findDup(list: Prospect[], cand: Pick<Prospect, 'profiles' | 'email' | 'phone'>, exceptId?: string): Prospect | undefined {
  const keys = new Set(dupKeys(cand));
  if (!keys.size) return undefined;
  return list.find((x) => x.id !== exceptId && dupKeys(x).some((k) => keys.has(k)));
}
export async function createProspect(p: Principal, body: Record<string, any>, s: Settings, existing: Prospect[], force = false): Promise<{ prospect?: Prospect; duplicate?: Prospect }> {
  const c = cleanProspect(body, s);
  if (!c.name && !c.company) throw fail(400, 'bad_request', 'Enter a name or a business name');
  const profiles = c.profiles || [];
  const dup = force ? undefined : findDup(existing, { profiles, email: c.email, phone: c.phone });
  if (dup) return { duplicate: dup };
  const doc: Prospect = { stage: 'cold', reply_status: 'none', sales_stage: 'prospect', ...c, name: c.name || c.company || '', profiles, source: c.source || profiles[0]?.platform || '', owner: c.owner || who(p), business: OUTREACH_BIZ, created_at: new Date().toISOString(), created_by: who(p), touches: 0 };
  const snap = await db(p).collection('outreach_prospects').add(doc as unknown as Record<string, unknown>);
  return { prospect: { ...doc, id: snap.id, version: snap.version } };
}
/** Log one action: writes the activity row and moves the prospect's state. */
export async function logActivity(p: Principal, body: Record<string, any>, s: Settings): Promise<{ prospect: Prospect; activity: Activity }> {
  const ref = db(p).collection('outreach_prospects').doc(String(body.prospect || ''));
  const snap = await ref.get();
  if (!snap) throw fail(404, 'not_found', 'Prospect not found');
  const at = body.at && !isNaN(Date.parse(body.at)) ? new Date(body.at).toISOString() : new Date().toISOString();
  const a0: Activity = { business: OUTREACH_BIZ, prospect: snap.id, type: String(body.type || 'note').slice(0, 40), platform: body.platform ? String(body.platform).slice(0, 40) : undefined, at, day: dayOf(at), by: who(p),
    sender: body.sender ? String(body.sender).slice(0, 60) : undefined, note: body.note ? String(body.note).slice(0, 3000) : undefined, sentiment: body.sentiment ? String(body.sentiment).slice(0, 40) : undefined, template: body.template ? String(body.template).slice(0, 60) : undefined };
  const { prospect, activity } = applyActivity(snap.data as Prospect, a0, s);
  if ('next_action' in body) prospect.next_action = String(body.next_action || '').slice(0, 300);
  if ('next_due' in body) prospect.next_due = String(body.next_due || '').slice(0, 10);
  const act = await db(p).collection('outreach_activities').add(JSON.parse(JSON.stringify(activity)));
  const { id: _i, version: _v, ...data } = prospect;
  const saved = await ref.set(JSON.parse(JSON.stringify(data)));
  return { prospect: { ...data, id: snap.id, version: saved.version }, activity: { ...activity, id: act.id } };
}
/** Undo one logged action: remove the row and rebuild the prospect's counters from what is left. */
export async function undoActivity(p: Principal, id: string, s: Settings): Promise<Prospect> {
  const aref = db(p).collection('outreach_activities').doc(id);
  const a = await aref.get();
  if (!a) throw fail(404, 'not_found', 'Log entry not found');
  const pid = (a.data as Activity).prospect;
  const ref = db(p).collection('outreach_prospects').doc(pid);
  const snap = await ref.get();
  await aref.delete();
  if (!snap) throw fail(404, 'not_found', 'Prospect not found');
  const rest = await db(p).collection('outreach_activities').where('prospect', '==', pid).limit(5000).get();
  const next = rebuild(snap.data as Prospect, rest.map((r) => r.data as Activity), s);
  const { id: _i, version: _v, ...data } = next;
  const saved = await ref.set(JSON.parse(JSON.stringify(data)));
  return { ...data, id: pid, version: saved.version };
}
