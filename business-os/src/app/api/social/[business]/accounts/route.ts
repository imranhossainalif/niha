import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { needBiz } from '@/lib/social/api';
import { bizName } from '@/lib/business';
import { discoverAccounts, metaUserToken, socialToken } from '@/lib/social/meta';
import { cfg, deleteSecret } from '@/lib/config';
import type { SocialAccount } from '@/lib/jobs/social';

type Ctx = { params: Promise<{ business: string }> };
const adminOnly = (p: Awaited<ReturnType<typeof needPrincipal>>) => { if (!isFull(p)) throw Object.assign(new Error('Account connect shudhu owner/admin korte pare'), { status: 403, code: 'permission_denied' }); };

/** Connected accounts; ?discover=1 also lists every page/Instagram the token can manage. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req);
  needBiz(p, business);
  const connected = (await db(p).collection('social_accounts').where('business', '==', business).limit(100).get()).map((s) => ({ id: s.id, ...(s.data as SocialAccount) }));
  // which logins are set up in Settings (no values)
  const providers = { meta: !!((await cfg('META_SOCIAL_TOKEN')) || (await cfg('META_ADS_TOKEN')) || (await metaUserToken())), metaApp: !!((await cfg('META_APP_ID')) && (await cfg('META_APP_SECRET'))), metaUser: !!(await metaUserToken()), youtube: !!((await cfg('YOUTUBE_CLIENT_ID')) && (await cfg('YOUTUBE_CLIENT_SECRET'))), tiktok: !!((await cfg('TIKTOK_CLIENT_KEY')) && (await cfg('TIKTOK_CLIENT_SECRET'))), pinterest: !!((await cfg('PINTEREST_APP_ID')) && (await cfg('PINTEREST_APP_SECRET'))), linkedin: !!((await cfg('LINKEDIN_CLIENT_ID')) && (await cfg('LINKEDIN_CLIENT_SECRET'))) };
  const callbackBase = (process.env.PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, '') + '/api/social/oauth/';
  if (new URL(req.url).searchParams.get('discover') !== '1') return json({ connected, providers, callbackBase });
  adminOnly(p);
  let found: Awaited<ReturnType<typeof discoverAccounts>> = [], error: string | null = null;
  try { found = await discoverAccounts(await socialToken(), undefined, true); } catch (e) { error = (e as Error).message; }
  // which business already holds each account, so the picker can show it (an account lives in exactly one business)
  const owners: Record<string, string> = {};
  for (const s of await db(p).collection('social_accounts').limit(500).get()) { const b = (s.data as SocialAccount).business; if (b && b !== business) owners[s.id] = b; }
  return json({ connected, providers, callbackBase, found, error, owners });
});

const Body = z.object({ accounts: z.array(z.object({ network: z.enum(['facebook', 'instagram']), ext_id: z.string(), name: z.string(), username: z.string().optional(), picture: z.string().optional(), followers: z.number().optional(), page_id: z.string().optional() })).max(30) });

/** Connect the chosen accounts to this business. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req, 'write');
  needBiz(p, business, true); adminOnly(p);
  const b = Body.parse(await req.json());
  // Never take an account away from another business silently: that is how "adding one removed another" happened.
  const taken: string[] = [];
  for (const a of b.accounts) {
    const ref = db(p).collection('social_accounts').doc(a.network + '_' + a.ext_id);
    const cur = (await ref.get())?.data as SocialAccount | undefined;
    if (cur && cur.business && cur.business !== business) { taken.push(a.name + ' (' + bizName(cur.business) + ')'); continue; }
    await ref.set({ ...(cur ?? {}), business, ...a, page_id: a.network === 'facebook' ? a.ext_id : a.page_id || '', active: true, connected_at: cur ? (cur as { connected_at?: string }).connected_at || new Date().toISOString() : new Date().toISOString(), error: '' });
  }
  if (taken.length) throw Object.assign(new Error('Ei account gulo onno business e connect kora ache: ' + taken.join(', ') + ' — age oikhane Disconnect korun, tarpor ekhane connect korun'), { status: 409, code: 'conflict' });
  return json({ connected: b.accounts.length });
});

/** Disconnect ?id=<network_extid>. Posts and history stay. */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req, 'write');
  needBiz(p, business, true); adminOnly(p);
  const id = new URL(req.url).searchParams.get('id') || '';
  const ref = db(p).collection('social_accounts').doc(id);
  const cur = (await ref.get())?.data as SocialAccount | undefined;
  // only this business's own account: a stray id must never remove another business's login
  if (!cur || cur.business !== business) throw Object.assign(new Error('Ei business e ei account nai'), { status: 404, code: 'not_found' });
  await deleteSecret('oauth:' + id); // YouTube/TikTok/LinkedIn/Pinterest login token
  // posts still waiting for this account would fail at their time: tell the caller how many
  const waiting = (await db(p).collection('social_posts').where('business', '==', business).limit(2000).get()).filter((s) => { const d = s.data as { status?: string; targets?: { account_id: string; status?: string }[] }; return d.status === 'scheduled' && (d.targets ?? []).some((t) => t.account_id === id && t.status !== 'published'); }).length;
  return json({ deleted: await ref.delete(), waiting });
});
