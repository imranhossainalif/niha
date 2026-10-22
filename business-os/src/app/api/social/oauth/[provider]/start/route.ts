import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { handle } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { BIZ_IDS } from '@/lib/business';
import { authUrl, type Provider } from '@/lib/social/oauth';

const origin = (req: Request) => { const h = req.headers, host = h.get('x-forwarded-host') || h.get('host'); return host ? (h.get('x-forwarded-proto') || 'https') + '://' + host : new URL(req.url).origin; };

/** Opens Google / TikTok login for connecting a YouTube channel or TikTok account (owner/admin). */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ provider: string }> }) => {
  const provider = (await params).provider as Provider;
  if (provider !== 'youtube' && provider !== 'tiktok') throw Object.assign(new Error('Unknown provider'), { status: 404, code: 'not_found' });
  const p = await needPrincipal(req, 'write');
  if (!isFull(p)) throw Object.assign(new Error('Account connect shudhu owner/admin korte pare'), { status: 403, code: 'permission_denied' });
  const business = new URL(req.url).searchParams.get('business') || 'kidscare';
  if (!BIZ_IDS.includes(business)) throw Object.assign(new Error('Unknown business'), { status: 404, code: 'not_found' });
  const state = randomBytes(16).toString('hex');
  (await cookies()).set('bos_oauth', JSON.stringify({ state, business, provider }), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/social/oauth', maxAge: 600 });
  return Response.redirect(await authUrl(provider, state, origin(req)), 302);
});
