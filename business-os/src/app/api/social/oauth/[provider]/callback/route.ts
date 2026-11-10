import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { readSecret, saveSecret } from '@/lib/config';
import { requestPrincipal } from '@/lib/session';
import { isFull } from '@/lib/access';
import { exchangeCode, type Provider } from '@/lib/social/oauth';
import { channel } from '@/lib/social/youtube';
import { profile } from '@/lib/social/tiktok';
import { pinBoards, pinProfile } from '@/lib/social/pinterest';
import { liProfile } from '@/lib/social/linkedin';
import { discoverAccounts, metaMe } from '@/lib/social/meta';
import { cfg } from '@/lib/config';
import { bizName } from '@/lib/business';
import type { SocialAccount } from '@/lib/jobs/social';

const origin = (req: Request) => { const h = req.headers, host = h.get('x-forwarded-host') || h.get('host'); return host ? (h.get('x-forwarded-proto') || 'https') + '://' + host : new URL(req.url).origin; };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** A small page for the login popup: tells the Social Media page to refresh and closes itself. */
const page = (ok: boolean, msg: string, business = 'kidscare', pick = false) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ok ? 'Connected' : 'Connect hoyni'}</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;background:#F2F5F4;color:#14211E"><div style="text-align:center;max-width:420px;padding:24px">
<div style="font-size:44px">${ok ? '✅' : '⚠️'}</div><h2>${ok ? 'Connect hoyeche' : 'Connect hoyni'}</h2><p>${esc(msg)}</p><p><a href="/app#biz:${esc(business)}/social">Dashboard e firun</a></p></div>
<script>try{window.opener&&window.opener.postMessage({bosSocialConnected:${ok},bosSocialPick:${pick}},location.origin)}catch(e){}${ok ? 'setTimeout(function(){window.close()},' + (pick ? 2500 : 1500) + ')' : ''}</script>`, { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } });

/** An account lives in exactly one business. Connecting it again from another business must not move it (that silently emptied the first business). */
async function heldElsewhere(p: NonNullable<Awaited<ReturnType<typeof requestPrincipal>>>, id: string, biz: string) {
  const cur = (await db(p).collection('social_accounts').doc(id).get())?.data as SocialAccount | undefined;
  return cur && cur.business && cur.business !== biz ? cur : null;
}
const held = (name: string, other: string) => page(false, '"' + name + '" agei ' + bizName(other) + ' e connect kora ache. Ekta account ekta business e-i thake — age ' + bizName(other) + ' → Social Media → Accounts theke Disconnect korun, tarpor ekhane connect korun. (Alada account lagle oi business er alada login diye connect korun.)', other);

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
    if (provider === 'meta') {
      // One-click Facebook + Instagram: keep the long-lived user token as a shared secret (publishing/analytics
      // derive page tokens from it) and connect every Page / Instagram this login can manage to this business.
      const me = await metaMe(t.access_token);
      await saveSecret('meta:user', { access_token: t.access_token, expires_at: t.expires_at, user_id: me.id, name: me.name });
      // Keep a short history of recent logins too: 'meta:user' is overwritten by the NEXT connect, and a
      // later connect (maybe for another business, with a narrower Page picker — possibly by the same
      // Facebook user) must not erase the only token that could manage some other business's Page.
      // Publishing derives a Page token from any stored login that can manage it (metaTokens in meta.ts).
      const prevLogins = (await readSecret<{ access_token: string; expires_at: number }[]>('meta:users').catch(() => null)) ?? [];
      const logins = [{ access_token: t.access_token, expires_at: t.expires_at, user_id: me.id },
        ...prevLogins.filter((x) => x.access_token !== t.access_token && x.expires_at > Date.now() + 60e3)].slice(0, 6);
      await saveSecret('meta:users', logins);
      const found = await discoverAccounts(t.access_token, undefined, true); // also keeps each Page's own token as a fallback
      const biz = st.business || 'kidscare';
      const mine = await db(p).collection('social_accounts').limit(500).get();
      const have = new Map(mine.map((s) => [s.id, s.data as SocialAccount]));
      const seen = new Set<string>();
      for (const a of found) {
        const id = a.network + '_' + a.ext_id; seen.add(id);
        const cur = have.get(id);
        // Accounts that are already connected (to ANY business) only get fresh details and a cleared error;
        // they never change business here.
        if (cur) await db(p).collection('social_accounts').doc(id).update({ name: a.name, username: a.username, picture: a.picture, followers: a.followers, error: '' });
      }
      // A Facebook login covers only the Pages ticked in its dialog, and un-ticking a Page takes it away from the app
      // for every earlier login too. Say so loudly instead of letting a business quietly stop publishing.
      const systemToken = !!(await cfg('META_SOCIAL_TOKEN'));
      const lost = systemToken ? [] : mine.filter((s) => { const a = s.data as SocialAccount; return (a.network === 'facebook' || a.network === 'instagram') && a.active !== false && !seen.has(s.id); });
      for (const s of lost) await db(p).collection('social_accounts').doc(s.id).update({ error: 'Last Facebook login e ei account ta tick kora chilo na — Facebook diye abar connect kore shob Page tick rakhun' });
      const lostNote = lost.length ? ' ⚠ Ei login e ' + lost.map((s) => (s.data as SocialAccount).name + ' (' + bizName((s.data as SocialAccount).business) + ')').join(', ') + ' pawa jayni — Facebook e ei Page gulo tick na thakle oder post bondho hoye jabe. Abar "Facebook diye connect" chepe SHOB Page tick rakhun.' : '';
      if (!found.length) return page(false, 'Kono Facebook Page pawa jayni — je Facebook account diye login korechen sheta diye ekta Page manage thakte hobe. Page thakle abar connect kore Page ta select korun.', biz);
      // One Page (+ its Instagram) and nothing connected here yet: no choice to make, connect it. Otherwise the user picks, so
      // a login that can see every business's Pages never drops them all into the business that happened to be open.
      const fresh = found.filter((a) => !have.has(a.network + '_' + a.ext_id));
      const pages = found.filter((a) => a.network === 'facebook');
      if (fresh.length && pages.length === 1 && !mine.some((s) => (s.data as SocialAccount).business === biz && ((s.data as SocialAccount).network === 'facebook'))) {
        for (const a of fresh) await db(p).collection('social_accounts').doc(a.network + '_' + a.ext_id).set({ business: biz, network: a.network, ext_id: a.ext_id, page_id: a.network === 'facebook' ? a.ext_id : a.page_id || '', name: a.name, username: a.username, picture: a.picture, followers: a.followers, active: true, connected_at: new Date().toISOString(), error: '' });
        return page(true, fresh.map((a) => a.name).join(', ') + ' connect hoyeche (' + bizName(biz) + ').' + lostNote + ' Ei window bondho korun.', biz);
      }
      const free = fresh.length;
      return page(true, 'Facebook login hoyeche. ' + (free ? free + ' ta notun account pawa geche — ' + bizName(biz) + ' er jonno kon gulo hobe seta ebar bachai korun (Dashboard e ashbe).' : 'Notun kono account pawa jayni.') + lostNote, biz, free > 0);
    }
    if (provider === 'pinterest') {
      // Pinterest: the account's boards are saved with it — publishing defaults to the first board.
      const info = await pinProfile(t.access_token);
      const boards = await pinBoards(t.access_token).catch(() => []);
      const id = 'pinterest_' + info.id;
      const own = await heldElsewhere(p, id, st.business || 'kidscare'); if (own) return held(info.name, own.business);
      await saveSecret('oauth:' + id, t);
      await db(p).collection('social_accounts').doc(id).set({ business: st.business || 'kidscare', network: 'pinterest', ext_id: info.id, page_id: '', name: info.name, username: info.username, picture: info.picture, followers: info.followers,
        boards, board_id: boards[0]?.id || '', scope: t.scope, active: true, connected_at: new Date().toISOString(), error: '' });
      return page(true, 'Pinterest account "@' + info.username + '" connect hoyeche' + (boards.length ? ' (' + boards.length + ' ta board, prothom board "' + boards[0].name + '" e pin jabe)' : ' (kono board pawa jayni — Pinterest e ekta board banan)') + '. Ei window bondho korun.', st.business);
    }
    if (provider === 'linkedin') {
      // LinkedIn: the member's own profile (OIDC sub is the identity). The token has no refresh
      // token at this tier — it lives ~60 days in the secret, then the owner reconnects.
      const info = await liProfile(t.access_token);
      const id = 'linkedin_' + info.id;
      const own = await heldElsewhere(p, id, st.business || 'kidscare'); if (own) return held(info.name, own.business);
      await saveSecret('oauth:' + id, t);
      await db(p).collection('social_accounts').doc(id).set({ business: st.business || 'kidscare', network: 'linkedin', ext_id: info.id, page_id: '', name: info.name, username: info.username, picture: info.picture, followers: info.followers,
        scope: t.scope, token_expires_at: new Date(t.expires_at).toISOString(), active: true, connected_at: new Date().toISOString(), error: '' });
      return page(true, 'LinkedIn profile "' + info.name + '" connect hoyeche (chobi/video o jabe). Token ~60 din thakbe — meyad shesh hole ek click e abar connect korte hobe. Ei window bondho korun.', st.business);
    }
    const info = provider === 'youtube' ? await channel(t.access_token) : await profile(t.access_token);
    const id = provider + '_' + info.id;
    const own = await heldElsewhere(p, id, st.business || 'kidscare'); if (own) return held(info.name, own.business);
    await saveSecret('oauth:' + id, t);
    await db(p).collection('social_accounts').doc(id).set({ business: st.business || 'kidscare', network: provider, ext_id: info.id, page_id: '', name: info.name, username: info.username, picture: info.picture, followers: info.followers,
      ...(provider === 'youtube' ? { uploads: (info as Awaited<ReturnType<typeof channel>>).uploads } : {}), scope: t.scope, active: true, connected_at: new Date().toISOString(), error: '' });
    return page(true, (provider === 'youtube' ? 'YouTube channel' : 'TikTok account') + ' "' + info.name + '" connect hoyeche. Ei window bondho korun.', st.business);
  } catch (e) { return page(false, (e as Error).message, st.business); }
}
