import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { saveSecret } from '@/lib/config';
import { requestPrincipal } from '@/lib/session';
import { isFull } from '@/lib/access';
import { exchangeCode, type Provider } from '@/lib/social/oauth';
import { channel } from '@/lib/social/youtube';
import { profile } from '@/lib/social/tiktok';

const origin = (req: Request) => { const h = req.headers, host = h.get('x-forwarded-host') || h.get('host'); return host ? (h.get('x-forwarded-proto') || 'https') + '://' + host : new URL(req.url).origin; };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** A small page for the login popup: tells the Social Media page to refresh and closes itself. */
const page = (ok: boolean, msg: string, business = 'kidscare') => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'Connected' : 'Connect hoyni'}</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;background:#F2F5F4;color:#14211E"><div style="text-align:center;max-width:420px;padding:24px">
<div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h2>${ok ? 'Connect hoyeche' : 'Connect hoyni'}</h2><p>${esc(msg)}</p><p><a href="/app#biz:${esc(business)}/social">Dashboard e firun</a></p></div>
<script>try{window.opener&&window.opener.postMessage({bosSocialConnected:${ok}},location.origin)}catch(e){}${ok ? 'setTimeout(function(){window.close()},1500)' : ''}</script>`, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = (await params).provider as Provider;
  const u = new URL(req.url);
  const jar = await cookies();
  let st: { state?: string; business?: string; provider?: string } = {};
  try { st = JSON.parse(jar.get('bos_oauth')?.value || '{}'); } catch { /* bad cookie */ }
  jar.delete('bos_oauth');
  const p = await requestPrincipal(req);
  if (!p || !isFull(p)) return page(false, 'Age EasyFounder e owner/admin hishebe login korun.');
  if (u.searchParams.get('error')) return page(false, 'Login baatil: ' + (u.searchParams.get('error_description') || u.searchParams.get('error')), st.business);
  if (!st.state || st.state !== u.searchParams.get('state') || st.provider !== provider) return page(false, 'Login er shomoy shesh / mile nai — abar "Connect" chapun.', st.business);
  const code = u.searchParams.get('code');
  if (!code) return page(false, 'Code pawa jayni.', st.business);
  try {
    const t = await exchangeCode(provider, code, origin(req));
    const info = provider === 'youtube' ? await channel(t.access_token) : await profile(t.access_token);
    const id = provider + '_' + info.id;
    await saveSecret('oauth:' + id, t);
    await db(p).collection('social_accounts').doc(id).set({ business: st.business || 'kidscare', network: provider, ext_id: info.id, page_id: '', name: info.name, username: info.username, picture: info.picture, followers: info.followers,
      ...(provider === 'youtube' ? { uploads: (info as Awaited<ReturnType<typeof channel>>).uploads } : {}), scope: t.scope, active: true, connected_at: new Date().toISOString(), error: '' });
    return page(true, (provider === 'youtube' ? 'YouTube channel' : 'TikTok account') + ' "' + info.name + '" connect hoyeche. Ei window bondho korun.', st.business);
  } catch (e) { return page(false, (e as Error).message, st.business); }
}
