// InboxPilot storage: one doc per message in `inbox_messages` (id = Meta message id), config in inbox_config/<business>.
import { db, ConflictError, type DocSnap } from '../db';
import { ibCompile, ibRulesCompile } from './compile';

export type Channel = 'messenger' | 'instagram' | 'whatsapp';
export type Order = { name?: string; phone?: string; address?: string; product?: string; qty?: string; baby_age?: string };
export type InboxMessage = {
  conv: string; // customer id on that channel (PSID for Messenger)
  channel: Channel;
  dir: 'in' | 'out';
  by: 'customer' | 'ai' | 'team';
  text: string;
  ts: string; // ISO time
  mid: string;
  intent?: string;
  mood?: string;
  human?: boolean;
  lead?: number;
  order?: Order | null;
  fallback?: boolean; // the standard "please wait, a team member will reply" message
  ai_why?: string; // why the AI wanted the team (shown when a chat is left waiting)
  status: 'open' | 'waiting' | 'done';
  name?: string;
  business: string;
  source?: 'webhook' | 'import' | 'dashboard';
};
export type InboxConfig = {
  ai_on: boolean;
  agent_name: string;
  kb?: string; // text the AI reads; empty = compile live from products/offers/couriers/kb
  rules?: string;
  fallback_text?: string; // sent when the AI can't answer
  [k: string]: unknown;
};

export const BUSINESS = 'kidscare'; // the Kids Care page is the only connected channel today
const COL = 'inbox_messages';
const store = () => db();

// Firestore-style ids can't contain '/', Meta mids never do but be safe.
export const msgId = (mid: string) => mid.replace(/\//g, '_').slice(0, 280);

/** Insert unless this mid was already stored. Returns false for a duplicate. */
export async function saveMessage(m: InboxMessage): Promise<boolean> {
  try {
    await store().collection(COL).doc(msgId(m.mid)).set(m, { expectedVersion: 0 });
    return true;
  } catch (e) {
    if (e instanceof ConflictError) return false;
    throw e;
  }
}

export async function convMessages(conv: string, limit = 10): Promise<InboxMessage[]> {
  const rows = await store().collection(COL).where('conv', '==', conv).orderBy('ts', 'desc').limit(limit).get();
  return rows.map((r) => r.data as InboxMessage).reverse();
}

export async function lastInbound(conv: string): Promise<InboxMessage | null> {
  const rows = await store().collection(COL).where('conv', '==', conv).where('dir', '==', 'in').orderBy('ts', 'desc').limit(1).get();
  return (rows[0]?.data as InboxMessage) ?? null;
}

export async function recentMessages(limit = 500): Promise<DocSnap[]> {
  return store().collection(COL).orderBy('ts', 'desc').limit(limit).get();
}

export async function updateMessage(mid: string, patch: Partial<InboxMessage>) {
  return store().collection(COL).doc(msgId(mid)).update(patch);
}

export async function getConfig(business = BUSINESS): Promise<InboxConfig> {
  const d = await store().collection('inbox_config').doc(business).get();
  return { ai_on: false, agent_name: 'Kids Care Assistant', ...(d?.data ?? {}) } as InboxConfig;
}

export async function saveConfig(patch: Partial<InboxConfig>, business = BUSINESS) {
  const cur = await getConfig(business);
  return store().collection('inbox_config').doc(business).set({ ...cur, ...patch, business, ts: new Date().toISOString() });
}

/** Knowledge + rules the AI reads: the saved text if the team pushed one ("AI te live koro"), otherwise compiled live. */
export async function knowledgeFor(cfg: InboxConfig, business = BUSINESS): Promise<{ kb: string; rules: string }> {
  if (cfg.kb && cfg.rules) return { kb: cfg.kb, rules: cfg.rules };
  const s = store();
  const byBiz = async (c: string) => (await s.collection(c).limit(500).get()).map((r) => r.data).filter((x) => !x.business || x.business === business);
  const [products, offers, couriers, kb, settings] = await Promise.all([
    byBiz('ib_products'), byBiz('ib_offers'), byBiz('ib_couriers'), byBiz('ib_kb'),
    s.collection('settings').doc('inbox_' + business).get(),
  ]);
  const st = settings?.data ?? {};
  return { kb: cfg.kb || ibCompile({ products, offers, couriers, kb, settings: st }), rules: cfg.rules || ibRulesCompile(st) };
}
