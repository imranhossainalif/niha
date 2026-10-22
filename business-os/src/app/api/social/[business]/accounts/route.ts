import { z } from 'zod';
import { db } from '@/lib/db';
import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { needBiz } from '@/lib/social/api';
import { discoverAccounts, socialToken } from '@/lib/social/meta';
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
  const providers = { meta: !!((await cfg('META_SOCIAL_TOKEN')) || (await cfg('META_ADS_TOKEN'))), youtube: !!((await cfg('YOUTUBE_CLIENT_ID')) && (await cfg('YOUTUBE_CLIENT_SECRET'))), tiktok: !!((await cfg('TIKTOK_CLIENT_KEY')) && (await cfg('TIKTOK_CLIENT_SECRET'))) };
  const callbackBase = (process.env.PUBLIC_URL || new URL(req.url).origin).replace(/\/$/, '') + '/api/social/oauth/';
  if (new URL(req.url).searchParams.get('discover') !== '1') return json({ connected, providers, callbackBase });
  adminOnly(p);
  let found: Awaited<ReturnType<typeof discoverAccounts>> = [], error: string | null = null;
  try { found = await discoverAccounts(await socialToken()); } catch (e) { error = (e as Error).message; }
  return json({ connected, providers, callbackBase, found, error });
});

const Body = z.object({ accounts: z.array(z.object({ network: z.enum(['facebook', 'instagram']), ext_id: z.string(), name: z.string(), username: z.string().optional(), picture: z.string().optional(), followers: z.number().optional(), page_id: z.string().optional() })).max(30) });

/** Connect the chosen accounts to this business. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req, 'write');
  needBiz(p, business, true); adminOnly(p);
  const b = Body.parse(await req.json());
  for (const a of b.accounts) {
    await db(p).collection('social_accounts').doc(a.network + '_' + a.ext_id).set({ business, ...a, page_id: a.network === 'facebook' ? a.ext_id : a.page_id || '', active: true, connected_at: new Date().toISOString() });
  }
  return json({ connected: b.accounts.length });
});

/** Disconnect ?id=<network_extid>. Posts and history stay. */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { business } = await params;
  const p = await needPrincipal(req, 'write');
  needBiz(p, business, true); adminOnly(p);
  const id = new URL(req.url).searchParams.get('id') || '';
  await deleteSecret('oauth:' + id); // YouTube/TikTok login token
  return json({ deleted: await db(p).collection('social_accounts').doc(id).delete() });
});
