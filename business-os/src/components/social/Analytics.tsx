'use client';
// What worked: totals vs the period before, followers, best time (weekday × hour), format, content type, top and weak posts.
import { useEffect, useState } from 'react';
import { api, FORMAT_LABEL, NetIcon, nf, pct, Tile, TYPE_LABEL, WEEKDAYS } from './ui';

type Agg = { key: string; posts: number; engagement: number; reach: number; avg_eng: number; avg_reach: number; rate: number | null };
type PostRow = { network: string; ext_id: string; created: string; text?: string; permalink?: string; thumb?: string; format: string; content_type?: string; eng: number; rate: number | null; metrics: Record<string, number | undefined> };
type Data = {
  days: number; total_posts: number; synced: string | null;
  analysis: { totals: { posts: number; engagement: number; reach: number; views: number }; byHour: Agg[]; byWeekday: Agg[]; byFormat: Agg[]; byType: Agg[]; heat: (Agg & { weekday: number; hour: number })[]; bestHours: Agg[]; bestDays: Agg[]; bestSlots: (Agg & { weekday: number; hour: number })[]; bestFormat: Agg | null; top: PostRow[]; weak: PostRow[] };
  prev: { posts: number; engagement: number; reach: number; views: number };
  followers: { account_doc: string; network: string; date: string; followers: number }[];
  audience: { account_doc: string; age_gender: { key: string; value: number }[]; city: { key: string; value: number }[] }[];
};

function Bars({ rows, label, value }: { rows: { k: string; v: number; n: number }[]; label: (k: string) => string; value: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="grid gap-1">
      {rows.map((r) => (
        <div key={r.k} className="grid items-center gap-2 text-sm" style={{ gridTemplateColumns: '120px 1fr 90px' }}>
          <span>{label(r.k)}</span>
          <div style={{ height: 10, background: 'var(--line)', borderRadius: 5 }}><div style={{ height: 10, width: (r.v / max) * 100 + '%', background: 'var(--accent)', borderRadius: 5 }} /></div>
          <span className="text-right">{value(r.v)} <span className="muted text-xs">({r.n})</span></span>
        </div>
      ))}
    </div>
  );
}

function FollowerChart({ rows }: { rows: { date: string; followers: number; network: string }[] }) {
  const nets = [...new Set(rows.map((r) => r.network))];
  if (rows.length < 2) return <p className="muted text-sm">Follower er hishab protidin jomche — kichu din por graph dekhabe.</p>;
  const W = 600, H = 140;
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%" role="img" aria-label="Follower">
      {nets.map((n) => {
        const rs = rows.filter((r) => r.network === n); if (rs.length < 2) return null;
        const min = Math.min(...rs.map((r) => r.followers)), max = Math.max(...rs.map((r) => r.followers)) || 1;
        const x = (i: number) => (i / (rs.length - 1)) * (W - 20) + 10, y = (v: number) => H - ((v - min) / Math.max(1, max - min)) * (H - 20) - 10;
        return <g key={n}><polyline fill="none" stroke={n === 'instagram' ? '#d6249f' : '#1877F2'} strokeWidth={2.5} points={rs.map((r, i) => x(i) + ',' + y(r.followers)).join(' ')} />
          <text x={W - 10} y={y(rs[rs.length - 1].followers) - 6} textAnchor="end" fontSize="12" fill="currentColor">{nf(rs[rs.length - 1].followers)}</text></g>;
      })}
      <text x={10} y={H + 16} fontSize="11" fill="currentColor" opacity=".6">{rows[0].date}</text>
      <text x={W - 10} y={H + 16} fontSize="11" textAnchor="end" fill="currentColor" opacity=".6">{rows[rows.length - 1].date}</text>
    </svg>
  );
}

