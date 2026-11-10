// Server side of the Outreach CRM: access check, settings doc, and the writes the routes share.
import { ConflictError, db } from '../db';
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
/** Map of duplicate key → prospect, built once for bulk work (a 2,000-row import must not rescan every prospect per row). */
export const keyIndex = (list: Prospect[]) => { const m = new Map<string, Prospect>(); for (const x of list) for (const k of dupKeys(x)) m.set(k, x); return m; };
export function findDup(list: Prospect[], cand: Pick<Prospect, 'profiles' | 'email' | 'phone'>, exceptId?: string): Prospect | undefined {
  const keys = new Set(dupKeys(cand));
  if (!keys.size) return undefined;
  return list.find((x) => x.id !== exceptId && dupKeys(x).some((k) => keys.has(k)));
}
export async function createProspect(p: Principal, body: Record<string, any>, s: Settings, existing: Prospect[], force = false, index?: Map<string, Prospect>): Promise<{ prospect?: Prospect; duplicate?: Prospect }> {
  const c = cleanProspect(body, s);
  if (!c.name && !c.company) throw fail(400, 'bad_request', 'Enter a name or a business name');
  const profiles = c.profiles || [];
  const keys = dupKeys({ profiles, email: c.email, phone: c.phone });
  const dup = force ? undefined : index ? keys.map((k) => index.get(k)).find(Boolean) : findDup(existing, { profiles, email: c.email, phone: c.phone });
  if (dup) return { duplicate: dup };
  const doc: Prospect = { stage: 'cold', reply_status: 'none', sales_stage: 'prospect', ...c, name: c.name || c.company || '', profiles, source: c.source || profiles[0]?.platform || '', owner: c.owner || who(p), business: OUTREACH_BIZ, created_at: new Date().toISOString(), created_by: who(p), touches: 0 };
  const snap = await db(p).collection('outreach_prospects').add(doc as unknown as Record<string, unknown>);
  const made = { ...doc, id: snap.id, version: snap.version };
  if (index) for (const k of keys) index.set(k, made);
  return { prospect: made };
}
/** Run a read-modify-write on one prospect, retrying when another rep saved it in between (two people logging the same prospect must not lose an update). */
async function withProspect<T>(p: Principal, id: string, fn: (cur: Prospect) => { next: Prospect; out: T }): Promise<{ saved: Prospect; out: T }> {
  const ref = db(p).collection('outreach_prospects').doc(id);
  for (let i = 0; ; i++) {
    const snap = await ref.get();
    if (!snap) throw fail(404, 'not_found', 'Prospect not found');
    const { next, out } = fn(snap.data as Prospect);
    const { id: _i, version: _v, ...data } = next;
    try {
      const w = await ref.set(JSON.parse(JSON.stringify(data)), { expectedVersion: snap.version });
      return { saved: { ...data, id, version: w.version } as Prospect, out };
    } catch (e) {
      if (!(e instanceof ConflictError) || i >= 11) throw e;
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 40 * (i + 1))); // jitter, so writers that collided do not collide again
    }
  }
}
/** Log one action: writes the activity row and moves the prospect's state. */
export async function logActivity(p: Principal, body: Record<string, any>, s: Settings): Promise<{ prospect: Prospect; activity: Activity }> {
  const id = String(body.prospect || '');
  // a future time would put the action on a day that has not happened (and break the daily numbers): clamp to now
  const when = body.at && !isNaN(Date.parse(body.at)) ? Math.min(Date.parse(body.at), Date.now()) : Date.now();
  const at = new Date(when).toISOString();
  const a0: Activity = { business: OUTREACH_BIZ, prospect: id, type: String(body.type || 'note').slice(0, 40), platform: body.platform ? String(body.platform).slice(0, 40) : undefined, at, day: dayOf(at), by: who(p),
    sender: body.sender ? String(body.sender).slice(0, 60) : undefined, note: body.note ? String(body.note).slice(0, 3000) : undefined, sentiment: body.sentiment ? String(body.sentiment).slice(0, 40) : undefined, template: body.template ? String(body.template).slice(0, 60) : undefined };
  const { saved, out } = await withProspect(p, id, (cur) => {
    const r = applyActivity(cur, a0, s);
    if ('next_action' in body) r.prospect.next_action = String(body.next_action || '').slice(0, 300);
    if ('next_due' in body) r.prospect.next_due = String(body.next_due || '').slice(0, 10);
    return { next: r.prospect, out: r.activity };
  });
  const act = await db(p).collection('outreach_activities').add(JSON.parse(JSON.stringify(out)));
  return { prospect: saved, activity: { ...out, id: act.id } };
}
/** Undo one logged action: remove the row and rebuild the prospect's counters from what is left. */
export async function undoActivity(p: Principal, id: string, s: Settings): Promise<Prospect> {
  const aref = db(p).collection('outreach_activities').doc(id);
  const a = await aref.get();
  if (!a) throw fail(404, 'not_found', 'Log entry not found');
  const undone = a.data as Activity;
  await aref.delete();
  const rest = (await db(p).collection('outreach_activities').where('prospect', '==', undone.prospect).limit(5000).get()).map((r) => r.data as Activity);
  return (await withProspect(p, undone.prospect, (cur) => ({ next: rebuild(cur, rest, s, undone), out: null }))).saved;
}
