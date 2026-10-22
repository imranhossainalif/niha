'use client';
// Connect Facebook Pages / Instagram accounts to this business, with the exact setup steps.
import { useState } from 'react';
import { api, Avatar, nf, type Account } from './ui';

type Found = { network: 'facebook' | 'instagram'; ext_id: string; name: string; username?: string; picture?: string; followers?: number; page_id?: string };

export function Accounts({ business, accounts, canAdmin, onChange }: { business: string; accounts: Account[]; canAdmin: boolean; onChange: () => void }) {
  const [found, setFound] = useState<Found[] | null>(null); const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const key = (f: Found) => f.network + '_' + f.ext_id;
  const discover = async () => {
    setBusy(true); setMsg('');
    try { const r = await api<{ found: Found[]; error: string | null }>(`/api/social/${business}/accounts?discover=1`); setFound(r.found); setPick(r.found.filter((f) => !accounts.some((a) => a.id === key(f))).map(key)); if (r.error) setMsg(r.error); else if (!r.found.length) setMsg('Kono page pawa jayni — nicher step 2-3 dekhun.'); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const connect = async () => {
    setBusy(true);
    try { await api(`/api/social/${business}/accounts`, { method: 'POST', json: { accounts: (found ?? []).filter((f) => pick.includes(key(f))) } }); setMsg('Connect hoyeche. "Analytics" e "Ekhon data anun" chapun.'); setFound(null); onChange(); }
    catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const remove = async (id: string) => { if (!confirm('Disconnect korben? Ager post o data thakbe.')) return; await api(`/api/social/${business}/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch((e) => setMsg(e.message)); onChange(); };

  return (
    <div className="grid gap-3">
      <section className="card grid gap-3">
        <h3 className="font-semibold">Connect kora account</h3>
        {accounts.length ? accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3"><Avatar a={a} size={40} /><div className="grid"><b>{a.name}</b><span className="muted text-xs">{a.network === 'instagram' ? 'Instagram' : 'Facebook Page'}{a.username ? ' · @' + a.username : ''} · {nf(a.followers)} follower</span></div>
            {canAdmin && <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => remove(a.id)}>Disconnect</button>}</div>
        )) : <p className="muted text-sm">Ekhono kichu connect kora nai.</p>}
        {canAdmin ? <div className="flex flex-wrap items-center gap-2"><button className="btn btn-primary" disabled={busy} onClick={discover}>{busy ? '…' : '+ Page / Instagram khujun'}</button>{msg && <span className="text-sm">{msg}</span>}</div>
          : <p className="muted text-sm">Account connect owner/admin korte paren.</p>}
        {found && found.length > 0 && (
          <div className="grid gap-2">
            {found.map((f) => (
              <label key={key(f)} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={pick.includes(key(f))} onChange={(e) => setPick((p) => (e.target.checked ? [...p, key(f)] : p.filter((x) => x !== key(f))))} />
                <Avatar a={{ ...f, id: key(f), page_id: f.page_id || f.ext_id, business }} size={30} /> <b>{f.name}</b> <span className="muted">{f.network === 'instagram' ? 'Instagram @' + f.username : 'Facebook Page'} · {nf(f.followers)} follower</span>
                {accounts.some((a) => a.id === key(f)) && <span className="muted text-xs">(age theke connect)</span>}</label>
            ))}
            <div><button className="btn btn-primary" disabled={busy || !pick.length} onClick={connect}>Ei {pick.length} ta Kids Care e connect korun</button></div>
          </div>
        )}
      </section>
      <section className="card grid gap-2 text-sm">
        <h3 className="font-semibold">Connect korar jonno ki korte hobe (ekbar)</h3>
        <ol style={{ paddingLeft: 18, listStyle: 'decimal', display: 'grid', gap: 6 }}>
          <li><b>Instagram ke Business/Creator account banan ar Facebook Page er sathe link korun:</b> Instagram app → Settings → Account type and tools → Switch to professional account. Tarpor Facebook Page → Settings → Linked accounts → Instagram → Connect.</li>
          <li><b>Meta app e permission jog korun:</b> developers.facebook.com → apnar app (Business OS) → Use cases → Add → "Manage everything on your Page" ar "Manage messaging &amp; content on Instagram". Era ei permission dey: pages_manage_posts, pages_read_engagement, read_insights, instagram_basic, instagram_content_publish, instagram_manage_insights.</li>
          <li><b>System user ke Page ar Instagram e access din:</b> business.facebook.com → Settings → Users → System users → <i>business-os</i> → Assign assets → Pages → Kids Care BD → "Full control" (ba Create content + Insights). Instagram accounts → Kids Care er Instagram → full control.</li>
          <li><b>Notun token banan:</b> oi system user e "Generate new token" → app bachai → upore 6 ta permission + ads_read, business_management, pages_show_list tick → Generate → copy.</li>
          <li><b>Token boshan:</b> Settings → API o connection → Meta → "Social media token" e paste → Save. (Faka rakhle Ads token use hoy, kintu tate post korar permission nai.)</li>
          <li>Ekhane <b>"+ Page / Instagram khujun"</b> → Kids Care BD ar tar Instagram tick → Connect.</li>
        </ol>
        <p className="muted text-xs">Jante rakhun: Meta API diye Facebook <b>group</b> e post kora jay na (2024 theke) — group gulor jonno suggestion ar caption copy dibo. TikTok, YouTube, LinkedIn porer dhape — protitar nijer app approval lage.</p>
      </section>
    </div>
  );
}