export function Analytics({ business, refresh }: { business: string; refresh: number }) {
  const [days, setDays] = useState(30); const [net, setNet] = useState('');
  const [d, setD] = useState<Data | null>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  useEffect(() => { setD(null); api<Data>(`/api/social/${business}/analytics?days=${days}&network=${net}`).then(setD).catch((e) => setErr(e.message)); }, [business, days, net, refresh]);
  const sync = async () => { setMsg('…'); try { const r = await api<{ queued: boolean; note?: string }>(`/api/social/${business}/research`, { method: 'POST', json: { action: 'sync' } }); setMsg(r.queued ? 'Facebook/Instagram theke notun data ana hocche — 2-5 min por refresh korun.' : r.note || ''); } catch (e) { setMsg((e as Error).message); } };
  if (err) return <p className="card text-sm" style={{ color: '#d64545' }}>{err}</p>;
  if (!d) return <p className="card muted text-sm">Load hocche…</p>;
  const A = d.analysis, T = A.totals;
  const lastF = (n: string) => { const r = d.followers.filter((x) => x.network === n); return r.length ? [r[0].followers, r[r.length - 1].followers] : null; };
  const heatMax = Math.max(1, ...A.heat.map((h) => h.avg_eng));
  const heatAt = (w: number, h: number) => A.heat.find((x) => x.weekday === w && x.hour === h);
  const slotLabel = (h: number) => String(h).padStart(2, '0') + '–' + String(h + 3).padStart(2, '0');
  const fact = (s: string) => <><b>FACT:</b> {s}</>;

  return (
    <div className="grid gap-3">
      <section className="card flex flex-wrap items-center gap-2">
        <select className="input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90, 180, 365].map((n) => <option key={n} value={n}>Shesh {n} din</option>)}</select>
        <select className="input" style={{ width: 'auto' }} value={net} onChange={(e) => setNet(e.target.value)}><option value="">Facebook + Instagram</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select>
        <span className="muted text-xs">Data update: {d.synced ? new Date(d.synced).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ekhono hoyni'} · proti 3 ghonta</span>
        <button className="btn" style={{ marginLeft: 'auto' }} onClick={sync}>↻ Ekhon data anun</button>
        {msg && <span className="text-sm">{msg}</span>}
      </section>
      {!d.total_posts ? <p className="card text-sm">Ekhono kono post er data nai. Accounts connect korar por "Ekhon data anun" chapun — shesh 90 diner post, reach, like, comment, share chole ashbe.</p> : (<>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Tile label="Post" value={nf(T.posts)} delta={pct(T.posts, d.prev.posts)} note={'ager ' + d.days + ' din: ' + nf(d.prev.posts)} />
          <Tile label="Reach (koto jon dekhse)" value={nf(T.reach)} delta={pct(T.reach, d.prev.reach)} note={T.posts ? 'gor ' + nf(T.reach / T.posts) + ' / post' : ''} />
          <Tile label="Engagement" value={nf(T.engagement)} delta={pct(T.engagement, d.prev.engagement)} note="react + comment + share + save" />
          <Tile label="Gor engagement / post" value={nf(T.posts ? T.engagement / T.posts : 0, 1)} note={T.reach ? 'reach er ' + nf((T.engagement / T.reach) * 100, 1) + '%' : ''} />
          <Tile label="Follower" value={['facebook', 'instagram'].map((n) => lastF(n)).filter(Boolean).map((x) => nf(x![1])).join(' / ') || '—'} note={['facebook', 'instagram'].map((n) => { const x = lastF(n); return x ? (n === 'facebook' ? 'FB ' : 'IG ') + (x[1] - x[0] >= 0 ? '+' : '') + nf(x[1] - x[0]) : null; }).filter(Boolean).join(' · ') || 'jomche'} />
        </div>
        <section className="card grid gap-2" style={{ background: 'color-mix(in srgb, var(--accent) 7%, transparent)' }}>
          <h3 className="font-semibold">Kokhon, ki post korle bhalo hoy (amader nijer data)</h3>
          <ul className="grid gap-1 text-sm" style={{ paddingLeft: 18, listStyle: 'disc' }}>
            {A.bestSlots.length ? <li>{fact('Shobcheye bhalo shomoy: ' + A.bestSlots.map((s) => WEEKDAYS[s.weekday] + ' ' + slotLabel(s.hour) + 'ta (gor ' + nf(s.avg_eng) + ', ' + s.posts + ' post)').join(' · '))}</li> : <li>Bhalo shomoy bolar moto data ekhono kom (ek ek slot e 2+ post lagbe).</li>}
            {A.bestDays.length > 0 && <li>{fact('Bhalo din: ' + A.bestDays.map((x) => WEEKDAYS[Number(x.key)] + ' (gor ' + nf(x.avg_eng) + ')').join(', '))}</li>}
            {A.bestFormat && <li>{fact('Bhalo format: ' + (FORMAT_LABEL[A.bestFormat.key] || A.bestFormat.key) + ' — gor ' + nf(A.bestFormat.avg_eng) + ' engagement (' + A.bestFormat.posts + ' post)')}</li>}
            {A.byType[0] && <li>{fact('Bhalo dhoron: ' + (TYPE_LABEL[A.byType[0].key] || A.byType[0].key) + ' — gor ' + nf(A.byType[0].avg_eng))}</li>}
          </ul>
          <p className="muted text-xs">Shomoy Bangladesh time. Ek-dui ta post diye shiddhanto na — post jotto barbe, hishab totto pakka hobe.</p>
        </section>
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="card grid gap-2">
            <h3 className="font-semibold">Best time heatmap</h3>
            <p className="muted text-xs">Ghor er rong = oi din-shomoyer post er gor engagement (gaar = beshi). Sonkha = koyta post.</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 12 }}>
                <thead><tr><th />{[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <th key={h} className="muted" style={{ fontWeight: 500 }}>{slotLabel(h)}</th>)}</tr></thead>
                <tbody>{[6, 0, 1, 2, 3, 4, 5].map((w) => (
                  <tr key={w}><th className="muted" style={{ textAlign: 'left', fontWeight: 500, paddingRight: 6 }}>{WEEKDAYS[w]}</th>
                    {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => { const c = heatAt(w, h); return <td key={h} title={c ? nf(c.avg_eng, 1) + ' gor · ' + c.posts + ' post' : 'post nai'} style={{ width: 46, height: 30, textAlign: 'center', borderRadius: 6, background: c ? `color-mix(in srgb, var(--accent) ${15 + (c.avg_eng / heatMax) * 85}%, transparent)` : 'color-mix(in srgb, var(--line) 50%, transparent)', color: c && c.avg_eng / heatMax > 0.55 ? '#fff' : undefined }}>{c ? c.posts : ''}</td>; })}
                  </tr>))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card grid gap-2">
            <h3 className="font-semibold">Kon ghontay post korle koto engagement</h3>
            <Bars rows={A.byHour.map((x) => ({ k: x.key, v: x.avg_eng, n: x.posts }))} label={(k) => String(k).padStart(2, '0') + ':00'} value={(v) => nf(v, 1)} />
          </section>
          <section className="card grid gap-2">
            <h3 className="font-semibold">Format: chobi / video / reel / carousel</h3>
            <table className="t text-sm"><thead><tr><th>Format</th><th>Post</th><th>Gor engagement</th><th>Gor reach</th><th>Engagement %</th></tr></thead>
              <tbody>{A.byFormat.map((x) => <tr key={x.key}><td>{FORMAT_LABEL[x.key] || x.key}</td><td>{x.posts}</td><td><b>{nf(x.avg_eng, 1)}</b></td><td>{nf(x.avg_reach)}</td><td>{x.rate == null ? '—' : nf(x.rate, 1) + '%'}</td></tr>)}</tbody></table>
          </section>
          <section className="card grid gap-2">
            <h3 className="font-semibold">Post er dhoron (product, offer, tips, review…)</h3>
            {A.byType.length ? <table className="t text-sm"><thead><tr><th>Dhoron</th><th>Post</th><th>Gor engagement</th><th>Gor reach</th></tr></thead>
              <tbody>{A.byType.map((x) => <tr key={x.key}><td>{TYPE_LABEL[x.key] || x.key}</td><td>{x.posts}</td><td><b>{nf(x.avg_eng, 1)}</b></td><td>{nf(x.avg_reach)}</td></tr>)}</tbody></table>
              : <p className="muted text-sm">AI protita post er dhoron chinbe "Suggestions" tab e analyze korle.</p>}
          </section>
        </div>
        <section className="card grid gap-2">
          <h3 className="font-semibold">Shobcheye bhalo post</h3>
          <PostList rows={A.top} />
          {A.weak.length > 0 && <><h3 className="mt-2 font-semibold">Kom bhalo korse</h3><PostList rows={A.weak} /></>}
        </section>
        {d.audience.some((a) => a.age_gender?.length || a.city?.length) && (
          <section className="card grid gap-3 lg:grid-cols-2">
            {d.audience.map((a) => (<div key={a.account_doc} className="grid gap-2">
              <h3 className="font-semibold">Instagram follower: boyosh o lingo</h3>
              <Bars rows={(a.age_gender ?? []).sort((x, y) => x.key.localeCompare(y.key)).map((x) => ({ k: x.key, v: x.value, n: x.value }))} label={(k) => k.replace(' F', ' Nari').replace(' M', ' Purush').replace(' U', ' ?')} value={(v) => nf(v)} />
              <h3 className="font-semibold">Shohor</h3>
              <Bars rows={(a.city ?? []).map((x) => ({ k: x.key, v: x.value, n: x.value }))} label={(k) => k.split(',')[0]} value={(v) => nf(v)} />
            </div>))}
          </section>
        )}
        <section className="card grid gap-2"><h3 className="font-semibold">Follower</h3><FollowerChart rows={d.followers} /></section>
      </>)}
    </div>
  );
}

