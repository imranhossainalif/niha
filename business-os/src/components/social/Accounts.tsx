'use client';
// Connect accounts: Facebook + Instagram (through the Meta system-user token), YouTube (Google login),
// TikTok (TikTok login). Each platform card shows what is connected and the exact one-time setup.
import { useEffect, useState, type ReactNode } from 'react';
import { Icon, NET_NAME, NetLogo, type Net } from './icons';
import { api, Avatar, compact, Modal, useToast, type Account } from './ui';

type Found = { network: 'facebook' | 'instagram'; ext_id: string; name: string; username?: string; picture?: string; followers?: number; page_id?: string };
type Prov = { meta: boolean; youtube: boolean; tiktok: boolean };
const DESC: Record<Net, string> = {
  facebook: 'Page e post (chobi, album, video, link) · reach, react, comment, share',
  instagram: 'Chobi, Reel, Carousel · reach, like, save · competitor research',
  youtube: 'Video / Shorts upload · view, like, comment, subscriber',
  tiktok: 'Video post ba TikTok app e draft · view, like, comment, share',
};

export function Accounts({ business, accounts, canAdmin, onChange }: { business: string; accounts: Account[]; canAdmin: boolean; onChange: () => void }) {
  const toast = useToast();
  const [prov, setProv] = useState<Prov | null>(null); const [cb, setCb] = useState('');
  const [found, setFound] = useState<Found[] | null>(null); const [pick, setPick] = useState<string[]>([]); const [busy, setBusy] = useState('');
  const key = (f: Found) => f.network + '_' + f.ext_id;
  useEffect(() => { api<{ providers: Prov; callbackBase: string }>(`/api/social/${business}/accounts`).then((r) => { setProv(r.providers); setCb(r.callbackBase); }).catch(() => {}); }, [business, accounts.length]);
  useEffect(() => {
    const on = (e: MessageEvent) => { if (e.origin === location.origin && e.data && e.data.bosSocialConnected != null) { toast(e.data.bosSocialConnected ? 'Connect hoyeche ✓' : 'Connect hoyni', e.data.bosSocialConnected ? 'ok' : 'err'); onChange(); } };
    window.addEventListener('message', on); return () => window.removeEventListener('message', on);
  }, [onChange, toast]);

  const discover = async () => {
    setBusy('meta');
    try { const r = await api<{ found: Found[]; error: string | null }>(`/api/social/${business}/accounts?discover=1`); if (r.error) toast(r.error, 'err'); setFound(r.found); setPick(r.found.filter((f) => !accounts.some((a) => a.id === key(f))).map(key)); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy('');
  };
  const connectMeta = async () => {
    setBusy('save');
    try { await api(`/api/social/${business}/accounts`, { method: 'POST', json: { accounts: (found ?? []).filter((f) => pick.includes(key(f))) } }); toast('Connect hoyeche ✓ — Analytics e "Ekhon data anun" chapun'); setFound(null); onChange(); }
    catch (e) { toast((e as Error).message, 'err'); }
    setBusy('');
  };
  const oauth = (p: 'youtube' | 'tiktok') => {
    const w = window.open(`/api/social/oauth/${p}/start?business=${business}`, 'bos-oauth', 'width=540,height=760');
    if (!w) toast('Popup bondho — browser e popup allow korun', 'err');
  };
  const remove = async (a: Account) => { if (!confirm(a.name + ' disconnect korben? Ager post o data thakbe.')) return; try { await api(`/api/social/${business}/accounts?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' }); toast('Disconnect hoyeche'); onChange(); } catch (e) { toast((e as Error).message, 'err'); } };

  const card = (net: Net, action: ReactNode) => {
    const list = accounts.filter((a) => a.network === net);
    return (
      <section key={net} className="sm-card sm-plat sm-fade">
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <NetLogo net={net} size={40} />
          <div className="grow stack" style={{ gap: 2 }}><h3>{NET_NAME[net]}</h3><span className="muted xs">{DESC[net]}</span></div>
          {list.length ? <span className="sm-badge" style={{ background: 'color-mix(in srgb, var(--good) 14%, transparent)', color: 'var(--good)' }}><Icon name="check" size={12} />{list.length} connect</span> : <span className="sm-badge">Connect kora nai</span>}
        </div>
        {list.map((a) => (
          <div key={a.id} className="sm-acc">
            <Avatar a={a} size={36} />
            <div className="grow stack" style={{ gap: 0 }}><b>{a.name}</b><span className="muted xs">{a.username ? '@' + a.username + ' · ' : ''}{compact(a.followers)} {net === 'youtube' ? 'subscriber' : 'follower'}</span>{a.error && <span className="xs" style={{ color: 'var(--bad)' }}>{a.error}</span>}</div>
            {canAdmin && <button className="sm-btn sm ghost danger" onClick={() => remove(a)}>Disconnect</button>}
          </div>
        ))}
        {canAdmin ? action : !list.length && <span className="muted xs">Owner/admin connect korte paren.</span>}
      </section>
    );
  };

  const metaBtn = <button className="sm-btn primary" onClick={discover} disabled={busy === 'meta' || prov?.meta === false}>{busy === 'meta' ? <span className="sm-spin" /> : <Icon name="search" size={14} />}Page / Instagram khujun</button>;
  const ytBtn = prov?.youtube ? <button className="sm-btn primary" onClick={() => oauth('youtube')}><NetLogo net="youtube" size={16} />Google diye connect</button> : <span className="sm-warn"><Icon name="alert" />Age nicher "YouTube setup" korun (Google client ID lagbe).</span>;
  const ttBtn = prov?.tiktok ? <button className="sm-btn primary" onClick={() => oauth('tiktok')}><NetLogo net="tiktok" size={16} />TikTok diye connect</button> : <span className="sm-warn"><Icon name="alert" />Age nicher "TikTok setup" korun (TikTok client key lagbe).</span>;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="sm-grid sm-g2">
        {card('facebook', prov?.meta === false ? <span className="sm-warn"><Icon name="alert" />Age Settings e Meta "Social media token" boshan (nicher guide).</span> : metaBtn)}
        {card('instagram', prov?.meta === false ? <span className="muted xs">Facebook er sathe eki token — Facebook Page er sathe link kora Instagram e ashe.</span> : metaBtn)}
        {card('youtube', ytBtn)}
        {card('tiktok', ttBtn)}
      </div>

      <section className="sm-card stack">
        <h2>Ekbar setup: ki ki korte hobe</h2>
        <span className="muted sm-t">Protita platform er nijer app/permission lage. Ekbar korle bar bar lagbe na.</span>
        <Guide net="facebook" title="Facebook + Instagram setup">
          <li><b>Instagram ke professional account banan:</b> Instagram app → Settings → <i>Account type and tools</i> → <i>Switch to professional account</i> → Business.</li>
          <li><b>Instagram ke Page er sathe link:</b> Facebook e Kids Care BD Page → Settings → <i>Linked accounts</i> → Instagram → Connect.</li>
          <li><b>Meta app e permission:</b> <a className="lnk" href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> → apnar app → <i>Use cases</i> → Add → "Manage everything on your Page" ar "Manage messaging &amp; content on Instagram".</li>
          <li><b>System user ke access:</b> <a className="lnk" href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer">Business settings → System users</a> → <i>business-os</i> → <i>Assign assets</i> → Pages → Kids Care BD → Full control; Instagram accounts → Kids Care → Full control.</li>
          <li><b>Token:</b> oi system user e <i>Generate new token</i> → tick: <code>pages_manage_posts</code> <code>pages_read_engagement</code> <code>read_insights</code> <code>instagram_basic</code> <code>instagram_content_publish</code> <code>instagram_manage_insights</code> <code>pages_show_list</code> <code>business_management</code> <code>ads_read</code> → Generate → copy.</li>
          <li>Dashboard → <b>Settings</b> → Meta card → "Key bosan" → <i>Social media token</i> e paste → Save. Tarpor upore <b>"Page / Instagram khujun"</b>.</li>
        </Guide>
        <Guide net="youtube" title="YouTube setup (Google)">
          <li><a className="lnk" href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com</a> e notun project: naam <i>Business OS</i>.</li>
          <li><a className="lnk" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noreferrer">YouTube Data API v3</a> → <b>Enable</b>.</li>
          <li><i>Google Auth Platform</i> (OAuth consent screen) → Get started → App name <i>Business OS</i>, apnar email → Audience: <b>External</b> → Create. Tarpor <i>Audience</i> e <b>Publish app</b> chapun (na hole 7 din por por login abar lagbe).</li>
          <li><i>Clients</i> → Create client → <b>Web application</b> → <i>Authorized redirect URIs</i> e eta din: <CopyCode text={cb + 'youtube/callback'} /> → Create → <b>Client ID</b> ar <b>Client secret</b> copy.</li>
          <li>Dashboard → Settings → "YouTube + TikTok" → client ID ar secret boshan → Save.</li>
          <li>Upore <b>"Google diye connect"</b> → je Google account e Kids Care er channel ache seta bachai (brand channel hole channel ta bachai) → "Google hasn't verified this app" ashle <i>Advanced → Go to Business OS</i> → Allow.</li>
          <li><b>Jene rakhun:</b> Google er niyome audit na hoya porjonto API diye upload kora video <b>private</b> thake — YouTube Studio theke Public korte hobe. Audit er jonno <a className="lnk" href="https://support.google.com/youtube/contact/yt_api_form" target="_blank" rel="noreferrer">ei form</a> fill korun (free, 1-3 shoptah). Din e ~6 ta upload er limit (quota).</li>
        </Guide>
        <Guide net="tiktok" title="TikTok setup">
          <li><a className="lnk" href="https://developers.tiktok.com/" target="_blank" rel="noreferrer">developers.tiktok.com</a> e Kids Care er TikTok diye login → <i>Manage apps</i> → <b>Connect an app</b>.</li>
          <li>App details: naam <i>Kids Care BD Scheduler</i>, icon, category, description. Terms: <CopyCode text={(cb.split('/api/')[0] || '') + '/legal/terms'} /> Privacy: <CopyCode text={(cb.split('/api/')[0] || '') + '/legal/privacy'} /> Platform: <b>Web</b>, website: <CopyCode text={cb.split('/api/')[0] || ''} /></li>
          <li><b>Products</b> e add: <i>Login Kit</i> ar <i>Content Posting API</i> (Direct Post on korun). Login Kit e <i>Redirect URI</i>: <CopyCode text={cb + 'tiktok/callback'} /></li>
          <li><b>Scopes</b>: <code>user.info.basic</code> <code>user.info.profile</code> <code>user.info.stats</code> <code>video.list</code> <code>video.upload</code> <code>video.publish</code></li>
          <li>Ekhoni test korte: <b>Sandbox</b> → Create → <i>Target users</i> e Kids Care er TikTok add → sandbox er client key/secret nin. Live er jonno <b>Submit for review</b> (likhun: "Our own company account: scheduling and analytics") — 3-10 din lage.</li>
          <li><b>Client key</b> ar <b>Client secret</b> → Dashboard → Settings → "YouTube + TikTok" → Save → upore <b>"TikTok diye connect"</b>.</li>
          <li><b>Jene rakhun:</b> TikTok review/audit er age "Shorasori post" kevol <i>Only me</i> hoy — tai default e "TikTok app e draft" deya: video TikTok app e notification hoye ashe, sound diye okhan theke post korben.</li>
        </Guide>
      </section>

      {found && (
        <Modal onClose={() => setFound(null)} width={560}>
          <div className="stack" style={{ padding: 20 }}>
            <h2>Kon gulo Kids Care e connect korben?</h2>
            {!found.length && <p className="muted">Kono page pawa jayni — upore Facebook setup er 3-5 step dekhun.</p>}
            {found.map((f) => (
              <label key={key(f)} className="sm-acc" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={pick.includes(key(f))} onChange={(e) => setPick((p) => (e.target.checked ? [...p, key(f)] : p.filter((x) => x !== key(f))))} />
                <Avatar a={f} size={34} /><div className="grow"><b>{f.name}</b><div className="muted xs">{NET_NAME[f.network]}{f.username ? ' · @' + f.username : ''} · {compact(f.followers)} follower</div></div>
                {accounts.some((a) => a.id === key(f)) && <span className="sm-badge">age theke</span>}
              </label>
            ))}
            {found.length > 0 && !found.some((f) => f.network === 'instagram') && <span className="sm-warn"><Icon name="alert" />Instagram dekha jacche na — Instagram Page er sathe link kora ache kina ar token e instagram permission ache kina dekhun.</span>}
            <div className="row"><span className="grow" /><button className="sm-btn" onClick={() => setFound(null)}>Bad din</button><button className="sm-btn primary" disabled={!pick.length || busy === 'save'} onClick={connectMeta}>{busy === 'save' ? <span className="sm-spin" /> : <Icon name="check" size={14} />}{pick.length} ta connect korun</button></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Guide({ net, title, children }: { net: Net; title: string; children: ReactNode }) {
  return (
    <details className="sm-acc-guide" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
      <summary><span className="chev"><Icon name="chevR" /></span><NetLogo net={net} size={20} />{title}</summary>
      <ol className="steps">{children}</ol>
    </details>
  );
}
function CopyCode({ text }: { text: string }) {
  const toast = useToast();
  return <button type="button" className="sm-chip plain" style={{ height: 'auto', padding: '2px 8px', fontFamily: 'monospace', fontSize: 12, maxWidth: '100%', overflowWrap: 'anywhere', textAlign: 'left' }} onClick={() => navigator.clipboard.writeText(text).then(() => toast('Copy hoyeche'), () => toast('Copy hoyni', 'err'))} title="Copy">{text} <Icon name="copy" size={12} /></button>;
}