function PostList({ rows }: { rows: PostRow[] }) {
  return (
    <div className="grid gap-2">
      {rows.map((p) => (
        <a key={p.network + p.ext_id} href={p.permalink} target="_blank" rel="noreferrer" className="grid items-center gap-3 text-sm" style={{ gridTemplateColumns: '56px 1fr auto', border: '1px solid var(--line)', borderRadius: 8, padding: 6 }}>
          {p.thumb ? <img src={p.thumb} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6 }} /> : <span style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><NetIcon net={p.network} /></span>}
          <span><span className="flex flex-wrap items-center gap-2"><NetIcon net={p.network} size={14} /><span className="muted text-xs">{new Date(p.created).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {FORMAT_LABEL[p.format] || p.format}{p.content_type ? ' · ' + (TYPE_LABEL[p.content_type] || p.content_type) : ''}</span></span>
            <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.text || '(lekha nai)'}</span></span>
          <span className="text-right text-xs"><b className="text-sm">{nf(p.eng)}</b> engagement<br />{p.metrics.reach ? nf(p.metrics.reach) + ' reach' : ''}{p.rate != null ? ' · ' + nf(p.rate, 1) + '%' : ''}<br />👍 {nf(p.metrics.reactions)} 💬 {nf(p.metrics.comments)} ↪ {nf(p.metrics.shares)}{p.metrics.saves ? ' 🔖 ' + nf(p.metrics.saves) : ''}</span>
        </a>
      ))}
    </div>
  );
}
